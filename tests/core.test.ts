import test from "node:test";
import assert from "node:assert/strict";
import { LocalStore } from "../server/store.js";
import { seedDemo } from "../server/seed.js";
import {
  createProposal,
  reviewProposal,
  splitReply,
  validWebhook,
} from "../server/domain.js";
import { review } from "../server/service.js";
import { createHmac } from "node:crypto";
import { proposalPdf } from "../server/pdf.js";
async function fixtures() {
  const store = await new LocalStore().init();
  await seedDemo(store);
  return store;
}
test("totais vêm do catálogo e permanecem no snapshot após alteração de preço", async () => {
  const s = await fixtures();
  const p = await s.transaction(async (tx) =>
    createProposal({
      contact: (await tx.list("contact"))[0],
      template: (await tx.list("template"))[0],
      products: await tx.list("product"),
      items: [
        { productId: "consulta", quantity: 3 },
        { productId: "retorno", quantity: 2 },
      ],
    }),
  );
  assert.equal(p.totalCents, 141000);
  await s.transaction(async (tx) => {
    const old = (await tx.get("product", "consulta"))!;
    await tx.put("product", { ...old, priceCents: 1 });
  });
  assert.equal(p.lines[0].unitPriceCents, 35000);
  assert.equal(p.totalCents, 141000);
});
test("produtos arquivados, quantidades fracionadas e variáveis desconhecidas são recusados", async () => {
  const s = await fixtures();
  await s.transaction(async (tx) => {
    const contact = (await tx.list("contact"))[0],
      template = (await tx.list("template"))[0],
      products = await tx.list("product");
    assert.throws(() =>
      createProposal({
        contact,
        template,
        products: products.map((p) => ({ ...p, active: false })),
        items: [{ productId: "consulta", quantity: 1 }],
      }),
    );
    assert.throws(() =>
      createProposal({
        contact,
        template,
        products,
        items: [{ productId: "consulta", quantity: 1.2 }],
      }),
    );
    assert.throws(() =>
      createProposal({
        contact,
        template: { ...template, intro: "{{desconto_secreto}}" },
        products,
        items: [{ productId: "consulta", quantity: 1 }],
      }),
    );
  });
});
test("aprovação exige snapshot correto e concorrência produz um único envio", async () => {
  const s = await fixtures();
  const p = (await s.transaction((tx) => tx.list("proposal")))[0];
  assert.throws(() => reviewProposal(p, "approve", "a".repeat(64), "humano"));
  const results = await Promise.allSettled([
    review(
      s,
      p.id,
      { decision: "approve", hash: p.snapshotHash, note: "" },
      "operador",
    ),
    review(
      s,
      p.id,
      { decision: "approve", hash: p.snapshotHash, note: "" },
      "outro",
    ),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await s.transaction((tx) => tx.list("job"))).filter(
      (j) => j.kind === "send_proposal",
    ).length,
    1,
  );
});
test("transação local reverte mutação em caso de falha", async () => {
  const s = await fixtures();
  await assert.rejects(
    s.transaction(async (tx) => {
      await tx.remove("product", "consulta");
      throw new Error("rollback");
    }),
  );
  assert.ok(await s.transaction((tx) => tx.get("product", "consulta")));
});
test("divisão preserva conteúdo e limite de balões", () => {
  assert.deepEqual(splitReply("A\n\nB\n\nC", "paragraphs", 2), ["A", "B\n\nC"]);
  assert.deepEqual(splitReply("A\n\nB", "single", 2), ["A\n\nB"]);
});
test("assinatura usa bytes originais e rejeita timestamp antigo", () => {
  const raw = Buffer.from('{"a":1}'),
    time = String(Math.floor(Date.now() / 1000)),
    secret = "segredo-de-teste";
  const sig =
    "sha256=" +
    createHmac("sha256", secret)
      .update(time + ".")
      .update(raw)
      .digest("hex");
  assert.ok(validWebhook(raw, time, sig, secret));
  assert.equal(validWebhook(Buffer.from('{"a":2}'), time, sig, secret), false);
  assert.equal(
    validWebhook(raw, time, sig, secret, Date.now() + 600000),
    false,
  );
});
test("PDF é gerado a partir do snapshot", async () => {
  const s = await fixtures(),
    p = (await s.transaction((tx) => tx.list("proposal")))[0];
  const pdf = await proposalPdf(p);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 1500);
});

test("proposta vencida não pode ser aprovada", async () => {
  const s = await fixtures();
  const p = (await s.transaction((tx) => tx.list("proposal")))[0];
  assert.throws(
    () =>
      reviewProposal(
        { ...p, validUntil: "2020-01-01T00:00:00Z" },
        "approve",
        p.snapshotHash,
        "humano",
      ),
    /proposta_expirada/,
  );
});
