import type { Config } from "../config.js";
import type { IntegrationStatus } from "../../shared/model.js";
export function integrations(c: Config): IntegrationStatus[] {
  const google = !!(
    c.google.clientId &&
    c.google.clientSecret &&
    c.google.refreshToken
  );
  const item = (
    id: string,
    name: string,
    description: string,
    category: string,
    configured: boolean,
    capabilities: string[],
    limitation?: string,
  ): IntegrationStatus => ({
    id,
    name,
    description,
    category,
    status: configured ? "configured" : "not_configured",
    capabilities,
    limitation,
  });
  return [
    item(
      "central",
      "Central",
      "Eventos comerciais e envio de mensagens.",
      "Mensageria",
      !!(c.central.key && c.central.baseUrl && c.central.companyId),
      ["Webhook assinado", "Envio de texto", "Idempotência"],
      "Texto, follow-up e nota de encaminhamento humano disponíveis. Mídia automática ainda não conectada ao motor.",
    ),
    item(
      "openai",
      "OpenAI",
      "Agente principal e especialistas de atendimento.",
      "Inteligência",
      !!(c.openaiKey && c.model),
      ["Responses API", "Consultas a especialistas", "Uso por chamada"],
      "Requer modelo e chave configurados, modo real e ativação da operação.",
    ),
    item(
      "elevenlabs",
      "ElevenLabs",
      "Voz e síntese para testar o jeito de falar.",
      "Voz",
      !!(c.elevenKey && c.voiceId),
      ["Prévia de voz", "Modelo de voz"],
      "Prévia de voz disponível. Síntese e envio automático como voz ainda não conectados ao motor.",
    ),
    item(
      "assemblyai",
      "AssemblyAI",
      "Transcrição de notas de voz.",
      "Voz",
      !!c.assemblyKey,
      ["Upload de áudio", "Transcrição assíncrona"],
      "Cliente HTTP implementado; processamento durável da transcrição é próxima etapa.",
    ),
    item(
      "google-docs",
      "Google Docs",
      "Preenchimento de modelos de documentos.",
      "Documentos",
      google,
      ["Substituição de campos"],
      "Cliente implementado; emissão remota e reconciliação ainda não liberadas no painel.",
    ),
    item(
      "google-drive",
      "Google Drive",
      "Modelos, cópias e organização de arquivos.",
      "Documentos",
      google,
      ["Listar arquivos", "Copiar documento", "Mover à lixeira"],
      "Requer OAuth e homologação dos recursos permitidos.",
    ),
    item(
      "google-sheets",
      "Google Sheets",
      "Contatos, resumos e registros operacionais.",
      "Dados",
      google,
      ["Consultar e editar valores", "Gerir linhas e abas"],
      "Cliente implementado; mapeamento por identificador e sincronização durável são próximas etapas.",
    ),
    item(
      "calendar",
      "Google Calendar",
      "Disponibilidade e eventos por agenda.",
      "Agendas",
      google,
      ["FreeBusy", "Criar evento"],
      "Roteamento entre agendas e reconciliação serão homologados antes da liberação.",
    ),
    item(
      "calcom",
      "Cal.com",
      "Horários e reservas por tipo de evento.",
      "Agendas",
      !!c.calKey,
      ["Consultar horários", "Reservar", "Cancelar"],
      "Falta homologar credenciais, agendas e recuperação de timeouts.",
    ),
    item(
      "approval",
      "Avisos de aprovação",
      "Notifica um canal e abre a revisão no Pulsoo.",
      "Operação",
      !!c.approvalWebhook,
      ["Webhook de aviso", "Link autenticado"],
      "O grupo não aprova por texto livre; a decisão acontece no painel.",
    ),
  ];
}
