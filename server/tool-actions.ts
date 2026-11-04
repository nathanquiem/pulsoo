import type { Store } from "./store.js";
import type { Config } from "./config.js";
import type { RuntimeJob, HumanHandoff } from "../shared/model.js";
import { IntegrationError } from "./integrations/http.js";
import { operation } from "./operation.js";
export async function processAction(
  store: Store,
  c: Config,
  job: RuntimeJob,
  sender: {
    moveStage?: (job: RuntimeJob) => Promise<void>;
    notifyHuman?: (h: HumanHandoff) => Promise<void>;
    transferHuman?: (h: HumanHandoff) => Promise<void>;
  },
) {
  try {
    if (job.kind === "record_stage") {
      const valid = await store.transaction(async (tx) => {
        const contact = await tx.get("contact", job.contactId),
          op = await operation(tx);
        return (
          contact &&
          contact.opportunityId === job.opportunityId &&
          contact.stage === job.expectedStage &&
          op.revision === job.policyRevision
        );
      });
      if (!job.opportunityId || !job.stageTarget)
        throw new IntegrationError("oportunidade_ou_etapa_nao_configurada");
      if (!valid)
        throw new IntegrationError("etapa_alterada_ou_contexto_desatualizado");
      if (!c.demo) {
        if (!sender.moveStage)
          throw new IntegrationError("ferramenta_de_etapa_indisponivel");
        await sender.moveStage(job);
      }
      await store.transaction(async (tx) => {
        const contact = await tx.get("contact", job.contactId),
          cv = await tx.get("conversation", job.conversationId);
        if (contact && contact.stage === job.expectedStage)
          await tx.put("contact", { ...contact, stage: job.stageTarget! });
        if (cv && cv.stage === job.expectedStage)
          await tx.put("conversation", { ...cv, stage: job.stageTarget! });
      });
    } else {
      const h = await store.transaction((tx) =>
        tx.get("handoff", job.executionId ?? ""),
      );
      if (!h) throw new IntegrationError("encaminhamento_ausente");
      if (job.kind === "record_transfer") {
        if (!c.demo) {
          if (!sender.transferHuman)
            throw new IntegrationError("transferencia_indisponivel");
          await sender.transferHuman(h);
        }
        await store.transaction((tx) =>
          tx.put("handoff", { ...h, transferState: "done" }),
        );
      } else {
        if (!c.demo) {
          if (!sender.notifyHuman)
            throw new IntegrationError("aviso_humano_indisponivel");
          await sender.notifyHuman(h);
        }
        await store.transaction((tx) =>
          tx.put("handoff", { ...h, notificationState: "done" }),
        );
      }
    }
    await store.transaction((tx) =>
      tx.put("runtimeJob", { ...job, state: "done" }),
    );
  } catch (error) {
    const uncertain = error instanceof IntegrationError && error.uncertain;
    const reason =
      error instanceof IntegrationError ? error.code : "falha_na_ferramenta";
    await store.transaction(async (tx) => {
      await tx.put("runtimeJob", {
        ...job,
        state: uncertain ? "unknown" : "blocked",
        lastError: reason,
      });
      if (job.kind === "notify_human" || job.kind === "record_transfer") {
        const h = await tx.get("handoff", job.executionId ?? "");
        if (h)
          await tx.put("handoff", {
            ...h,
            ...(job.kind === "record_transfer"
              ? { transferState: "blocked" as const }
              : { notificationState: "blocked" as const }),
            lastError: reason,
          });
      }
    });
  }
}
