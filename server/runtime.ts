import type { Store, Tx } from "./store.js";
import type { Config } from "./config.js";
import type {
  Conversation,
  RuntimeJob,
  FollowupExecution,
} from "../shared/model.js";
import { base } from "./domain.js";
import {
  operation,
  testContactAllowed,
  isRecordJob,
  photoHandoff,
} from "./operation.js";
import { hydrateContext } from "./central-context.js";
import { requestHuman } from "./handoff.js";
import { deliverTurn } from "./turn-delivery.js";
import { processAction } from "./tool-actions.js";
import { queueStage } from "./workflow.js";
import { armFollowup, nextBusinessTime } from "./followup.js";
import { generateAgent, type AgentInput, type AgentResult } from "./agent.js";
import { CentralClient } from "./integrations/central.js";
import { IntegrationError } from "./integrations/http.js";
type Sender = {
  sendText(
    conversationId: string,
    text: string,
    intentId: string,
  ): Promise<{ mensagem: { id: string; status: string } }>;
  readContext?: CentralClient["readContext"];
  setTyping?: CentralClient["setTyping"];
  transferHuman?: CentralClient["transferHuman"];
  moveStage?: (job: RuntimeJob) => Promise<void>;
  notifyHuman?: (
    handoff: import("../shared/model.js").HumanHandoff,
  ) => Promise<void>;
  recordHandoffNote?(
    handoff: import("../shared/model.js").HumanHandoff,
    attempt: number,
  ): Promise<{ nota: { id: string } }>;
  recordCompletedFollowup(
    execution: FollowupExecution,
    attempt: number,
    responsibleId?: string,
  ): Promise<{ tarefa: { id: string; status: string } }>;
};
export async function recoverRuntimeJobs(store: Store) {
  await store.transaction(async (tx) => {
    for (const j of await tx.list("runtimeJob"))
      if (j.state === "running" || j.state === "dispatching") {
        if (
          j.state === "dispatching" &&
          j.deliveryParts &&
          !j.deliveryParts.some((p) => p.state === "sending")
        ) {
          await tx.put("runtimeJob", { ...j, state: "pending" });
        } else if (j.state === "dispatching" && !isRecordJob(j.kind)) {
          await tx.put("runtimeJob", {
            ...j,
            state: "unknown",
            lastError: "envio_interrompido_conciliar",
          });
          const c = await tx.get("conversation", j.conversationId);
          if (c) await tx.put("conversation", { ...c, deliveryUnknown: true });
        } else await tx.put("runtimeJob", { ...j, state: "pending" });
      }
  });
}
async function cancel(tx: Tx, j: RuntimeJob, reason: string) {
  await tx.put("runtimeJob", { ...j, state: "cancelled", lastError: reason });
}
export async function processRuntime(
  store: Store,
  c: Config,
  deps: {
    sender?: Sender;
    generate?: (input: AgentInput) => Promise<AgentResult>;
    now?: () => Date;
    pause?: (ms: number) => Promise<void>;
  } = {},
) {
  const now = deps.now ?? (() => new Date()),
    sender = deps.sender ?? new CentralClient(c.central);
  const job = await store.transaction(async (tx) => {
    const op = await operation(tx),
      at = now();
    const j = (await tx.list("runtimeJob"))
      .filter((j) => j.state === "pending" && new Date(j.dueAt) <= at)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
    if (!j) return;
    if (isRecordJob(j.kind)) {
      await tx.put("runtimeJob", {
        ...j,
        state: "running",
        attempts: j.attempts + 1,
      });
      return { ...j, attempts: j.attempts + 1 };
    }
    const conversation = await tx.get("conversation", j.conversationId),
      contact = await tx.get("contact", j.contactId);
    const reason =
      !op.agentEnabled && !(c.demo && j.demoOnly)
        ? "agente_desativado"
        : !conversation || !contact
          ? "contexto_ausente"
          : !testContactAllowed(op, contact)
            ? "fora_do_contato_de_teste"
            : !contact.automationAllowed
              ? "automacao_pausada"
              : conversation.status !== "active" &&
                  !(
                    j.handoffAckId &&
                    conversation.handoffId === j.handoffAckId &&
                    conversation.status === "paused"
                  )
                ? "conversa_inativa"
                : conversation.deliveryUnknown
                  ? "entrega_pendente_de_conciliacao"
                  : conversation.cycle !== j.cycle && !j.handoffAckId
                    ? "lead_respondeu"
                    : j.policyRevision !== op.revision
                      ? "configuracao_alterada"
                      : op.followup.terminalStages
                            .map((s) => s.toLowerCase())
                            .includes(conversation.stage.toLowerCase())
                        ? "qualificacao_encerrada"
                        : "";
    if (reason) {
      await cancel(tx, j, reason);
      return;
    }
    if (j.kind === "followup") {
      if (!op.followup.enabled || j.step >= op.followup.steps.length) {
        await cancel(tx, j, "followup_desativado_ou_finalizado");
        return;
      }
      if (!conversation!.lastOutboundAt || !conversation!.lastInboundAt) {
        await cancel(tx, j, "sem_contexto_de_envio");
        return;
      }
      if (!c.demo && conversation!.channel === "unknown") {
        await tx.put("runtimeJob", {
          ...j,
          state: "blocked",
          lastError: "canal_nao_identificado",
        });
        return;
      }
      if (
        conversation!.channel === "official" &&
        at.getTime() - new Date(conversation!.lastInboundAt).getTime() >=
          24 * 3600000
      ) {
        await tx.put("runtimeJob", {
          ...j,
          state: "blocked",
          lastError: "janela_oficial_exige_template",
        });
        return;
      }
      const due = nextBusinessTime(at, op.followup);
      if (due.getTime() > at.getTime()) {
        await tx.put("runtimeJob", { ...j, dueAt: due.toISOString() });
        return;
      }
      const formatter = new Intl.DateTimeFormat("en-CA", {
          timeZone: op.followup.timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }),
        today = formatter.format(at);
      const sent = (await tx.list("followup")).filter(
        (f) =>
          f.conversationId === j.conversationId &&
          formatter.format(new Date(f.sentAt)) === today,
      );
      if (sent.length >= op.followup.maxPerDay) {
        const tomorrow = nextBusinessTime(
          new Date(at.getTime() + 24 * 3600000),
          op.followup,
        );
        await tx.put("runtimeJob", { ...j, dueAt: tomorrow.toISOString() });
        return;
      }
    }
    await tx.put("runtimeJob", {
      ...j,
      state: "running",
      attempts: j.attempts + 1,
    });
    return { ...j, attempts: j.attempts + 1 };
  });
  if (!job) return false;
  if (
    job.kind === "record_stage" ||
    job.kind === "notify_human" ||
    job.kind === "record_transfer"
  ) {
    await processAction(store, c, job, sender);
    return true;
  }
  if (job.kind === "record_handoff") {
    const handoff = await store.transaction((tx) =>
      tx.get("handoff", job.executionId ?? ""),
    );
    if (!handoff) {
      await store.transaction((tx) =>
        tx.put("runtimeJob", {
          ...job,
          state: "blocked",
          lastError: "encaminhamento_ausente",
        }),
      );
      return true;
    }
    try {
      if (!c.demo && !sender.recordHandoffNote)
        throw new IntegrationError("registro_de_nota_indisponivel");
      const result = c.demo
        ? { nota: { id: handoff.id } }
        : await sender.recordHandoffNote!(handoff, job.attempts);
      await store.transaction(async (tx) => {
        await tx.put("handoff", {
          ...handoff,
          noteState: "done",
          centralNoteId: c.demo ? undefined : result.nota.id,
          lastError: undefined,
        });
        await tx.put("runtimeJob", { ...job, state: "done" });
      });
    } catch (e) {
      const retry =
        e instanceof IntegrationError &&
        (e.uncertain || (e.httpStatus ?? 0) >= 500) &&
        job.attempts < 6;
      const reason =
        e instanceof IntegrationError
          ? e.code
          : "falha_ao_registrar_encaminhamento";
      await store.transaction(async (tx) => {
        await tx.put("handoff", {
          ...handoff,
          noteState: retry ? "pending" : "blocked",
          lastError: reason,
        });
        await tx.put("runtimeJob", {
          ...job,
          state: retry ? "pending" : "blocked",
          lastError: reason,
          dueAt: new Date(
            now().getTime() + Math.min(3600000, 60000 * 2 ** job.attempts),
          ).toISOString(),
        });
      });
    }
    return true;
  }
  if (job.kind === "record_followup") {
    const execution = await store.transaction((tx) =>
      tx.get("followup", job.executionId ?? ""),
    );
    if (!execution) {
      await store.transaction((tx) =>
        tx.put("runtimeJob", {
          ...job,
          state: "blocked",
          lastError: "registro_followup_ausente",
        }),
      );
      return true;
    }
    try {
      const result = c.demo
        ? { tarefa: { id: execution.id, status: "concluida" } }
        : await sender.recordCompletedFollowup(
            execution,
            job.attempts,
            c.followupResponsibleId || undefined,
          );
      await store.transaction(async (tx) => {
        await tx.put("runtimeJob", { ...job, state: "done" });
        await tx.put("followup", {
          ...execution,
          taskState: c.demo ? "simulated" : "done",
          taskId: c.demo ? undefined : result.tarefa.id,
          lastError: undefined,
        });
      });
    } catch (e) {
      const retry =
        e instanceof IntegrationError &&
        (e.uncertain || (e.httpStatus ?? 0) >= 500) &&
        job.attempts < 6;
      const reason =
        e instanceof IntegrationError ? e.code : "falha_ao_registrar_followup";
      await store.transaction(async (tx) => {
        await tx.put("runtimeJob", {
          ...job,
          state: retry ? "pending" : "blocked",
          dueAt: new Date(
            now().getTime() + Math.min(3600000, 60000 * 2 ** job.attempts),
          ).toISOString(),
          lastError: reason,
        });
        await tx.put("followup", {
          ...execution,
          taskState: retry ? "pending" : "blocked",
          lastError: reason,
        });
      });
    }
    return true;
  }
  let dispatched = false;
  try {
    if (!job.deliveryParts) await hydrateContext(store, c, job, sender);
    const context = await store.transaction(async (tx) => ({
      conversation: await tx.get("conversation", job.conversationId),
      contact: await tx.get("contact", job.contactId),
      settings: await tx.get("settings", "agent"),
      op: await operation(tx),
      messages: (await tx.list("message"))
        .filter((m) => m.conversationId === job.conversationId)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
        .slice(-18),
    }));
    const input: AgentInput = {
      messages: context.messages.map((m) => ({
        role: m.role,
        content: m.text,
      })),
      mode: c.demo ? "simulation" : "live",
      kind: job.kind === "followup" ? "followup" : "reply",
      step: job.step,
      contact: context.contact,
      environment: "production",
      photoCount: context.conversation?.photoCount ?? 0,
      forceHandoff:
        photoHandoff(context.op) &&
        context.messages.some(
          (m) =>
            m.messageType === "imagem" &&
            m.occurredAt > (context.conversation?.lastOutboundAt ?? ""),
        ),
    };
    const result = job.deliveryParts
      ? {
          text: job.resultText!,
          reason: "",
          handoff: job.savedHandoff,
          qualification: job.savedQualification,
          parts: [],
          trace: [],
          simulated: c.demo,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
        }
      : await (
          deps.generate ??
          ((input) =>
            generateAgent(store, c, input, {
              canContinue: () =>
                store.transaction(async (tx) => {
                  const latest = await tx.get("runtimeJob", job.id);
                  const cv = await tx.get("conversation", job.conversationId);
                  const contact = await tx.get("contact", job.contactId);
                  const op = await operation(tx);
                  return (
                    latest?.state === "running" &&
                    cv?.cycle === job.cycle &&
                    cv.status === "active" &&
                    !cv.deliveryUnknown &&
                    !!contact?.automationAllowed &&
                    testContactAllowed(op, contact) &&
                    op.revision === job.policyRevision &&
                    (op.agentEnabled || (c.demo && !!job.demoOnly)) &&
                    (job.kind !== "followup" || op.followup.enabled)
                  );
                }),
            }))
        )(input);
    const dispatch = await store.transaction(async (tx) => {
      const latest = await tx.get("runtimeJob", job.id),
        conversation = await tx.get("conversation", job.conversationId),
        contact = await tx.get("contact", job.contactId),
        op = await operation(tx);
      if (
        !latest ||
        latest.state !== "running" ||
        !conversation ||
        (conversation.cycle !== job.cycle && !latest.handoffAckId) ||
        (conversation.status !== "active" &&
          !(
            latest.handoffAckId &&
            conversation.handoffId === latest.handoffAckId &&
            conversation.status === "paused"
          )) ||
        !contact?.automationAllowed ||
        !testContactAllowed(op, contact) ||
        conversation.deliveryUnknown ||
        op.revision !== job.policyRevision ||
        (!op.agentEnabled && !(c.demo && job.demoOnly)) ||
        (job.kind === "followup" && !op.followup.enabled)
      ) {
        if (latest?.state === "running")
          await cancel(tx, latest, "estado_alterado_antes_do_envio");
        return;
      }
      if (result.text === null || !result.text.trim()) {
        await cancel(tx, latest, "agente_decidiu_nao_enviar");
        await tx.put("audit", {
          ...base(),
          action: "followup_nao_enviado",
          subjectId: job.conversationId,
          actor: "agente",
          detail: result.reason.slice(0, 400),
        });
        return;
      }
      if (result.text.length > 4000)
        throw new IntegrationError("resposta_excede_limite");
      if (job.kind === "followup") {
        const due = nextBusinessTime(now(), op.followup);
        if (due > now()) {
          await tx.put("runtimeJob", {
            ...latest,
            state: "pending",
            dueAt: due.toISOString(),
          });
          return;
        }
        if (
          conversation.channel === "official" &&
          now().getTime() - new Date(conversation.lastInboundAt!).getTime() >=
            24 * 3600000
        ) {
          await tx.put("runtimeJob", {
            ...latest,
            state: "blocked",
            lastError: "janela_oficial_exige_template",
          });
          return;
        }
      }
      if (result.handoff && !op.handoff?.enabled)
        throw new IntegrationError("encaminhamento_desativado");
      if (result.qualification) {
        await tx.put("contact", {
          ...contact,
          qualification: { ...contact.qualification, ...result.qualification },
        });
      }
      const updatedContact = (await tx.get("contact", job.contactId))!;
      if (
        context.op.workflow?.enabled &&
        !conversation.handoffId &&
        !result.handoff &&
        !job.deliveryParts
      )
        await queueStage(
          tx,
          conversation,
          updatedContact,
          context.op.workflow.stageOnStart,
          op,
        );
      let humanId = latest.handoffAckId;
      if (result.handoff && !humanId)
        humanId = (
          await requestHuman(
            tx,
            conversation,
            result.handoff.reason,
            result.handoff.summary,
          )
        )?.id;
      const executionId = job.kind === "followup" ? base().id : undefined;
      await tx.put("runtimeJob", {
        ...latest,
        state: "dispatching",
        executionId,
        resultText: result.text,
        handoffAckId: humanId,
        savedHandoff: result.handoff,
        savedQualification: result.qualification,
      });
      return { conversation, executionId };
    });
    if (!dispatch) return true;
    dispatched = true;
    const deliveryJob = (await store.transaction((tx) =>
      tx.get("runtimeJob", job.id),
    ))!;
    const delivered = await deliverTurn(
      store,
      c,
      deliveryJob,
      result.text!,
      context.settings!,
      sender,
      now,
      deps.pause,
    );
    if (delivered.cancelled) return true;
    const sent = { mensagem: { id: delivered.lastId, status: "enviada" } };
    const sentAt = delivered.sentAt;
    await store.transaction(async (tx) => {
      const latest = await tx.get("runtimeJob", job.id);
      await tx.put("runtimeJob", { ...(latest ?? job), state: "done" });
      const conversation = await tx.get("conversation", job.conversationId);
      if (latest?.handoffAckId) {
        const h = await tx.get("handoff", latest.handoffAckId);
        if (h) {
          await tx.put("handoff", {
            ...h,
            farewellState: "done",
            ...(c.central.extendedApi
              ? { transferState: "pending" as const }
              : {}),
          });
          if (
            c.central.extendedApi &&
            !(await tx.get("runtimeJob", "transfer:" + h.id))
          )
            await tx.put("runtimeJob", {
              ...base("transfer:" + h.id),
              kind: "record_transfer",
              conversationId: h.conversationId,
              contactId: h.contactId,
              state: "pending",
              attempts: 0,
              dueAt: sentAt,
              cycle: job.cycle,
              step: 0,
              policyRevision: job.policyRevision,
              executionId: h.id,
            });
        }
      }
      if (job.kind === "followup" && dispatch.executionId) {
        const execution: FollowupExecution = {
          ...base(dispatch.executionId),
          conversationId: job.conversationId,
          contactId: job.contactId,
          step: job.step,
          text: result.text!,
          sentAt,
          centralMessageId: c.demo ? undefined : sent.mensagem.id,
          taskState: c.demo ? "simulated" : "pending",
          simulated: c.demo,
        };
        await tx.put("followup", execution);
        if (!c.demo)
          await tx.put("runtimeJob", {
            ...base("record:" + execution.id),
            kind: "record_followup",
            conversationId: job.conversationId,
            contactId: job.contactId,
            state: "pending",
            attempts: 0,
            dueAt: sentAt,
            cycle: job.cycle,
            step: job.step,
            policyRevision: job.policyRevision,
            executionId: execution.id,
          });
      }
      if (conversation) {
        const fresh = {
          ...conversation,
          lastOutboundAt: sentAt,
          followupStep:
            conversation.cycle === job.cycle
              ? job.kind === "followup"
                ? job.step + 1
                : 0
              : conversation.followupStep,
        };
        await tx.put("conversation", fresh);
        if (conversation.cycle === job.cycle && !job.demoOnly)
          await armFollowup(
            tx,
            fresh,
            new Date(sentAt),
            job.kind === "followup" ? job.step + 1 : 0,
          );
      }
      await tx.put("audit", {
        ...base(),
        action:
          job.kind === "followup"
            ? c.demo
              ? "followup_simulado"
              : "followup_enviado"
            : c.demo
              ? "resposta_simulada"
              : "resposta_enviada",
        subjectId: job.conversationId,
        actor: "agente_principal",
        detail: "Envio confirmado em " + sentAt,
      });
    });
  } catch (e) {
    const uncertain =
      dispatched && (!(e instanceof IntegrationError) || e.uncertain);
    const reason =
      e instanceof IntegrationError ? e.code : "falha_na_geracao_ou_envio";
    await store.transaction(async (tx) => {
      const latest = await tx.get("runtimeJob", job.id);
      if (!dispatched && latest?.state === "cancelled") return;
      await tx.put("runtimeJob", {
        ...(latest ?? job),
        state: uncertain ? "unknown" : "blocked",
        lastError: reason,
      });
      if (uncertain) {
        const cv = await tx.get("conversation", job.conversationId);
        if (cv) await tx.put("conversation", { ...cv, deliveryUnknown: true });
      }
    });
  }
  return true;
}
import { createHash } from "node:crypto";
function baseIntent(id: string) {
  return createHash("sha256").update(id).digest("hex");
}
