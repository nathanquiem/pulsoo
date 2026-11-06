export const toolDescriptions = [
  {
    id: "responder_atendimento",
    name: "Qualificar e responder",
    kind: "decision",
    objective: "Preparar uma resposta natural e guardar fatos da qualificação.",
    trigger:
      "Depois de ler o contexto, acolher e identificar a próxima pendência.",
    inputs:
      "facts: somente chaves cadastradas e fatos do lead; null para desconhecido. message: texto ao cliente. Nome, telefone, conversa e credenciais vêm do servidor.",
    output:
      "Decisão validada; o backend persiste os fatos, aplica o fluxo e entrega os balões.",
    avoid: "Não confirma escrita remota ou informação que não foi consultada.",
  },
  {
    id: "consultar_informacoes",
    name: "Consultar informações aprovadas",
    kind: "read",
    objective:
      "Resolver dúvidas com a base desta instalação e voltar à pendência.",
    trigger:
      "Pergunta sobre atendimento, serviços ou regras que não está respondida no roteiro.",
    inputs:
      "pergunta: consulta específica. Base aprovada e contexto são vinculados pelo servidor.",
    output:
      "Até quatro respostas aprovadas ou found=false. Não executa escrita e não chama subagente.",
    avoid:
      "Não inventa resposta quando não há correspondência; não lê a internet automaticamente.",
  },
  {
    id: "solicitar_humano",
    name: "Encaminhar para humano",
    kind: "decision",
    objective: "Pausar a IA e entregar o contexto para a equipe.",
    trigger:
      "Pedido explícito, dúvida sem resposta aprovada ou qualificação concluída.",
    inputs:
      "reasonKind: requested, question ou ready; reason, summary, message e facts. IDs e destinatário vêm do contexto/configuração.",
    output:
      "Pausa local e plano de nota, etapa e aviso. Cada ação externa tem confirmação independente.",
    avoid:
      "ready é recusado enquanto faltarem campos/fotos. Dúvida e pedido humano não exigem completar o formulário.",
  },
  {
    id: "mover_etapa",
    name: "Mover etapa",
    kind: "action",
    objective: "Refletir no CRM o progresso configurado.",
    trigger: "Entrada em etapa do fluxo ou encaminhamento humano.",
    inputs:
      "Oportunidade: contexto autenticado/manual; etapa e responsável: mapeamento da instalação. A IA não inventa IDs.",
    output: "PATCH confirmado pela Central ou bloqueio com motivo.",
    avoid: "Não executa sem vínculo seguro; não repete escrita incerta.",
  },
  {
    id: "registrar_resumo",
    name: "Registrar resumo",
    kind: "action",
    objective: "Entregar à equipe fatos, pendências e próximo passo.",
    trigger: "Encaminhamento com registro de nota habilitado.",
    inputs:
      "Nome/telefone: contato; fatos: qualificação persistida; motivo/síntese: decisão validada; UUID permanente: backend.",
    output: "Nota acrescentada e ID confirmado; não substitui texto humano.",
    avoid: "Não copia o histórico bruto nem inventa informações.",
  },
  {
    id: "avisar_humano",
    name: "Avisar equipe",
    kind: "action",
    objective: "Notificar o destino humano com resumo organizado.",
    trigger: "Encaminhamento para destino configurado.",
    inputs:
      "Destino: configuração; conteúdo: snapshot do encaminhamento; chave/URL: variáveis no servidor.",
    output:
      "Confirmação pela Central ou webhook assinado com retorno de envio.",
    avoid:
      "HTTP 202 significa recebido, não enviado. Envio incerto não é repetido às cegas.",
  },
];
export function toolDescription(id: string, guidance?: string) {
  const t = toolDescriptions.find((t) => t.id === id)!;
  return [
    t.objective,
    "Quando usar: " + t.trigger,
    "Entradas: " + t.inputs,
    "Resultado: " + t.output,
    "Limites: " + t.avoid,
    guidance ? "Orientação adicional aprovada: " + guidance : "",
  ]
    .filter(Boolean)
    .join("\n");
}
