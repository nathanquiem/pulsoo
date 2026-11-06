import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Config } from "./config.js";
import type { Store } from "./store.js";
import type { HumanHandoff } from "../shared/model.js";
import { validWebhook, DomainError } from "./domain.js";
import { HttpClient, IntegrationError } from "./integrations/http.js";
import { z } from "zod";
export function notificationConfigured(c: Config) {
  try {
    const u = new URL(c.humanNotification.url);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.hash &&
      c.humanNotification.secret.length >= 32
    );
  } catch {
    return false;
  }
}
export function notificationSignature(
  raw: string,
  timestamp: string,
  secret: string,
) {
  return (
    "sha256=" +
    createHmac("sha256", secret)
      .update(timestamp + "." + raw)
      .digest("hex")
  );
}
export function notificationPayload(h: HumanHandoff, c: Config) {
  return {
    version: "1.0",
    event: "human_handoff.requested",
    id: h.id,
    createdAt: h.createdAt,
    destination: h.notification?.targetId || null,
    lead: h.notificationData?.lead ?? {
      id: h.contactId,
      conversationId: h.conversationId,
    },
    qualification: h.notificationData?.qualification ?? [],
    photosReceived: h.notificationData?.photosReceived ?? 0,
    reason: h.reason,
    summary: h.summary,
    nextStep: h.notificationData?.nextStep ?? "",
    callback: {
      url: new URL("/api/webhooks/human-notifications", c.appUrl).href,
      method: "POST",
      auth: "HMAC-SHA256",
    },
  };
}
export async function sendHumanNotification(
  h: HumanHandoff,
  c: Config,
  http = new HttpClient(),
) {
  if (!notificationConfigured(c))
    throw new IntegrationError("configure_webhook_de_aviso_e_segredo");
  const body = JSON.stringify(notificationPayload(h, c)),
    timestamp = String(Math.floor(Date.now() / 1000));
  const response = await http.response(c.humanNotification.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": h.id,
      "X-Pulsoo-Timestamp": timestamp,
      "X-Pulsoo-Signature": notificationSignature(
        body,
        timestamp,
        c.humanNotification.secret,
      ),
    },
    body,
  });
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new IntegrationError("retorno_de_aviso_invalido", true);
  }
  if (
    response.status === 200 &&
    data.notification?.id === h.id &&
    data.notification.status === "sent" &&
    typeof data.notification.messageId === "string" &&
    data.notification.messageId.length > 0 &&
    data.notification.messageId.length <= 200
  )
    return {
      status: "sent" as const,
      messageId: data.notification.messageId as string,
    };
  if (response.status === 202 && data.accepted === true && data.id === h.id)
    return { status: "pending" as const };
  throw new IntegrationError("aviso_nao_confirmado", true);
}
export function notificationRoutes(
  app: FastifyInstance,
  store: Store,
  c: Config,
) {
  app.post("/api/webhooks/human-notifications", async (req) => {
    const timestamp = String(req.headers["x-pulsoo-timestamp"] ?? ""),
      signature = String(req.headers["x-pulsoo-signature"] ?? "");
    if (
      c.humanNotification.secret.length < 32 ||
      !req.rawBody ||
      !validWebhook(
        req.rawBody,
        timestamp,
        signature,
        c.humanNotification.secret,
      )
    )
      throw new DomainError("assinatura_invalida", 401);
    const body = z
      .object({
        id: z.uuid(),
        status: z.enum(["sent", "failed"]),
        messageId: z.string().min(1).max(200).optional(),
        error: z
          .enum([
            "destination_rejected",
            "provider_rejected",
            "delivery_failed",
          ])
          .optional(),
      })
      .strict()
      .parse(req.body);
    if (body.status === "sent" && !body.messageId)
      throw new DomainError("confirmacao_exige_id_da_mensagem", 422);
    return store.transaction(async (tx) => {
      const h = await tx.get("handoff", body.id),
        job = await tx.get("runtimeJob", "notify:" + body.id);
      if (
        !h ||
        h.notification?.kind !== "webhook" ||
        !job ||
        job.attempts === 0
      )
        throw new DomainError("aviso_ausente_ou_nao_despachado", 404);
      if (h.notificationState === "done") {
        if (
          body.status !== "sent" ||
          h.notificationMessageId !== body.messageId
        )
          throw new DomainError("confirmacao_conflitante", 409);
        return { accepted: true, duplicate: true };
      }
      const sent = body.status === "sent";
      await tx.put("handoff", {
        ...h,
        notificationState: sent ? "done" : "blocked",
        notificationMessageId: body.messageId,
        notificationConfirmedAt: new Date().toISOString(),
        lastError: sent ? undefined : (body.error ?? "delivery_failed"),
      });
      await tx.put("runtimeJob", {
        ...job,
        state: sent ? "done" : "blocked",
        lastError: sent ? undefined : (body.error ?? "delivery_failed"),
      });
      return { accepted: true, duplicate: false };
    });
  });
}
