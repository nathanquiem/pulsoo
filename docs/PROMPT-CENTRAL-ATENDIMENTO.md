# Prompt para a IA da Central — contrato público de atendimento

Objetivo: permitir que um aplicativo externo genérico execute atendimento, qualificação, passagem humana e avisos pela API da Central. Preservar o padrão atual de autenticação, isolamento por empresa, idempotência, pausa humana e logs sem segredos. Não personalizar para cliente/nicho.

Problemas encontrados no contrato atual:
- PATCH /api/v1/oportunidades/{id} já muda etapa e responsável, porém o webhook de mensagem nem sempre inclui oportunidade/funil/etapa. O consumidor não pode descobrir ou escolher uma oportunidade de forma segura.
- POST /api/v1/contatos/{id}/notas já acrescenta notas. Preservar este contrato e o UUID permanente do consumidor.
- POST /api/v1/conversas/iniciar serve contatos cadastrados; não é uma API geral de avisos para equipe/grupos e depende da automação da conversa de destino.
- Não existe rota pública de presença nem transferência/pausa com responsável.

Implementar estes contratos e testes, sem alterar silenciosamente os contratos já publicados:

1. GET /api/v1/conversas/{id}/contexto, escopo novo atendimento:ler.
Retornar {conversa:{id,status,numero_whatsapp_id,responsavel_id},contato:{id,nome,telefone},automacao:{pode_responder},oportunidades:[{id,funil_id,etapa_id,status,responsavel_id}],capacidades:{digitando:boolean,avisos_grupo:boolean}}. Respeitar empresa e vínculo. Nunca escolher uma oportunidade arbitrária se houver várias. Consultar apenas o necessário; paginação/limites. Não devolver credenciais, domínios internos dos provedores nem conteúdo privado de outra empresa. Opcionalmente aceitar funil_id para desambiguar. Enriquecer o webhook de mensagem quando houver vínculo inequívoco, mantendo compatibilidade 2.0.

2. POST /api/v1/conversas/{id}/presenca, escopo mensagens:enviar.
Corpo {estado:"digitando",duracao_ms:5000}. Validar 1000–10000 ms, vínculo e permissão atual. Evolution: usar presença real do provedor. Canal sem suporte: retornar 200 {aplicado:false,motivo:"nao_suportado"}, nunca simular sucesso. Não criar mensagem, tarefa ou evento comercial. Rate limit e timeout curto. Nenhuma exposição de chave ao frontend.

3. POST /api/v1/avisos/atendimento, escopo novo atendimento:avisar.
Corpo {id:"uuid-estavel",contato_id:"uuid-do-lead",conversa_id:"uuid-do-lead",numero_whatsapp_id:"uuid",destino:{tipo:"contato"|"grupo",id:"uuid-contato-ou-groupJid"},texto:"nome, telefone, resumo e próximo passo"}.
Cadastrar/validar destinos internos autorizados por empresa. Para grupos Evolution, groupJid deve pertencer à instância da empresa e terminar no formato aceito pelo provedor; não aceitar grupos arbitrários só por um parâmetro do modelo. Contato e grupo são canais diferentes. Canal oficial sem suporte a grupo deve recusar de forma explícita. Aviso interno não depende da automação da conversa do destinatário humano estar ativa. Não criar loop de automação e não reinjetar aviso como mensagem do lead. Confirmar entrega com {aviso:{id,mensagem_id,status:"enviado"}}. UUID do corpo e Idempotency-Key evitam duplicação; resultado incerto exige conciliação, não reenvio cego.

4. POST /api/v1/conversas/{id}/encaminhar, escopo novo atendimento:encaminhar.
Corpo {id:"uuid-estavel",responsavel_id:"uuid-opcional",motivo:"texto-curto"}. Pausar automação da conversa e, se informado, atribuir membro ativo da mesma empresa. Não enviar despedida nesta rota: o aplicativo já envia e confirma a mensagem antes. Emitir eventos de pausa/atribuição existentes, sem duplicar mensagens nem tarefas. Resposta {conversa:{id,automacao_pausada:true,responsavel_id}}. Idempotência e autorização por empresa obrigatórias.

5. Consulta de configuração: fornecer leitura autenticada de funis/etapas e responsáveis ativos, com escopo atendimento:ler, ou documentar o endpoint já existente. Retornar IDs e nomes para o app montar seletores, sem acesso direto ao banco. Nenhuma chave existente ganha escopos automaticamente.

Validação: testes de isolamento entre empresas, membro/destino inválido, pausa humana, canal sem capacidade, mesma chave com corpo conflitante, concorrência, timeout/entrega incerta e ausência de loop. Publicar exemplos de requisição/resposta e atualizar documentação pública. Informar quais migrações/escopos precisam ser aplicados na VPS. Não reiniciar proxy global nem alterar outros projetos.

O aplicativo consumidor só habilitará as capacidades após os contratos estarem publicados e homologados; não apresentar funcionalidades planejadas como prontas.
