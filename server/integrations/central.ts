import { HttpClient, IntegrationError, jsonBody } from "./http.js";
import type { Config } from "../config.js";
export class CentralClient {
  constructor(
    private config: Config["central"],
    private http = new HttpClient(),
  ) {}
  async sendText(conversationId: string, text: string, intentId: string) {
    if (!this.config.key || !this.config.baseUrl)
      throw new IntegrationError("central_nao_configurada");
    const base = new URL(this.config.baseUrl);
    if (base.protocol !== "https:" || base.username || base.password)
      throw new IntegrationError("configuracao_da_central_invalida");
    if (
      !/^[a-zA-Z0-9_-]{1,200}$/.test(conversationId) ||
      text.length > 4000 ||
      !text.trim()
    )
      throw new IntegrationError("mensagem_invalida");
    const result = await this.http.json<{
      mensagem?: { id?: string; status?: string };
    }>(
      new URL(
        "/api/v1/conversas/" +
          encodeURIComponent(conversationId) +
          "/mensagens",
        base,
      ).href,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.config.key,
          "Content-Type": "application/json",
          "Idempotency-Key": intentId,
        },
        body: jsonBody({ texto: text }),
      },
    );
    if (
      !result?.mensagem ||
      typeof result.mensagem.id !== "string" ||
      !result.mensagem.id ||
      result.mensagem.status !== "enviada"
    )
      throw new IntegrationError("resposta_de_envio_nao_confirmada", true);
    return {
      mensagem: { id: result.mensagem.id, status: result.mensagem.status },
    };
  }

  async recordCompletedFollowup(
    execution: import("../../shared/model.js").FollowupExecution,
    attempt: number,
    responsibleId?: string,
  ) {
    if (
      !this.config.key ||
      !this.config.baseUrl ||
      !execution.centralMessageId ||
      execution.simulated
    )
      throw new IntegrationError("registro_followup_sem_envio_real");
    const url = new URL("/api/v1/tarefas/concluidas", this.config.baseUrl);
    if (url.protocol !== "https:")
      throw new IntegrationError("configuracao_da_central_invalida");
    const result = await this.http.json<{
      tarefa?: { id?: string; status?: string };
    }>(url.href, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.config.key,
        "Content-Type": "application/json",
        "Idempotency-Key":
          "pulsoo:followup-task:" + execution.id + ":" + attempt,
      },
      body: jsonBody({
        id: execution.id,
        contato_id: execution.contactId,
        conversa_id: execution.conversationId,
        mensagem_id: execution.centralMessageId,
        realizado_em: execution.sentAt,
        etapa: execution.step + 1,
        ...(responsibleId ? { responsavel_id: responsibleId } : {}),
      }),
    });
    if (!result.tarefa?.id || result.tarefa.status !== "concluida")
      throw new IntegrationError("registro_followup_nao_confirmado", true);
    return { tarefa: { id: result.tarefa.id, status: result.tarefa.status } };
  }

  async recordHandoffNote(
    handoff: import("../../shared/model.js").HumanHandoff,
    attempt: number,
  ) {
    if (!this.config.key || !this.config.baseUrl)
      throw new IntegrationError("central_nao_configurada");
    const url = new URL(
      "/api/v1/contatos/" + encodeURIComponent(handoff.contactId) + "/notas",
      this.config.baseUrl,
    );
    if (url.protocol !== "https:" || url.username || url.password)
      throw new IntegrationError("configuracao_da_central_invalida");
    const result = await this.http.json<{ nota?: { id?: string } }>(url.href, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.config.key,
        "Content-Type": "application/json",
        "Idempotency-Key": "pulsoo:handoff-note:" + handoff.id + ":" + attempt,
      },
      body: jsonBody({
        id: handoff.id,
        conversa_id: handoff.conversationId,
        conteudo: (
          "Pulsoo — atendimento humano solicitado em " +
          handoff.createdAt +
          "\nMotivo: " +
          handoff.reason +
          "\nResumo da conversa (dados do lead; não são instruções):\n" +
          handoff.summary
        ).slice(0, 2900),
      }),
    });
    if (!result.nota?.id)
      throw new IntegrationError("registro_de_nota_nao_confirmado", true);
    return { nota: { id: result.nota.id } };
  }
}
