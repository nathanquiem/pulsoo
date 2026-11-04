import { operation, testContactAllowed } from "./operation.js";
import type { Config } from "./config.js";
import type { Store } from "./store.js";
import type { Job, Proposal } from "../shared/model.js";
import { money } from "../shared/model.js";
import { base } from "./domain.js";
import { CentralClient } from "./integrations/central.js";
import { HttpClient, IntegrationError } from "./integrations/http.js";
export function proposalText(p: Proposal) {
  return [
    p.title,
    p.intro,
    ...p.lines.map(
      (l) =>
        l.name +
        " · " +
        l.quantity +
        " × " +
        money(l.unitPriceCents) +
        " = " +
        money(l.totalCents),
    ),
    "Total: " + money(p.totalCents),
    p.terms,
    p.number,
  ].join("\n\n");
}
export async function recoverJobs(store: Store) {
  await store.transaction(async (tx) => {
    for (const j of await tx.list("job"))
      if (j.state === "running") {
        await tx.put("job", {
          ...j,
          state: "unknown",
          lastError: "execucao_interrompida_requer_conciliacao",
        });
        const p = await tx.get("proposal", j.proposalId);
        if (p && j.kind === "send_proposal")
          await tx.put("proposal", { ...p, status: "delivery_unknown" });
      }
  });
}
export async function processOne(
  store: Store,
  c: Config,
  deps: { central?: CentralClient; http?: HttpClient } = {},
) {
  const task = await store.transaction(async (tx) => {
    const j = (await tx.list("job")).find((j) => j.state === "pending");
    if (!j) return;
    const p = await tx.get("proposal", j.proposalId);
    if (!p) {
      await tx.put("job", {
        ...j,
        state: "blocked",
        lastError: "proposta_ausente",
      });
      return;
    }
    if (!(await operation(tx)).modules.proposals) {
      await tx.put("job", {
        ...j,
        state: "blocked",
        lastError: "modulo_desativado",
      });
      await tx.put("proposal", { ...p, status: "blocked" });
      return;
    }
    const contact = await tx.get("contact", p.contactId);
    if (
      j.kind === "send_proposal" &&
      (p.status !== "queued" ||
        !p.approvedBy ||
        !contact?.automationAllowed ||
        !testContactAllowed(await operation(tx), contact) ||
        new Date(p.validUntil).getTime() <= Date.now())
    ) {
      await tx.put("job", {
        ...j,
        state: "blocked",
        lastError: "envio_nao_autorizado",
      });
      await tx.put("proposal", { ...p, status: "blocked" });
      return;
    }
    await tx.put("job", { ...j, state: "running", attempts: j.attempts + 1 });
    return { j, p };
  });
  if (!task) return false;
  const { j, p } = task;
  let messageId: string | undefined;
  try {
    if (!c.demo) {
      if (j.kind === "send_proposal") {
        if (!p.conversationId)
          throw new IntegrationError("conversa_da_central_ausente");
        const text = proposalText(p);
        if (text.length > 4000)
          throw new IntegrationError("proposta_excede_limite_de_texto");
        const result = await (
          deps.central ?? new CentralClient(c.central)
        ).sendText(
          p.conversationId,
          text,
          "pulsoo:proposal:" + p.id + ":" + p.snapshotHash.slice(0, 32),
        );
        messageId = result.mensagem.id;
      } else {
        if (!c.approvalWebhook)
          throw new IntegrationError("canal_de_aviso_nao_configurado");
        const u = new URL(c.approvalWebhook);
        if (u.protocol !== "https:" || u.username || u.password)
          throw new IntegrationError("canal_de_aviso_invalido");
        await (deps.http ?? new HttpClient()).response(u.href, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text:
              "Proposta " +
              p.number +
              " aguarda aprovação no Pulsoo: " +
              new URL("/#approvals", c.appUrl).href,
            event: "proposal.approval_requested",
            proposalId: p.id,
            reviewUrl: new URL("/#approvals", c.appUrl).href,
          }),
        });
      }
    }
    await store.transaction(async (tx) => {
      await tx.put("job", { ...j, state: "done", attempts: j.attempts + 1 });
      const fresh = await tx.get("proposal", p.id);
      if (fresh && j.kind === "send_proposal")
        await tx.put("proposal", {
          ...fresh,
          status: c.demo ? "simulated" : "sent",
          sentAt: new Date().toISOString(),
          deliveryMessageId: messageId,
        });
      await tx.put("audit", {
        ...base(),
        action:
          j.kind === "send_proposal"
            ? c.demo
              ? "envio_simulado"
              : "proposta_enviada"
            : c.demo
              ? "aviso_simulado"
              : "aviso_enviado",
        subjectId: p.id,
        actor: "worker",
        detail: "Ação concluída.",
      });
    });
  } catch (e) {
    const uncertain = e instanceof IntegrationError && e.uncertain;
    const code = e instanceof IntegrationError ? e.code : "falha_na_execucao";
    await store.transaction(async (tx) => {
      await tx.put("job", {
        ...j,
        state: uncertain ? "unknown" : "blocked",
        attempts: j.attempts + 1,
        lastError: code,
      });
      const fresh = await tx.get("proposal", p.id);
      if (fresh && j.kind === "send_proposal")
        await tx.put("proposal", {
          ...fresh,
          status: uncertain ? "delivery_unknown" : "blocked",
        });
      await tx.put("audit", {
        ...base(),
        action: "acao_bloqueada",
        subjectId: p.id,
        actor: "worker",
        detail: code,
      });
    });
  }
  return true;
}
