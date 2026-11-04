import type { Conversation } from "../shared/model.js";
import type { Tx } from "./store.js";
import { base } from "./domain.js";
import { cancelPending } from "./followup.js";
import { operation } from "./operation.js";
export async function requestHuman(
  tx: Tx,
  cv: Conversation,
  reason: string,
  summary: string,
) {
  if (cv.handoffId) return;
  const op = await operation(tx);
  const handoff = {
    ...base(),
    conversationId: cv.id,
    contactId: cv.contactId,
    reason: reason.slice(0, 500),
    summary: summary.slice(0, 1800),
    noteState: op.handoff?.recordNote
      ? ("pending" as const)
      : ("not_requested" as const),
  };
  await tx.put("handoff", handoff);
  await cancelPending(tx, cv.id, "atendimento_humano_solicitado");
  await tx.put("conversation", {
    ...cv,
    status: "paused",
    manualState: "paused",
    handoffId: handoff.id,
  });
  if (op.handoff?.recordNote)
    await tx.put("runtimeJob", {
      ...base("handoff-note:" + handoff.id),
      kind: "record_handoff",
      conversationId: cv.id,
      contactId: cv.contactId,
      state: "pending",
      attempts: 0,
      dueAt: handoff.createdAt,
      cycle: cv.cycle,
      step: 0,
      policyRevision: op.revision,
      executionId: handoff.id,
    });
  await tx.put("audit", {
    ...base(),
    action: "atendimento_humano_solicitado",
    subjectId: cv.id,
    actor: "agente",
    detail: handoff.reason,
  });
}
