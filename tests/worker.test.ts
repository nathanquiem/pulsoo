import test from "node:test";
import assert from "node:assert/strict";
import { LocalStore } from "../server/store.js";
import { seedDemo } from "../server/seed.js";
import { review } from "../server/service.js";
import { processOne, recoverJobs } from "../server/worker.js";
import { defaultOperation } from "../server/operation.js";
import { readConfig } from "../server/config.js";
import { CentralClient } from "../server/integrations/central.js";
import { HttpClient, type Transport } from "../server/integrations/http.js";
async function setup() {
  const s = await new LocalStore().init();
  await seedDemo(s);
  await s.transaction((tx) =>
    tx.put("operation", {
      ...defaultOperation(),
      modules: { catalog: true, proposals: true, calendar: false },
    }),
  );
  const p = (await s.transaction((tx) => tx.list("proposal")))[0];
  await s.transaction(async (tx) => {
    const c = (await tx.get("contact", p.contactId))!;
    await tx.put("contact", { ...c, conversationId: "conversa-1" });
    await tx.put("proposal", { ...p, conversationId: "conversa-1" });
  });
  await review(
    s,
    p.id,
    { decision: "approve", hash: p.snapshotHash, note: "" },
    "humano",
  );
  return { s, p };
}
const config = () =>
  readConfig({
    DEMO_MODE: "false",
    ADMIN_PASSWORD: "senha-de-teste-123",
    SESSION_SECRET: "x".repeat(48),
    CENTRAL_API_KEY: "secret",
    CENTRAL_BASE_URL: "https://central.example",
  });
test("pausa humana bloqueia envio aprovado antes da chamada externa", async () => {
  const { s, p } = await setup();
  await s.transaction(async (tx) => {
    const c = (await tx.get("contact", p.contactId))!;
    await tx.put("contact", { ...c, automationAllowed: false });
  });
  let called = 0;
  const t: Transport = async () => {
    called++;
    return Response.json({});
  };
  await processOne(s, config(), {
    central: new CentralClient(config().central, new HttpClient(t)),
  });
  assert.equal(called, 0);
  assert.equal(
    (await s.transaction((tx) => tx.get("proposal", p.id)))!.status,
    "blocked",
  );
});
test("escrita incerta não é reenviada por próxima execução", async () => {
  const { s, p } = await setup();
  let called = 0;
  const t: Transport = async () => {
    called++;
    throw new Error("timeout");
  };
  const deps = {
    central: new CentralClient(config().central, new HttpClient(t)),
  };
  await processOne(s, config(), deps);
  await processOne(s, config(), deps);
  assert.equal(called, 1);
  assert.equal(
    (await s.transaction((tx) => tx.get("proposal", p.id)))!.status,
    "delivery_unknown",
  );
});
test("reinício com job em execução exige conciliação e não repete", async () => {
  const { s, p } = await setup();
  await s.transaction(async (tx) => {
    const j = (await tx.list("job"))[0];
    await tx.put("job", { ...j, state: "running" });
  });
  await recoverJobs(s);
  assert.equal(
    (await s.transaction((tx) => tx.get("proposal", p.id)))!.status,
    "delivery_unknown",
  );
  assert.equal(await processOne(s, config()), false);
});
test("envio local termina como simulado, nunca enviado real", async () => {
  const { s, p } = await setup();
  const c = readConfig({
    DEMO_MODE: "true",
    STORAGE_DRIVER: "file",
    HOST: "127.0.0.1",
  });
  await processOne(s, c);
  assert.equal(
    (await s.transaction((tx) => tx.get("proposal", p.id)))!.status,
    "simulated",
  );
});
