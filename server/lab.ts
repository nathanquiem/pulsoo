import type { Store } from "./store.js";
import type { Config } from "./config.js";
import { generateAgent } from "./agent.js";
export async function runLab(
  store: Store,
  c: Config,
  messages: { role: "user" | "assistant"; content: string }[],
  mode: "simulation" | "live",
  kind: "reply" | "followup" = "reply",
) {
  return generateAgent(store, c, { messages, mode, kind, environment: "lab" });
}
