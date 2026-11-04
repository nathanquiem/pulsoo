import test from "node:test";
import assert from "node:assert/strict";
import { LocalStore } from "../server/store.js";
import { defaultOperation } from "../server/operation.js";
import { generateAgent } from "../server/agent.js";
import { readConfig } from "../server/config.js";
import { base } from "../server/domain.js";

test("principal delega somente a especialistas ativos, isola consultas e registra o modelo de cada chamada", async () => {
  const store = await new LocalStore().init();
  const op = defaultOperation();
  op.specialists[0].model = "modelo-especialista";
  await store.transaction(async (tx) => {
    await tx.put("operation", op);
    await tx.put("settings", {
      ...base("agent"),
      name: "Principal",
      tone: "Natural",
      instructions: "Qualifique.",
      splitMode: "paragraphs",
      maxChunks: 3,
      delayMs: 800,
      voiceMode: "text",
    });
  });
  const calls: Record<string, any>[] = [];
  const mockFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    calls.push(body);
    const output =
      calls.length === 1
        ? [
            {
              type: "function_call",
              id: "fc_1",
              call_id: "call_1",
              name: "consultar_especialista",
              arguments: JSON.stringify({
                specialist: "qualification",
                question: "O que falta perguntar?",
              }),
            },
          ]
        : [
            {
              type: "message",
              id: "msg_" + calls.length,
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text:
                    calls.length === 2
                      ? "Falta saber o prazo."
                      : "Para quando você precisa?",
                  annotations: [],
                },
              ],
            },
          ];
    return new Response(
      JSON.stringify({
        id: "resp_" + calls.length,
        object: "response",
        status: "completed",
        output,
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const c = readConfig({
    DEMO_MODE: "false",
    ADMIN_PASSWORD: "teste-seguro-123",
    SESSION_SECRET: "s".repeat(40),
    OPENAI_API_KEY: "chave-teste",
    OPENAI_MODEL: "modelo-principal",
  });
  const r = await generateAgent(
    store,
    c,
    {
      messages: [{ role: "user", content: "Preciso organizar os contatos." }],
      kind: "reply",
      mode: "live",
      environment: "lab",
    },
    { fetch: mockFetch },
  );
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].tools[0].parameters.properties.specialist.enum, [
    "qualification",
    "knowledge",
  ]);
  assert.equal(calls[1].model, "modelo-especialista");
  assert.equal(calls[1].tools, undefined);
  assert.equal(calls[1].store, false);
  assert.equal(calls[2].input.at(-1).type, "function_call_output");
  assert.equal(
    JSON.parse(calls[2].input.at(-1).output).performedExternalAction,
    false,
  );
  assert.equal(r.text, "Para quando você precisa?");
  const usage = await store.transaction((tx) => tx.list("usage"));
  assert.equal(usage.length, 3);
  assert.equal(
    usage.find((u) => u.task === "especialista:qualification")?.model,
    "modelo-especialista",
  );
  assert.equal(
    usage.reduce((sum, u) => sum + u.inputTokens, 0),
    30,
  );
});

async function agentFixture(maxDelegations = 1, contextChars = 24000) {
  const store = await new LocalStore().init();
  await store.transaction(async (tx) => {
    await tx.put("operation", defaultOperation());
    await tx.put("settings", {
      ...base("agent"),
      name: "Principal",
      tone: "Natural",
      instructions: "Qualifique.",
      splitMode: "paragraphs",
      maxChunks: 3,
      delayMs: 800,
      voiceMode: "text",
    });
  });
  const config = readConfig({
    DEMO_MODE: "false",
    ADMIN_PASSWORD: "senha-ficticia-segura",
    SESSION_SECRET: "s".repeat(40),
    OPENAI_API_KEY: "chave-ficticia",
    OPENAI_MODEL: "modelo-principal",
    AGENT_MAX_DELEGATIONS: String(maxDelegations),
    AGENT_CONTEXT_CHARS: String(contextChars),
  });
  return {
    store,
    config,
    input: {
      messages: [{ role: "user" as const, content: "Preciso de ajuda." }],
      kind: "reply" as const,
      mode: "live" as const,
      environment: "lab" as const,
    },
  };
}
function toolCall(id = "1") {
  return {
    type: "function_call",
    id: "fc_" + id,
    call_id: "call_" + id,
    name: "consultar_especialista",
    arguments: JSON.stringify({
      specialist: "qualification",
      question: "O que falta saber?",
    }),
  };
}
function answer(text = "Qual é sua necessidade?") {
  return {
    type: "message",
    id: "msg",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text, annotations: [] }],
  };
}
function response(output: unknown[]) {
  return Response.json({
    id: "resp",
    object: "response",
    status: "completed",
    output,
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  });
}
test("limite de delegação impede chamadas extras mesmo quando o modelo pede várias consultas", async () => {
  const f = await agentFixture();
  let calls = 0;
  let last: any;
  await generateAgent(f.store, f.config, f.input, {
    fetch: async (_u, init) => {
      const body = JSON.parse(String(init?.body));
      calls++;
      last = body;
      return response(
        calls === 1 ? [toolCall("1"), toolCall("2")] : [answer()],
      );
    },
  });
  assert.equal(calls, 3);
  assert.equal(last.tool_choice, "none");
  assert.equal(
    last.input.filter((i: any) => i.type === "function_call_output").length,
    2,
  );
  assert.ok(
    last.input.some(
      (i: any) =>
        i.type === "function_call_output" &&
        i.output.includes("limite_de_consultas_atingido"),
    ),
  );
});
test("consulta desligada faz uma chamada e envia apenas histórico recente dentro do limite", async () => {
  const f = await agentFixture(0, 4000);
  let body: any;
  f.input.messages = [
    { role: "user", content: "antigo".repeat(2000) },
    { role: "user", content: "Minha pergunta mais recente." },
  ];
  await generateAgent(f.store, f.config, f.input, {
    fetch: async (_u, init) => {
      body = JSON.parse(String(init?.body));
      return response([answer()]);
    },
  });
  assert.equal(body.tool_choice, "none");
  assert.equal(body.tools.length, 0);
  assert.equal(body.input.at(-1).content, "Minha pergunta mais recente.");
  assert.ok(
    body.input.reduce((sum: number, m: any) => sum + m.content.length, 0) <=
      4000,
  );
  assert.equal((await f.store.transaction((tx) => tx.list("usage"))).length, 1);
});
test("falha posterior preserva consumo conhecido e registra chamada sem usage como custo desconhecido", async () => {
  const f = await agentFixture();
  let calls = 0;
  await assert.rejects(
    generateAgent(f.store, f.config, f.input, {
      fetch: async () => {
        calls++;
        if (calls === 3)
          return Response.json(
            { error: { message: "falha simulada" } },
            { status: 500 },
          );
        return response(calls === 1 ? [toolCall()] : [answer()]);
      },
    }),
  );
  const usage = await f.store.transaction((tx) => tx.list("usage"));
  assert.equal(calls, 3);
  assert.equal(usage.length, 3);
  assert.equal(
    usage
      .filter((u) => u.status === "success")
      .reduce((sum, u) => sum + u.inputTokens, 0),
    20,
  );
  assert.equal(usage.filter((u) => u.status === "failed").length, 1);
  assert.equal(
    usage.find((u) => u.status === "failed")!.estimatedCostMicros,
    null,
  );
});
test("turno cancelado não inicia a próxima chamada paga", async () => {
  const f = await agentFixture();
  let checks = 0,
    calls = 0;
  await assert.rejects(
    generateAgent(f.store, f.config, f.input, {
      canContinue: async () => ++checks === 1,
      fetch: async () => {
        calls++;
        return response([toolCall()]);
      },
    }),
    /geracao_cancelada/,
  );
  assert.equal(calls, 1);
  assert.equal((await f.store.transaction((tx) => tx.list("usage"))).length, 1);
});
test("limite de contexto não envia mensagem muito longa sem indicar o corte", async () => {
  const f = await agentFixture(0, 4000);
  let body: any;
  f.input.messages = [
    { role: "user", content: "primeiro ".repeat(2000) + " PERGUNTA FINAL" },
  ];
  await generateAgent(f.store, f.config, f.input, {
    fetch: async (_u, init) => {
      body = JSON.parse(String(init?.body));
      return response([answer()]);
    },
  });
  assert.equal(body.input[0].content.length, 4000);
  assert.match(body.input[0].content, /Início omitido/);
  assert.ok(body.input[0].content.endsWith("PERGUNTA FINAL"));
});
test("limites inválidos são recusados antes de chamar o provedor", () => {
  assert.throws(() =>
    readConfig({ DEMO_MODE: "true", AGENT_MAX_DELEGATIONS: "-1" }),
  );
  assert.throws(() =>
    readConfig({ DEMO_MODE: "true", AGENT_CONTEXT_CHARS: "NaN" }),
  );
});
