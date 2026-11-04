import type { Operation, Conversation, RuntimeJob } from "../shared/model.js";
import type { Tx } from "./store.js";
import { base } from "./domain.js";
import { operation } from "./operation.js";
const dayMap: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};
export function nextBusinessTime(
  date: Date,
  policy: Operation["followup"],
): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: policy.timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const allowed = (d: Date) => {
    const p = Object.fromEntries(
      formatter.formatToParts(d).map((x) => [x.type, x.value]),
    );
    const time = p.hour + ":" + p.minute;
    return (
      policy.weekdays.includes(dayMap[p.weekday]) &&
      time >= policy.start &&
      time < policy.end
    );
  };
  if (allowed(date)) return date;
  let candidate = new Date(Math.ceil(date.getTime() / 60000) * 60000);
  for (let n = 0; n < 8 * 24 * 60; n++) {
    if (allowed(candidate)) return candidate;
    candidate = new Date(candidate.getTime() + 60000);
  }
  throw new Error("janela_de_horario_indisponivel");
}
export async function cancelPending(
  tx: Tx,
  conversationId: string,
  reason: string,
) {
  for (const job of await tx.list("runtimeJob"))
    if (
      job.conversationId === conversationId &&
      ["pending", "running"].includes(job.state) &&
      job.kind !== "record_followup"
    )
      await tx.put("runtimeJob", {
        ...job,
        state: "cancelled",
        lastError: reason,
      });
}
export async function armFollowup(
  tx: Tx,
  conversation: Conversation,
  from: Date,
  step: number,
  o?: Operation,
) {
  const op = o ?? (await operation(tx));
  if (
    !op.agentEnabled ||
    !op.followup.enabled ||
    conversation.status !== "active" ||
    step >= op.followup.steps.length
  )
    return;
  if (
    op.followup.terminalStages
      .map((s) => s.toLowerCase())
      .includes(conversation.stage.toLowerCase())
  )
    return;
  const contact = await tx.get("contact", conversation.contactId);
  if (!contact?.automationAllowed) return;
  const dueAt = nextBusinessTime(
    new Date(from.getTime() + op.followup.steps[step].delayMinutes * 60000),
    op.followup,
  ).toISOString();
  const id =
    "follow:" + conversation.id + ":" + conversation.cycle + ":" + step;
  if (await tx.get("runtimeJob", id)) return;
  const job: RuntimeJob = {
    ...base(id),
    kind: "followup",
    conversationId: conversation.id,
    contactId: conversation.contactId,
    state: "pending",
    attempts: 0,
    dueAt,
    cycle: conversation.cycle,
    step,
    policyRevision: op.revision,
  };
  await tx.put("runtimeJob", job);
}
export async function observeInbound(
  tx: Tx,
  input: {
    contactId: string;
    conversationId: string;
    messageId: string;
    text: string;
    occurredAt: string;
    receivedAt: string;
    channel: Conversation["channel"];
    allow: boolean;
    stage: string;
  },
) {
  const previous = await tx.get("conversation", input.conversationId);
  if (await tx.get("message", input.messageId)) return;
  const stale =
    previous?.lastInboundAt &&
    new Date(input.occurredAt).getTime() <
      new Date(previous.lastInboundAt).getTime();
  await tx.put("message", {
    ...base(input.messageId),
    conversationId: input.conversationId,
    role: "user",
    text: input.text,
    occurredAt: input.occurredAt,
    source: "central",
  });
  if (stale) return;
  await cancelPending(tx, input.conversationId, "lead_respondeu");
  const optOut =
    /\b(pare|parar|remova|remover|descadastrar|nao me (mande|envie)|não me (mande|envie))\b/i.test(
      input.text,
    );
  const c: Conversation = {
    ...(previous ?? base(input.conversationId)),
    contactId: input.contactId,
    stage: input.stage,
    channel: input.channel,
    status: optOut
      ? "opted_out"
      : previous?.status === "opted_out"
        ? "opted_out"
        : (previous?.manualState ?? (input.allow ? "active" : "paused")),
    cycle: (previous?.cycle ?? 0) + 1,
    lastInboundAt: input.occurredAt,
    lastOutboundAt: previous?.lastOutboundAt,
    followupStep: 0,
  };
  await tx.put("conversation", c);
  const op = await operation(tx);
  if (op.agentEnabled && input.allow && c.status === "active")
    await tx.put("runtimeJob", {
      ...base("reply:" + c.id + ":" + c.cycle),
      kind: "reply",
      conversationId: c.id,
      contactId: c.contactId,
      state: "pending",
      attempts: 0,
      dueAt: new Date(
        new Date(input.receivedAt).getTime() + 2000,
      ).toISOString(),
      cycle: c.cycle,
      step: 0,
      policyRevision: op.revision,
    });
}
export async function syncConversationGate(
  tx: Tx,
  contactId: string,
  allowed: boolean,
  closed: boolean,
  stage?: string,
) {
  for (const c of await tx.list("conversation"))
    if (c.contactId === contactId) {
      await tx.put("conversation", {
        ...c,
        stage: stage ?? c.stage,
        status:
          c.status === "opted_out"
            ? "opted_out"
            : (c.manualState ??
              (closed
                ? "closed"
                : !allowed
                  ? "paused"
                  : c.status === "paused"
                    ? "active"
                    : c.status)),
      });
      if (!allowed || closed)
        await cancelPending(
          tx,
          c.id,
          closed ? "conversa_encerrada" : "humano_ou_automacao_pausada",
        );
    }
}
