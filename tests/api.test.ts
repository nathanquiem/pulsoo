import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { readConfig } from "../server/config.js";
import { LocalStore } from "../server/store.js";
import { seedDemo } from "../server/seed.js";
import { defaultOperation } from "../server/operation.js";
import { buildApp, publicSafe } from "../server/app.js";
const env = {
  DEMO_MODE: "true",
  STORAGE_DRIVER: "file",
  HOST: "127.0.0.1",
  CENTRAL_EMPRESA_ID: "empresa-1",
  CENTRAL_WEBHOOK_SECRET: "segredo-compartilhado-teste",
  SESSION_SECRET: "s".repeat(48),
};
async function setup() {
  const c = readConfig(env),
    s = await new LocalStore().init();
  await seedDemo(s);
  await s.transaction((tx) =>
    tx.put("operation", {
      ...defaultOperation(),
      modules: { catalog: true, proposals: true, calendar: false },
    }),
  );
  const app = await buildApp(c, s);
  return { c, s, app };
}
test("webhook da Central é autenticado, isolado e idempotente", async (t) => {
  const { app, s, c } = await setup();
  t.after(() => app.close());
  await s.transaction(async (tx) =>
    tx.put("rule", {
      id: "r1",
      createdAt: new Date().toISOString(),
      name: "Proposta",
      fromStage: "qualificar",
      toStage: "propor",
      templateId: "padrao",
      productIds: ["consulta"],
      active: true,
      requireApproval: true,
    }),
  );
  const body = {
    versao: "2.0",
    evento: { id: "evento-1", tipo: "negocio.etapa_alterada" },
    empresa: { id: "empresa-1" },
    contato: { id: "marina", nome: "Marina Costa" },
    oportunidade: {
      etapa: { id: "propor" },
      etapa_anterior: { id: "qualificar" },
    },
    atendimento: {
      conversa_id: "conversa-1",
      automacao: { pode_responder: true },
    },
  };
  const send = (payload = body, signature?: string) => {
    const raw = JSON.stringify(payload),
      timestamp = String(Math.floor(Date.now() / 1000)),
      sig =
        signature ??
        "sha256=" +
          createHmac("sha256", c.central.webhookSecret)
            .update(timestamp + "." + raw)
            .digest("hex");
    return app.inject({
      method: "POST",
      url: "/api/webhooks/central",
      headers: {
        "Content-Type": "application/json",
        "X-Central-Id": "evento-1",
        "X-Central-Timestamp": timestamp,
        "X-Central-Assinatura": sig,
      },
      payload: raw,
    });
  };
  assert.equal((await send(body, "invalida")).statusCode, 401);
  assert.equal(
    (await send({ ...body, empresa: { id: "outra" } })).statusCode,
    422,
  );
  const first = await send();
  assert.equal(first.statusCode, 202);
  assert.equal(first.json().duplicate, false);
  const second = await send();
  assert.equal(second.statusCode, 202);
  assert.equal(second.json().duplicate, true);
  assert.equal(
    (await s.transaction((tx) => tx.list("proposal"))).filter(
      (p) => p.sourceKey === "evento-1:r1",
    ).length,
    1,
  );
});
test("preço fornecido pelo navegador não pode substituir catálogo", async (t) => {
  const { app } = await setup();
  t.after(() => app.close());
  const r = await app.inject({
    method: "POST",
    url: "/api/proposals",
    payload: {
      contactId: "marina",
      templateId: "padrao",
      items: [{ productId: "consulta", quantity: 1, priceCents: 1 }],
    },
  });
  assert.equal(r.statusCode, 422);
});
test("modo real exige login e recusa origem de outro site", async (t) => {
  const c = readConfig({
      ...env,
      DEMO_MODE: "false",
      ADMIN_EMAIL: "operador@example.com",
      ADMIN_PASSWORD: "senha-de-teste-123",
    }),
    s = await new LocalStore().init();
  const app = await buildApp(c, s);
  t.after(() => app.close());
  assert.equal((await app.inject("/api/bootstrap")).statusCode, 401);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/login",
        headers: { origin: "https://outro.example" },
        payload: { email: c.email, password: c.password },
      })
    ).statusCode,
    403,
  );
  const login = await app.inject({
    method: "POST",
    url: "/api/login",
    payload: { email: c.email, password: c.password },
  });
  assert.equal(login.statusCode, 200);
  const cookie = String(login.headers["set-cookie"]).split(";")[0];
  assert.match(String(login.headers["set-cookie"]), /HttpOnly/);
  assert.equal(
    (await app.inject({ url: "/api/bootstrap", headers: { cookie } }))
      .statusCode,
    200,
  );
});
test("resposta pública não expõe domínio ou segredos da Central", () => {
  const c = readConfig({
    ...env,
    CENTRAL_BASE_URL: "https://central.privada.example",
    CENTRAL_API_KEY: "cs_live_teste_muito_secreto",
  });
  const safe = JSON.stringify(
    publicSafe(
      {
        text: "Abrir https://central.privada.example/app/conversa ou CENTRAL.PRIVADA.EXAMPLE e cs_live_teste_muito_secreto",
      },
      c,
    ),
  );
  assert.equal(safe.toLowerCase().includes("central.privada.example"), false);
  assert.equal(safe.includes("cs_live_"), false);
});
test("simulação do laboratório não usa chaves e separa consumo", async (t) => {
  const { app, s } = await setup();
  t.after(() => app.close());
  const r = await app.inject({
    method: "POST",
    url: "/api/lab/chat",
    payload: {
      messages: [{ role: "user", content: "Quais os preços?" }],
      mode: "live",
    },
  });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().simulated, true);
  const usage = await s.transaction((tx) => tx.list("usage"));
  assert.equal(usage[0].estimatedCostMicros, 0);
  assert.equal(usage[0].environment, "lab");
});
test("produção recusa demonstração e persistência local", () => {
  assert.throws(() =>
    readConfig({
      ...env,
      NODE_ENV: "production",
      APP_URL: "https://pulsoo.example",
      ADMIN_PASSWORD: "senha-de-teste-123",
      DATABASE_URL: "postgres://x",
    }),
  );
});

test("todas as respostas JSON removem domínio interno, inclusive criação de proposta", async (t) => {
  const { app, s, c } = await setup();
  t.after(() => app.close());
  c.central.baseUrl = "https://central-interna.example";
  await s.transaction(async (tx) => {
    const contact = (await tx.get("contact", "marina"))!;
    await tx.put("contact", {
      ...contact,
      notes: "Origem https://central-interna.example/app/contato",
    });
  });
  const result = await app.inject({
    method: "POST",
    url: "/api/proposals",
    payload: {
      contactId: "marina",
      templateId: "padrao",
      items: [{ productId: "consulta", quantity: 1 }],
    },
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.includes("central-interna.example"), false);
  assert.match(result.json().notes, /endereço interno/);
});

test("áudio recebido cancela follow-up e aguarda conteúdo antes de gerar resposta", async (t) => {
  const { app, s, c } = await setup();
  t.after(() => app.close());
  const contactId = randomUUID(),
    conversationId = randomUUID();
  await s.transaction(async (tx) => {
    await tx.put("operation", { ...defaultOperation(), agentEnabled: true });
    await tx.put("contact", {
      id: contactId,
      createdAt: new Date().toISOString(),
      name: "Exemplo",
      company: "",
      phone: "",
      stage: "Qualificação",
      notes: "",
      conversationId,
      automationAllowed: true,
    });
    await tx.put("conversation", {
      id: conversationId,
      createdAt: new Date().toISOString(),
      contactId,
      stage: "Qualificação",
      channel: "evolution",
      status: "active",
      cycle: 1,
      followupStep: 0,
    });
    await tx.put("runtimeJob", {
      id: "follow-audio",
      createdAt: new Date().toISOString(),
      kind: "followup",
      conversationId,
      contactId,
      state: "pending",
      attempts: 0,
      dueAt: new Date().toISOString(),
      cycle: 1,
      step: 0,
      policyRevision: 1,
    });
  });
  const eventId = randomUUID(),
    body = {
      versao: "2.0",
      evento: {
        id: eventId,
        tipo: "whatsapp.mensagem_recebida",
        origem: "evolution",
        ocorrido_em: new Date().toISOString(),
      },
      empresa: { id: c.central.companyId },
      contato: { id: contactId },
      atendimento: {
        conversa_id: conversationId,
        automacao: { pode_responder: true },
      },
      mensagem: { id: randomUUID(), direcao: "entrada", tipo: "audio" },
    };
  const raw = JSON.stringify(body),
    stamp = String(Math.floor(Date.now() / 1000));
  const r = await app.inject({
    method: "POST",
    url: "/api/webhooks/central",
    headers: {
      "Content-Type": "application/json",
      "X-Central-Id": eventId,
      "X-Central-Timestamp": stamp,
      "X-Central-Assinatura":
        "sha256=" +
        createHmac("sha256", c.central.webhookSecret)
          .update(stamp + "." + raw)
          .digest("hex"),
    },
    payload: raw,
  });
  assert.equal(r.statusCode, 202);
  const jobs = await s.transaction((tx) => tx.list("runtimeJob"));
  assert.equal(jobs.find((j) => j.id === "follow-audio")?.state, "cancelled");
  assert.equal(
    jobs.filter((j) => j.kind === "reply" && j.state === "pending").length,
    0,
  );
  assert.equal(
    (await s.transaction((tx) => tx.get("conversation", conversationId)))
      ?.status,
    "paused",
  );
});
