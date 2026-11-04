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
