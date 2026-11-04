import test from "node:test";
import assert from "node:assert/strict";
import {
  HttpClient,
  IntegrationError,
  type Transport,
} from "../server/integrations/http.js";
import { CentralClient } from "../server/integrations/central.js";
import { GoogleClient } from "../server/integrations/google.js";
import { CalClient } from "../server/integrations/calendar.js";
test("Central envia pelo caminho público com idempotência e sem credenciais no corpo", async () => {
  let captured: { url: string; init?: RequestInit } | undefined;
  const transport: Transport = async (url, init) => {
    captured = { url: String(url), init };
    return Response.json({ mensagem: { id: "m1", status: "enviada" } });
  };
  const client = new CentralClient(
    {
      baseUrl: "https://central.example",
      key: "secret",
      companyId: "c",
      webhookSecret: "s",
    },
    new HttpClient(transport),
  );
  await client.sendText("conversa-1", "Olá", "intencao-1");
  assert.equal(
    captured!.url,
    "https://central.example/api/v1/conversas/conversa-1/mensagens",
  );
  assert.equal(
    (captured!.init!.headers as Record<string, string>)["Idempotency-Key"],
    "intencao-1",
  );
  assert.deepEqual(JSON.parse(String(captured!.init!.body)), { texto: "Olá" });
  assert.equal(captured!.init!.redirect, "error");
});
test("Drive copia modelo, Docs substitui campos e Sheets usa RAW", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const transport: Transport = async (url, init) => {
    requests.push({ url: String(url), init });
    return Response.json(
      String(url).includes("oauth2")
        ? { access_token: "temp", expires_in: 3600 }
        : {},
    );
  };
  const google = new GoogleClient(
    { clientId: "id", clientSecret: "secret", refreshToken: "refresh" },
    new HttpClient(transport),
  );
  await google.copyDoc("modelo-1", "Proposta", "intencao");
  await google.replaceDoc("doc-1", { "cliente.nome": "Marina" });
  await google.appendRows("planilha-1", "Leads!A:C", [
    ["=texto-nao-e-formula", "Marina", "Resumo"],
  ]);
  assert.equal(requests.filter((r) => r.url.includes("oauth2")).length, 1);
  const doc = requests.find((r) => r.url.includes("docs.googleapis.com"))!;
  assert.deepEqual(
    JSON.parse(String(doc.init?.body)).requests[0].replaceAllText,
    {
      containsText: { text: "{{cliente.nome}}", matchCase: true },
      replaceText: "Marina",
    },
  );
  assert.ok(requests.some((r) => r.url.includes("valueInputOption=RAW")));
  assert.equal(
    requests[1].url,
    "https://www.googleapis.com/drive/v3/files/modelo-1/copy",
  );
});
test("Cal.com usa versão explícita e estrutura de reserva", async () => {
  let body: unknown, headers: Record<string, string> | undefined;
  const transport: Transport = async (url, init) => {
    body = JSON.parse(String(init?.body));
    headers = init?.headers as Record<string, string>;
    return Response.json({ data: { uid: "r1" } });
  };
  const cal = new CalClient(
    "cal-key",
    { slots: "2024-09-04", bookings: "2024-08-13" },
    new HttpClient(transport),
  );
  await cal.book(42, "2026-11-04T14:00:00Z", {
    name: "Marina",
    email: "marina@example.com",
    timeZone: "America/Sao_Paulo",
  });
  assert.equal(headers!["cal-api-version"], "2024-08-13");
  assert.equal((body as { eventTypeId: number }).eventTypeId, 42);
});
test("timeout e resposta inválida em escrita são resultados incertos", async () => {
  const timeout: Transport = async () => {
    throw new Error("URL com segredo que não pode vazar");
  };
  await assert.rejects(
    new HttpClient(timeout).json("https://example.com", { method: "POST" }),
    (e: unknown) =>
      e instanceof IntegrationError &&
      e.uncertain &&
      !e.message.includes("segredo"),
  );
  const invalid: Transport = async () =>
    new Response("invalid", { status: 200 });
  await assert.rejects(
    new HttpClient(invalid).json("https://example.com", { method: "POST" }),
    (e: unknown) => e instanceof IntegrationError && e.uncertain,
  );
});
test("HTTP 5xx de escrita requer conciliação; 4xx é recusa conhecida", async () => {
  for (const status of [409, 503]) {
    const t: Transport = async () =>
      Response.json({ private: "never return" }, { status });
    await assert.rejects(
      new HttpClient(t).json("https://example.com", { method: "POST" }),
      (e: unknown) =>
        e instanceof IntegrationError &&
        e.uncertain === status >= 500 &&
        !e.message.includes("private"),
    );
  }
});

test("JSON válido sem confirmação de envio não é marcado como enviado", async () => {
  const transport: Transport = async () => Response.json({ ok: true });
  const client = new CentralClient(
    {
      baseUrl: "https://central.example",
      key: "secret",
      companyId: "c",
      webhookSecret: "s",
    },
    new HttpClient(transport),
  );
  await assert.rejects(
    client.sendText("conversa", "Olá", "intencao"),
    (e: unknown) => e instanceof IntegrationError && e.uncertain,
  );
});

test("registro de follow-up usa tarefa concluída, timestamp original e ID permanente", async () => {
  let capture: RequestInit | undefined,
    url = "";
  const transport: Transport = async (u, i) => {
    url = String(u);
    capture = i;
    return Response.json({
      tarefa: { id: "execution-1", status: "concluida" },
    });
  };
  const client = new CentralClient(
    {
      baseUrl: "https://central.example",
      key: "secret",
      companyId: "c",
      webhookSecret: "s",
    },
    new HttpClient(transport),
  );
  await client.recordCompletedFollowup(
    {
      id: "execution-1",
      createdAt: "2026-11-03T10:00:00Z",
      contactId: "contato-1",
      conversationId: "conversa-1",
      step: 0,
      text: "Retomada",
      sentAt: "2026-11-03T10:02:00Z",
      centralMessageId: "mensagem-1",
      taskState: "pending",
      simulated: false,
    },
    2,
  );
  assert.equal(url, "https://central.example/api/v1/tarefas/concluidas");
  const body = JSON.parse(String(capture?.body));
  assert.equal(body.realizado_em, "2026-11-03T10:02:00Z");
  assert.equal(body.id, "execution-1");
  assert.equal(body.status, undefined);
  assert.equal(body.etapa, 1);
});
