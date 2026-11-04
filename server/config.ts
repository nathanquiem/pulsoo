import "dotenv/config";
import { randomBytes } from "node:crypto";
export type Config = ReturnType<typeof readConfig>;
function limit(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (!value?.trim()) return fallback;
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max)
    throw new Error("Limite de IA inválido na configuração.");
  return result;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === "production",
    demo = env.DEMO_MODE === "true";
  const storage = env.STORAGE_DRIVER ?? "postgres",
    host = env.HOST ?? (production ? "0.0.0.0" : "127.0.0.1");
  const secret =
    env.SESSION_SECRET || (!production ? randomBytes(32).toString("hex") : "");
  const password = env.ADMIN_PASSWORD || "";
  if (
    production &&
    new URL(env.APP_URL ?? "http://invalid").protocol !== "https:"
  )
    throw new Error("APP_URL deve usar HTTPS em produção.");
  if (
    production &&
    (demo ||
      storage !== "postgres" ||
      secret.length < 32 ||
      password.length < 12 ||
      !env.DATABASE_URL)
  )
    throw new Error("Configuração de produção incompleta.");
  if (demo && (production || !["127.0.0.1", "localhost", "::1"].includes(host)))
    throw new Error(
      "Simulação permitida somente em desenvolvimento e loopback.",
    );
  if (!demo && (!password || secret.length < 32))
    throw new Error("Configure ADMIN_PASSWORD e SESSION_SECRET.");
  return {
    production,
    demo,
    storage,
    host,
    port: Number(env.PORT ?? 3081),
    appUrl: env.APP_URL ?? "http://localhost:3081",
    secret,
    password,
    email: env.ADMIN_EMAIL ?? "admin@pulsoo.local",
    databaseUrl: env.DATABASE_URL,
    central: {
      baseUrl: env.CENTRAL_BASE_URL ?? "",
      companyId: env.CENTRAL_EMPRESA_ID ?? "",
      key: env.CENTRAL_API_KEY ?? "",
      webhookSecret: env.CENTRAL_WEBHOOK_SECRET ?? "",
    },
    openaiKey: env.OPENAI_API_KEY ?? "",
    model: env.OPENAI_MODEL ?? "",
    summaryModel: env.OPENAI_MODEL_SUMMARY ?? "",
    elevenKey: env.ELEVENLABS_API_KEY ?? "",
    voiceId: env.ELEVENLABS_VOICE_ID ?? "",
    assemblyKey: env.ASSEMBLYAI_API_KEY ?? "",
    google: {
      clientId: env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
      refreshToken: env.GOOGLE_REFRESH_TOKEN ?? "",
    },
    calKey: env.CALCOM_API_KEY ?? "",
    calSlotsVersion: env.CALCOM_API_VERSION_SLOTS ?? "2024-09-04",
    calBookingsVersion: env.CALCOM_API_VERSION_BOOKINGS ?? "2024-08-13",
    approvalWebhook: env.APPROVAL_WEBHOOK_URL ?? "",
    followupResponsibleId: env.CENTRAL_FOLLOWUP_RESPONSAVEL_ID ?? "",
    channelMode: (["evolution", "official"].includes(
      env.CENTRAL_CHANNEL_MODE ?? "",
    )
      ? env.CENTRAL_CHANNEL_MODE
      : "unknown") as "evolution" | "official" | "unknown",
    agentLimits: {
      maxDelegations: limit(env.AGENT_MAX_DELEGATIONS, 1, 0, 3),
      contextChars: limit(env.AGENT_CONTEXT_CHARS, 24000, 4000, 64000),
      outputTokens: limit(env.AGENT_MAX_OUTPUT_TOKENS, 700, 128, 1600),
    },
    runtimeDir: env.RUNTIME_DIR ?? ".runtime",
  };
}
