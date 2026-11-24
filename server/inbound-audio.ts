import type { ConversationMessage, RuntimeJob } from "../shared/model.js";
import type { Store } from "./store.js";
import { IntegrationError } from "./integrations/http.js";
import { requestedOptOut } from "./followup.js";

const pollMs = 4_000;
const timeoutMs = 120_000;

type AudioProvider = {
  read: (conversationId: string, messageId: string) => Promise<Buffer>;
  submit: (
    audio: Buffer,
    canContinue: () => Promise<boolean>,
  ) => Promise<{ id: string }>;
  get: (
    id: string,
  ) => Promise<{ id: string; status: string; text: string | null }>;
};

export async function prepareAudio(
  store: Store,
  job: RuntimeJob,
  message: ConversationMessage,
  provider: AudioProvider | undefined,
  canContinue: () => Promise<boolean>,
  now: () => Date,
) {
  const audio = message.audio!;
  async function cancelIfRunning() {
    await store.transaction(async (tx) => {
      const latest = await tx.get("runtimeJob", job.id);
      if (latest?.state === "running")
        await tx.put("runtimeJob", {
          ...latest,
          state: "cancelled",
          lastError: "transcricao_cancelada",
        });
    });
  }
  const startedAt = audio.startedAt ?? now().toISOString();
  let next: NonNullable<ConversationMessage["audio"]>;
  let text = message.text;
  let delay = 0;
  try {
    if (!(await canContinue())) return cancelIfRunning();
    if (!provider) throw new IntegrationError("transcricao_indisponivel");
    if (audio.state === "submitting")
      throw new IntegrationError("criacao_de_transcricao_incerta");
    if (audio.state === "pending") {
      const bytes = await provider.read(job.conversationId, message.id);
      if (!(await canContinue())) return cancelIfRunning();
      // Se o processo cair durante uma criação, não reenviar o áudio às cegas.
      const claimed = await store.transaction(async (tx) => {
        const fresh = await tx.get("message", message.id);
        if (fresh?.audio?.state !== "pending") return false;
        await tx.put("message", {
          ...fresh,
          audio: { state: "submitting", startedAt },
        });
        return true;
      });
      if (!claimed) return cancelIfRunning();
      const { id } = await provider.submit(bytes, canContinue);
      if (typeof id !== "string" || !/^[\w-]{1,200}$/.test(id))
        throw new IntegrationError("id_de_transcricao_invalido");
      next = { state: "processing", startedAt, transcriptId: id };
      delay = pollMs;
    } else {
      if (now().getTime() - Date.parse(startedAt) >= timeoutMs)
        throw new IntegrationError("tempo_de_transcricao_excedido");
      const transcript = await provider.get(audio.transcriptId!);
      if (transcript.id !== audio.transcriptId)
        throw new IntegrationError("id_de_transcricao_divergente");
      if (
        transcript.status === "queued" ||
        transcript.status === "processing"
      ) {
        next = audio;
        delay = pollMs;
      } else if (
        transcript.status === "completed" &&
        typeof transcript.text === "string" &&
        transcript.text.trim()
      ) {
        text = transcript.text.trim().slice(0, 12000);
        next = { state: "completed" };
      } else throw new IntegrationError("audio_sem_transcricao_util");
    }
  } catch (error) {
    next = {
      state: "failed",
      error:
        error instanceof IntegrationError ? error.code : "falha_na_transcricao",
    };
  }
  await store.transaction(async (tx) => {
    const fresh = await tx.get("message", message.id);
    if (!fresh) return;
    await tx.put("message", { ...fresh, audio: next, text });
    const current = await tx.get("runtimeJob", job.id);
    const conversation = await tx.get("conversation", job.conversationId);
    if (
      current?.state !== "running" ||
      !conversation ||
      conversation.cycle !== job.cycle
    )
      return;
    if (next.state === "completed" && requestedOptOut(text)) {
      await tx.put("conversation", { ...conversation, status: "opted_out" });
      await tx.put("runtimeJob", {
        ...current,
        state: "cancelled",
        lastError: "lead_pediu_para_parar",
      });
      return;
    }
    await tx.put("runtimeJob", {
      ...current,
      state: "pending",
      dueAt: new Date(now().getTime() + delay).toISOString(),
    });
  });
}
