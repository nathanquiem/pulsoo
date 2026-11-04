import type { Store } from "./store.js";
import type { Config } from "./config.js";
import { generateAgent } from "./agent.js";
import { operation, photoHandoff } from "./operation.js";
import { workflowSummary } from "./workflow.js";
import { base } from "./domain.js";
export async function runLab(
  store: Store,
  c: Config,
  messages: { role: "user" | "assistant"; content: string }[],
  mode: "simulation" | "live",
  kind: "reply" | "followup" = "reply",
  photoCount = 0,
) {
  const op = await store.transaction(operation);
  const result = await generateAgent(store, c, {
    messages,
    mode,
    kind,
    environment: "lab",
    photoCount,
    forceHandoff: photoCount > 0 && photoHandoff(op),
  });
  return {
    ...result,
    summaryPreview: op.workflow?.enabled
      ? workflowSummary(
          {
            ...base("lab-contact"),
            name: "Lead de teste",
            phone: "Não informado no laboratório",
            company: "",
            stage: "Teste",
            notes: "",
            automationAllowed: false,
            qualification: result.qualification,
          },
          {
            ...base("lab-conversation"),
            contactId: "lab-contact",
            stage: "Teste",
            channel: "unknown",
            status: "active",
            cycle: 1,
            followupStep: 0,
            photoCount,
          },
          op,
          result.handoff?.reason ?? "Prévia de qualificação",
          result.handoff?.summary ?? "",
        )
      : undefined,
  };
}
