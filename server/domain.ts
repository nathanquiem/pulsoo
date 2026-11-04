import {
  createHash,
  randomUUID,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import type {
  Contact,
  Product,
  ProposalTemplate,
  Proposal,
  AgentSettings,
} from "../shared/model.js";
export class DomainError extends Error {
  constructor(
    public code: string,
    public status = 422,
  ) {
    super(code);
  }
}
export const base = (id: string = randomUUID()) => ({
  id,
  createdAt: new Date().toISOString(),
});
export function renderText(text: string, values: Record<string, string>) {
  return text.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key: string) => {
    const value = values[key.trim()];
    if (value === undefined)
      throw new DomainError("variavel_de_modelo_desconhecida");
    return value;
  });
}
export function createProposal(
  args: {
    contact: Contact;
    template: ProposalTemplate;
    products: Product[];
    items: { productId: string; quantity: number }[];
    sourceKey?: string;
  },
  now = new Date(),
): Proposal {
  if (!args.items.length || args.items.length > 30)
    throw new DomainError("itens_invalidos");
  const lines = args.items.map((item) => {
    const p = args.products.find((p) => p.id === item.productId && p.active);
    if (
      !p ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 1000
    )
      throw new DomainError("produto_ou_quantidade_invalido");
    if (
      !Number.isSafeInteger(p.priceCents) ||
      p.priceCents < 0 ||
      p.priceCents > 1000000000
    )
      throw new DomainError("preco_invalido");
    return {
      productId: p.id,
      name: p.name,
      quantity: item.quantity,
      unitPriceCents: p.priceCents,
      totalCents: p.priceCents * item.quantity,
      unit: p.unit,
    };
  });
  const totalCents = lines.reduce((sum, l) => sum + l.totalCents, 0);
  if (!Number.isSafeInteger(totalCents))
    throw new DomainError("total_invalido");
  const id = randomUUID(),
    number = "PUL-" + now.getFullYear() + "-" + id.slice(0, 8).toUpperCase();
  const values = {
    "cliente.nome": args.contact.name,
    "cliente.empresa": args.contact.company,
    "cliente.notas": args.contact.notes,
    "proposta.numero": number,
  };
  const snapshot = {
    contactId: args.contact.id,
    contactName: args.contact.name,
    conversationId: args.contact.conversationId,
    templateName: args.template.name,
    title: renderText(args.template.title, values),
    intro: renderText(args.template.intro, values),
    terms: renderText(args.template.terms, values),
    notes: args.contact.notes,
    lines,
    totalCents,
    currency: "BRL" as const,
    validUntil: new Date(
      now.getTime() + args.template.validDays * 86400000,
    ).toISOString(),
  };
  return {
    ...base(id),
    ...snapshot,
    number,
    status: "draft",
    revision: 1,
    snapshotHash: createHash("sha256")
      .update(JSON.stringify(snapshot))
      .digest("hex"),
    sourceKey: args.sourceKey,
  };
}
export function reviewProposal(
  p: Proposal,
  decision: "approve" | "reject",
  hash: string,
  actor: string,
  note = "",
): Proposal {
  if (p.status !== "pending")
    throw new DomainError("proposta_nao_aguarda_aprovacao", 409);
  if (hash !== p.snapshotHash)
    throw new DomainError("versao_da_proposta_divergente", 409);
  if (decision === "approve" && new Date(p.validUntil).getTime() <= Date.now())
    throw new DomainError("proposta_expirada", 409);
  return {
    ...p,
    status: decision === "approve" ? "approved" : "rejected",
    approvedBy: decision === "approve" ? actor : undefined,
    approvedAt: decision === "approve" ? new Date().toISOString() : undefined,
    reviewNote: note,
  };
}
export function splitReply(
  text: string,
  mode: AgentSettings["splitMode"],
  maxChunks: number,
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (mode === "single") return [trimmed];
  const parts = trimmed.split(/\n\s*\n/).filter(Boolean);
  if (parts.length <= maxChunks) return parts;
  return [
    ...parts.slice(0, maxChunks - 1),
    parts.slice(maxChunks - 1).join("\n\n"),
  ];
}
export function validWebhook(
  raw: Buffer,
  timestamp: string,
  signature: string,
  secret: string,
  now = Date.now(),
) {
  if (
    !/^\d+$/.test(timestamp) ||
    Math.abs(now - Number(timestamp) * 1000) > 300000 ||
    !secret
  )
    return false;
  const expected =
    "sha256=" +
    createHmac("sha256", secret)
      .update(timestamp + ".")
      .update(raw)
      .digest("hex");
  const a = Buffer.from(expected),
    b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
