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
    workflow: z
      .object({
        enabled: z.boolean(),
        fields: z
          .array(
            z
              .object({
                key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
                label: z.string().min(1).max(80),
                question: z.string().min(1).max(400),
                required: z.boolean(),
              })
              .strict(),
          )
          .max(12),
        steps: z
          .array(
            z
              .object({
                id: z.string().min(1).max(80),
                title: z.string().min(1).max(100),
                objective: z.string().min(1).max(500),
                question: z.string().min(1).max(400),
                instructions: z.string().max(1500),
                fieldKeys: z.array(z.string()).max(12),
                requirePhoto: z.boolean(),
                crmStageId: z.string().max(100),
              })
              .strict(),
          )
          .max(12)
          .optional(),
        autoHandoff: z.boolean().optional(),
        knowledge: z
          .array(
            z
              .object({
                id: z.string().min(1).max(80),
                question: z.string().min(1).max(300),
                answer: z.string().min(1).max(2000),
              })
              .strict(),
          )
          .max(30)
          .optional(),
        toolGuidance: z
          .object({
            responder_atendimento: z.string().max(2000).optional(),
            consultar_informacoes: z.string().max(2000).optional(),
            solicitar_humano: z.string().max(2000).optional(),
          })
          .strict()
          .optional(),
        stageOnStart: z.string().max(100),
        stageOnHandoff: z.string().max(100),
        responsibleId: z.string().max(100),
        farewell: z.string().min(1).max(800),
        nextStep: z.string().max(300),
        photoPolicy: z.enum(["immediate", "collect"]),
        requirePhoto: z.boolean(),
        notification: z
          .object({
            kind: z.enum([
              "none",
              "contact",
              "conversation",
              "group",
              "webhook",
            ]),
            targetId: z.string().max(200),
            numberId: z.string().max(100),
          })
          .strict(),
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
    if (
      o.workflow &&
      new Set(o.workflow.fields.map((f) => f.key)).size !==
        o.workflow.fields.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Campos de qualificação duplicados.",
      });
    if (o.workflow?.steps) {
      const keys = new Set(o.workflow.fields.map((f) => f.key));
      if (
        new Set(o.workflow.steps.map((s) => s.id)).size !==
          o.workflow.steps.length ||
        o.workflow.steps.some(
          (s) =>
            (!s.fieldKeys.length && !s.requirePhoto) ||
            new Set(s.fieldKeys).size !== s.fieldKeys.length ||
            s.fieldKeys.some((k) => !keys.has(k)),
        )
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Cada etapa exige uma condição válida e identificadores únicos.",
        });
    }
    if (
      o.workflow?.knowledge &&
      new Set(o.workflow.knowledge.map((k) => k.id)).size !==
        o.workflow.knowledge.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Informações aprovadas duplicadas.",
      });
    if (
      o.workflow?.autoHandoff &&
      !o.workflow.requirePhoto &&
      !o.workflow.fields.some((f) => f.required) &&
      !o.workflow.steps?.length
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Conclusão automática exige ao menos uma condição de qualificação.",
      });
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
  contact: { phone: string; id?: string; conversationId?: string } | undefined,
) {
  const destination = op.workflow?.notification;
  if (
    destination?.targetId &&
    ((destination.kind === "contact" && contact?.id === destination.targetId) ||
      (destination.kind === "conversation" &&
        contact?.conversationId === destination.targetId))
  )
    return false;
  if (!op.testMode?.enabled) return true;
  const phone = normalizePhone(contact?.phone ?? "");
  return !!phone && op.testMode.phones.some((p) => normalizePhone(p) === phone);
}
export function photoHandoff(op: Operation) {
  return (
    !!op.handoff?.enabled &&
    (op.workflow?.enabled
      ? op.workflow.photoPolicy === "immediate"
      : !!op.handoff?.onImage)
  );
}
export function isRecordJob(kind: string) {
  return [
    "record_followup",
    "record_handoff",
    "record_stage",
    "notify_human",
    "record_transfer",
  ].includes(kind);
}
