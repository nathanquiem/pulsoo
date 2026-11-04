import { readConfig } from "./config.js";
import { PostgresStore } from "./store.js";
const config = readConfig();
if (!config.databaseUrl) throw new Error("DATABASE_URL ausente");
const store = await new PostgresStore(config.databaseUrl).init();
await store.close();
console.log("Migração 1 aplicada.");
