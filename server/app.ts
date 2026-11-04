import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import type { Config } from "./config.js";
import type { Store } from "./store.js";
import { base, DomainError, validWebhook } from "./domain.js";
import { draft, submit, review, applyStage } from "./service.js";
import { integrations } from "./integrations/registry.js";
import {
  operation,
  operationSchema,
  requireModule,
  testContactAllowed,
  isRecordJob,
} from "./operation.js";
import { requestHuman } from "./handoff.js";
import { testHistoryRoutes } from "./test-history.js";
import { toolDescriptions } from "./workflow.js";
import {
  observeInbound,
  syncConversationGate,
  cancelPending,
} from "./followup.js";
import { runLab } from "./lab.js";
import { proposalPdf } from "./pdf.js";
import { MediaClient } from "./integrations/media.js";
declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
    actor?: string;
  }
}
const label = z.string().trim().min(1).max(200),
  text = z.string().max(12000),
  id = label;
const productSchema = z
  .object({
    name: label,
    category: label,
    description: text,
    priceCents: z.number().int().min(0).max(1000000000),
    unit: label,
    active: z.boolean(),
  })
  .strict();
const templateSchema = z
  .object({
    name: label,
    title: label,
    intro: text,
    terms: text,
    validDays: z.number().int().min(1).max(365),
  })
  .strict();
const contactSchema = z
  .object({
    name: label,
    company: z.string().max(200),
    phone: z.string().max(30),
    stage: label,
    notes: text,
    opportunityId: z.string().max(100).optional(),
  })
  .strict();
const proposalSchema = z
  .object({
    contactId: id,
    templateId: id,
    items: z
      .array(
        z
          .object({
            productId: id,
            quantity: z.number().int().min(1).max(1000),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
const ruleSchema = z
  .object({
    name: label,
    fromStage: label,
    toStage: label,
    templateId: id,
    productIds: z.array(id).min(1).max(20),
    active: z.boolean(),
  })
  .strict();
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
function string(value: unknown) {
  return typeof value === "string" ? value : "";
}
export function publicSafe<T>(value: T, c: Config): T {
  let serialized = JSON.stringify(value);
  let host = "";
  try {
    host = new URL(c.central.baseUrl).hostname;
  } catch {}
  const secrets = [
    c.central.key,
    c.central.webhookSecret,
    c.openaiKey,
    c.elevenKey,
    c.assemblyKey,
    c.google.clientSecret,
    c.google.refreshToken,
    c.calKey,
    c.approvalWebhook,
    c.databaseUrl ?? "",
    c.password,
    c.secret,
  ];
  for (const secret of secrets)
    if (secret) serialized = serialized.split(secret).join("[protegido]");
  if (host) {
    const escape = host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    serialized = serialized.replace(
      new RegExp("https?://" + escape + '[^\\s"<>]*', "gi"),
      "[endereço interno]",
    );
    serialized = serialized.replace(
      new RegExp(escape, "gi"),
      "[endereço interno]",
    );
  }
  return JSON.parse(serialized) as T;
}
export async function buildApp(c: Config, store: Store) {
  const app = Fastify({
    logger: false,
    bodyLimit: 1024 * 1024,
    trustProxy: false,
  });
  await app.register(cookie, { secret: c.secret });
  app.addHook("preSerialization", async (request, _reply, payload) => {
    if (
      request.url.startsWith("/api") &&
      payload &&
      typeof payload === "object" &&
      !Buffer.isBuffer(payload)
    )
      return publicSafe(payload, c);
    return payload;
  });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      req.rawBody = body as Buffer;
      try {
        done(null, JSON.parse((body as Buffer).toString("utf8")));
      } catch {
        done(new DomainError("json_invalido", 400), undefined);
      }
    },
  );
  app.addHook("preHandler", async (req) => {
    const path = req.url.split("?")[0];
    const mod = /^\/api\/products(?:\/|$)/.test(path)
      ? "catalog"
      : /^\/api\/(templates|proposals|rules)(?:\/|$)/.test(path)
        ? "proposals"
        : null;
    if (mod) await store.transaction((tx) => requireModule(tx, mod));
  });
  const passwordHash = scryptSync(c.password || "unused", c.secret, 64);
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("X-Frame-Options", "DENY");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    if (req.url.startsWith("/api")) reply.header("Cache-Control", "no-store");
    const path = req.url.split("?")[0];
    if (
      !["GET", "HEAD"].includes(req.method) &&
      path !== "/api/webhooks/central"
    ) {
      const origin = req.headers.origin;
      if (origin) {
        const allowed = [
          new URL(c.appUrl).origin,
          ...(c.demo ? ["http://localhost:5173", "http://127.0.0.1:5173"] : []),
        ];
        if (!allowed.includes(origin))
          throw new DomainError("origem_nao_autorizada", 403);
      }
    }
    if (
      !path.startsWith("/api") ||
      ["/api/login", "/api/session", "/api/webhooks/central"].includes(path)
    )
      return;
    if (c.demo) {
      req.actor = "operador-local";
      return;
    }
    const token = req.cookies.pulsoo;
    if (!token) throw new DomainError("autenticacao_necessaria", 401);
    const unsign = req.unsignCookie(token);
    if (!unsign.valid || !unsign.value)
      throw new DomainError("sessao_invalida", 401);
    const session = await store.transaction((tx) =>
      tx.get(
        "session",
        createHash("sha256").update(unsign.value).digest("hex"),
      ),
    );
    if (!session || session.expiresAt < Date.now())
      throw new DomainError("sessao_expirada", 401);
    req.actor = session.email;
  });
  app.setErrorHandler((error, req, reply) => {
    const status =
      error instanceof DomainError
        ? error.status
        : error instanceof z.ZodError
          ? 422
          : ((error as { statusCode?: number }).statusCode ?? 500);
    reply.status(status).send({
      error:
        error instanceof DomainError
          ? error.code
          : error instanceof z.ZodError
            ? "dados_invalidos"
            : status === 429
              ? "limite_de_requisicoes"
              : "operacao_nao_concluida",
    });
  });
  app.get("/health", async () => ({ status: "ok", service: "pulsoo" }));
  app.get("/api/session", async (req) => {
    if (c.demo)
      return { authenticated: true, demo: true, email: "operador-local" };
    const token = req.cookies.pulsoo;
    if (!token) return { authenticated: false, demo: false };
    const result = req.unsignCookie(token);
    if (!result.valid || !result.value)
      return { authenticated: false, demo: false };
    const s = await store.transaction((tx) =>
      tx.get(
        "session",
        createHash("sha256").update(result.value!).digest("hex"),
      ),
    );
    return {
      authenticated: !!s && s.expiresAt > Date.now(),
      demo: false,
      email: s?.email,
    };
  });
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const input = z
        .object({ email: z.string().email(), password: z.string().max(200) })
        .parse(req.body);
      const actual = scryptSync(input.password, c.secret, 64);
      if (input.email !== c.email || !timingSafeEqual(actual, passwordHash))
        throw new DomainError("credenciais_invalidas", 401);
      const token = randomBytes(32).toString("hex");
      await store.transaction((tx) =>
        tx.put("session", {
          ...base(createHash("sha256").update(token).digest("hex")),
          email: c.email,
          expiresAt: Date.now() + 12 * 3600000,
        }),
      );
      reply.setCookie("pulsoo", token, {
        path: "/",
        httpOnly: true,
        secure: c.production,
        sameSite: "strict",
        signed: true,
        maxAge: 43200,
      });
      return { ok: true };
    },
  );
  app.post("/api/logout", async (req, reply) => {
    const t = req.cookies.pulsoo;
    if (t) {
      const s = req.unsignCookie(t);
      if (s.valid && s.value)
        await store.transaction((tx) =>
          tx.remove(
            "session",
            createHash("sha256").update(s.value!).digest("hex"),
          ),
        );
    }
    reply.clearCookie("pulsoo", { path: "/" });
    return { ok: true };
  });
  testHistoryRoutes(app, store);
  app.get("/api/bootstrap", async () =>
    publicSafe(
      await store.transaction(async (tx) => ({
        operation: await operation(tx),
        tools: toolDescriptions,
        centralExtensions: !!c.central.extendedApi,
        archives: (await tx.list("testArchive")).map((a) => ({
          id: a.id,
          createdAt: a.createdAt,
          count: a.records.length,
          restoredAt: a.restoredAt,
        })),
        conversations: await tx.list("conversation"),
        handoffs: await tx.list("handoff"),
        messages: (await tx.list("message")).slice(-250),
        runtimeJobs: await tx.list("runtimeJob"),
        followups: await tx.list("followup"),
        demo: c.demo,
        storage: store.driver,
        products: await tx.list("product"),
        templates: await tx.list("template"),
        contacts: await tx.list("contact"),
        proposals: await tx.list("proposal"),
        rules: await tx.list("rule"),
        usage: (await tx.list("usage")).slice(-200),
        audit: (await tx.list("audit")).slice(-30).reverse(),
        jobs: await tx.list("job"),
        settings: await tx.get("settings", "agent"),
        integrations: integrations(c),
      })),
      c,
    ),
  );
  app.post("/api/products", async (req) =>
    store.transaction(async (tx) => {
      const p = { ...base(), ...productSchema.parse(req.body) };
      await tx.put("product", p);
      return p;
    }),
  );
  app.put<{ Params: { id: string } }>("/api/products/:id", async (req) =>
    store.transaction(async (tx) => {
      const p = await tx.get("product", req.params.id);
      if (!p) throw new DomainError("produto_ausente", 404);
      const value = { ...p, ...productSchema.parse(req.body) };
      await tx.put("product", value);
      return value;
    }),
  );
  app.post("/api/templates", async (req) =>
    store.transaction(async (tx) => {
      const t = { ...base(), ...templateSchema.parse(req.body) };
      await tx.put("template", t);
      return t;
    }),
  );
  app.post("/api/contacts", async (req) =>
    store.transaction(async (tx) => {
      const contact = {
        ...base(),
        ...contactSchema.parse(req.body),
        automationAllowed: c.demo,
        demo: c.demo,
      };
      await tx.put("contact", contact);
      return contact;
    }),
  );
  app.put<{ Params: { id: string } }>("/api/contacts/:id", async (req) =>
    store.transaction(async (tx) => {
      const old = await tx.get("contact", req.params.id);
      if (!old) throw new DomainError("contato_ausente", 404);
      const data = contactSchema.parse(req.body);
      await tx.put("contact", { ...old, ...data });
      if (old.stage !== data.stage)
        await applyStage(
          tx,
          old.id,
          old.stage,
          data.stage,
          "manual:" + randomBytes(16).toString("hex"),
        );
      return { ok: true };
    }),
  );
  app.post("/api/proposals", async (req) =>
    store.transaction((tx) => draft(tx, proposalSchema.parse(req.body))),
  );
  app.post<{ Params: { id: string } }>(
    "/api/proposals/:id/submit",
    async (req) =>
      store.transaction(async (tx) => {
        const p = await tx.get("proposal", req.params.id);
        if (!p) throw new DomainError("proposta_ausente", 404);
        return submit(tx, p);
      }),
  );
  app.post<{ Params: { id: string } }>(
    "/api/proposals/:id/review",
    async (req) =>
      review(
        store,
        req.params.id,
        z
          .object({
            decision: z.enum(["approve", "reject"]),
            hash: z.string().length(64),
            note: z.string().max(1000).default(""),
          })
          .strict()
          .parse(req.body),
        req.actor!,
      ),
  );
  app.get<{ Params: { id: string } }>(
    "/api/proposals/:id/pdf",
    async (req, reply) => {
      const p = await store.transaction((tx) =>
        tx.get("proposal", req.params.id),
      );
      if (!p) throw new DomainError("proposta_ausente", 404);
      const pdf = await proposalPdf(publicSafe(p, c));
      reply
        .type("application/pdf")
        .header(
          "Content-Disposition",
          'inline; filename="' + p.number + '.pdf"',
        );
      return reply.send(pdf);
    },
  );
  app.post("/api/rules", async (req) =>
    store.transaction(async (tx) => {
      const input = ruleSchema.parse(req.body);
      if (!(await tx.get("template", input.templateId)))
        throw new DomainError("modelo_ausente");
      for (const pid of input.productIds)
        if (!(await tx.get("product", pid)))
          throw new DomainError("produto_ausente");
      const rule = { ...base(), ...input, requireApproval: true as const };
      await tx.put("rule", rule);
      return rule;
    }),
  );
  app.put("/api/settings", async (req) =>
    store.transaction(async (tx) => {
      const data = z
        .object({
          name: label,
          tone: label,
          instructions: text,
          splitMode: z.enum(["single", "paragraphs"]),
          maxChunks: z.number().int().min(1).max(8),
          delayMs: z.number().int().min(0).max(15000),
          voiceMode: z.enum(["text", "audio", "adaptive"]),
          groupingMs: z.number().int().min(0).max(30000).optional(),
          replyDelayMs: z.number().int().min(0).max(15000).optional(),
          maxCharsPerMessage: z.number().int().min(100).max(4000).optional(),
          naturalParagraphs: z.boolean().optional(),
          typing: z.boolean().optional(),
        })
        .strict()
        .parse(req.body);
      const settings = { ...base("agent"), ...data };
      await tx.put("settings", settings);
      const op = await operation(tx);
      await tx.put("operation", { ...op, revision: op.revision + 1 });
      for (const job of await tx.list("runtimeJob"))
        if (
          !isRecordJob(job.kind) &&
          ["pending", "running"].includes(job.state)
        ) {
          await tx.put("runtimeJob", {
            ...job,
            state: "cancelled",
            lastError: "comportamento_alterado",
          });
        }
      return settings;
    }),
  );
  app.post(
    "/api/lab/chat",
    { config: { rateLimit: { max: c.demo ? 60 : 6, timeWindow: "1 minute" } } },
    async (req) => {
      const input = z
        .object({
          messages: z
            .array(
              z
                .object({
                  role: z.enum(["user", "assistant"]),
                  content: z.string().min(1).max(4000),
                })
                .strict(),
            )
            .min(1)
            .max(20),
          mode: z.enum(["simulation", "live"]),
          kind: z.enum(["reply", "followup"]).default("reply"),
          photoCount: z.number().int().min(0).max(10).default(0),
        })
        .strict()
        .parse(req.body);
      const result = await runLab(
        store,
        c,
        publicSafe(input.messages, c),
        input.mode,
        input.kind,
        input.photoCount,
      );
      return publicSafe(result, c);
    },
  );
  app.post(
    "/api/lab/voice",
    { config: { rateLimit: { max: c.demo ? 60 : 3, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (c.demo)
        throw new DomainError("voz_real_desativada_na_simulacao", 409);
      const { text } = z
        .object({ text: z.string().min(1).max(1500) })
        .strict()
        .parse(req.body);
      if (!c.voiceId) throw new DomainError("configure_a_voz", 409);
      const safeText = publicSafe(text, c);
      const audio = await new MediaClient({
        eleven: c.elevenKey,
        assembly: c.assemblyKey,
      }).synthesize(safeText, c.voiceId);
      await store.transaction((tx) =>
        tx.put("usage", {
          ...base(),
          provider: "ElevenLabs",
          model: "eleven_multilingual_v2",
          task: "prévia de voz",
          environment: "lab",
          inputTokens: 0,
          outputTokens: 0,
          characters: safeText.length,
          estimatedCostMicros: null,
          currency: "USD",
          status: "success",
        }),
      );
      return reply.type("audio/mpeg").send(audio);
    },
  );
  app.post("/api/webhooks/central", async (req, reply) => {
    const timestamp = string(req.headers["x-central-timestamp"]),
      signature = string(req.headers["x-central-assinatura"]),
      eventId = string(req.headers["x-central-id"]);
    if (
      !req.rawBody ||
      !validWebhook(req.rawBody, timestamp, signature, c.central.webhookSecret)
    )
      throw new DomainError("assinatura_invalida", 401);
    const body = object(req.body),
      event = object(body.evento),
      company = object(body.empresa),
      contactData = object(body.contato),
      attendance = object(body.atendimento),
      automation = object(attendance.automacao),
      opportunity = object(body.oportunidade);
    if (
      body.versao !== "2.0" ||
      !eventId ||
      event.id !== eventId ||
      company.id !== c.central.companyId ||
      !string(event.tipo)
    )
      throw new DomainError("contrato_de_evento_invalido", 422);
    const duplicate = await store.transaction(async (tx) => {
      if (await tx.get("event", eventId)) return true;
      const type = string(event.tipo),
        contactId = string(contactData.id);
      if (object(body.automacao).ativa === false) {
        for (const cv of await tx.list("conversation"))
          await cancelPending(tx, cv.id, "automacao_global_desativada");
        for (const old of await tx.list("contact"))
          await tx.put("contact", { ...old, automationAllowed: false });
      }
      if (contactId) {
        const old = await tx.get("contact", contactId),
          stage = object(opportunity.etapa);
        await tx.put("contact", {
          ...(old ?? base(contactId)),
          name: string(contactData.nome) || old?.name || "Contato",
          company: old?.company ?? "",
          phone: string(contactData.telefone) || old?.phone || "",
          notes: old?.notes ?? "",
          opportunityId: string(opportunity.id) || old?.opportunityId,
          stage: string(stage.id) || old?.stage || "Novo contato",
          conversationId: string(attendance.conversa_id) || old?.conversationId,
          automationAllowed:
            object(body.automacao).ativa === false
              ? false
              : typeof automation.pode_responder === "boolean"
                ? automation.pode_responder
                : (old?.automationAllowed ?? false),
        });
        const permitted =
          object(body.automacao).ativa === false
            ? false
            : typeof automation.pode_responder === "boolean"
              ? automation.pode_responder
              : (old?.automationAllowed ?? false);
        const stageId = string(stage.id) || old?.stage || "Novo contato";
        const completed =
          ["ganho", "perdido"].includes(string(opportunity.status)) ||
          ["ganho", "perdido"].includes(string(stage.tipo)) ||
          ["finalizada", "arquivada"].includes(string(attendance.status));
        await syncConversationGate(
          tx,
          contactId,
          permitted &&
            testContactAllowed(
              await operation(tx),
              await tx.get("contact", contactId),
            ),
          completed,
          stageId,
        );
        const message = object(body.mensagem),
          conversationId = string(attendance.conversa_id);
        if (
          type === "whatsapp.mensagem_recebida" &&
          message.direcao === "entrada" &&
          conversationId &&
          string(message.id) &&
          !completed
        ) {
          const receivedAt = new Date().toISOString(),
            rawTime = string(event.ocorrido_em),
            parsed = new Date(rawTime);
          const occurredAt =
            Number.isFinite(parsed.getTime()) &&
            parsed.getTime() <= Date.now() + 60000
              ? parsed.toISOString()
              : receivedAt;
          const origin = string(event.origem).toLowerCase();
          const channel =
            origin === "evolution"
              ? "evolution"
              : origin.includes("cloud") || origin === "meta"
                ? "official"
                : c.channelMode;
          await observeInbound(tx, {
            contactId,
            conversationId,
            messageId: string(message.id),
            text:
              message.tipo === "texto" && string(message.conteudo)
                ? string(message.conteudo).slice(0, 12000)
                : message.tipo === "imagem" &&
                    (await operation(tx)).workflow?.enabled
                  ? "[Foto recebida; disponível para avaliação da equipe na Central]"
                  : "[Mensagem " +
                    string(message.tipo) +
                    " recebida; conteúdo ou transcrição pendente]",
            occurredAt,
            receivedAt,
            messageType: string(message.tipo),
            channel,
            allow:
              permitted &&
              ((message.tipo === "texto" && !!string(message.conteudo)) ||
                (message.tipo === "imagem" &&
                  (!!(await operation(tx)).workflow?.enabled ||
                    !!(await operation(tx)).handoff?.onImage))),
            stage: stageId,
          });
        }
        if (type === "negocio.etapa_alterada")
          await applyStage(
            tx,
            contactId,
            string(object(opportunity.etapa_anterior).id),
            string(stage.id),
            eventId,
          );
      }
      await tx.put("event", {
        ...base(eventId),
        type,
        contactId,
        processed: true,
      });
      return false;
    });
    return reply.code(202).send({ accepted: true, duplicate });
  });

  app.put("/api/operation", async (req) =>
    store.transaction(async (tx) => {
      const data = operationSchema.parse(req.body);
      if (data.agentEnabled && data.workflow?.enabled && !data.handoff?.enabled)
        throw new DomainError(
          "habilite_o_encaminhamento_humano_para_este_fluxo",
          409,
        );
      if(data.agentEnabled && data.workflow?.enabled && data.workflow.notification.kind!=="none" && !data.workflow.notification.targetId)throw new DomainError("configure_o_destino_da_equipe_antes_de_ativar",409);
      if (
        data.agentEnabled &&
        data.workflow?.enabled &&
        data.workflow.notification.kind === "group" &&
        !c.central.extendedApi
      )
        throw new DomainError(
          "avisos_de_grupo_exigem_atualizacao_da_central",
          409,
        );
      const old = await operation(tx),
        next = { ...old, ...data, revision: old.revision + 1 };
      await tx.put("operation", next);
      for (const j of await tx.list("runtimeJob"))
        if (!isRecordJob(j.kind) && ["pending", "running"].includes(j.state))
          await tx.put("runtimeJob", {
            ...j,
            state: "cancelled",
            lastError: "configuracao_alterada",
          });
      return next;
    }),
  );
  app.post<{ Params: { id: string } }>(
    "/api/conversations/:id/control",
    async (req) =>
      store.transaction(async (tx) => {
        const { status } = z
            .object({ status: z.enum(["paused", "active", "closed"]) })
            .strict()
            .parse(req.body),
          cv = await tx.get("conversation", req.params.id);
        if (!cv) throw new DomainError("conversa_ausente", 404);
        if (cv.status === "opted_out")
          throw new DomainError("lead_solicitou_parada", 409);
        await tx.put("conversation", {
          ...cv,
          status,
          manualState: status === "active" ? undefined : status,
          handoffId: status === "active" ? undefined : cv.handoffId,
        });
        await cancelPending(
          tx,
          cv.id,
          status === "closed" ? "qualificacao_encerrada" : "controle_manual",
        );
        return { ok: true };
      }),
  );
  app.post("/api/demo/followup", async () => {
    if (!c.demo) throw new DomainError("somente_demonstracao", 403);
    return store.transaction(async (tx) => {
      const at = new Date(),
        id = base().id,
        contactId = "demo:" + id,
        conversationId = "demo-conversation:" + id,
        op = await operation(tx);
      await tx.put("contact", {
        ...base(contactId),
        name: "Lead de teste",
        company: "",
        phone: "",
        stage: "Qualificação",
        notes: "Cenário fictício de qualificação em silêncio.",
        automationAllowed: true,
        demo: true,
        conversationId,
      });
      await tx.put("conversation", {
        ...base(conversationId),
        contactId,
        stage: "Qualificação",
        channel: "evolution",
        status: "active",
        cycle: 1,
        lastInboundAt: new Date(at.getTime() - 3 * 3600000).toISOString(),
        lastOutboundAt: new Date(at.getTime() - 2 * 3600000).toISOString(),
        followupStep: 0,
      });
      await tx.put("message", {
        ...base("demo-in:" + id),
        conversationId,
        role: "user",
        text: "Quero entender se vocês podem ajudar na minha operação.",
        occurredAt: new Date(at.getTime() - 3 * 3600000).toISOString(),
        source: "central",
      });
      await tx.put("message", {
        ...base("demo-out:" + id),
        conversationId,
        role: "assistant",
        text: "Qual sua principal necessidade e quando pretende resolver?",
        occurredAt: new Date(at.getTime() - 2 * 3600000).toISOString(),
        source: "reply",
        simulated: true,
      });
      await tx.put("runtimeJob", {
        ...base("demo-follow:" + id),
        kind: "followup",
        contactId,
        conversationId,
        state: "pending",
        attempts: 0,
        dueAt: at.toISOString(),
        cycle: 1,
        step: 0,
        policyRevision: op.revision,
        demoOnly: true,
      });
      return { ok: true };
    });
  });

  const webRoot = resolve("dist/web");
  app.get("/", async (req, reply) => {
    try {
      return reply
        .type("text/html")
        .send(await readFile(resolve(webRoot, "index.html")));
    } catch {
      return reply.code(503).send("Execute npm run build ou use npm run dev.");
    }
  });
  app.get<{ Params: { file: string } }>("/assets/:file", async (req, reply) => {
    if (!/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(req.params.file))
      return reply.code(404).send();
    const ext = req.params.file.split(".").pop();
    const types: Record<string, string> = {
      js: "text/javascript",
      css: "text/css",
      svg: "image/svg+xml",
      woff2: "font/woff2",
      png: "image/png",
    };
    if (!types[ext ?? ""]) return reply.code(404).send();
    try {
      return reply
        .type(types[ext!])
        .header("Cache-Control", "public,max-age=31536000,immutable")
        .send(await readFile(resolve(webRoot, "assets", req.params.file)));
    } catch {
      return reply.code(404).send();
    }
  });
  return app;
}
