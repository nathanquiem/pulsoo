import type { Store } from "./store.js";
import type { Config } from "./config.js";
import { generateAgent } from "./agent.js";
import { operation, photoHandoff } from "./operation.js";
import { workflowSummary } from "./workflow.js";
import { base, DomainError } from "./domain.js";
import { flowProgress } from "./flow-state.js";
export async function runLab(
  store: Store,
  c: Config,
  messages: { role: "user" | "assistant"; content: string }[],
  mode: "simulation" | "live",
  kind: "reply" | "followup" = "reply",
  photoCount = 0,
  qualification: Record<string, string> = {},
) {
  const op = await store.transaction(operation);
  if (
    Object.keys(qualification).length > 12 ||
    Object.keys(qualification).some(
      (k) => !op.workflow?.fields.some((f) => f.key === k),
    )
  )
    throw new DomainError("campo_de_teste_nao_cadastrado", 422);
  const result = await generateAgent(store, c, {
    messages,
    mode,
    kind,
    environment: "lab",
    photoCount,
    contact: {
      ...base("lab-contact"),
      name: "Lead de teste",
      phone: "",
      company: "",
      stage: "Teste",
      notes: "",
      automationAllowed: false,
      qualification,
    },
    forceHandoff: photoCount > 0 && photoHandoff(op),
  });
  const known = { ...qualification, ...result.qualification };
  const progress = flowProgress(op, known, photoCount);
  if (op.workflow?.enabled)
    result.trace.push({
      name: "fluxo",
      detail: progress.title
        ? "Etapa pendente: " + progress.title
        : progress.ready
          ? "Condições de qualificação satisfeitas."
          : "Qualificação ainda tem dados pendentes.",
    });
  return {
    ...result,
    qualification: known,
    progress,
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
            qualification: known,
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
