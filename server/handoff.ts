import type { Conversation } from "../shared/model.js";
import type { Tx } from "./store.js";
import { base } from "./domain.js";
import { cancelPending } from "./followup.js";
import { operation } from "./operation.js";
import {
  workflowSummary,
  queueHumanNotification,
  queueStage,
} from "./workflow.js";
export async function requestHuman(
  tx: Tx,
  cv: Conversation,
  reason: string,
  summary: string,
) {
  if (cv.handoffId) return tx.get("handoff", cv.handoffId);
  const op = await operation(tx);
  const contact = await tx.get("contact", cv.contactId);
  const handoff: import("../shared/model.js").HumanHandoff = {
    ...base(),
    conversationId: cv.id,
    contactId: cv.contactId,
    reason: reason.slice(0, 500),
    summary: contact
      ? workflowSummary(contact, cv, op, reason, summary)
      : summary.slice(0, 1800),
    farewellState: "pending",
    notificationData: contact
      ? {
          lead: {
            id: contact.id,
            name: contact.name,
            phone: contact.phone,
            conversationId: cv.id,
            opportunityId: contact.opportunityId,
            stage: contact.stage,
          },
          qualification: (op.workflow?.fields ?? []).map((f) => ({
            key: f.key,
            label: f.label,
            value: (cv.qualification ?? contact.qualification)?.[f.key] ?? null,
          })),
          photosReceived: cv.photoCount ?? 0,
          nextStep: op.workflow?.nextStep ?? "",
        }
      : undefined,
    notification: op.workflow?.notification
      ? {
          ...op.workflow.notification,
          numberId:
            op.workflow.notification.numberId || contact?.numberId || "",
        }
      : undefined,
    responsibleId: op.workflow?.responsibleId || undefined,
    notificationState:
      op.workflow?.notification.kind && op.workflow.notification.kind !== "none"
        ? "pending"
        : "not_requested",
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
  await queueHumanNotification(tx, handoff, op);
  if (contact && op.workflow?.stageOnHandoff)
    await queueStage(tx, cv, contact, op.workflow.stageOnHandoff, op);
  await tx.put("audit", {
    ...base(),
    action: "atendimento_humano_solicitado",
    subjectId: cv.id,
    actor: "agente",
    detail: handoff.reason,
  });
  return handoff;
}
