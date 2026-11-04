import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { LocalStore } from "../server/store.js";
import { defaultOperation, operationSchema } from "../server/operation.js";
import {
  observeInbound,
  armFollowup,
  nextBusinessTime,
  syncConversationGate,
} from "../server/followup.js";
import { processRuntime, recoverRuntimeJobs } from "../server/runtime.js";
import { readConfig } from "../server/config.js";
import { IntegrationError } from "../server/integrations/http.js";
import type { AgentInput, AgentResult } from "../server/agent.js";
import { generateAgent, activeSpecialists } from "../server/agent.js";
import { base } from "../server/domain.js";
import { buildApp } from "../server/app.js";
async function fixture(
  channel: "evolution" | "official" | "unknown" = "evolution",
) {
  const s = await new LocalStore().init(),
    contactId = randomUUID(),
    conversationId = randomUUID();
  let clock = new Date("2026-11-03T10:00:00Z"),
    sent = 0,
    recorded = 0;
  const records: unknown[] = [];
  const op = {
    ...defaultOperation(),
    agentEnabled: true,
    followup: {
      ...defaultOperation().followup,
      steps: [
        {
          delayMinutes: 1,
          instruction: "Retome a qualificação com uma pergunta útil.",
        },
      ],
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      start: "00:00",
      end: "23:59",
      timeZone: "UTC",
    },
  };
  await s.transaction(async (tx) => {
    await tx.put("operation", op);
    await tx.put("settings", {
      ...base("agent"),
      name: "Principal",
      tone: "Natural",
      instructions: "Qualifique sem inventar.",
      splitMode: "paragraphs",
      maxChunks: 3,
      delayMs: 800,
      voiceMode: "text",
    });
    await tx.put("contact", {
      ...base(contactId),
      name: "Lead",
      company: "",
      phone: "",
      stage: "qualificação",
      notes: "",
      conversationId,
      automationAllowed: true,
    });
    await observeInbound(tx, {
      contactId,
      conversationId,
      messageId: randomUUID(),
      text: "Preciso melhorar meu atendimento.",
      occurredAt: clock.toISOString(),
      receivedAt: clock.toISOString(),
      channel,
      allow: true,
      stage: "qualificação",
    });
  });
  const config = readConfig({
    DEMO_MODE: "false",
    SESSION_SECRET: "s".repeat(40),
    ADMIN_PASSWORD: "senha-de-teste-segura",
  });
  const generator = async (input: AgentInput): Promise<AgentResult> => ({
    text:
      input.kind === "followup"
        ? "Ficou alguma dúvida sobre o próximo passo?"
        : "Qual é sua maior dificuldade no atendimento?",
    parts: [],
    reason: "contexto aberto",
    trace: [],
    simulated: false,
    inputTokens: 1,
    outputTokens: 1,
    latencyMs: 1,
  });
  const sender = {
    sendText: async () => {
      sent++;
      return { mensagem: { id: randomUUID(), status: "enviada" } };
    },
    recordCompletedFollowup: async (execution: unknown) => {
      recorded++;
      records.push(execution);
      return {
        tarefa: { id: (execution as { id: string }).id, status: "concluida" },
      };
    },
  };
  const deps = { sender, generate: generator, now: () => clock };
  return {
    s,
    op,
    contactId,
    conversationId,
    config,
    deps,
    counts: () => ({ sent, recorded }),
    records,
    advance: (iso: string) => {
      clock = new Date(iso);
    },
  };
}
async function reply(f: Awaited<ReturnType<typeof fixture>>) {
  f.advance("2026-11-03T10:00:03Z");
  await processRuntime(f.s, f.config, f.deps);
}
test("qualificação sem módulos agenda no Pulsoo e só registra tarefa após envio confirmado", async () => {
  const f = await fixture();
  assert.deepEqual(f.counts(), { sent: 0, recorded: 0 });
  await reply(f);
  const scheduled = (await f.s.transaction((tx) => tx.list("runtimeJob"))).find(
    (j) => j.kind === "followup",
  )!;
  assert.equal(scheduled.dueAt, "2026-11-03T10:01:03.000Z");
  assert.equal(f.counts().recorded, 0);
  f.advance("2026-11-03T10:02:00Z");
  await processRuntime(f.s, f.config, f.deps);
  assert.deepEqual(f.counts(), { sent: 2, recorded: 0 });
  const execution = (await f.s.transaction((tx) => tx.list("followup")))[0];
  assert.equal(execution.sentAt, "2026-11-03T10:02:00.000Z");
  assert.equal(execution.taskState, "pending");
  await processRuntime(f.s, f.config, f.deps);
  assert.deepEqual(f.counts(), { sent: 2, recorded: 1 });
  assert.equal(
    (await f.s.transaction((tx) => tx.list("followup")))[0].taskState,
    "done",
  );
});
test("falha ao gravar tarefa repete somente registro e preserva data/hora do envio", async () => {
  const f = await fixture();
  await reply(f);
  f.advance("2026-11-03T10:02:00Z");
  await processRuntime(f.s, f.config, f.deps);
  let attempts = 0;
  const sender = {
    ...f.deps.sender,
    recordCompletedFollowup: async (e: unknown) => {
      if (++attempts === 1) throw new IntegrationError("temporario", true, 503);
      return f.deps.sender.recordCompletedFollowup(e);
    },
  };
  await processRuntime(f.s, f.config, { ...f.deps, sender });
  assert.equal(f.counts().sent, 2);
  f.advance("2026-11-03T10:05:00Z");
  await processRuntime(f.s, f.config, { ...f.deps, sender });
  assert.equal(f.counts().sent, 2);
  assert.equal(attempts, 2);
  assert.equal(
    (f.records[0] as { sentAt: string }).sentAt,
    "2026-11-03T10:02:00.000Z",
  );
});
test("resposta do lead cancela follow-up antigo e reinicia o ciclo", async () => {
  const f = await fixture();
  await reply(f);
  await f.s.transaction((tx) =>
    observeInbound(tx, {
      contactId: f.contactId,
      conversationId: f.conversationId,
      messageId: randomUUID(),
      text: "Posso explicar melhor.",
      occurredAt: "2026-11-03T10:00:30Z",
      receivedAt: "2026-11-03T10:00:30Z",
      channel: "evolution",
      allow: true,
      stage: "qualificação",
    }),
  );
  const jobs = await f.s.transaction((tx) => tx.list("runtimeJob"));
  assert.equal(jobs.find((j) => j.kind === "followup")?.state, "cancelled");
  assert.equal(
    jobs.filter((j) => j.kind === "reply" && j.state === "pending").length,
    1,
  );
});
test("pausa humana durante geração impede o envio", async () => {
  const f = await fixture();
  await reply(f);
  f.advance("2026-11-03T10:02:00Z");
  const generate = async (input: AgentInput) => {
    await f.s.transaction(async (tx) => {
      const c = (await tx.get("contact", f.contactId))!;
      await tx.put("contact", { ...c, automationAllowed: false });
      await syncConversationGate(tx, f.contactId, false, false);
    });
    return f.deps.generate(input);
  };
  await processRuntime(f.s, f.config, { ...f.deps, generate });
  assert.equal(f.counts().sent, 1);
  assert.equal((await f.s.transaction((tx) => tx.list("followup"))).length, 0);
});
test("nova mensagem durante geração impede follow-up com contexto antigo", async () => {
  const f = await fixture();
  await reply(f);
  f.advance("2026-11-03T10:02:00Z");
  const generate = async (input: AgentInput) => {
    await f.s.transaction((tx) =>
      observeInbound(tx, {
        contactId: f.contactId,
        conversationId: f.conversationId,
        messageId: randomUUID(),
        text: "Voltei.",
        occurredAt: "2026-11-03T10:02:00Z",
        receivedAt: "2026-11-03T10:02:00Z",
        channel: "evolution",
        allow: true,
        stage: "qualificação",
      }),
    );
    return f.deps.generate(input);
  };
  await processRuntime(f.s, f.config, { ...f.deps, generate });
  assert.equal(f.counts().sent, 1);
});
test("pedido para parar mantém conversa fora da cadência", async () => {
  const f = await fixture();
  await reply(f);
  await f.s.transaction((tx) =>
    observeInbound(tx, {
      contactId: f.contactId,
      conversationId: f.conversationId,
      messageId: randomUUID(),
      text: "Não me envie mais mensagens.",
      occurredAt: "2026-11-03T10:01:00Z",
      receivedAt: "2026-11-03T10:01:00Z",
      channel: "evolution",
      allow: true,
      stage: "qualificação",
    }),
  );
  assert.equal(
    (await f.s.transaction((tx) => tx.get("conversation", f.conversationId)))!
      .status,
    "opted_out",
  );
  assert.equal(
    (await f.s.transaction((tx) => tx.list("runtimeJob"))).filter(
      (j) => j.state === "pending",
    ).length,
    0,
  );
});
test("horários e fim de semana são calculados no fuso da operação", () => {
  const policy = {
    ...defaultOperation().followup,
    timeZone: "America/Sao_Paulo",
    weekdays: [1, 2, 3, 4, 5],
    start: "09:00",
    end: "18:00",
  };
  assert.equal(
    nextBusinessTime(new Date("2026-11-07T13:00:00Z"), policy).toISOString(),
    "2026-11-09T12:00:00.000Z",
  );
  assert.equal(
    nextBusinessTime(new Date("2026-11-03T22:00:00Z"), policy).toISOString(),
    "2026-11-04T12:00:00.000Z",
  );
});
test("canal oficial fora da janela e canal desconhecido ficam bloqueados", async () => {
  for (const channel of ["official", "unknown"] as const) {
    const f = await fixture(channel);
    await reply(f);
    f.advance("2026-11-04T12:00:00Z");
    await processRuntime(f.s, f.config, f.deps);
    assert.equal(f.counts().sent, 1);
    assert.equal(
      (await f.s.transaction((tx) => tx.list("runtimeJob"))).find(
        (j) => j.kind === "followup",
      )?.state,
      "blocked",
    );
  }
});
test("envio incerto não gera tarefa concluída nem reenvio automático", async () => {
  const f = await fixture();
  await reply(f);
  f.advance("2026-11-03T10:02:00Z");
  let attempts = 0;
  const sender = {
    ...f.deps.sender,
    sendText: async () => {
      attempts++;
      throw new IntegrationError("timeout", true);
    },
  };
  await processRuntime(f.s, f.config, { ...f.deps, sender });
  await processRuntime(f.s, f.config, { ...f.deps, sender });
  assert.equal(attempts, 1);
  assert.equal(f.counts().recorded, 0);
  assert.equal((await f.s.transaction((tx) => tx.list("followup"))).length, 0);
});
test("reinício repete geração sem envio, mas entrega em andamento exige conciliação", async () => {
  const f = await fixture();
  await f.s.transaction(async (tx) => {
    const j = (await tx.list("runtimeJob"))[0];
    await tx.put("runtimeJob", { ...j, state: "dispatching" });
  });
  await recoverRuntimeJobs(f.s);
  assert.equal(
    (await f.s.transaction((tx) => tx.list("runtimeJob")))[0].state,
    "unknown",
  );
  assert.equal(
    (await f.s.transaction((tx) => tx.get("conversation", f.conversationId)))!
      .deliveryUnknown,
    true,
  );
});
test("módulos desativados removem especialistas e bloqueiam acesso direto à API", async (t) => {
  const f = await fixture();
  const op = defaultOperation();
  assert.deepEqual(
    activeSpecialists(op).map((s) => s.id),
    ["qualification", "knowledge"],
  );
  assert.equal(
    operationSchema.safeParse({
      ...op,
      id: undefined,
      createdAt: undefined,
      revision: undefined,
    }).success,
    false,
  );
  const app = await buildApp(
    readConfig({ DEMO_MODE: "true", HOST: "127.0.0.1" }),
    f.s,
  );
  t.after(() => app.close());
  assert.equal(
    (await app.inject({ method: "POST", url: "/api/proposals", payload: {} }))
      .statusCode,
    409,
  );
  assert.equal(
    (await app.inject({ method: "POST", url: "/api/products", payload: {} }))
      .statusCode,
    409,
  );
});
test("laboratório de qualificação não oferece catálogo com módulo desligado", async () => {
  const f = await fixture();
  const result = await generateAgent(
    f.s,
    { ...f.config, demo: true },
    {
      messages: [{ role: "user", content: "Qual o preço?" }],
      kind: "reply",
      mode: "simulation",
      environment: "lab",
    },
  );
  assert.equal(result.text?.includes("R$"), false);
  assert.equal(
    result.trace.some((t) => t.name === "especialista:catalog"),
    false,
  );
});
test("agente pode decidir não insistir sem criar tarefa", async () => {
  const f = await fixture();
  await reply(f);
  f.advance("2026-11-03T10:02:00Z");
  await processRuntime(f.s, f.config, {
    ...f.deps,
    generate: async (input) => ({
      ...(await f.deps.generate(input)),
      text: null,
      reason: "Conversa encerrada pelo lead.",
    }),
  });
  assert.equal(f.counts().sent, 1);
  assert.equal((await f.s.transaction((tx) => tx.list("followup"))).length, 0);
});

test("pausa e encerramento locais persistem após novo webhook com permissão da Central", async (t) => {
  for (const status of ["paused", "closed"] as const) {
    const f = await fixture(),
      app = await buildApp({ ...f.config, demo: true }, f.s);
    t.after(() => app.close());
    assert.equal(
      (
        await app.inject({
          method: "POST",
          url: "/api/conversations/" + f.conversationId + "/control",
          payload: { status },
        })
      ).statusCode,
      200,
    );
    await f.s.transaction(async (tx) => {
      await syncConversationGate(tx, f.contactId, true, false);
      await observeInbound(tx, {
        contactId: f.contactId,
        conversationId: f.conversationId,
        messageId: randomUUID(),
        text: "Tenho outra informação.",
        occurredAt: "2026-11-03T10:03:00Z",
        receivedAt: "2026-11-03T10:03:00Z",
        channel: "evolution",
        allow: true,
        stage: "qualificação",
      });
    });
    assert.equal(
      (await f.s.transaction((tx) => tx.get("conversation", f.conversationId)))
        ?.status,
      status,
    );
    assert.equal(
      (await f.s.transaction((tx) => tx.list("runtimeJob"))).filter(
        (j) => j.state === "pending",
      ).length,
      0,
    );
  }
});
