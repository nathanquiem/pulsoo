import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { LocalStore } from "../server/store.js";
import { readConfig } from "../server/config.js";
import { defaultOperation } from "../server/operation.js";
import { base } from "../server/domain.js";
import { observeInbound } from "../server/followup.js";
import { processRuntime, recoverRuntimeJobs } from "../server/runtime.js";
import { deliveryParts } from "../server/delivery.js";
import { generateAgent, type AgentResult } from "../server/agent.js";
import { buildApp } from "../server/app.js";
import { IntegrationError, HttpClient } from "../server/integrations/http.js";
import { CentralClient } from "../server/integrations/central.js";
async function fixture() {
  const store = await new LocalStore().init(),
    contactId = randomUUID(),
    conversationId = randomUUID();
  const op = {
    ...defaultOperation(),
    agentEnabled: true,
    testMode: { enabled: true, phones: ["5511999990000"] },
    handoff: { enabled: true, onImage: true, recordNote: true },
    workflow: {
      enabled: true,
      fields: [
        {
          key: "necessidade",
          label: "Necessidade",
          question: "Como podemos ajudar?",
          required: true,
        },
      ],
      stageOnStart: "",
      stageOnHandoff: "",
      responsibleId: "",
      farewell:
        "Obrigada pelas informações!\n\nVou deixar seu atendimento com a equipe.",
      nextStep: "Preparar a orientação.",
      photoPolicy: "immediate" as const,
      requirePhoto: false,
      notification: { kind: "none" as const, targetId: "", numberId: "" },
    },
  };
  const settings = {
    ...base("agent"),
    name: "Assistente",
    tone: "Acolhedor",
    instructions: "Qualifique pelo roteiro.",
    splitMode: "paragraphs" as const,
    maxChunks: 5,
    delayMs: 1200,
    voiceMode: "text" as const,
    groupingMs: 8000,
    replyDelayMs: 2500,
    maxCharsPerMessage: 140,
    naturalParagraphs: true,
  };
  const config = readConfig({
    DEMO_MODE: "true",
    STORAGE_DRIVER: "file",
    SESSION_SECRET: "s".repeat(40),
    OPENAI_API_KEY: "ficticia",
    OPENAI_MODEL: "modelo",
  });
  const start = Date.now();
  let clock = start,
    sends: string[] = [];
  const waits: number[] = [];
  await store.transaction(async (tx) => {
    await tx.put("operation", op);
    await tx.put("settings", settings);
    await tx.put("contact", {
      ...base(contactId),
      name: "Lead de teste",
      company: "",
      phone: "5511999990000",
      stage: "novo",
      notes: "",
      opportunityId: randomUUID(),
      automationAllowed: true,
    });
  });
  async function inbound(text = "Olá", type = "texto") {
    await store.transaction((tx) =>
      observeInbound(tx, {
        contactId,
        conversationId,
        messageId: randomUUID(),
        text,
        occurredAt: new Date(clock).toISOString(),
        receivedAt: new Date(clock).toISOString(),
        channel: "evolution",
        allow: true,
        stage: "novo",
        messageType: type,
      }),
    );
  }
  await inbound();
  const result: AgentResult = {
    text: "Entendi sua necessidade.\n\nPode me contar mais?",
    parts: [],
    reason: "",
    trace: [],
    simulated: false,
    inputTokens: 1,
    outputTokens: 1,
    latencyMs: 1,
    qualification: { necessidade: "Orientação" },
  };
  const sender = {
    sendText: async (_id: string, text: string) => {
      sends.push(text);
      return { mensagem: { id: randomUUID(), status: "enviada" } };
    },
    recordCompletedFollowup: async () => ({
      tarefa: { id: "t", status: "concluida" },
    }),
  };
  const deps = {
    now: () => new Date(clock),
    pause: async (ms: number) => {
      waits.push(ms);
    },
    sender,
    generate: async () => result,
  };
  return {
    store,
    op,
    settings,
    config,
    contactId,
    conversationId,
    result,
    deps,
    waits,
    sends,
    inbound,
    advance: (ms: number) => {
      clock = start + ms;
    },
  };
}
test("agrupa mensagens rápidas e espera a janela completa antes de chamar o modelo", async () => {
  const f = await fixture();
  let calls = 0;
  f.advance(5000);
  await f.inbound("Minha necessidade é orientação");
  await processRuntime(
    f.store,
    { ...f.config, demo: false },
    {
      ...f.deps,
      generate: async () => {
        calls++;
        return f.result;
      },
    },
  );
  assert.equal(calls, 0);
  f.advance(14000);
  await processRuntime(
    f.store,
    { ...f.config, demo: false },
    {
      ...f.deps,
      generate: async (input) => {
        calls++;
        assert.equal(input.messages.length, 2);
        return f.result;
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(f.sends.length, 2);
  assert.deepEqual(f.waits, [2500, 1200]);
});
test("nova resposta entre balões cancela somente o restante e preserva a mensagem enviada", async () => {
  const f = await fixture();
  f.advance(10000);
  let calls = 0;
  const sender = {
    ...f.deps.sender,
    sendText: async (_id: string, text: string) => {
      calls++;
      if (calls === 1) await f.inbound("Já tenho essa informação");
      return { mensagem: { id: "enviada-1", status: "enviada" } };
    },
  };
  await processRuntime(
    f.store,
    { ...f.config, demo: false },
    { ...f.deps, sender },
  );
  assert.equal(calls, 1);
  assert.equal(
    (await f.store.transaction((tx) => tx.list("message"))).filter(
      (m) => m.role === "assistant",
    ).length,
    1,
  );
  assert.equal(
    (await f.store.transaction((tx) => tx.list("runtimeJob"))).some(
      (j) => j.kind === "followup",
    ),
    false,
  );
});
test("entrega parcial incerta não repete o primeiro balão nem a parte sem confirmação", async () => {
  const f = await fixture();
  f.advance(10000);
  let calls = 0;
  await processRuntime(
    f.store,
    { ...f.config, demo: false },
    {
      ...f.deps,
      sender: {
        ...f.deps.sender,
        sendText: async () => {
          calls++;
          if (calls === 2) throw new IntegrationError("timeout", true);
          return { mensagem: { id: "primeira", status: "enviada" } };
        },
      },
    },
  );
  await recoverRuntimeJobs(f.store);
  assert.equal(calls, 2);
  const job = (await f.store.transaction((tx) => tx.list("runtimeJob"))).find(
    (j) => j.kind === "reply",
  )!;
  assert.equal(job.state, "unknown");
  assert.deepEqual(
    job.deliveryParts?.map((p) => p.state),
    ["sent", "sending"],
  );
  assert.equal(
    (
      await f.store.transaction((tx) =>
        tx.get("conversation", f.conversationId),
      )
    )?.deliveryUnknown,
    true,
  );
});
test("reinício seguro entre partes retoma o plano sem gerar outra resposta ou reenviar o confirmado", async () => {
  const f = await fixture();
  f.advance(10000);
  await f.store.transaction(async (tx) => {
    const j = (await tx.list("runtimeJob"))[0];
    await tx.put("runtimeJob", {
      ...j,
      state: "dispatching",
      resultText: "Primeira.\n\nSegunda.",
      deliveryParts: [
        {
          text: "Primeira.",
          state: "sent",
          messageId: "confirmada",
          sentAt: new Date().toISOString(),
        },
        { text: "Segunda.", state: "pending" },
      ],
    });
  });
  await recoverRuntimeJobs(f.store);
  await processRuntime(
    f.store,
    { ...f.config, demo: false },
    {
      ...f.deps,
      generate: async () => {
        throw Error("não deve chamar IA novamente");
      },
    },
  );
  assert.deepEqual(f.sends, ["Segunda."]);
});
test("encaminhamento despede em balões e gera resumo com dados e pendências sem transcrever o histórico", async () => {
  const f = await fixture();
  f.advance(10000);
  await processRuntime(
    f.store,
    { ...f.config, demo: false },
    {
      ...f.deps,
      generate: async () => ({
        ...f.result,
        text: f.op.workflow.farewell,
        handoff: {
          reason: "Equipe deve avaliar",
          summary: "Lead solicitou orientação.",
        },
      }),
    },
  );
  assert.equal(f.sends.length, 2);
  const h = (await f.store.transaction((tx) => tx.list("handoff")))[0];
  assert.ok(h.summary.includes("WhatsApp:"));
  assert.ok(h.summary.includes("Necessidade: Orientação"));
  assert.ok(h.summary.includes("Próximo passo:"));
  assert.equal(h.farewellState, "done");
  assert.equal(
    (await f.store.transaction((tx) => tx.list("runtimeJob"))).some(
      (j) => j.kind === "followup",
    ),
    false,
  );
});
test("limites de balão preservam todo o texto e recusam excesso sem truncar", () => {
  const settings = {
    splitMode: "paragraphs",
    maxChunks: 8,
    maxCharsPerMessage: 100,
    naturalParagraphs: false,
  } as any;
  const text = "Palavra de um texto que precisa ser preservado. "
    .repeat(7)
    .trim();
  const parts = deliveryParts(text, settings);
  assert.ok(parts.every((p) => p.length <= 100));
  assert.equal(parts.join(" ").replace(/\s+/g, " "), text.replace(/\s+/g, " "));
  assert.throws(() => deliveryParts(text, { ...settings, maxChunks: 1 }));
});
test("esquema de qualificação adapta campos de nichos diferentes sem código específico", async () => {
  const f = await fixture();
  await f.store.transaction(async (tx) =>
    tx.put("operation", {
      ...f.op,
      workflow: {
        ...f.op.workflow,
        fields: [
          {
            key: "curso",
            label: "Curso pretendido",
            question: "Qual curso?",
            required: true,
          },
        ],
      },
    }),
  );
  let calls = 0;
  const r = await generateAgent(
    f.store,
    { ...f.config, demo: false },
    {
      messages: [{ role: "user", content: "Quero o curso de culinária" }],
      kind: "reply",
      mode: "live",
      environment: "lab",
    },
    {
      fetch: async (_url, init) => {
        calls++;
        const body = JSON.parse(String(init?.body)),
          tool = body.tools.find(
            (x: any) => x.name === "responder_atendimento",
          );
        assert.ok(tool.parameters.properties.facts.properties.curso);
        assert.equal(
          tool.parameters.properties.facts.properties.necessidade,
          undefined,
        );
        return Response.json({
          id: "r",
          object: "response",
          status: "completed",
          output: [
            {
              type: "function_call",
              id: "f",
              call_id: "c",
              name: "responder_atendimento",
              arguments: JSON.stringify({
                facts: { curso: "Culinária" },
                message: "Que bom!\n\nVocê busca uma formação inicial?",
              }),
            },
          ],
          usage: { input_tokens: 10, output_tokens: 10 },
        });
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(r.qualification?.curso, "Culinária");
});
test("limpeza é restrita ao teste, preserva consumo e permite restaurar sem reexecutar", async (t) => {
  const f = await fixture();
  await f.store.transaction(async (tx) => {
    await tx.put("operation", { ...f.op, agentEnabled: false });
    await tx.put("usage", {
      ...base(),
      provider: "OpenAI",
      model: "m",
      task: "t",
      environment: "lab",
      inputTokens: 1,
      outputTokens: 1,
      estimatedCostMicros: null,
      currency: "USD",
      status: "success",
    });
    await tx.put("contact", {
      ...base("outro"),
      name: "Outro",
      company: "",
      phone: "5511999991111",
      stage: "novo",
      notes: "preservar",
      automationAllowed: true,
    });
  });
  const app = await buildApp(f.config, f.store);
  t.after(() => app.close());
  const reset = await app.inject({
    method: "POST",
    url: "/api/test-history/reset",
  });
  assert.equal(reset.statusCode, 200);
  const id = reset.json().id;
  assert.equal(
    (await f.store.transaction((tx) => tx.list("message"))).length,
    0,
  );
  assert.equal((await f.store.transaction((tx) => tx.list("usage"))).length, 1);
  assert.equal(
    (await f.store.transaction((tx) => tx.get("contact", "outro")))?.notes,
    "preservar",
  );
  const restored = await app.inject({
    method: "POST",
    url: "/api/test-history/" + id + "/restore",
  });
  assert.equal(restored.statusCode, 200);
  assert.equal(
    (await f.store.transaction((tx) => tx.list("runtimeJob")))[0].state,
    "cancelled",
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
test("cliente muda apenas etapa configurada e valida confirmação da Central", async () => {
  let body: any;
  const opportunity = randomUUID();
  const client = new CentralClient(
    {
      baseUrl: "https://central.example",
      key: "ficticia",
      companyId: "c",
      webhookSecret: "s",
    },
    new HttpClient(async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({
        oportunidade: { id: opportunity, etapa_id: "qualificar" },
      });
    }),
  );
  await client.moveStage({
    ...base(),
    kind: "record_stage",
    opportunityId: opportunity,
    stageTarget: "qualificar",
    contactId: "c",
    conversationId: "cv",
    state: "running",
    attempts: 1,
    dueAt: new Date().toISOString(),
    cycle: 1,
    step: 0,
    policyRevision: 1,
  });
  assert.deepEqual(body, { etapa_id: "qualificar" });
});

test("despedida parcialmente confirmada retoma depois de reinício mesmo com a IA já pausada", async () => {
  const f = await fixture();
  f.advance(10000);
  const handoffId = randomUUID();
  await f.store.transaction(async (tx) => {
    const cv = (await tx.get("conversation", f.conversationId))!,
      j = (await tx.list("runtimeJob"))[0];
    await tx.put("handoff", {
      ...base(handoffId),
      contactId: f.contactId,
      conversationId: f.conversationId,
      reason: "Equipe",
      summary: "Resumo",
      noteState: "done",
      farewellState: "pending",
    });
    await tx.put("conversation", {
      ...cv,
      status: "paused",
      manualState: "paused",
      handoffId,
    });
    await tx.put("runtimeJob", {
      ...j,
      state: "dispatching",
      handoffAckId: handoffId,
      resultText: "Recebi as informações.\n\nA equipe continua por aqui.",
      savedHandoff: { reason: "Equipe", summary: "Resumo" },
      deliveryParts: [
        {
          text: "Recebi as informações.",
          state: "sent",
          messageId: "confirmada",
          sentAt: new Date().toISOString(),
        },
        { text: "A equipe continua por aqui.", state: "pending" },
      ],
    });
  });
  await recoverRuntimeJobs(f.store);
  await processRuntime(
    f.store,
    { ...f.config, demo: false },
    {
      ...f.deps,
      generate: async () => {
        throw Error("não deve gerar de novo");
      },
    },
  );
  assert.deepEqual(f.sends, ["A equipe continua por aqui."]);
  assert.equal(
    (await f.store.transaction((tx) => tx.get("handoff", handoffId)))
      ?.farewellState,
    "done",
  );
});
test("falha incerta no aviso humano não dispara avisos repetidos", async () => {
  const f = await fixture();
  f.advance(10000);
  const hId = randomUUID();
  await f.store.transaction(async (tx) => {
    for (const j of await tx.list("runtimeJob"))
      await tx.put("runtimeJob", { ...j, state: "cancelled" });
    await tx.put("handoff", {
      ...base(hId),
      contactId: f.contactId,
      conversationId: f.conversationId,
      reason: "Equipe",
      summary: "Resumo",
      noteState: "done",
      notificationState: "pending",
      notification: { kind: "contact", targetId: randomUUID(), numberId: "" },
    });
    await tx.put("runtimeJob", {
      ...base("notify:" + hId),
      kind: "notify_human",
      contactId: f.contactId,
      conversationId: f.conversationId,
      state: "pending",
      attempts: 0,
      dueAt: new Date().toISOString(),
      cycle: 1,
      step: 0,
      policyRevision: 1,
      executionId: hId,
    });
  });
  let attempts = 0;
  const deps = {
    ...f.deps,
    sender: {
      ...f.deps.sender,
      notifyHuman: async () => {
        attempts++;
        throw new IntegrationError("aviso_incerto", true);
      },
    },
  };
  await processRuntime(f.store, { ...f.config, demo: false }, deps);
  await processRuntime(f.store, { ...f.config, demo: false }, deps);
  assert.equal(attempts, 1);
  assert.equal(
    (await f.store.transaction((tx) => tx.get("runtimeJob", "notify:" + hId)))
      ?.state,
    "unknown",
  );
});
test("etapa com oportunidade ausente é bloqueada e nunca apresentada como concluída", async () => {
  const f = await fixture();
  f.advance(10000);
  await f.store.transaction(async (tx) => {
    for (const j of await tx.list("runtimeJob"))
      await tx.put("runtimeJob", { ...j, state: "cancelled" });
    await tx.put("runtimeJob", {
      ...base("stage:missing"),
      kind: "record_stage",
      contactId: f.contactId,
      conversationId: f.conversationId,
      state: "pending",
      attempts: 0,
      dueAt: new Date().toISOString(),
      cycle: 1,
      step: 0,
      policyRevision: 1,
      stageTarget: randomUUID(),
      expectedStage: "novo",
    });
  });
  let calls = 0;
  await processRuntime(
    f.store,
    { ...f.config, demo: false },
    {
      ...f.deps,
      sender: {
        ...f.deps.sender,
        moveStage: async () => {
          calls++;
        },
      },
    },
  );
  assert.equal(calls, 0);
  assert.equal(
    (await f.store.transaction((tx) => tx.get("runtimeJob", "stage:missing")))
      ?.state,
    "blocked",
  );
});

test("contrato complementar desligado não consulta contexto nem envia presença", async () => {
  let calls = 0;
  const client = new CentralClient(
    {
      baseUrl: "https://central.example",
      key: "ficticia",
      companyId: "c",
      webhookSecret: "s",
    },
    new HttpClient(async () => {
      calls++;
      throw Error("não deve chamar");
    }),
  );
  assert.equal(await client.setTyping("c", 2000), false);
  await assert.rejects(() => client.readContext("c"));
  assert.equal(calls, 0);
});
test("adaptadores complementares validam aviso de grupo, transferência e presença sem simular sucesso", async () => {
  const calls: { url: string; body: any }[] = [];
  const client = new CentralClient(
    {
      baseUrl: "https://central.example",
      key: "ficticia",
      companyId: "c",
      webhookSecret: "s",
      extendedApi: true,
    },
    new HttpClient(async (url, init) => {
      const u = String(url),
        body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url: u, body });
      return Response.json(
        u.endsWith("/presenca")
          ? { aplicado: false }
          : u.endsWith("/encaminhar")
            ? { conversa: { id: "conversa-lead", automacao_pausada: true } }
            : { aviso: { status: "enviado", mensagem_id: "aviso-1" } },
      );
    }),
  );
  const h = {
    ...base(),
    conversationId: "conversa-lead",
    contactId: "lead",
    reason: "Qualificação concluída",
    summary: "Resumo estruturado",
    noteState: "done" as const,
    notification: {
      kind: "group" as const,
      targetId: "120300000000000000@g.us",
      numberId: "numero",
    },
  };
  await client.notifyHuman(h);
  await client.transferHuman(h);
  assert.equal(await client.setTyping(h.conversationId, 50000), false);
  assert.deepEqual(calls[0].body.destino, {
    tipo: "grupo",
    id: h.notification.targetId,
  });
  assert.equal(calls[1].body.id, h.id);
  assert.equal(calls[2].body.duracao_ms, 10000);
});
test("contexto complementar respeita a pausa humana antes de qualquer geração", async () => {
  const f = await fixture();
  const { hydrateContext } = await import("../server/central-context.js");
  const c = {
    ...f.config,
    demo: false,
    central: { ...f.config.central, extendedApi: true },
  };
  const j = (await f.store.transaction((tx) => tx.list("runtimeJob")))[0];
  await hydrateContext(f.store, c, j, {
    readContext: async () => ({
      conversa: { id: f.conversationId },
      contato: { id: f.contactId },
      automacao: { pode_responder: false },
      oportunidades: [],
    }),
  });
  assert.equal(
    (await f.store.transaction((tx) => tx.get("contact", f.contactId)))
      ?.automationAllowed,
    false,
  );
  assert.equal(
    (await f.store.transaction((tx) => tx.get("runtimeJob", j.id)))?.state,
    "cancelled",
  );
});
test("presença sem suporte é ignorada e a resposta continua com as validações de entrega", async () => {
  const f = await fixture();
  f.advance(10000);
  let typing = 0;
  await f.store.transaction(async (tx) =>
    tx.put("settings", { ...f.settings, typing: true }),
  );
  await processRuntime(
    f.store,
    {
      ...f.config,
      demo: false,
      central: { ...f.config.central, extendedApi: true },
    },
    {
      ...f.deps,
      sender: {
        ...f.deps.sender,
        setTyping: async () => {
          typing++;
          return false;
        },
      },
    },
  );
  assert.equal(typing, 1);
  assert.equal(f.sends.length, 2);
});
test("política de fotos do fluxo estruturado funciona sem a opção antiga do modo simples", async () => {
  const f = await fixture();
  await f.store.transaction((tx) =>
    tx.put("operation", {
      ...f.op,
      handoff: { ...f.op.handoff, onImage: false },
    }),
  );
  await f.inbound("Foto recebida", "imagem");
  f.advance(10000);
  await processRuntime(
    f.store,
    { ...f.config, demo: false },
    {
      ...f.deps,
      generate: async (input) => {
        assert.equal(input.forceHandoff, true);
        assert.equal(input.photoCount, 1);
        return {
          ...f.result,
          text: f.op.workflow.farewell,
          handoff: { reason: "Fotos", summary: "Equipe deve avaliar" },
        };
      },
    },
  );
  assert.equal(
    (await f.store.transaction((tx) => tx.list("handoff"))).length,
    1,
  );
});

test("destino humano configurado não volta ao fluxo de qualificação", async () => {
  const f = await fixture();
  await f.store.transaction((tx) =>
    tx.put("operation", {
      ...f.op,
      testMode: { enabled: false, phones: [] },
      workflow: {
        ...f.op.workflow,
        notification: { kind: "contact", targetId: f.contactId, numberId: "" },
      },
    }),
  );
  f.advance(10000);
  let calls = 0;
  await processRuntime(
    f.store,
    { ...f.config, demo: false },
    {
      ...f.deps,
      generate: async () => {
        calls++;
        return f.result;
      },
    },
  );
  assert.equal(calls, 0);
  assert.equal(f.sends.length, 0);
});
