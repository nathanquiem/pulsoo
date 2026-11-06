# Pulsoo

Aplicativo independente por cliente (0.4), com primeira instalação na VPS em homologação. Memória e fila no PostgreSQL da própria VPS; uma instalação e uma réplica por cliente. Implantação e integrações reais ainda em homologação.

## Operação enxuta

A navegação fixa tem cinco áreas: Visão geral, Conversas, Agente, Laboratório e Configurações. Catálogo, propostas e agenda começam desligados. Ative em Configurações > Módulos; Comercial aparece somente quando catálogo/propostas estiverem ativos. Desativar preserva o histórico e bloqueia as APIs e especialistas do módulo.

O agente principal conversa com o lead. Especialistas têm instruções e modelo OpenAI próprios, recebem contexto delimitado e devolvem consultas. Não enviam mensagens nem executam escritas. Qualificação e contexto ficam disponíveis sem os módulos comerciais. Catálogo usa registros ativos; agenda/propostas ainda não efetuam reserva/emissão por delegação.

Atendimento automático começa desligado. A ativação só permite novos turnos autorizados pela Central; não dispara mensagens antigas.

## Atendimento e follow-up

1. Webhook autenticado da Central persiste mensagem e contexto e confirma rapidamente.
2. Uma fila durável agrupa o contexto recebido e gera a resposta pelo principal/especialistas.
3. Antes de enviar, revalida ciclo, pausa, permissão e versão da configuração. Envio ocorre somente pela API da Central.
4. Após confirmação do envio, agenda o follow-up dentro do Pulsoo, inclusive em qualificação.
5. Quando vencer, a IA avalia o contexto e pode enviar ou desistir. Horários, fuso, dias e máximo diário são configuráveis.
6. Só depois do follow-up confirmado, cria na Central uma tarefa já concluída, com data/hora do envio. Não cria tarefa futura ou aberta.

Resposta do lead (inclusive áudio), pausa humana, encerramento e pedido para parar cancelam pendências. Pausa/encerramento manuais no Pulsoo persistem até controle explícito. Alterar a operação cancela a fila de respostas/follow-ups anterior; não reexecuta histórico. Registros de envios já realizados continuam sendo reconciliados.

Falha ao registrar a tarefa repete somente o registro, com ID permanente e horário original. Envio incerto bloqueia a conversa para conciliação; não repete a mensagem às cegas.

No canal oficial, follow-up livre fora de 24h fica bloqueado. Templates aprovados ainda precisam de implementação/homologação. Canal desconhecido também bloqueia follow-up real. Configure CENTRAL_CHANNEL_MODE somente após conferir a origem do canal.

## Executar a demonstração

Node.js >= 22.12 e npm:

    npm ci
    # Copie .env.example para .env:
    # DEMO_MODE=true, STORAGE_DRIVER=file, HOST=127.0.0.1
    npm run build
    npm start

Abra http://127.0.0.1:3081. Dados fictícios ficam em .runtime/state.json. A demonstração não chama provedores e não envia mensagens/tarefas reais, mesmo com chaves no ambiente. Laboratório > Criar cenário na fila local cria um cenário fictício na fila, respeitando o horário configurado.

Desenvolvimento: npm run dev (interface em 5173, API em 3081). Laboratório permite cenário de resposta ou follow-up, trace das consultas, prévia de parágrafos e modo real OpenAI quando configurado fora da demonstração.

## Produção na VPS

Procedimento para novas instalações:

1. Configurar .env: DEMO_MODE=false, STORAGE_DRIVER=postgres, APP_URL HTTPS, ADMIN_EMAIL, ADMIN_PASSWORD >= 12 e SESSION_SECRET >= 32.
2. Definir POSTGRES_PASSWORD e PULSOO_DB_PASSWORD diferentes, preferencialmente hexadecimais para evitar escape na URL.
3. Configurar domínio próprio/proxy HTTPS e executar docker compose up -d --build. A porta da aplicação fica no loopback; o PostgreSQL não publica porta.
4. Publicar/homologar na Central a rota POST /api/v1/tarefas/concluidas e a migração 070_followup_concluido_api.sql. Criar chave com mensagens:enviar e tarefas:escrever. Chaves existentes não ganham escopo automaticamente.
5. Configurar CENTRAL_BASE_URL, CENTRAL_API_KEY, CENTRAL_EMPRESA_ID, CENTRAL_WEBHOOK_SECRET e CENTRAL_CHANNEL_MODE no servidor. CENTRAL_FOLLOWUP_RESPONSAVEL_ID é opcional quando conversa/contato já têm responsável ativo.
6. Configurar OPENAI_API_KEY e OPENAI_MODEL; OPENAI_MODEL_SUMMARY é fallback dos especialistas sem modelo específico. Habilitar conteúdo de mensagens no webhook e eventos de pausa/retomada/encerramento.
7. Homologar em recursos de teste; depois ativar o atendimento.

O papel pulsoo_app não é superusuário. Não compartilhar o banco entre clientes. A aplicação usa transações/lock e registros tipados em JSONB. Somente uma réplica é suportada. Backup, retenção e restauração devem ser validados na VPS. Rotação de senha em volume existente exige atualizar o papel e a configuração.

## Credenciais e aprovação

Segredos e endereço da Central ficam somente no servidor; não usar variáveis públicas de build. O painel e respostas removem o endereço interno e os segredos conhecidos. Não existe cadastro público. Login único por instalação, cookie HttpOnly, proteção de origem e sessão de 12h.

Com o módulo Propostas: catálogo em centavos, modelos locais, snapshot imutável, PDF, aprovação humana autenticada por versão e envio textual pela Central. APPROVAL_WEBHOOK_URL recebe aviso com link para revisão. Aprovação por um “sim” em grupo não está liberada.

## Controle de consumo

Por padrão, cada turno permite uma consulta a especialista (até três chamadas: principal, especialista e resposta final). `AGENT_MAX_DELEGATIONS=0` desliga delegações; o intervalo permitido é 0–3. `AGENT_CONTEXT_CHARS=24000` limita o histórico recente e `AGENT_MAX_OUTPUT_TOKENS=700` limita cada resposta do principal. Esses limites não constituem um teto financeiro: instruções, ferramentas e respostas intermediárias também consomem tokens.

Cada chamada registra uso imediatamente, mesmo se uma etapa posterior falhar. Falhas sem relatório de uso ficam com custo desconhecido. O motor revalida cancelamento antes da próxima chamada paga. O laboratório real aceita seis testes de texto e três prévias de voz por minuto por origem de requisição; simulação não usa os provedores.

## Limites atuais

- A primeira instalação está publicada com PostgreSQL e HTTPS. O webhook foi ativado na Central; atendimento real de ponta a ponta e integrações ainda precisam de homologação. “Credencial configurada” não equivale a conexão testada.
- O motor reativo e a fila de follow-up estão implementados, com testes de contratos simulados; falta homologação real de ponta a ponta.
- A entrega real pode dividir respostas em balões, com espera de agrupamento, atraso inicial, intervalo, limite de caracteres e máximo de balões. Cada parte tem confirmação persistida; partes confirmadas não são reenviadas e entrega incerta exige conciliação.
- Voz: cliente ElevenLabs e prévia real no laboratório. A Central já tem contrato de mídia; síntese e envio automático ainda precisam ser ligados ao motor do Pulsoo.
- Áudio recebido pausa a geração até conteúdo disponível; AssemblyAI possui cliente, mas transcrição durável ainda não está ligada ao motor.
- Docs/Drive/Sheets/Calendar/Cal.com têm clientes HTTP testados com mocks; OAuth de recursos, ferramentas de escrita, reserva e sincronização ainda não foram liberados ao agente.
- Propostas geram PDF local; anexos, importação e emissão completa com Google Docs ainda faltam.
- Encaminhamento humano inclui despedida, pausa local e resumo por campos. Etapas e aviso para equipe são configuráveis. Contexto, grupos, digitando e transferência da conversa dependem do contrato complementar da Central, desligado por padrão. A escrita de notas já usa a API atual; cada instalação exige homologação dos seus recursos.
- Consumo OpenAI por chamada/modelo é registrado. Tarifas, fatura e custos de chamadas que terminam sem usage ainda precisam de conciliação; valores desconhecidos não são inventados.
- Outros provedores de IA, busca documental e base vetorial continuam no planejamento.

## Verificar

    npm run check
    npm test
    npm run build

Teste de PostgreSQL do Pulsoo é condicional a TEST_DATABASE_URL. Use banco descartável (compose.test.yaml); nunca apontar para produção. Docker/PostgreSQL do Pulsoo ainda não foram validados nesta máquina.

Contratos: docs/CONTRATOS.md. Evidências atuais: docs/ENTREGA-0.2.md. O planejamento histórico permanece em PLANEJAMENTO-ATENDIMENTO.md.

## Primeiro teste na VPS (04/11/2026)

Fonte: https://github.com/nathanquiem/pulsoo. No Coolify, use compose.coolify.yaml para o proxy/serviços internos. Configure domínio, credenciais e banco de cada instalação nas variáveis do respectivo cliente. Credenciais, papéis dos agentes, exemplos de prompt e sequência de homologação: [primeiro teste](docs/PRIMEIRO-TESTE.md).

## Uso do código

O repositório é público. Nenhuma licença de código aberto foi concedida ao código próprio do Pulsoo; as dependências mantêm suas respectivas licenças. Dados, prompts de clientes e credenciais pertencem à instalação e ficam fora do Git.

## Roteiro orientado por etapas

Agente > Atendimento inclui modelo copiável com objetivos, perguntas, ramificações, ferramentas e condições de avanço. [Como configurar](docs/ROTEIRO-POR-ETAPAS.md). O roteiro conversacional não altera automaticamente IDs de etapas do CRM. Campos obrigatórios/foto são validados pelo backend antes da conclusão; regras arbitrárias do prompt continuam orientações ao modelo.

## Motor 0.4

Fluxo e ferramentas agora permite etapas com condições, informações aprovadas para dúvidas e orientações das ferramentas. O motor mantém a pendência, consulta dados aprovados e valida a conclusão. [Revisão e referências](docs/REVISAO-MOTOR-0.4.md). [Aviso por webhook n8n](docs/AVISO-N8N.md), independente da API de grupos da Central; HTTP 202 aguarda confirmação. [Contexto mínimo da Central](docs/PROMPT-CENTRAL-CONTEXTO.md).

Com base de informações cadastrada, o principal pode fazer até duas consultas locais, além do limite de especialistas. Cada consulta exige continuação do modelo; há um limite total de rodadas (delegações permitidas + duas consultas + resposta final). Não são chamadas sem custo; saudações e coleta simples normalmente usam uma chamada. Especialistas não devem ser ativados sem uma função necessária.
