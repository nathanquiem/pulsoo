import type {
  Contact,
  Operation,
  Conversation,
  HumanHandoff,
  RuntimeJob,
} from "../shared/model.js";
import type { Tx } from "./store.js";
import { base } from "./domain.js";
export function workflowSummary(
  contact: Contact,
  cv: Conversation,
  op: Operation,
  reason: string,
  summary: string,
) {
  const fields = op.workflow?.fields ?? [];
  const short = (value: string, max: number) =>
    value.replace(/\s+/g, " ").trim().slice(0, max);
  return [
    "ATENDIMENTO PARA A EQUIPE",
    "Nome: " + short(contact.name, 120),
    "WhatsApp: " + contact.phone,
    ...fields.map(
      (f) =>
        short(f.label, 35) +
        ": " +
        short(contact.qualification?.[f.key] || "Não informado", 90),
    ),
    "Fotos recebidas: " + (cv.photoCount ?? 0),
    "Motivo do encaminhamento: " + short(reason, 160),
    "Resumo: " +
      short(summary || "Equipe deve conferir as informações recebidas.", 350),
    "Próximo passo: " +
      short(op.workflow?.nextStep ?? "Dar continuidade ao atendimento.", 160),
  ]
    .join("\n")
    .slice(0, 2700);
}
export async function queueStage(
  tx: Tx,
  cv: Conversation,
  contact: Contact,
  target: string,
  op: Operation,
) {
  if (!target || target === contact.stage) return;
  const id = "stage:" + cv.id + ":" + cv.cycle + ":" + target;
  if (await tx.get("runtimeJob", id)) return;
  await tx.put("runtimeJob", {
    ...base(id),
    kind: "record_stage",
    conversationId: cv.id,
    contactId: contact.id,
    state: "pending",
    attempts: 0,
    dueAt: new Date().toISOString(),
    cycle: cv.cycle,
    step: 0,
    policyRevision: op.revision,
    stageTarget: target,
    expectedStage: contact.stage,
    opportunityId: contact.opportunityId,
    responsibleId: op.workflow?.responsibleId,
  });
}
export async function queueHumanNotification(
  tx: Tx,
  h: HumanHandoff,
  op: Operation,
) {
  if (!op.workflow?.notification || op.workflow.notification.kind === "none")
    return;
  await tx.put("runtimeJob", {
    ...base("notify:" + h.id),
    kind: "notify_human",
    conversationId: h.conversationId,
    contactId: h.contactId,
    state: "pending",
    attempts: 0,
    dueAt: new Date().toISOString(),
    cycle: 0,
    step: 0,
    policyRevision: op.revision,
    executionId: h.id,
  });
}
export const toolDescriptions = [
  {
    id: "responder_atendimento",
    name: "Qualificar e responder",
    trigger: "Chamada do principal com dados estruturados e texto de resposta.",
  },
  {
    id: "solicitar_humano",
    name: "Encaminhar para humano",
    trigger:
      "Pedido do lead, dúvida fora do roteiro ou conclusão da qualificação.",
  },
  {
    id: "mover_etapa",
    name: "Mover etapa",
    trigger:
      "Início da qualificação ou passagem ao humano, conforme mapeamento.",
  },
  {
    id: "registrar_resumo",
    name: "Registrar resumo",
    trigger: "Encaminhamento: nota com fatos, pendências e próximo passo.",
  },
  {
    id: "avisar_humano",
    name: "Avisar equipe",
    trigger: "Após encaminhamento, para o destino cadastrado.",
  },
];
