# Prompt mínimo para a IA da Central
Precisamos do vínculo correto para um consumidor externo mover etapas sem adivinhar IDs. Avisos para grupos/contatos serão feitos por webhook no n8n e não dependem deste ajuste.

1. No webhook 2.0 whatsapp.mensagem_recebida, preencher oportunidade.id e oportunidade.etapa.id/tipo/status apenas quando houver vínculo inequívoco entre a conversa, o contato e uma oportunidade da mesma empresa. Não escolher a primeira se houver várias abertas. Preservar atendimento.conversa_id e automacao.pode_responder; incluir atendimento.numero_whatsapp_id sem expor segredos.
2. Se houver ambiguidade, não inventar o vínculo; sinalizar que o consumidor precisa escolher explicitamente. Preservar compatibilidade com os destinos existentes.
3. Documentar PATCH /api/v1/oportunidades/{id}, o escopo existente oportunidades:escrever, resposta e confirmação de etapa/responsável. Permitir leitura autenticada das opções de funis/etapas e membros ativos.
4. Se o enriquecimento do webhook não for suficiente, GET /api/v1/conversas/{id}/contexto está especificado no contrato amplo anterior. Não é necessário implementar grupos/presença/transferência para testar a qualificação básica.

Testar isolamento por empresa, contato errado, conversa sem oportunidade, múltiplas oportunidades, pausa humana e eventos existentes. Informar quais escopos/migrações/publicação serão necessários. Não ampliar chaves antigas automaticamente e não alterar outros projetos/infra.

Até isso ser publicado, o Pulsoo permite vínculo manual explícito em Conversas > Contexto e notas. Não divulgar a URL interna da Central no frontend do consumidor.
