import type { Config } from "./config.js";
import type { Store } from "./store.js";
import type { RuntimeJob, AgentSettings } from "../shared/model.js";
import { IntegrationError } from "./integrations/http.js";
import { operation, testContactAllowed } from "./operation.js";
import { deliveryParts } from "./delivery.js";
export async function deliverTurn(
  store: Store,
  c: Config,
  job: RuntimeJob,
  text: string,
  settings: AgentSettings,
  sender: {
    setTyping?: (id: string, duration: number) => Promise<boolean>;
    sendText: (
      conversation: string,
      text: string,
      intent: string,
    ) => Promise<{ mensagem: { id: string; status: string } }>;
  },
  now: () => Date,
  pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
) {
  let parts = job.deliveryParts;
  if (!parts) {
    parts = deliveryParts(text, settings).map((text) => ({
      text,
      state: "pending" as const,
    }));
    await store.transaction(async (tx) => {
      const latest = await tx.get("runtimeJob", job.id);
      await tx.put("runtimeJob", { ...(latest ?? job), deliveryParts: parts });
    });
  }
  let lastId = "",
    sentAt = now().toISOString();
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].state === "sent") {
      lastId = parts[i].messageId ?? "";
      sentAt = parts[i].sentAt ?? sentAt;
      continue;
    }
    if (parts[i].state === "sending")
      throw new IntegrationError("entrega_parcial_incerta", true);
    const waitMs =
      i === 0 && !parts.some((p) => p.state === "sent")
        ? (settings.replyDelayMs ?? 0)
        : i > 0
          ? settings.delayMs
          : 0;
    if (
      !c.demo &&
      settings.typing &&
      c.central.extendedApi &&
      sender.setTyping
    ) {
      const canShow = await store.transaction(async (tx) => {
        const cv = await tx.get("conversation", job.conversationId),
          contact = await tx.get("contact", job.contactId),
          op = await operation(tx),
          latest = await tx.get("runtimeJob", job.id);
        const ack =
          !!latest?.handoffAckId &&
          cv?.handoffId === latest.handoffAckId &&
          cv.status === "paused";
        return (
          !!cv &&
          cv.typingSupported !== false &&
          !!contact?.automationAllowed &&
          testContactAllowed(op, contact) &&
          op.agentEnabled &&
          op.revision === job.policyRevision &&
          latest?.state === "dispatching" &&
          (ack || (cv.status === "active" && cv.cycle === job.cycle))
        );
      });
      if (canShow)
        try {
          const shown = await sender.setTyping(
            job.conversationId,
            waitMs + 1000,
          );
          if (!shown)
            await store.transaction(async (tx) => {
              const cv = await tx.get("conversation", job.conversationId);
              if (cv)
                await tx.put("conversation", { ...cv, typingSupported: false });
            });
        } catch {
          await store.transaction((tx) =>
            tx.put("audit", {
              id: "presence:" + job.id,
              createdAt: now().toISOString(),
              action: "presenca_nao_confirmada",
              subjectId: job.conversationId,
              actor: "ferramenta",
              detail:
                "Indicador indisponível. A entrega de texto mantém suas próprias validações.",
            }),
          );
        }
    }
    if (!c.demo && waitMs > 0) await pause(waitMs);

    const allowed = await store.transaction(async (tx) => {
      const latest = await tx.get("runtimeJob", job.id),
        cv = await tx.get("conversation", job.conversationId),
        contact = await tx.get("contact", job.contactId),
        op = await operation(tx);
      const ack =
        !!latest?.handoffAckId &&
        cv?.handoffId === latest.handoffAckId &&
        cv?.status === "paused" &&
        cv.manualState === "paused";
      if (
        latest?.state !== "dispatching" ||
        !cv ||
        (!ack && (cv.cycle !== job.cycle || cv.status !== "active")) ||
        cv.deliveryUnknown ||
        !contact?.automationAllowed ||
        !testContactAllowed(op, contact) ||
        op.revision !== job.policyRevision ||
        (!op.agentEnabled && !(c.demo && job.demoOnly))
      ) {
        if (latest)
          await tx.put("runtimeJob", {
            ...latest,
            state: "cancelled",
            lastError: "estado_alterado_entre_mensagens",
          });
        return false;
      }
      parts![i] = { ...parts![i], state: "sending" };
      await tx.put("runtimeJob", { ...latest, deliveryParts: parts });
      return true;
    });
    if (!allowed) return { cancelled: true, lastId, sentAt };
    const sent = c.demo
      ? { mensagem: { id: "simulated:" + job.id + ":" + i, status: "enviada" } }
      : await sender.sendText(
          job.conversationId,
          parts[i].text,
          "pulsoo:part:" + job.id + ":" + i,
        );
    lastId = sent.mensagem.id;
    sentAt = now().toISOString();
    parts[i] = { ...parts[i], state: "sent", messageId: lastId, sentAt };
    await store.transaction(async (tx) => {
      const latest = await tx.get("runtimeJob", job.id);
      if (latest)
        await tx.put("runtimeJob", { ...latest, deliveryParts: parts });
      await tx.put("message", {
        id: "out:" + job.id + ":" + i,
        createdAt: sentAt,
        conversationId: job.conversationId,
        role: "assistant",
        text: parts![i].text,
        occurredAt: sentAt,
        source: job.kind === "followup" ? "followup" : "reply",
        centralMessageId: c.demo ? undefined : lastId,
        simulated: c.demo,
      });
    });
  }
  return { cancelled: false, lastId, sentAt };
}
