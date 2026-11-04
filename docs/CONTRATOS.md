# Contratos e ferramentas do Pulsoo

Estado: base 0.1.0. Clientes HTTP implementados não significam recursos homologados em conta real. Nenhum segredo deve ser enviado no navegador ou no schema de ferramenta da IA.

## Fluxo de proposta

Mudança de etapa -> regra ativa -> contato + notas locais + catálogo + modelo -> snapshot -> revisão humana -> job durável -> envio.

O modelo controla o texto; os produtos controlam preços. Total = soma de quantidade inteira × preço em centavos. Não existe parâmetro de preço livre nem desconto vindo da IA nesta fase.

O snapshot inclui conteúdo, nomes, linhas, preços, validade e contexto. O hash identifica essa versão. Uma aprovação informa o hash visto pelo humano. Duas aprovações concorrentes geram no máximo um job de envio. O PDF usa o mesmo snapshot e não inclui notas internas em uma seção própria.

O modelo pode usar {{cliente.nome}}, {{cliente.empresa}}, {{cliente.notas}} e {{proposta.numero}}. Inserir cliente.notas é uma decisão de autoria do modelo; a configuração padrão não usa esse campo no documento externo.

Propostas enviadas não são editadas. Nesta fase, criar outra proposta é a forma de revisar o conteúdo. Versionamento com vínculo entre revisões é próximo passo.

## API do app

Todas as rotas /api, exceto sessão/login/webhook, exigem cookie autenticado fora da simulação. Mutação com Origin divergente é recusada. Sessões expiram em 12h.

- GET /api/session: estado de acesso.
- POST /api/login: email/password; cookie assinado e HttpOnly.
- POST /api/logout.
- GET /api/bootstrap: dados do painel, sem endpoints/segredos internos.
- POST /api/products e PUT /api/products/:id: catálogo; active=false arquiva.
- POST /api/templates: modelo local.
- POST /api/contacts e PUT /api/contacts/:id: contexto e notas locais.
- POST /api/proposals: contactId, templateId, items[{productId,quantity}].
- POST /api/proposals/:id/submit: solicita aprovação.
- POST /api/proposals/:id/review: decision (approve/reject), hash e note.
- GET /api/proposals/:id/pdf: documento autenticado; não é link público para lead.
- POST /api/rules: fromStage, toStage, templateId, productIds, active.
- PUT /api/settings: comportamento do agente.
- POST /api/lab/chat: messages e mode (simulation/live).
- POST /api/lab/voice: texto para prévia real, somente quando configurada.

Ainda não há API pública de administração por chave nem ferramentas genéricas para executar URL/HTTP arbitrários.

## Central

Arquivo: server/integrations/central.ts.

Envio: POST /api/v1/conversas/{id}/mensagens, Authorization Bearer, Content-Type JSON e Idempotency-Key estável. Corpo: {texto}. O ID vem de uma conversa vinculada ao contato; não do texto do lead.

O envio de proposta é uma mensagem de até 4.000 caracteres nesta fase. Bloqueios da Central são respeitados. Não existe acesso direto à Evolution ou Meta. PDF e voz aguardam contrato de anexos/mídia.

Recepção: POST /api/webhooks/central. Contrato 2.0, X-Central-Id, X-Central-Timestamp e X-Central-Assinatura. HMAC-SHA256 sobre timestamp + ponto + bytes originais. Tolerância de cinco minutos no timestamp de entrega; o horário do evento pode ser anterior. Cabeçalho e evento.id precisam coincidir. empresa.id precisa corresponder à instalação.

Evento já processado recebe 202 com duplicate=true. Persistência, atualização de contato, criação de proposta e job são atômicas. O receptor não chama modelo nem serviço externo antes de confirmar.

Mudança de etapa lê oportunidade.etapa_anterior.id e oportunidade.etapa.id. Notas do lead não estão comprovadas no webhook atual e não são inventadas. Automação desligada pausa contatos localmente; permissão por conversa vem de atendimento.automacao.pode_responder.

Próximos contratos a negociar: notas/histórico, estado atual, handoff, anexos e conciliação por identificador de envio.

## Aviso para grupo/canal

APPROVAL_WEBHOOK_URL é configuração do operador, apenas no servidor. O Pulsoo faz POST HTTPS com:

    {
      "event": "proposal.approval_requested",
      "proposalId": "id",
      "text": "Proposta ... aguarda aprovação no Pulsoo: ...",
      "reviewUrl": "https://dominio-do-pulsoo/#approvals"
    }

O destino deve aceitar esse contrato. Não presumir que um webhook genérico seja um grupo WhatsApp. O provedor do canal precisa ser escolhido e homologado; capacidades do WhatsApp oficial não são assumidas como iguais às da Evolution.

O grupo recebe aviso. O painel autenticado identifica a decisão e aplica o hash. Aprovação remota em grupo, comandos por pessoa autorizada, assinaturas e expiração de links são evolução separada.

## Google Docs, Drive e Sheets

server/integrations/google.ts usa OAuth no backend. Token temporário é renovado em memória. Não imprime chave nem resposta bruta de erro.

- Drive: GET files com filtro para Docs/Sheets, POST files/{id}/copy e PATCH files/{id} com trashed=true.
- Docs: POST documents/{id}:batchUpdate, replaceAllText com campos explícitos.
- Sheets: criação de arquivo, leitura, append e atualização de valores RAW; batchUpdate para linhas/abas.
- Calendar: freeBusy para agendas e criação de evento com ID determinístico derivado da intenção.

Google Docs segue copiar modelo -> persistir ID -> substituir campos -> conferir conteúdo -> exportar/guardar artefato -> aprovar versão. A base tem métodos de cópia/substituição; o job completo e a interface ainda não estão liberados.

O arquivo original não deve ser sobrescrito. IDs de arquivo, pasta, planilha e agenda devem vir de cadastro autorizado. Autorizar o acesso Google não libera automaticamente todos os arquivos como ferramentas do agente.

Criar/copiar/append exige conciliação antes de repetir após timeout. Identidade estável de linha e conflitos com edição humana ainda devem ser implementados antes da sincronização de produção.

## Outros conectores

- Cal.com: slots e bookings API v2 com versão explícita por endpoint; criação/cancelamento. Disponibilidade não equivale a reserva.
- AssemblyAI: upload e criação de transcript assíncrono; consulta de estado. Persistência do transcriptId e conclusão durável ainda faltam no motor.
- ElevenLabs: síntese TTS com voice_id/model_id. Prévia binária no laboratório; conta, voz e formato precisam ser homologados.
- OpenAI: Responses API, store=false, ferramenta somente leitura de catálogo, até três rodadas, maxRetries=0 e timeout. Não expõe escrita externa ao modelo neste início.

## Falhas e recuperação

Sem redirecionamentos; timeout HTTP padrão de 20s, OpenAI 30s. Erros remotos viram códigos locais; corpos brutos não são enviados ao painel.

Uma escrita com falha de comunicação, HTTP 5xx ou JSON inválido após resposta pode ter ocorrido. Classificar como incerta e impedir repetição automática. Jobs interrompidos em execução seguem a mesma regra na inicialização. Recusas 4xx são registradas como bloqueio conhecido.

Não há promessa de entrega exatamente uma vez entre serviços. O identificador estável reduz duplicações, mas conciliação remota precisa de contrato próprio.

## Referências consultadas

- [Fazer AI — documentos e aprovação](https://github.com/fazer-ai/agents/blob/main/docs/documents.md).
- [Fazer AI — integrações e ferramentas](https://github.com/fazer-ai/agents/blob/main/docs/integrations.md).
- [OpenAI Docs — function calling](https://developers.openai.com/api/docs/guides/function-calling).
- [Google Docs — preencher documentos](https://developers.google.com/workspace/docs/api/how-tos/merge).
- [Google Drive — copiar arquivo](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/copy).

A Fazer AI foi usada como referência documental. Nenhum arquivo de código de seu repositório foi incorporado nesta base.

## Atualização 0.2: operação, delegação e follow-up

Esta seção substitui a descrição anterior do laboratório limitado ao catálogo.

- PUT /api/operation: agentEnabled, modules, specialists e followup. Revisão sobe no servidor; dados de Base/revision não são aceitos no corpo. Propostas exigem catálogo. Salvar cancela respostas/follow-ups pendentes, preservando registro de ações já realizadas.
- POST /api/conversations/:id/control: status paused, active ou closed. Pausa/encerramento locais persistem diante de webhooks. Pedido para parar não pode ser revertido por este controle.
- POST /api/lab/chat: kind reply ou followup (padrão reply), messages e mode. Resposta inclui trace e consumo.
- POST /api/demo/followup: apenas demonstração local, cria cenário sintético de fila; não aceita envio real.

Módulos desligados bloqueiam endpoints de catálogo/propostas/modelos/regras (409 modulo_desativado), não apenas escondem menus. Agenda apenas disponibiliza o especialista de preparação de dados; reserva no provedor continua pendente.

OpenAI Responses: principal com função consultar_especialista, enum restrito aos habilitados, até quatro rodadas, sem chamadas paralelas, store=false e sem retry automático. Especialista recebe uma chamada separada sem ferramentas recursivas ou de escrita. Cada chamada bem-sucedida registra modelo e tokens.

Entidades conversation/message/runtimeJob/followup guardam memória e fila no driver da instalação. Ciclo da conversa invalida trabalho antigo. Antes do envio, revalida permissão, pausa, ciclo e revisão. Follow-up usa horário local, 1–5 etapas e limite por dia/conversa. IA pode retornar skip. Unknown/blocked exige revisão; não existe reenvio cego.

Central POST /api/v1/tarefas/concluidas:
    {id, contato_id, conversa_id, mensagem_id, realizado_em, etapa, responsavel_id?}
Exige escopo tarefas:escrever e migração 070. id é UUID permanente da execução; etapa é 1–5; realizado_em é ISO com fuso, do envio confirmado. Responsável deve ser membro ativo; pode ser resolvido da conversa/contato. Só aceita mensagem de saída de automacao_externa em estado enviada/entregue/lida e vinculada à própria empresa. Retorna tarefa com status concluida. Nunca recebe status aberto.

A tentativa de registro tem Idempotency-Key própria, mas id da tarefa é permanente, permitindo reconciliar falhas sem reenviar o texto. Após falhas transitórias, só registro é repetido até seis tentativas. Exaustão/recusa ficam bloqueadas no painel; a data/hora não muda.

Evento de áudio ou texto sem conteúdo persiste marcador e cancela a cadência, mas não gera resposta sem conteúdo. Transcrição durável ainda não implementada. Canal oficial fora de 24h exige template ainda pendente; canal desconhecido bloqueia follow-up real. CENTRAL_CHANNEL_MODE é configuração explícita por instalação quando a origem não identifica o canal.

Pausa local não altera automaticamente a pausa da Central; ela acrescenta um bloqueio no Pulsoo. Retomar não reenvia pendências antigas. Alteração do módulo não remove os dados preservados do bootstrap autenticado, mas impede seu uso no motor/API.
