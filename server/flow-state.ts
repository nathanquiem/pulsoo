import type { Operation } from "../shared/model.js";
export function factPresent(value: string | undefined | null) {
  if (!value?.trim()) return false;
  return !/^(nao informado|nao sei|desconhecido|pendente|a confirmar|n\/a|null|undefined)$/i.test(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim(),
  );
}
export function flowProgress(
  op: Operation,
  facts: Record<string, string> = {},
  photos = 0,
) {
  const w = op.workflow;
  const steps = w?.steps ?? [];
  const completed = steps.filter(
    (s) =>
      s.fieldKeys.every((k) => factPresent(facts[k])) &&
      (!s.requirePhoto || photos > 0),
  );
  const current = steps.find((s) => !completed.includes(s));
  const required = new Set([
    ...(w?.fields.filter((f) => f.required).map((f) => f.key) ?? []),
    ...steps.flatMap((s) => s.fieldKeys),
  ]);
  const missing = [...required].filter((k) => !factPresent(facts[k]));
  return {
    stepId: current?.id,
    title: current?.title,
    objective: current?.objective,
    instructions: current?.instructions,
    question: current?.question,
    completedStepIds: completed.map((s) => s.id),
    missingFields: missing,
    photoMissing:
      !!(w?.requirePhoto || steps.some((s) => s.requirePhoto)) && photos === 0,
    ready:
      !!w?.enabled &&
      missing.length === 0 &&
      (!(w.requirePhoto || steps.some((s) => s.requirePhoto)) || photos > 0),
    crmStageId: current?.crmStageId || undefined,
  };
}
const stop = new Set(
  "a o as os de da do das dos em no na nos nas e que qual quais como para por um uma eu meu minha voce voces onde aonde".split(
    " ",
  ),
);
function tokens(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !stop.has(t))
    .map((t) => t.slice(0, 5));
}
export function lookupInformation(op: Operation, question: string) {
  const query = new Set(tokens(question));
  const matches = (op.workflow?.knowledge ?? [])
    .map((entry) => ({
      entry,
      score:
        tokens(entry.question).reduce((n, t) => n + (query.has(t) ? 2 : 0), 0) +
        Math.min(
          0.5,
          tokens(entry.answer).reduce(
            (n, t) => n + (query.has(t) ? 0.05 : 0),
            0,
          ),
        ),
    }))
    .filter((v) => v.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((v) => v.entry);
  return {
    found: matches.length > 0,
    entries: matches,
    instruction: matches.length
      ? "Responda apenas com estes dados aprovados e retome a pendência, sem reiniciar o roteiro."
      : "Não há resposta aprovada correspondente. Não invente; esclareça a dúvida ou solicite humano.",
  };
}
