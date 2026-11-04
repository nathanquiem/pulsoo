import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { LocalStore } from "../server/store.js";
import { readConfig } from "../server/config.js";
import { base } from "../server/domain.js";
import { defaultOperation, testContactAllowed } from "../server/operation.js";
import { buildApp } from "../server/app.js";
import { processRuntime, recoverRuntimeJobs } from "../server/runtime.js";
import { observeInbound, syncConversationGate } from "../server/followup.js";
import { generateAgent, type AgentResult } from "../server/agent.js";
import { IntegrationError, HttpClient } from "../server/integrations/http.js";
import { CentralClient } from "../server/integrations/central.js";
async function fixture() {
  const store = await new LocalStore().init();
  const config = readConfig({
    DEMO_MODE: "true",
    STORAGE_DRIVER: "file",
    CENTRAL_EMPRESA_ID: "empresa",
    CENTRAL_WEBHOOK_SECRET: "segredo-ficticio",
    SESSION_SECRET: "s".repeat(40),
    OPENAI_API_KEY: "ficticia",
    OPENAI_MODEL: "modelo",
  });
  const op = {
    ...defaultOperation(),
    agentEnabled: true,
    testMode: { enabled: true, phones: ["5511999990000"] },
    handoff: { enabled: true, onImage: true, recordNote: true },
  };
  await store.transaction(async (tx) => {
    await tx.put("operation", op);
    await tx.put("settings", {
      ...base("agent"),
      name: "Assistente",
      tone: "Natural",
      instructions: "Qualifique e encaminhe para humano.",
      splitMode: "single",
      maxChunks: 1,
      delayMs: 0,
      voiceMode: "text",
    });
  });
  const app = await buildApp(config, store);
  const contactId = randomUUID(),
    conversationId = randomUUID();
  async function inbound(
    type = "texto",
    phone = "5511999990000",
    content = "Preciso de proteção",
    eventId = randomUUID(),
  ) {
    const payload = JSON.stringify({
      versao: "2.0",
      evento: {
        id: eventId,
        tipo: "whatsapp.mensagem_recebida",
        ocorrido_em: new Date().toISOString(),
        origem: "evolution",
      },
      empresa: { id: "empresa" },
      contato: { id: contactId, nome: "Contato fictício", telefone: phone },
      oportunidade: { etapa: { id: "qualificacao" } },
      atendimento: {
        conversa_id: conversationId,
        automacao: { pode_responder: true },
      },
      mensagem: {
        id: eventId,
        direcao: "entrada",
        tipo: type,
        conteudo: content,
      },
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature =
      "sha256=" +
      createHmac("sha256", config.central.webhookSecret)
        .update(timestamp + "." + payload)
        .digest("hex");
    return app.inject({
      method: "POST",
      url: "/api/webhooks/central",
      headers: {
        "content-type": "application/json",
        "x-central-id": eventId,
        "x-central-timestamp": timestamp,
        "x-central-assinatura": signature,
      },
      payload,
    });
  }
  return { store, config, op, app, inbound, contactId, conversationId };
}
const result: AgentResult = {
  text: "Vou encaminhar sua dúvida para a equipe.",
  reason: "",
  trace: [],
  simulated: false,
  inputTokens: 1,
  outputTokens: 1,
  latencyMs: 1,
  parts: [],
  handoff: {
    reason: "Dúvida técnica sem resposta aprovada",
    summary: "Lead quer saber se a estrutura permite instalar.",
  },
};
test("teste restrito não agenda outros contatos e lista vazia bloqueia todos", async (t) => {
  const f = await fixture();
  t.after(() => f.app.close());
  assert.equal((await f.inbound("texto", "5511999991111")).statusCode, 202);
  assert.equal(
    (await f.store.transaction((tx) => tx.list("runtimeJob"))).length,
    0,
  );
  assert.equal(
    testContactAllowed(
      { ...f.op, testMode: { enabled: true, phones: [] } },
      { phone: "5511999990000" },
    ),
    false,
  );
  assert.equal(testContactAllowed(f.op, { phone: "(11) 99999-0000" }), true);
  assert.equal(testContactAllowed(f.op, { phone: "" }), false);
});
test("foto pausa para humano, cancela fila e não reinicia após novas mensagens ou eventos", async (t) => {
  const f = await fixture();
  t.after(() => f.app.close());
  await f.inbound();
  const eventId = randomUUID();
  assert.equal(
    (await f.inbound("imagem", undefined, "", eventId)).statusCode,
    202,
  );
  assert.equal(
    (await f.inbound("imagem", undefined, "", eventId)).statusCode,
    202,
  );
  await f.inbound("texto", undefined, "As medidas são aproximadas");
  await f.store.transaction((tx) =>
    syncConversationGate(tx, f.contactId, true, false),
  );
  const cv = await f.store.transaction((tx) =>
    tx.get("conversation", f.conversationId),
  );
  assert.equal(cv?.status, "paused");
  assert.equal(cv?.manualState, "paused");
  assert.ok(cv?.handoffId);
  const jobs = await f.store.transaction((tx) => tx.list("runtimeJob"));
  assert.equal(
    jobs.filter((j) => j.kind === "reply" && j.state === "pending").length,
    0,
  );
  assert.equal(jobs.filter((j) => j.kind === "record_handoff").length, 1);
  assert.equal(
    (await f.store.transaction((tx) => tx.list("handoff"))).length,
    1,
  );
});
test("mudança do número autorizado cancela turno já enfileirado antes de chamar IA", async (t) => {
  const f = await fixture();
  t.after(() => f.app.close());
  await f.inbound();
  await f.store.transaction(async (tx) =>
    tx.put("operation", { ...f.op, testMode: { enabled: true, phones: [] } }),
  );
  let calls = 0;
  await processRuntime(f.store, f.config, {
    now: () => new Date(Date.now() + 6000),
    generate: async () => {
      calls++;
      return result;
    },
  });
  assert.equal(calls, 0);
  assert.equal(
    (await f.store.transaction((tx) => tx.list("runtimeJob")))[0].lastError,
    "fora_do_contato_de_teste",
  );
});
test("solicitação humana envia uma confirmação e não agenda follow-up", async (t) => {
  const f = await fixture();
  t.after(() => f.app.close());
  await f.inbound();
  let sends = 0;
  await processRuntime(
    f.store,
    { ...f.config, demo: false },
    {
      now: () => new Date(Date.now() + 6000),
      generate: async () => result,
      sender: {
        sendText: async () => {
          sends++;
          return { mensagem: { id: "confirmada", status: "enviada" } };
        },
        recordCompletedFollowup: async () => {
          throw Error("não deve registrar follow-up");
        },
      },
    },
  );
  assert.equal(sends, 1);
  const cv = await f.store.transaction((tx) =>
    tx.get("conversation", f.conversationId),
  );
  assert.equal(cv?.status, "paused");
  assert.ok(cv?.handoffId);
  assert.equal(
    (await f.store.transaction((tx) => tx.list("runtimeJob"))).some(
      (j) => j.kind === "followup",
    ),
    false,
  );
});
test("falha na confirmação mantém encaminhamento e não repete envio incerto", async (t) => {
  const f = await fixture();
  t.after(() => f.app.close());
  await f.inbound();
  let sends = 0;
  const deps = {
    now: () => new Date(Date.now() + 6000),
    generate: async () => result,
    sender: {
      sendText: async () => {
        sends++;
        throw new IntegrationError("timeout", true);
      },
      recordCompletedFollowup: async () => {
        throw Error("não esperado");
      },
    },
  };
  await processRuntime(f.store, { ...f.config, demo: false }, deps);
  await recoverRuntimeJobs(f.store);
  const cv = await f.store.transaction((tx) =>
    tx.get("conversation", f.conversationId),
  );
  assert.equal(sends, 1);
  assert.equal(cv?.manualState, "paused");
  assert.equal(cv?.deliveryUnknown, true);
  await f.inbound("texto", undefined, "Pode continuar?");
  assert.equal(
    (
      await f.store.transaction((tx) =>
        tx.get("conversation", f.conversationId),
      )
    )?.deliveryUnknown,
    true,
  );
  assert.equal(
    (await f.store.transaction((tx) => tx.list("runtimeJob"))).filter(
      (j) => j.kind === "reply" && j.state === "pending",
    ).length,
    0,
  );
});
test("nota de encaminhamento tem repetição independente sem reativar atendimento", async (t) => {
  const f = await fixture();
  t.after(() => f.app.close());
  await f.inbound("imagem", undefined, "");
  let attempts = 0;
  const ids: string[] = [];
  let clock = Date.now() + 6000;
  const sender = {
    sendText: async () => {
      throw Error("não deve enviar mensagem");
    },
    recordCompletedFollowup: async () => {
      throw Error("não esperado");
    },
    recordHandoffNote: async (h: { id: string }) => {
      ids.push(h.id);
      if (++attempts === 1) throw new IntegrationError("temporario", true, 503);
      return { nota: { id: "nota-confirmada" } };
    },
  };
  await processRuntime(
    f.store,
    { ...f.config, demo: false },
    { sender, now: () => new Date(clock) },
  );
  await f.inbound("texto", undefined, "Obrigado");
  clock += 600000;
  await recoverRuntimeJobs(f.store);
  await processRuntime(
    f.store,
    { ...f.config, demo: false },
    { sender, now: () => new Date(clock) },
  );
  assert.equal(attempts, 2);
  assert.equal(ids[0], ids[1]);
  assert.equal(
    (await f.store.transaction((tx) => tx.list("handoff")))[0].noteState,
    "done",
  );
  assert.equal(
    (
      await f.store.transaction((tx) =>
        tx.get("conversation", f.conversationId),
      )
    )?.status,
    "paused",
  );
});
test("principal solicita humano em uma chamada e laboratório não pausa conversa real", async (t) => {
  const f = await fixture();
  t.after(() => f.app.close());
  let calls = 0;
  const mock: typeof fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.ok(
      body.tools.some((x: { name: string }) => x.name === "solicitar_humano"),
    );
    return Response.json({
      id: "r",
      object: "response",
      status: "completed",
      output: [
        {
          type: "function_call",
          id: "fc",
          call_id: "c",
          name: "solicitar_humano",
          arguments: JSON.stringify({
            reason: "Dúvida técnica",
            summary: "Solicitou avaliação",
            message: "A equipe vai ajudar com essa avaliação.",
          }),
        },
      ],
      usage: { input_tokens: 20, output_tokens: 10 },
    });
  };
  const r = await generateAgent(
    f.store,
    { ...f.config, demo: false },
    {
      messages: [
        { role: "user", content: "Consegue certificar minha sacada?" },
      ],
      mode: "live",
      kind: "reply",
      environment: "lab",
    },
    { fetch: mock },
  );
  assert.equal(calls, 1);
  assert.equal(r.handoff?.reason, "Dúvida técnica");
  assert.ok(r.text);
  assert.equal(
    (await f.store.transaction((tx) => tx.list("handoff"))).length,
    0,
  );
});
test("cliente de notas repete ID externo e não envia credenciais no conteúdo", async () => {
  const calls: { url: string; body: any; headers: any }[] = [];
  const client = new CentralClient(
    {
      baseUrl: "https://central.example",
      key: "segredo-ficticio",
      companyId: "c",
      webhookSecret: "s",
    },
    new HttpClient(async (url, init) => {
      calls.push({
        url: String(url),
        body: JSON.parse(String(init?.body)),
        headers: init?.headers,
      });
      return Response.json({ nota: { id: "nota-confirmada" } });
    }),
  );
  const h = {
    ...base(),
    contactId: randomUUID(),
    conversationId: randomUUID(),
    reason: "Fotos recebidas",
    summary: "Lead pediu proteção",
    noteState: "pending" as const,
  };
  await client.recordHandoffNote(h, 1);
  await client.recordHandoffNote(h, 2);
  assert.equal(calls[0].body.id, calls[1].body.id);
  assert.equal(calls[0].body.conversa_id, h.conversationId);
  assert.ok(calls[0].url.endsWith("/contatos/" + h.contactId + "/notas"));
  assert.ok(!calls[0].body.conteudo.includes("segredo-ficticio"));
});

test("troca de roteiro cancela geração pendente sem remover registro humano", async (t) => {
  const f = await fixture();
  t.after(() => f.app.close());
  await f.inbound();
  const before = await f.store.transaction((tx) =>
    tx.get("operation", "operation"),
  );
  const response = await f.app.inject({
    method: "PUT",
    url: "/api/settings",
    payload: {
      name: "Assistente",
      tone: "Natural",
      instructions: "Roteiro novo aprovado",
      splitMode: "single",
      maxChunks: 1,
      delayMs: 0,
      voiceMode: "text",
    },
  });
  assert.equal(response.statusCode, 200);
  const jobs = await f.store.transaction((tx) => tx.list("runtimeJob"));
  assert.equal(jobs[0].state, "cancelled");
  assert.equal(
    (await f.store.transaction((tx) => tx.get("operation", "operation")))
      ?.revision,
    (before?.revision ?? 0) + 1,
  );
});
test("restrição alterada durante geração impede confirmação e encaminhamento", async (t) => {
  const f = await fixture();
  t.after(() => f.app.close());
  await f.inbound();
  let sends = 0;
  await processRuntime(
    f.store,
    { ...f.config, demo: false },
    {
      now: () => new Date(Date.now() + 6000),
      generate: async () => {
        await f.store.transaction((tx) =>
          tx.put("operation", {
            ...f.op,
            testMode: { enabled: true, phones: [] },
          }),
        );
        return result;
      },
      sender: {
        sendText: async () => {
          sends++;
          return { mensagem: { id: "não-deve", status: "enviada" } };
        },
        recordCompletedFollowup: async () => {
          throw Error("não esperado");
        },
      },
    },
  );
  assert.equal(sends, 0);
  assert.equal(
    (await f.store.transaction((tx) => tx.list("handoff"))).length,
    0,
  );
});
