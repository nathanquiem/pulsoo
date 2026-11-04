import { readConfig } from "./config.js";
import { LocalStore, PostgresStore } from "./store.js";
import { seedDemo } from "./seed.js";
import { buildApp } from "./app.js";
import { processOne, recoverJobs } from "./worker.js";
import { processRuntime, recoverRuntimeJobs } from "./runtime.js";
import { defaultOperation } from "./operation.js";
import { base } from "./domain.js";
const c = readConfig();
if (!c.demo && c.storage !== "postgres")
  throw new Error("PostgreSQL é obrigatório fora da simulação.");
const store =
  c.storage === "postgres"
    ? await new PostgresStore(c.databaseUrl ?? "").init()
    : await new LocalStore(c.runtimeDir).init();
if (c.demo) await seedDemo(store);
else
  await store.transaction(async (tx) => {
    if (!(await tx.get("settings", "agent")))
      await tx.put("settings", {
        ...base("agent"),
        name: "Assistente principal",
        tone: "Claro e próximo",
        instructions:
          "Consulte dados aprovados. Não invente preços ou confirmações.",
        splitMode: "paragraphs",
        maxChunks: 3,
        delayMs: 800,
        voiceMode: "text",
      });
  });
await store.transaction(async (tx) => {
  if (!(await tx.get("operation", "operation")))
    await tx.put("operation", defaultOperation());
});
await recoverJobs(store);
await recoverRuntimeJobs(store);
const app = await buildApp(c, store);
let busy = false;
const timer = setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    await processOne(store, c);
    await processRuntime(store, c);
  } catch {
    console.error("Falha no worker; verificar o estado local.");
  } finally {
    busy = false;
  }
}, 1500);
await app.listen({ port: c.port, host: c.host });
console.log(
  "Pulsoo: http://" +
    c.host +
    ":" +
    c.port +
    " · " +
    (c.demo ? "SIMULAÇÃO LOCAL" : "PRIVADO"),
);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(timer);
  while (busy) await new Promise((r) => setTimeout(r, 50));
  await app.close();
  await store.close();
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
