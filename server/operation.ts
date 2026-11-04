import { z } from "zod";
import type { Tx } from "./store.js";
import type { Operation, ModuleKey } from "../shared/model.js";
import { base, DomainError } from "./domain.js";
export const operationSchema = z
  .object({
    agentEnabled: z.boolean(),
    testMode: z
      .object({
        enabled: z.boolean(),
        phones: z.array(z.string().regex(/^\d{10,15}$/)).max(10),
      })
      .strict()
      .optional(),
    handoff: z
      .object({
        enabled: z.boolean(),
        onImage: z.boolean(),
        recordNote: z.boolean(),
      })
      .strict()
      .optional(),
    modules: z
      .object({
        catalog: z.boolean(),
        proposals: z.boolean(),
        calendar: z.boolean(),
      })
      .strict(),
    specialists: z
      .array(
        z
          .object({
            id: z.enum([
              "qualification",
              "knowledge",
              "catalog",
              "calendar",
              "proposals",
            ]),
            enabled: z.boolean(),
            instructions: z.string().max(4000),
            model: z.string().max(100),
          })
          .strict(),
      )
      .max(5),
    followup: z
      .object({
        enabled: z.boolean(),
        steps: z
          .array(
            z
              .object({
                delayMinutes: z.number().int().min(1).max(43200),
                instruction: z.string().min(1).max(1500),
              })
              .strict(),
          )
          .min(1)
          .max(5),
        timeZone: z.string().max(100),
        weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
        maxPerDay: z.number().int().min(1).max(5),
        terminalStages: z.array(z.string().max(200)).max(30),
      })
      .strict(),
  })
  .strict()
  .superRefine((o, ctx) => {
    if (o.modules.proposals && !o.modules.catalog)
      ctx.addIssue({ code: "custom", message: "Propostas exigem catálogo." });
    if (
      o.followup.start >= o.followup.end ||
      [o.followup.start, o.followup.end].some(
        (t) => Number(t.slice(0, 2)) > 23 || Number(t.slice(3)) > 59,
      )
    )
      ctx.addIssue({ code: "custom", message: "Horário inválido." });
    if (new Set(o.specialists.map((s) => s.id)).size !== o.specialists.length)
      ctx.addIssue({ code: "custom", message: "Especialistas duplicados." });
    try {
      new Intl.DateTimeFormat("en", { timeZone: o.followup.timeZone });
    } catch {
      ctx.addIssue({ code: "custom", message: "Fuso inválido." });
    }
  });
export function defaultOperation(): Operation {
  return {
    ...base("operation"),
    revision: 1,
    agentEnabled: false,
    modules: { catalog: false, proposals: false, calendar: false },
    specialists: [
      {
        id: "qualification",
        enabled: true,
        instructions:
          "Extraia necessidade, urgência e próximo passo. Nunca invente dados.",
        model: "",
      },
      {
        id: "knowledge",
        enabled: true,
        instructions:
          "Consulte o contexto e as notas aprovadas. Diferencie fato e pendência.",
        model: "",
      },
      {
        id: "catalog",
        enabled: true,
        instructions: "Use apenas serviços e preços ativos do catálogo.",
        model: "",
      },
      {
        id: "calendar",
        enabled: true,
        instructions: "Não confirme horário sem reserva no provedor.",
        model: "",
      },
      {
        id: "proposals",
        enabled: true,
        instructions: "Prepare dados e solicite aprovação antes de enviar.",
        model: "",
      },
    ],
    followup: {
      enabled: true,
      steps: [
        {
          delayMinutes: 60,
          instruction:
            "Retome a pergunta pendente com naturalidade, sem repetir a saudação.",
        },
        {
          delayMinutes: 240,
          instruction: "Ofereça ajuda para dar o próximo passo; evite pressão.",
        },
      ],
      timeZone: "America/Sao_Paulo",
      weekdays: [1, 2, 3, 4, 5],
      start: "09:00",
      end: "18:00",
      maxPerDay: 2,
      terminalStages: ["qualificado", "qualificada", "ganho", "perdido"],
    },
  };
}
export async function operation(tx: Tx) {
  return (await tx.get("operation", "operation")) ?? defaultOperation();
}
export async function requireModule(tx: Tx, module: ModuleKey) {
  if (!(await operation(tx)).modules[module])
    throw new DomainError("modulo_desativado", 409);
}
export function specialistAvailable(
  o: Operation,
  id: Operation["specialists"][number]["id"],
) {
  const module =
    id === "catalog"
      ? "catalog"
      : id === "proposals"
        ? "proposals"
        : id === "calendar"
          ? "calendar"
          : null;
  return (
    (!module || o.modules[module]) &&
    o.specialists.some((s) => s.id === id && s.enabled)
  );
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11 ? "55" + digits : digits;
}
export function testContactAllowed(
  op: Operation,
  contact: { phone: string } | undefined,
) {
  if (!op.testMode?.enabled) return true;
  const phone = normalizePhone(contact?.phone ?? "");
  return !!phone && op.testMode.phones.some((p) => normalizePhone(p) === phone);
}
export function isRecordJob(kind: string) {
  return kind === "record_followup" || kind === "record_handoff";
}
