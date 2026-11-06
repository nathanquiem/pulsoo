import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { LocalStore } from "../server/store.js";
import { base, validWebhook } from "../server/domain.js";
import { defaultOperation, operationSchema } from "../server/operation.js";
import { flowProgress, lookupInformation } from "../server/flow-state.js";
import { generateAgent } from "../server/agent.js";
import { readConfig } from "../server/config.js";
import { buildApp } from "../server/app.js";
import {
  notificationPayload,
  notificationSignature,
  sendHumanNotification,
} from "../server/human-notification.js";
import { HttpClient } from "../server/integrations/http.js";
import { recoverRuntimeJobs } from "../server/runtime.js";
import { deliveryParts } from "../server/delivery.js";
import type { Operation, HumanHandoff, RuntimeJob } from "../shared/model.js";
function opFixture(): Operation {
  return {
    ...defaultOperation(),
    specialists: [],
    handoff: { enabled: true, onImage: false, recordNote: true },
    workflow: {
      enabled: true,
      fields: [
        {
          key: "necessidade",
          label: "Necessidade",
          question: "O que precisa?",
          required: true,
        },
        {
          key: "cidade",
          label: "Cidade",
          question: "Em qual cidade?",
          required: true,
        },
      ],
      steps: [
        {
          id: "identificar",
          title: "Identificar",
          objective: "Entender a necessidade",
          question: "O que você precisa?",
          instructions: "Acolha antes de perguntar.",
          fieldKeys: ["necessidade"],
          requirePhoto: false,
          crmStageId: "",
        },
        {
          id: "local",
          title: "Local",
          objective: "Localizar o atendimento",
          question: "Em qual cidade será?",
          instructions: "Não repetir os dados conhecidos.",
          fieldKeys: ["cidade"],
          requirePhoto: false,
          crmStageId: "",
        },
      ],
      autoHandoff: false,
      knowledge: [
        {
          id: "area",
          question: "Área de atendimento e cidades atendidas",
          answer:
            "Atendemos Cidade Exemplo e região; confirme o bairro com a equipe.",
        },
      ],
      stageOnStart: "",
      stageOnHandoff: "",
      responsibleId: "",
      farewell: "Obrigada! A equipe continuará o atendimento.",
      nextStep: "Continuar avaliação",
      requirePhoto: false,
      photoPolicy: "collect",
      notification: { kind: "none", targetId: "", numberId: "" },
    },
  };
}
async function agentFixture() {
  const store = await new LocalStore().init(),
    op = opFixture();
  await store.transaction(async (tx) => {
    await tx.put("operation", op);
    await tx.put("settings", {
      ...base("agent"),
      name: "Assistente",
      tone: "Acolhedor",
      instructions:
        "Consulte dados aprovados para dúvidas. Retome o passo pendente.",
      splitMode: "paragraphs",
      maxChunks: 5,
      delayMs: 0,
      voiceMode: "text",
    });
  });
  return {
    store,
    op,
    c: readConfig({
      DEMO_MODE: "false",
      ADMIN_PASSWORD: "teste-seguro-123",
      SESSION_SECRET: "s".repeat(40),
      OPENAI_API_KEY: "ficticia",
      OPENAI_MODEL: "modelo",
      AGENT_MAX_DELEGATIONS: "0",
    }),
  };
}
function call(name: string, args: unknown) {
  return {
    type: "function_call",
    id: randomUUID(),
    call_id: randomUUID(),
    name,
    arguments: JSON.stringify(args),
  };
}
function response(output: any[]) {
  return new Response(
    JSON.stringify({
      id: randomUUID(),
      object: "response",
      status: "completed",
      output,
      usage: { input_tokens: 10, output_tokens: 10 },
    }),
    { headers: { "content-type": "application/json" } },
  );
}
test("o estado do fluxo preserva pendência durante dúvidas e aceita informações adiantadas", () => {
  const op = opFixture();
  assert.equal(
    flowProgress(op, { necessidade: "Proteção" }, 0).stepId,
    "local",
  );
  assert.equal(
    flowProgress(op, { cidade: "Cidade Exemplo" }, 0).stepId,
    "identificar",
  );
  assert.equal(
    flowProgress(op, { necessidade: "Não informado", cidade: "Pendente" }, 0)
      .ready,
    false,
  );
  assert.equal(
    flowProgress(op, { necessidade: "Proteção", cidade: "Cidade Exemplo" }, 0)
      .ready,
    true,
  );
  op.workflow!.steps![1].requirePhoto = true;
  assert.equal(
    flowProgress(op, { necessidade: "Proteção", cidade: "Cidade Exemplo" }, 0)
      .photoMissing,
    true,
  );
  assert.equal(
    flowProgress(op, { necessidade: "Proteção", cidade: "Cidade Exemplo" }, 1)
      .ready,
    true,
  );
});
test("condições de etapa recusam campo inexistente, passo vazio e ID duplicado", () => {
  const op = opFixture();
  op.workflow!.steps![0].fieldKeys = ["inexistente"];
  assert.equal(
    operationSchema.safeParse({
      ...op,
      id: undefined,
      createdAt: undefined,
      revision: undefined,
    }).success,
    false,
  );
  const clean = (({ id, createdAt, revision, ...rest }) => rest)(opFixture());
  assert.equal(operationSchema.safeParse(clean).success, true);
  clean.workflow!.steps![0].fieldKeys = [];
  assert.equal(operationSchema.safeParse(clean).success, false);
});
test("consulta retorna somente informação aprovada com correspondência; assunto ausente não vira resposta", () => {
  const op = opFixture();
  assert.equal(
    lookupInformation(op, "qual área de atendimento?").entries[0].id,
    "area",
  );
  assert.equal(
    lookupInformation(op, "resistência do vidro temperado").found,
    false,
  );
});
test("loop executa consulta local sem subagente, devolve resultado por call_id e volta à pendência", async () => {
  const f = await agentFixture(),
    calls: any[] = [];
  const result = await generateAgent(
    f.store,
    f.c,
    {
      messages: [{ role: "user", content: "Onde vocês atendem?" }],
      kind: "reply",
      mode: "live",
      environment: "lab",
      contact: {
        ...base("contato"),
        name: "Lead",
        phone: "5511999990000",
        company: "",
        stage: "novo",
        notes: "",
        automationAllowed: true,
        qualification: { necessidade: "Proteção" },
      },
    },
    {
      fetch: async (_u, init) => {
        const body = JSON.parse(String(init?.body));
        calls.push(body);
        if (calls.length === 1) {
          assert(
            body.tools.some((t: any) => t.name === "consultar_informacoes"),
          );
          assert(
            !body.tools.some((t: any) => t.name === "consultar_especialista"),
          );
          return response([
            call("consultar_informacoes", {
              pergunta: "Área de atendimento e cidades",
            }),
          ]);
        }
        const output = body.input.find(
          (v: any) => v.type === "function_call_output",
        );
        assert(output.call_id);
        assert(JSON.parse(output.output).found);
        assert(body.instructions.includes('"stepId":"local"'));
        return response([
          call("responder_atendimento", {
            facts: { necessidade: "Proteção", cidade: null },
            message: "Atendemos Cidade Exemplo e região. Em qual cidade será?",
          }),
        ]);
      },
    },
  );
  assert.equal(calls.length, 2);
  assert.equal(result.handoff, undefined);
  assert(result.trace.some((t) => t.name === "consultar_informacoes"));
  assert(result.text?.includes("Em qual cidade"));
  assert.equal((await f.store.transaction((tx) => tx.list("usage"))).length, 2);
});
test("dúvida sem resposta usa mensagem específica e não a despedida de conclusão", async () => {
  const f = await agentFixture();
  const result = await generateAgent(
    f.store,
    f.c,
    {
      messages: [{ role: "user", content: "Isso suporta vidro temperado?" }],
      kind: "reply",
      mode: "live",
      environment: "lab",
    },
    {
      fetch: async () =>
        response([
          call("solicitar_humano", {
            reason: "Dúvida técnica",
            summary: "Precisa avaliar vidro",
            message:
              "Sobre o vidro, preciso da avaliação da equipe. Vou deixar essa dúvida com ela por aqui.",
            reasonKind: "question",
            facts: { necessidade: null, cidade: null },
          }),
        ]),
    },
  );
  assert(result.handoff);
  assert(result.text?.includes("Sobre o vidro"));
  assert.notEqual(result.text, f.op.workflow!.farewell);
});
test("conclusão ready não aceita pendente como fato e preserva pergunta aprovada", async () => {
  const f = await agentFixture();
  const result = await generateAgent(
    f.store,
    f.c,
    {
      messages: [{ role: "user", content: "Pode seguir" }],
      kind: "reply",
      mode: "live",
      environment: "lab",
    },
    {
      fetch: async () =>
        response([
          call("solicitar_humano", {
            reason: "Concluído",
            summary: "Nada",
            message: "Equipe continuará.",
            reasonKind: "ready",
            facts: { necessidade: "Não informado", cidade: "Pendente" },
          }),
        ]),
    },
  );
  assert.equal(result.handoff, undefined);
  assert.equal(result.text, "O que você precisa?");
  assert(result.trace.some((t) => t.name === "pre_condicao"));
});
test("conclusão automática usa condições satisfeitas e gera encaminhamento, sem depender de frase mágica", async () => {
  const f = await agentFixture();
  f.op.workflow!.autoHandoff = true;
  await f.store.transaction((tx) => tx.put("operation", f.op));
  const result = await generateAgent(
    f.store,
    f.c,
    {
      messages: [
        { role: "user", content: "Preciso de proteção, Cidade Exemplo." },
      ],
      kind: "reply",
      mode: "live",
      environment: "lab",
    },
    {
      fetch: async () =>
        response([
          call("responder_atendimento", {
            facts: { necessidade: "Proteção", cidade: "Cidade Exemplo" },
            message: "Tudo certo.",
          }),
        ]),
    },
  );
  assert(result.handoff);
  assert.equal(result.text, f.op.workflow!.farewell);
});
test("modelos que ignoram o protocolo obrigatório não enviam texto sem validação", async () => {
  const f = await agentFixture();
  await assert.rejects(
    () =>
      generateAgent(
        f.store,
        f.c,
        {
          messages: [{ role: "user", content: "Oi" }],
          kind: "reply",
          mode: "live",
          environment: "lab",
        },
        {
          fetch: async () =>
            response([
              {
                type: "message",
                id: "m",
                role: "assistant",
                status: "completed",
                content: [
                  { type: "output_text", text: "Sem função.", annotations: [] },
                ],
              },
            ]),
        },
      ),
    /modelo_nao_usou_ferramenta/,
  );
});
function noticeFixture() {
  const id = randomUUID();
  const h: HumanHandoff = {
    ...base(id),
    conversationId: randomUUID(),
    contactId: randomUUID(),
    reason: "Qualificado",
    summary: "Nome e dados organizados",
    noteState: "done",
    notificationState: "pending",
    notification: { kind: "webhook", targetId: "grupo-exemplo", numberId: "" },
    notificationData: {
      lead: {
        id: "lead",
        name: "Lead fictício",
        phone: "5511999990000",
        conversationId: "conversa",
        stage: "qualificacao",
      },
      qualification: [
        { key: "necessidade", label: "Necessidade", value: "Orientação" },
      ],
      photosReceived: 1,
      nextStep: "Avaliar pedido",
    },
  };
  const c = readConfig({
    DEMO_MODE: "true",
    STORAGE_DRIVER: "file",
    SESSION_SECRET: "s".repeat(40),
    APP_URL: "https://pulsoo.example",
    HUMAN_NOTIFICATION_WEBHOOK_URL: "https://n8n.example/webhook/aviso",
    HUMAN_NOTIFICATION_WEBHOOK_SECRET: "segredo-ficticio-".repeat(3),
  });
  return { h, c };
}
test("webhook transmite snapshot estruturado, UUID estável e assinatura; 202 aguarda confirmação", async () => {
  const { h, c } = noticeFixture();
  let calls = 0;
  const result = await sendHumanNotification(
    h,
    c,
    new HttpClient(async (url, init) => {
      calls++;
      assert.equal(url, c.humanNotification.url);
      const headers = init!.headers as Record<string, string>,
        raw = String(init!.body);
      assert.equal(headers["Idempotency-Key"], h.id);
      assert(
        validWebhook(
          Buffer.from(raw),
          headers["X-Pulsoo-Timestamp"],
          headers["X-Pulsoo-Signature"],
          c.humanNotification.secret,
        ),
      );
      const body = JSON.parse(raw);
      assert.equal(body.lead.name, "Lead fictício");
      assert.equal(body.qualification[0].value, "Orientação");
      assert.equal(
        body.callback.url,
        "https://pulsoo.example/api/webhooks/human-notifications",
      );
      assert(!raw.includes(c.humanNotification.secret));
      return new Response(JSON.stringify({ accepted: true, id: h.id }), {
        status: 202,
      });
    }),
  );
  assert.equal(calls, 1);
  assert.equal(result.status, "pending");
});
test("somente recibo com ID e mensagem confirmados marca aviso como enviado; retorno genérico é incerto", async () => {
  const { h, c } = noticeFixture();
  const ok = await sendHumanNotification(
    h,
    c,
    new HttpClient(
      async () =>
        new Response(
          JSON.stringify({
            notification: { id: h.id, status: "sent", messageId: "msg1" },
          }),
        ),
    ),
  );
  assert.equal(ok.status, "sent");
  await assert.rejects(
    () =>
      sendHumanNotification(
        h,
        c,
        new HttpClient(async () => new Response(JSON.stringify({ ok: true }))),
      ),
    (e: any) => e.uncertain === true,
  );
});
test("callback exige assinatura, resiste repetição e rejeita recibo conflitante", async () => {
  const { h, c } = noticeFixture(),
    store = await new LocalStore().init();
  const job: RuntimeJob = {
    ...base("notify:" + h.id),
    kind: "notify_human",
    conversationId: h.conversationId,
    contactId: h.contactId,
    state: "awaiting_confirmation",
    attempts: 1,
    dueAt: new Date().toISOString(),
    cycle: 0,
    step: 0,
    policyRevision: 1,
    executionId: h.id,
  };
  await store.transaction(async (tx) => {
    await tx.put("handoff", h);
    await tx.put("runtimeJob", job);
  });
  const app = await buildApp(c, store);
  const payload = JSON.stringify({
      id: h.id,
      status: "sent",
      messageId: "msg-confirmada",
    }),
    timestamp = String(Math.floor(Date.now() / 1000));
  const headers = {
    "content-type": "application/json",
    "x-pulsoo-timestamp": timestamp,
    "x-pulsoo-signature": notificationSignature(
      payload,
      timestamp,
      c.humanNotification.secret,
    ),
  };
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/webhooks/human-notifications",
        payload,
        headers: { "content-type": "application/json" },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/webhooks/human-notifications",
        payload,
        headers,
      })
    ).statusCode,
    200,
  );
  const repeat = await app.inject({
    method: "POST",
    url: "/api/webhooks/human-notifications",
    payload,
    headers,
  });
  assert.equal(repeat.json().duplicate, true);
  const conflicting = JSON.stringify({
    id: h.id,
    status: "sent",
    messageId: "outra",
  });
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/webhooks/human-notifications",
        payload: conflicting,
        headers: {
          ...headers,
          "x-pulsoo-signature": notificationSignature(
            conflicting,
            timestamp,
            c.humanNotification.secret,
          ),
        },
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (await store.transaction((tx) => tx.get("runtimeJob", job.id)))!.state,
    "done",
  );
  assert.equal(
    (await store.transaction((tx) => tx.get("handoff", h.id)))!
      .notificationMessageId,
    "msg-confirmada",
  );
  await app.close();
});
test("reinício não repete ação externa em andamento nem aviso aguardando callback", async () => {
  const { h } = noticeFixture(),
    store = await new LocalStore().init();
  const job: RuntimeJob = {
    ...base("notify:" + h.id),
    kind: "notify_human",
    conversationId: h.conversationId,
    contactId: h.contactId,
    state: "running",
    attempts: 1,
    dueAt: new Date().toISOString(),
    cycle: 0,
    step: 0,
    policyRevision: 1,
    executionId: h.id,
  };
  await store.transaction((tx) => tx.put("runtimeJob", job));
  await recoverRuntimeJobs(store);
  assert.equal(
    (await store.transaction((tx) => tx.get("runtimeJob", job.id)))!.state,
    "unknown",
  );
  await store.transaction((tx) =>
    tx.put("runtimeJob", { ...job, state: "awaiting_confirmation" }),
  );
  await recoverRuntimeJobs(store);
  assert.equal(
    (await store.transaction((tx) => tx.get("runtimeJob", job.id)))!.state,
    "awaiting_confirmation",
  );
});

test("parágrafos naturais não isolam uma confirmação curta em outro balão", () => {
  const settings = {
    ...base("agent"),
    name: "Assistente",
    tone: "Natural",
    instructions: "",
    splitMode: "paragraphs" as const,
    maxChunks: 2,
    delayMs: 0,
    voiceMode: "text" as const,
    maxCharsPerMessage: 200,
    naturalParagraphs: true,
  };
  assert.deepEqual(
    deliveryParts(
      "Entendi! A prioridade é proteger seus filhos.\n\nEm qual bairro seria?",
      settings,
    ),
    ["Entendi! A prioridade é proteger seus filhos.", "Em qual bairro seria?"],
  );
});
