# Revisão do motor 0.4 — 05/11/2026
## Causas observadas no piloto
A etapa do CRM tinha IDs de destino preenchidos, mas não havia ID da oportunidade no contato/webhook. Os jobs foram bloqueados corretamente, repetindo o mesmo bloqueio em novos ciclos. A nota foi confirmada. A dúvida sobre área de atendimento não tinha base aprovada e virou encaminhamento; a mensagem específica do modelo foi substituída por despedida fixa de conclusão. Não era falha de recebimento da mensagem nem prova de que a Central executou mudanças de etapa.

## Correções
- Modelo e painel compartilham catálogo com objetivo, quando usar, entradas/fontes, resultado e limites. As funções de decisão do principal e as ações enfileiradas do backend são identificadas separadamente.
- consultar_informacoes busca respostas aprovadas locais e devolve function_call_output pelo call_id, antes da resposta final. Não usa subagente ou rede. Até duas consultas locais por turno; limite de especialistas permanece independente. Ferramentas não cadastradas não ganham acesso automático.
- Etapas ordenadas têm objetivo, pergunta, regras, campos exigidos, foto e mapeamento opcional de CRM. O backend calcula a primeira pendência a partir de fatos/fotos, preserva estado na conversa e recusa conclusão com dados faltantes. Dados antecipados são aproveitados. As ramificações textuais continuam instruções ao modelo; não são um grafo arbitrário de condições.
- Dúvidas resolvidas voltam à pendência. Pergunta sem resposta aprovada pode chamar humano com mensagem específica; pedido humano interrompe a coleta. A despedida fixa se aplica à conclusão ready/foto imediata, não substitui a resposta a uma dúvida.
- Conclusão automática configurável pelas condições; modelo sem função obrigatória não envia texto fora do protocolo. null/pendente/não informado não satisfazem campo obrigatório.
- Fatos estruturados também são mantidos na sessão do laboratório; não são gravados em contatos reais. Decisões/consultas ficam visíveis por conversa e ações externas mantêm confirmação separada.
- Etapa ausente não gera jobs iguais em cada mensagem com a mesma dependência faltante. Reinício de ação externa em andamento exige conciliação; não a repete automaticamente.
- Aviso por webhook n8n usa snapshot estruturado, HMAC, UUID estável e confirmação síncrona ou callback. HTTP 202 não é sucesso de envio. Contrato em AVISO-N8N.md.

## Referências e aplicação
- [Fazer AI, grafo e pré-condições](https://github.com/fazer-ai/agents/blob/main/docs/graph.md): separar intenção, contexto vinculado, pré-condição e efeito. [Integrações](https://github.com/fazer-ai/agents/blob/main/docs/integrations.md): separar campos da IA de dados fixos do servidor. Repositório consultado sob Apache-2.0; nenhum código incorporado.
- [OpenAI, function calling](https://developers.openai.com/api/docs/guides/function-calling): descrições e esquemas claros; resultado da consulta ligado ao call_id e continuação do turno. Resposta/encaminhamento são decisões terminais do runtime, não simulação de escrita remota concluída.
- [LangGraph, workflows e agentes](https://docs.langchain.com/oss/python/langgraph/workflows-agents): combinar caminhos determinados com decisão de linguagem e estado persistido.
- [Anthropic, agentes eficazes](https://www.anthropic.com/research/building-effective-agents): interface de ferramentas clara e desenho simples antes de adicionar orquestração.
- JSON privado fornecido pelo operador: personalidade separada do procedimento, objetivos/perguntas por etapa, fontes de parâmetros e confirmação antes de anunciar resultado. O arquivo e seus dados/credenciais não foram publicados; não se incorporou o preço/oferta/agenda daquela operação.

## Limites de homologação
Os testes automatizados usam transportes simulados. A publicação, verificação visual e resultados de laboratório real são registrados após executados em ENTREGA-0.2.md. A Central não foi modificada por esta revisão. Mudar etapa ainda exige oportunidade vinculada, permissão e contrato válido. Aviso n8n depende da URL, segredo e workflow com envio/recibo real. Nenhum contrato preparado equivale a integração homologada.
