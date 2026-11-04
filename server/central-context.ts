import { syncConversationGate } from "./followup.js";
import type { Store } from "./store.js";
import type { Config } from "./config.js";
import type { RuntimeJob } from "../shared/model.js";
import { IntegrationError } from "./integrations/http.js";
export async function hydrateContext(
  store: Store,
  c: Config,
  job: RuntimeJob,
  sender: {
    readContext?: (id: string) => Promise<{
      conversa: { id: string; numero_whatsapp_id?: string };
      contato: { id: string };
      automacao: { pode_responder: boolean };
      oportunidades: { id: string; etapa_id: string; status: string }[];
      capacidades?: { digitando: boolean };
    }>;
  },
) {
  if (c.demo || !c.central.extendedApi || !sender.readContext) return;
  const remote = await sender.readContext(job.conversationId);
  if (
    remote.conversa?.id !== job.conversationId ||
    remote.contato?.id !== job.contactId ||
    !Array.isArray(remote.oportunidades)
  )
    throw new IntegrationError("contexto_da_central_invalido");
  await store.transaction(async (tx) => {
    const cv = await tx.get("conversation", job.conversationId),
      contact = await tx.get("contact", job.contactId),
      op = await tx.get("operation", "operation");
    if (!cv || !contact) return;
    const candidates = remote.oportunidades.filter(
      (o) => o.status === "aberto",
    );
    const chosen =
      candidates.find((o) => o.id === contact.opportunityId) ??
      (candidates.length === 1 ? candidates[0] : undefined);
    if (!chosen && (op?.workflow?.stageOnStart || op?.workflow?.stageOnHandoff))
      throw new IntegrationError(
        "vincule_uma_oportunidade_antes_de_mover_etapas",
      );
    await tx.put("contact", {
      ...contact,
      opportunityId: chosen?.id ?? contact.opportunityId,
      stage: chosen?.etapa_id ?? contact.stage,
      automationAllowed: remote.automacao?.pode_responder === true,
      numberId: remote.conversa.numero_whatsapp_id ?? contact.numberId,
    });
    await tx.put("conversation", {
      ...cv,
      stage: chosen?.etapa_id ?? cv.stage,
      typingSupported: remote.capacidades?.digitando === true,
    });
    if (remote.automacao?.pode_responder !== true)
      await syncConversationGate(tx, job.contactId, false, false);
  });
}
