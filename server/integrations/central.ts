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
          "\n" +
          (handoff.summary.startsWith("ATENDIMENTO PARA A EQUIPE")
            ? handoff.summary
            : "Motivo: " + handoff.reason + "\nResumo: " + handoff.summary)
        ).slice(0, 2900),
      }),
    });
    if (!result.nota?.id)
      throw new IntegrationError("registro_de_nota_nao_confirmado", true);
    return { nota: { id: result.nota.id } };
  }

  async moveStage(job: import("../../shared/model.js").RuntimeJob) {
    const base = new URL(this.config.baseUrl);
    if (
      base.protocol !== "https:" ||
      base.username ||
      base.password ||
      !this.config.key
    )
      throw new IntegrationError("configuracao_da_central_invalida");
    const result = await this.http.json<{
      oportunidade?: { id?: string; etapa_id?: string };
    }>(
      new URL(
        "/api/v1/oportunidades/" + encodeURIComponent(job.opportunityId!),
        this.config.baseUrl,
      ).href,
      {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + this.config.key,
          "Content-Type": "application/json",
          "Idempotency-Key": job.id,
        },
        body: jsonBody({
          etapa_id: job.stageTarget,
          ...(job.responsibleId ? { responsavel_id: job.responsibleId } : {}),
        }),
      },
    );
    if (
      result.oportunidade?.id !== job.opportunityId ||
      result.oportunidade?.etapa_id !== job.stageTarget
    )
      throw new IntegrationError("etapa_nao_confirmada", true);
  }
  async notifyHuman(h: import("../../shared/model.js").HumanHandoff) {
    const base = new URL(this.config.baseUrl);
    if (
      base.protocol !== "https:" ||
      base.username ||
      base.password ||
      !this.config.key
    )
      throw new IntegrationError("configuracao_da_central_invalida");
    const target = h.notification;
    if (!target || target.kind === "none" || !target.targetId)
      throw new IntegrationError("destino_humano_nao_configurado");
    if (target.kind === "conversation") {
      if (target.targetId === h.conversationId)
        throw new IntegrationError("destino_humano_igual_ao_lead");
      await this.sendText(
        target.targetId,
        h.summary,
        "pulsoo:human-notify:" + h.id,
      );
      return;
    }
    if (this.config.extendedApi) {
      const result = await this.http.json<{
        aviso?: { status?: string; mensagem_id?: string };
      }>(new URL("/api/v1/avisos/atendimento", base).href, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.config.key,
          "Content-Type": "application/json",
          "Idempotency-Key": "pulsoo:human-notify:" + h.id,
        },
        body: jsonBody({
          id: h.id,
          contato_id: h.contactId,
          conversa_id: h.conversationId,
          ...(target.numberId ? { numero_whatsapp_id: target.numberId } : {}),
          destino: {
            tipo: target.kind === "group" ? "grupo" : "contato",
            id: target.targetId,
          },
          texto: h.summary,
        }),
      });
      if (result.aviso?.status !== "enviado" || !result.aviso.mensagem_id)
        throw new IntegrationError("aviso_humano_nao_confirmado", true);
      return;
    }
    if (target.kind === "group")
      throw new IntegrationError("grupo_exige_contrato_publico_da_central");
    if (target.targetId === h.contactId)
      throw new IntegrationError("destino_humano_igual_ao_lead");
    const result = await this.http.json<{ mensagem_id?: string }>(
      new URL("/api/v1/conversas/iniciar", this.config.baseUrl).href,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.config.key,
          "Content-Type": "application/json",
          "Idempotency-Key": "pulsoo:human-notify:" + h.id,
        },
        body: jsonBody({
          contato_id: target.targetId,
          ...(target.numberId ? { numero_whatsapp_id: target.numberId } : {}),
          mensagem: h.summary,
        }),
      },
    );
    if (!result.mensagem_id)
      throw new IntegrationError("aviso_humano_nao_confirmado", true);
  }

  async readContext(conversationId: string) {
    if (!this.config.extendedApi)
      throw new IntegrationError("contrato_complementar_da_central_desativado");
    const base = new URL(this.config.baseUrl);
    if (base.protocol !== "https:" || base.username || base.password)
      throw new IntegrationError("configuracao_da_central_invalida");
    return this.http.json<{
      conversa: { id: string; numero_whatsapp_id?: string };
      contato: { id: string };
      automacao: { pode_responder: boolean };
      oportunidades: { id: string; etapa_id: string; status: string }[];
      capacidades?: { digitando: boolean };
    }>(
      new URL(
        "/api/v1/conversas/" + encodeURIComponent(conversationId) + "/contexto",
        base,
      ).href,
      { headers: { Authorization: "Bearer " + this.config.key } },
    );
  }
  async setTyping(conversationId: string, duration: number) {
    if (!this.config.extendedApi) return false;
    const base = new URL(this.config.baseUrl);
    if (base.protocol !== "https:" || base.username || base.password)
      throw new IntegrationError("configuracao_da_central_invalida");
    const result = await this.http.json<{ aplicado?: boolean }>(
      new URL(
        "/api/v1/conversas/" + encodeURIComponent(conversationId) + "/presenca",
        base,
      ).href,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.config.key,
          "Content-Type": "application/json",
        },
        body: jsonBody({
          estado: "digitando",
          duracao_ms: Math.max(1000, Math.min(10000, duration)),
        }),
      },
    );
    return result.aplicado === true;
  }
  async transferHuman(h: import("../../shared/model.js").HumanHandoff) {
    if (!this.config.extendedApi)
      throw new IntegrationError("contrato_complementar_da_central_desativado");
    const base = new URL(this.config.baseUrl);
    if (base.protocol !== "https:" || base.username || base.password)
      throw new IntegrationError("configuracao_da_central_invalida");
    const result = await this.http.json<{
      conversa?: { id?: string; automacao_pausada?: boolean };
    }>(
      new URL(
        "/api/v1/conversas/" +
          encodeURIComponent(h.conversationId) +
          "/encaminhar",
        base,
      ).href,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + this.config.key,
          "Content-Type": "application/json",
          "Idempotency-Key": "pulsoo:transfer:" + h.id,
        },
        body: jsonBody({
          id: h.id,
          motivo: h.reason,
          ...(h.responsibleId ? { responsavel_id: h.responsibleId } : {}),
        }),
      },
    );
    if (
      result.conversa?.id !== h.conversationId ||
      !result.conversa.automacao_pausada
    )
      throw new IntegrationError("transferencia_nao_confirmada", true);
  }
}
