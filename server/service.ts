import { operation } from "./operation.js";
import type { Store, Tx } from "./store.js";
import type { Proposal } from "../shared/model.js";
import { base, createProposal, DomainError, reviewProposal } from "./domain.js";
export async function draft(
  tx: Tx,
  input: {
    contactId: string;
    templateId: string;
    items: { productId: string; quantity: number }[];
    sourceKey?: string;
  },
) {
  if (input.sourceKey) {
    const found = (await tx.list("proposal")).find(
      (p) => p.sourceKey === input.sourceKey,
    );
    if (found) return found;
  }
  const contact = await tx.get("contact", input.contactId),
    template = await tx.get("template", input.templateId);
  if (!contact || !template) throw new DomainError("contato_ou_modelo_ausente");
  const p = createProposal({
    contact,
    template,
    products: await tx.list("product"),
    items: input.items,
    sourceKey: input.sourceKey,
  });
  await tx.put("proposal", p);
  return p;
}
export async function submit(tx: Tx, p: Proposal) {
  if (p.status !== "draft")
    throw new DomainError("estado_da_proposta_invalido", 409);
  const next = { ...p, status: "pending" as const };
  await tx.put("proposal", next);
  await tx.put("job", {
    ...base("notify:" + p.id),
    kind: "notify_approval",
    proposalId: p.id,
    state: "pending",
    attempts: 0,
  });
  return next;
}
export async function review(
  store: Store,
  id: string,
  input: { decision: "approve" | "reject"; hash: string; note: string },
  actor: string,
) {
  return store.transaction(async (tx) => {
    const p = await tx.get("proposal", id);
    if (!p) throw new DomainError("proposta_ausente", 404);
    const next = reviewProposal(
      p,
      input.decision,
      input.hash,
      actor,
      input.note,
    );
    await tx.put("proposal", next);
    await tx.put("audit", {
      ...base(),
      action:
        input.decision === "approve"
          ? "proposta_aprovada"
          : "proposta_rejeitada",
      subjectId: p.id,
      actor,
      detail: input.note,
    });
    if (next.status === "approved") {
      await tx.put("proposal", { ...next, status: "queued" });
      await tx.put("job", {
        ...base("send:" + p.id),
        kind: "send_proposal",
        proposalId: p.id,
        state: "pending",
        attempts: 0,
      });
    }
    return {
      ...next,
      status: next.status === "approved" ? "queued" : next.status,
    };
  });
}
export async function applyStage(
  tx: Tx,
  contactId: string,
  fromStage: string,
  toStage: string,
  sourceId: string,
) {
  if (!(await operation(tx)).modules.proposals) return [];
  const rules = (await tx.list("rule")).filter(
    (r) => r.active && r.fromStage === fromStage && r.toStage === toStage,
  );
  const results: Proposal[] = [];
  for (const rule of rules) {
    const p = await draft(tx, {
      contactId,
      templateId: rule.templateId,
      items: rule.productIds.map((productId) => ({ productId, quantity: 1 })),
      sourceKey: sourceId + ":" + rule.id,
    });
    if (p.status === "draft") results.push(await submit(tx, p));
    else results.push(p);
  }
  return results;
}
