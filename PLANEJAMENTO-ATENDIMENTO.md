> Atualização implementada em 03/11/2026: a entrega 0.2 substitui o estado inicial 0.1 nas seções históricas abaixo. Consulte README.md e docs/ENTREGA-0.2.md para navegação modular, especialistas e motor de atendimento/follow-up. Integrações externas continuam sem homologação real.

# Pulsoo — planejamento do aplicativo

Versão 0.4 · 03/11/2026 · catálogo, documentos e aprovação definidos; implementação inicial 0.1.0 iniciada. O estado executado consta na seção 20 e no README.

## 1. Direção recebida

Criar um aplicativo da linha Seelva, como extensão da Central by Seelva, para substituir as automações de atendimento hoje montadas em n8n e facilitar sua replicação.

Requisitos já definidos pelo usuário:

- Instalação independente por cliente, com login e dashboard próprios; sem multi-tenancy neste aplicativo.
- Receber eventos e enviar mensagens pela integração pública da Central.
- Atuar até o limite de cada operação: atendimento, qualificação, agendamento ou venda.
- Priorizar qualidade, manutenção simples e replicação rápida.
- Manter chaves e credenciais em variáveis de ambiente no servidor.
- Manter memória e estado persistente em PostgreSQL na VPS da instalação.
- Suportar Cal.com e/ou Google Calendar, com múltiplas agendas por instalação.
- Disponibilizar testes e avaliação dentro do próprio app, com comportamento e divisão de mensagens configuráveis.
- Servir mensagens via API da Central, com compatibilidade por capacidade para Evolution e WhatsApp oficial.
- Hospedar o app em domínio público, com uso autenticado restrito à equipe autorizada e domínio da Central ausente do frontend.
- Identidade visual própria baseada na referência Raycast do Refero fornecida pelo usuário, com modos claro e escuro. O padrão dos demais aplicativos não se aplica.
- Voz de saída com ElevenLabs e transcrição configurável, tendo AssemblyAI como opção inicial a validar.
- Integração com Google Sheets para cadastro, resumos e operações em linhas, abas e arquivos.
- Suporte a mais de um modelo/provedor de IA, com OpenAI como foco principal.
- Dashboard operacional e de consumo de APIs, distinguindo métricas observadas, estimativas e cobrança conciliada.
- Nome escolhido: Pulsoo, sem sufixo “by Seelva”.
- Trabalhar nesta pasta: Aplicativos/Atendimento.

Docker é uma opção apresentada pelo usuário e recomendada nesta proposta; ainda não foi implantado. O nome comercial definido é Pulsoo. Stack final, prazo e orçamento permanecem indefinidos. A pasta de trabalho continua Aplicativos/Atendimento para preservar o caminho indicado pelo usuário.

## 2. Referência encontrada: fazer.ai agents

Projeto oficial: [fazer-ai/agents](https://github.com/fazer-ai/agents).
Produto: [fazer.ai agents](https://fazer.ai/agents).

O repositório apresenta uma edição Free aberta e uma edição Pro com recursos adicionais. A stack informada combina Bun/Elysia, React, Prisma/PostgreSQL com pgvector e LangGraph TS. A edição Free declara licença Apache 2.0. Fontes: [README](https://github.com/fazer-ai/agents/blob/main/README.md), [LICENSE](https://github.com/fazer-ai/agents/blob/main/LICENSE).

O encaixe funcional é próximo da proposta da Seelva, mas sua integração operacional é com Chatwoot. Há dependências de tokens de bot/admin, caixas de entrada, atribuição, histórico e estados próprios desse sistema. Portanto, compatibilidade direta com a Central não foi demonstrada. Fonte: [integração Chatwoot](https://github.com/fazer-ai/agents/blob/main/docs/chatwoot.md).

Esta pesquisa examinou documentação e trechos públicos de código. Não instalou nem executou a Fazer AI, não mediu qualidade real de atendimento e não constitui auditoria integral do projeto. Os links acompanham a branch main e podem mudar.

### O que aproveitar como referência

| Referência observada | Aplicação proposta para a Seelva |
|---|---|
| Agrupamento de mensagens antes da resposta | Esperar uma pequena sequência do lead e responder com contexto |
| Memória persistida | Retomar uma conversa após reinício sem perder o andamento |
| Ferramentas e conhecimento | Consultar informação aprovada e executar ações permitidas |
| Transferência para pessoas | Respeitar a pausa humana e entregar contexto |
| Editor de comportamento | Configurar objetivo, perguntas, regras e limite de atuação |
| Áudio e imagens | Evoluir para canais de entrada usados pelos clientes |

Fontes dos recursos: [README](https://github.com/fazer-ai/agents/blob/main/README.md), [debounce](https://github.com/fazer-ai/agents/blob/main/docs/debounce.md), [runtime e memória](https://github.com/fazer-ai/agents/blob/main/docs/graph.md).

O console também serve de referência para custos, rastreabilidade e leitura operacional. A Seelva deve definir seus próprios indicadores e linguagem. Fonte: [apresentação oficial](https://fazer.ai/agents).

O ambiente de testes merece atenção: a documentação da Fazer AI informa que ferramentas externas podem executar de verdade no playground. Para este app, a proposta é simular escritas por padrão; testes reais devem ter destino e credenciais de homologação explícitos. Fonte: [playground](https://github.com/fazer-ai/agents/blob/main/docs/playground.md).

O compose de produção documenta restrições de réplica para workers e recursos que operam no mesmo processo. É uma referência útil para não confundir “roda em Docker” com “pode escalar livremente”. Fonte: [compose de produção](https://github.com/fazer-ai/agents/blob/main/docker-compose.prod.yml).

### Avaliação preliminar: referência ou fork?

Recomendação: construir um núcleo próprio, pequeno, integrado à Central, aproveitando padrões da referência.

Motivo: o projeto encontrado incorpora um conjunto amplo de conceitos do Chatwoot e infraestrutura para cenários além deste aplicativo. Um fork exigiria mapear e substituir essas dependências, além de sustentar as atualizações futuras.

Isso é uma avaliação de arquitetura, não uma comparação medida de esforço. Se optarmos por reaproveitar código, primeiro selecionar módulos, fixar um commit e conferir LICENSE/NOTICE e dependências daquela versão. Não incorporar componentes Pro a partir de sua apresentação comercial. Fonte: [NOTICE](https://github.com/fazer-ai/agents/blob/main/NOTICE).

## 3. O que a Central já oferece

Foram consultados o documento mestre, o guia de agentes e as rotas públicas locais. Esta é uma conferência estática do checkout, sem teste no ambiente publicado.

Fontes locais:

- [Documento mestre](../Central%20by%20Seelva/central_seelva_documento_mestre.md).
- [Guia de agentes e automações](../Central%20by%20Seelva/GUIA_AGENTES_E_AUTOMACOES.md).
- Rotas em ../Central by Seelva/src/app/api/v1/.
- Serviços em ../Central by Seelva/src/lib/integracoes/api.ts e mensagens.ts.

O contrato documentado prevê webhooks 2.0, assinatura HMAC, identificação de eventos e estado de automação por conversa. A API usa Bearer token com escopos e Idempotency-Key nas mutações. O webhook tem timeout documentado de oito segundos.

| Necessidade | Contrato identificado |
|---|---|
| Receber mensagens | Evento whatsapp.mensagem_recebida |
| Detectar pausa e retomada | Eventos automacao.conversa_pausada e automacao.conversa_retomada |
| Enviar texto | POST /api/v1/conversas/{id}/mensagens |
| Iniciar ou reabrir conversa | POST /api/v1/conversas/iniciar |
| Qualificação no CRM | PATCH /api/v1/oportunidades/{id}, com campos suportados |
| Identificação e classificação | Upsert de contato e operações com etiquetas |

A rota de envio examinada aceita texto de até 4.000 caracteres. A Central verifica condições como automação desligada, conversa finalizada e pausa humana. O aplicativo deve respeitar essas recusas e nunca contorná-las pela Evolution.

A Central continua sendo um produto com isolamento por empresa. O novo app pode ter uma única empresa configurada por instalação, com sua própria chave; não precisa reproduzir a arquitetura multi-tenant da Central nem acessar seu banco.

### Lacunas que precisam de definição antes de prometer recursos

Na árvore pública /api/v1 examinada, não foram identificadas rotas para:

- Recuperar histórico completo ou reconciliar mensagens já enviadas.
- Consultar o estado atual da automação sob demanda.
- Assumir, pausar ou transferir atendimento para uma pessoa pela API externa.
- Baixar mídia autenticada ou enviar áudio/arquivos.
- Consultar disponibilidade e criar reservas em agenda.
- Gravar respostas arbitrárias de qualificação em campos personalizados.

Ausência nesta árvore não prova ausência em todo o produto. Cada capacidade precisa de contrato público confirmado. Nenhuma alteração na Central foi feita nesta pesquisa.

O app pode manter memória a partir dos eventos recebidos após sua ativação; histórico anterior não deve ser presumido. Etiquetas, temperatura e etapa permitem parte da qualificação atual. Respostas detalhadas exigem armazenamento local e uma definição explícita de como serão refletidas na Central.

Handoff completo, áudio e vendas com efeitos externos dependem dessas decisões ou de conectores próprios autorizados. Agendamento será feito por conectores Cal.com/Google Calendar; sua sincronização com a Central exige definir um registro suportado.

O usuário autorizou adaptações leves na Central para viabilizar esta extensão. Primeiro especificar o contrato mínimo, checar compatibilidade e testar; esta etapa continua sendo de planejamento e não altera a Central.

## 4. Arquitetura proposta para discussão

Fluxo principal:

    Central
      -> webhook HTTPS
      -> validação de assinatura, empresa e contrato
      -> persistência do evento + trabalho pendente
      -> confirmação rápida à Central
      -> processamento ordenado por conversa
      -> agrupamento de mensagens
      -> regras + IA + ferramentas permitidas
      -> API da Central com idempotência
      -> registro do resultado e indicadores

A confirmação 2xx só acontece depois da persistência durável. Falhas antes disso devem permitir nova entrega. Evento recebido não equivale a trabalho concluído: o registro deve distinguir pendente, processando, concluído e falha.

Implantação inicial sugerida:

- Uma imagem do aplicativo, usada pelo servidor e pelo worker em serviços separados.
- PostgreSQL próprio na VPS de cada instalação, para configuração, memória, eventos, fila e auditoria, com volume persistente separado do ciclo de vida do container.
- Banco acessível somente pela rede interna dos serviços; credenciais próprias por cliente.
- Docker Compose por cliente, com volumes, rede, domínio e segredos próprios.
- Versão fixada da imagem, migrações controladas e procedimento de backup/restauração.
- Fila persistida no PostgreSQL como hipótese inicial; Redis só se houver necessidade demonstrada.

Separar processos não autoriza múltiplos workers sem coordenação. Locks, retomada de trabalhos interrompidos e ordenação por conversa devem ser parte do desenho.

Stack candidata: TypeScript no backend e frontend, React no painel e PostgreSQL. Framework e biblioteca de IA devem ser escolhidos após uma prova de integração. LangGraph é uma opção a avaliar, não requisito já decidido. OpenAI será o primeiro conector de atendimento; o núcleo deve suportar modelos por tarefa e provedores alternativos sem trocar a memória ou a integração com a Central.

### Replicação por configuração

Manter uma base de código comum e criar um perfil de operação versionado, contendo:

- objetivo e ponto de encerramento;
- perguntas e critérios de qualificação;
- informações comerciais aprovadas;
- etapas, etiquetas e responsáveis mapeados;
- horários, fuso e regras de acompanhamento;
- conhecimento e ferramentas autorizadas;
- limites de custo, tentativas e duração.

Cada instalação recebe sua configuração e seus segredos. Exportar um perfil não deve exportar credenciais, mensagens ou dados pessoais. Evitar manter uma branch de código diferente por cliente.

### Variáveis de ambiente

Proposta de nomes, ainda sem implementação:

    CENTRAL_BASE_URL
    CENTRAL_EMPRESA_ID
    CENTRAL_API_KEY
    CENTRAL_WEBHOOK_SECRET
    DATABASE_URL
    SESSION_SECRET
    LLM_PROVIDER
    LLM_MODEL
    LLM_API_KEY
    APP_BASE_URL
    TZ
    CALCOM_API_KEY_EQUIPE_A
    GOOGLE_CLIENT_ID_EQUIPE_A
    GOOGLE_CLIENT_SECRET_EQUIPE_A
    GOOGLE_REFRESH_TOKEN_EQUIPE_A
    OPENAI_API_KEY_ATENDIMENTO
    OPENAI_MODEL_ATENDIMENTO
    OPENAI_MODEL_RESUMO
    ELEVENLABS_API_KEY
    ASSEMBLYAI_API_KEY
    SHEETS_GOOGLE_CLIENT_ID
    SHEETS_GOOGLE_CLIENT_SECRET
    SHEETS_GOOGLE_REFRESH_TOKEN

Os nomes com EQUIPE_A representam uma convenção ilustrativa por conexão. Mais agendas podem compartilhar a mesma conexão autorizada ou usar outras credenciais, conforme o acesso concedido. O cadastro não secreto aponta para o alias da conexão; não armazena os tokens no perfil.
A lista ilustra papéis e conexões; não obriga duplicar segredos quando uma credencial puder atender os mesmos recursos autorizados. Modelo e voz são configurações não secretas; chaves e refresh tokens são resolvidos no servidor por alias. Eventuais credenciais administrativas de consumo têm acesso separado e são opcionais.

Segredos reais ficam apenas no servidor. O repositório terá somente .env.example sem valores reais. Nenhuma chave deve aparecer em prompt, frontend, exportação de perfil ou log. O painel pode mostrar se uma conexão está configurada e funcional.

“Login único” foi interpretado provisoriamente como um acesso administrativo próprio por instalação, com cadastro público desativado; não como SSO com a Central. Confirmar se haverá mais de uma pessoa usando o painel.

## 5. Qualidade necessária para substituir os fluxos atuais

O objetivo é replicar operações confiáveis. Isso exige comportamento definido também nas exceções:

1. Deduplicar eventos e mensagens; serializar os turnos da mesma conversa.
2. Agrupar mensagens com espera máxima para o lead não ficar aguardando indefinidamente.
3. Cancelar respostas pendentes quando chegar pausa humana e tratar a recusa da Central no envio.
4. Manter chave de idempotência estável por ação e corpo estável por tentativa.
5. Separar falha transitória, erro de configuração e resultado de envio desconhecido.
6. Aplicar limites de chamadas, ferramentas, tokens, custo e tempo.
7. Executar ferramentas com schemas e permissões definidos no servidor; mensagem do lead não escolhe URL, segredo ou empresa.
8. Registrar versão do perfil, decisão, ações e resultados com retenção definida.
9. Oferecer pausa geral e fila de falhas visível para a operação.

Idempotência não garante entrega exatamente uma vez entre todos os sistemas. No código local examinado, respostas concluídas da API, inclusive erros, podem ser reproduzidas em nova chamada com a mesma chave. Timeout ou falha do provedor exige reconciliação; gerar uma chave nova sem saber o resultado pode duplicar mensagem. A política de recuperação precisa ser homologada com a Central.

Também é necessário testar a corrida entre intervenção humana e envio. Esta leitura não demonstra atomicidade entre a checagem de pausa e a chamada ao provedor.

## 6. Escopo inicial sugerido

### Primeira entrega funcional: atendimento e qualificação

- Login privado da instalação.
- Conexão com uma empresa da Central.
- Recepção de mensagens de texto e envio de respostas.
- Memória, agrupamento de mensagens e perguntas de qualificação.
- Atualização dos campos, etapas e etiquetas já suportados.
- Respeito à pausa humana e bloqueios da Central.
- Editor de perfil, conhecimento aprovado e testes internos com escritas simuladas por padrão.
- Parâmetros de tom, perguntas, parágrafos, divisão em mensagens e ritmo.
- Alternância claro/escuro e proteção do endereço da Central na fronteira com o navegador.
- Painel de execução, falhas, latência e custo de IA quando o provedor fornecer uso.

A transferência ativa com responsável e resumo na Central entra quando houver contrato confirmado. Até lá, respeitar uma tomada humana não deve ser apresentado como handoff completo.

### Evolução por necessidade da operação

- Áudio de entrada com AssemblyAI e conector alternativo configurável, depois de resolver acesso à mídia pela Central.
- Agendamento por Cal.com e Google Calendar, com múltiplas agendas, conforme o conector escolhido para o primeiro ciclo.
- Follow-up, com critérios de parada, horários e condições do canal.
- Venda assistida, com catálogo, preços e política comercial como fonte de verdade.
- Cobrança ou pagamento, com confirmação pelo sistema responsável.
- Respostas em áudio com ElevenLabs, conforme preferência do contato e política da operação.
- Google Sheets/Drive para cadastro, resumos e gestão dos recursos autorizados.
- Mais modelos/provedores de IA e indicadores completos de consumo.
- Interpretação de imagens quando justificada.

“Venda concluída” precisa de critério observável: aceite, pedido ou pagamento confirmado, conforme a operação. A IA não pode inventar preço, aplicar desconto ou marcar ganho fora da política aprovada.

### Telas candidatas

Visão geral; agentes e modelos; comportamento e voz; conhecimento; agendas; integrações e planilhas; laboratório; execuções e falhas; consumo e custos; configurações. A conexão operacional aparece somente com nome amigável e estado, sem URL ou tokens.

O painel deve ajudar a configurar e acompanhar a automação. Atendimento humano e gestão comercial continuam na Central. Layout, cores, tipografia e componentes seguem a direção da referência do usuário, detalhada na seção 12.

## 7. Validação antes de replicar

A prova de integração deve demonstrar:

- Evento válido persistido e processado; evento inválido rejeitado.
- Reentrega do mesmo evento sem resposta duplicada.
- Sequência de mensagens agrupada com contexto.
- Reinício durante processamento sem perda silenciosa.
- Pausa humana durante geração impedindo envios posteriores conforme o contrato.
- Recusa, timeout e falha de provedor com tratamento definido.
- Falta de contexto levando a pergunta ou encaminhamento, sem inventar resposta.
- Perfil instalado em uma segunda instância sem alterar código nem reutilizar dados do primeiro cliente.
- Backup restaurado e credenciais ausentes dos artefatos exportados.

A lista acima descreve critérios do produto. Os testes efetivamente executados na primeira base estão registrados na seção 20 e em docs/ENTREGA-0.1.md.

## 8. Integração, canais e privacidade da Central

### Fronteira entre navegador e backend

O aplicativo pode estar disponível na internet em domínio próprio e continuar sendo de uso privado. Login obrigatório, ausência de cadastro público e autorização no servidor são requisitos; endereço público não libera dados nem configurações.

Fluxo proposto:

    Navegador -> backend deste aplicativo -> API da Central
    Central -> webhook deste aplicativo -> processamento no servidor

A URL da Central existe somente na configuração do servidor. Não incluir em variáveis públicas de build, HTML, JavaScript, mapas de código publicados, respostas JSON, redirecionamentos, links, prompts ou relatórios exportados.

O painel deve exibir estados como “Conectado”, “Credencial inválida” e “Ação bloqueada por atendimento humano”, sem retornar a mensagem bruta do serviço remoto. Logs exibidos no painel passam por limpeza de hosts, credenciais e URLs; logs internos de infraestrutura têm acesso restrito.

Dados e documentações copiados manualmente da Central entram por cadastro/importação com revisão e limpeza. Não repassar payloads ou documentação brutos ao navegador. Converter IDs e campos necessários para o modelo interno; IDs de configuração podem ser informados manualmente.

Quando houver mídia, não enviar ao navegador sua URL original na Central. Avaliar proxy autenticado pelo backend, com tipos, destinos e tamanhos permitidos, sem aceitar uma URL arbitrária enviada pelo usuário.

Este requisito controla exposição pelo aplicativo. Não representa garantia de que um domínio publicamente registrado ou publicado em outros lugares seja impossível de descobrir.

### Evolution e WhatsApp oficial

O caminho principal permanece pela Central nos dois cenários. O novo app não deve exigir acesso direto à Evolution nem à Meta para realizar o fluxo normal.

Definir capacidades por canal: texto, mídia, indicação de digitação, mensagem proativa e template, conforme a integração disponível. O app mostra opções somente quando o contrato da Central e o provedor permitirem. A rota pública local examinada ainda demonstra somente envio de texto; não declarar os dois provedores homologados antes do teste ponta a ponta.

Regras e capacidades do canal oficial, incluindo condições de envio e templates quando necessários, devem ser transmitidas/aplicadas pela Central. Uma recusa de canal não pode ser contornada usando outro conector.

### Adaptações leves candidatas na Central

1. Consulta autenticada do estado atual da conversa e permissão para automação.
2. Consulta paginada de histórico e resultado de envio por identificador estável.
3. Handoff explícito, com responsável/equipe e resumo, se requerido pela operação.
4. Metadados de canal/capacidades e acesso autorizado a mídia quando entrar no escopo.
5. Registro mínimo da qualificação e do agendamento no atendimento/oportunidade.

São propostas a dimensionar, não rotas já entregues. Preferir mudanças pequenas e compatíveis, com escopo de chave por empresa e autoria de automação preservados. Não conectar o aplicativo ao banco da Central.

## 9. Memória e conhecimento na VPS

Decisão do usuário: PostgreSQL na VPS da instalação. Não depender de serviço externo de memória para continuar conversas.

Separar os dados pelo que representam:

| Camada | Conteúdo | Comportamento |
|---|---|---|
| Histórico recente | Mensagens recebidas e efetivamente enviadas | Contexto fiel ao que as pessoas viram |
| Resumo persistente | Necessidade, dados confirmados e pendências | Atualização controlada sem transformar hipótese em fato |
| Estado da operação | Etapa de qualificação, próximo passo e permissões | Ações verificáveis e retomáveis |
| Conhecimento aprovado | Serviços, preços, políticas e documentos | Versão e fonte registradas |
| Execução | Ferramentas, mensagens, resultado e consumo | Auditoria e recuperação de falhas |

A chave de memória deve considerar instalação, contato e canal; conversas paralelas não podem compartilhar indiscriminadamente todo o contexto. Definir quando um novo atendimento reutiliza fatos confirmados e quando reinicia o objetivo comercial.

PostgreSQL guarda a memória; a IA recebe somente uma seleção de contexto. Resumo e limites de contexto controlam custo. pgvector é opcional para busca semântica em documentos, não um requisito para gravar histórico e estado.

Prever edição/correção de fatos, limpeza de uma sessão de teste, política de retenção, backup e restauração. Instalação nova recebe perfil e documentos aprovados, nunca a memória de outro cliente.

## 10. Agendas e ferramentas

### Modelo com várias agendas

Separar “conexão”, “agenda/recurso” e “regra de roteamento”:

- Conexão: alias e credencial resolvida pelo servidor, com Cal.com ou Google Calendar.
- Agenda/recurso: identificador externo, profissional, unidade, serviço, duração, fuso e regras de disponibilidade.
- Roteamento: quais serviços podem usar quais agendas, prioridade, profissional escolhido e alternativas permitidas.

Uma conexão pode ter acesso a mais de uma agenda. Instalações com contas distintas podem configurar vários aliases e respectivos segredos nas variáveis. O painel mostra nomes amigáveis, capacidades e estado da conexão; não mostra tokens.

O agente escolhe um recurso autorizado a partir do contexto e das regras. Se o serviço/profissional estiver ambíguo, pergunta antes de marcar. Dados da conversa não escolhem credenciais ou identificadores externos arbitrários.

### Conectores

Cal.com: usar API v2 para disponibilidade e reservas, com autenticação e versão da API fixadas por endpoint. A API suporta chave e OAuth; a documentação recomenda OAuth para integrações em geral. Para uma implantação interna por conta, avaliar chave restrita ao acesso efetivamente disponível, sem presumir recursos de equipe/organização não contratados. Fontes: [autenticação](https://cal.com/docs/api-reference/v2/introduction), [horários disponíveis](https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type), [criação de reserva](https://cal.com/docs/api-reference/v2/bookings/create-a-booking).

Google Calendar: consultar ocupação das agendas autorizadas e gravar no calendário de destino selecionado. A API disponibiliza consulta FreeBusy para um conjunto de calendários e criação de evento por calendarId. Uma agenda disponível tecnicamente ainda precisa respeitar horários de trabalho, duração e intervalos configurados no app. Fontes: [FreeBusy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query), [criação de evento](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert).

OAuth Google: client ID, client secret e refresh token provisionados no servidor; access token obtido e renovado em memória. Tokens temporários não são configuração permanente. Revogação ou alteração do refresh token exige fluxo seguro de atualização da configuração, sem escrever credenciais em logs ou exportações. Fonte: [acesso offline e renovação](https://developers.google.com/identity/protocols/oauth2/web-server#offline).

Quando Cal.com já grava em um Google Calendar conectado, criar a reserva somente pelo Cal.com. Não criar um segundo evento diretamente no Google para a mesma intenção.

### Ferramentas internas propostas

- consultar_disponibilidade;
- criar_agendamento;
- consultar_agendamento;
- remarcar_agendamento;
- cancelar_agendamento.

Uma interface comum permite trocar o conector sem mudar o comportamento do agente. Expor somente as ações permitidas pela operação e efetivamente suportadas pelo conector.

Consultar horários -> oferecer opções -> obter escolha/confirmação -> revalidar -> criar -> persistir ID externo -> informar resultado. Não anunciar confirmação antes de sucesso verificado no provedor.

Persistir intenção, agenda, horário, fuso, participante e resultado externo. Diante de timeout, consultar/reconciliar antes de tentar criar de novo. Consulta prévia e lock local reduzem conflitos, mas não garantem exclusividade contra alterações externas; tratar essa limitação de cada provedor.

Confirmar quem envia convites e lembretes para evitar duplicidade entre app, Cal.com e Google. A Central recebe apenas o registro comercial definido no contrato; não precisa ser dona da agenda.

### Documentação e ferramentas inspiradas na Fazer AI

Aproveitar sua organização em contratos, ferramentas com schema, configuração fixa no servidor, erros operacionais e documentação por capacidade. A implementação da referência separa parâmetros gerados pela IA dos valores fixos e segredos interpolados no servidor. Fonte: [integrações](https://github.com/fazer-ai/agents/blob/main/docs/integrations.md).

No app, cada ferramenta terá objetivo, pré-requisitos, parâmetros, validação, retorno, efeitos, política de repetição e exemplos de teste. IDs, credenciais e regras críticas são resolvidos pelo backend.

## 11. Atendimento natural e laboratório de avaliação

### Comportamento configurável

Humanização significa contexto, linguagem adequada, clareza e ritmo. Não orientar o agente a inventar vivências ou fingir uma identidade humana.

Configurações propostas por perfil:

| Configuração | Objetivo |
|---|---|
| Tom e vocabulário | Ajustar formalidade, tratamento e termos do negócio |
| Tamanho da resposta | Favorecer respostas curtas sem perder informação |
| Perguntas por turno | Evitar interrogatórios e conduzir a qualificação |
| Emojis | Desativados, discretos ou permitidos conforme operação |
| Parágrafos | Preservar quebras de linha naturais na mesma mensagem |
| Divisão de mensagens | Uma mensagem, por parágrafos ou por limite com corte em frases |
| Quantidade de blocos | Limitar fragmentação e excesso de notificações |
| Espera por novas mensagens | Agrupar uma sequência do lead com tempo máximo |
| Intervalo entre blocos | Ritmo configurável com teto para não atrasar o atendimento |
| Indicação de digitação | Apenas quando o canal e a API suportarem |

Parágrafo dentro de uma mensagem e envio de várias mensagens são opções diferentes. Preservar links, datas, valores e listas; evitar cortar frases ou juntar trechos de forma que mude o significado.

Guardar o plano de resposta e o resultado de cada bloco. Se o envio parar no segundo bloco, não reenviar automaticamente o primeiro. Se chegar pausa humana, cancelar o restante. Novas mensagens do lead durante a entrega exigem reavaliar os blocos pendentes.

Referência: o projeto da Fazer AI documenta divisão por parágrafos/frases, limites de blocos e ritmo de envio. Usar como ponto de partida para nossos próprios contratos de entrega. Fonte: [split e typing](https://github.com/fazer-ai/agents/blob/main/docs/split.md).

### Laboratório no próprio app

O laboratório deve executar o mesmo núcleo de perfil, conhecimento, memória e regras usado em produção, substituindo apenas os conectores com efeitos externos.

Três modos:

1. Simulação: conversa e agenda fictícias, sem envio à Central e sem reservas reais.
2. Avaliação: cenários salvos, respostas esperadas por critério e comparação entre versões.
3. Homologação: ferramentas reais somente com ambiente, contato e agendas de teste previamente configurados e identificados.

As chamadas ao modelo podem ter custo mesmo em simulação. Separar esse consumo dos indicadores de produção. Sessões de teste não leem nem alteram a memória real dos leads.

Exibir conversa como o destinatário receberia, parágrafos, blocos e linha do tempo prevista; também mostrar ferramentas usadas, argumentos sem segredos, fontes, latência, consumo e motivo de bloqueio. Incluir envio de áudio de teste para transcrição, revisão do texto reconhecido, prévia reproduzível da voz sintetizada e ações simuladas em agendas e Sheets.

Permitir ajustar um rascunho, executar o mesmo cenário novamente, comparar com a versão anterior e publicar uma versão do perfil. Mudanças no rascunho não entram em produção automaticamente.

### Critérios de avaliação

- Correção com base em conhecimento aprovado.
- Naturalidade, concisão e perguntas adequadas.
- Coleta de dados sem repetição desnecessária.
- Respeito ao limite de atuação.
- Agendamento na agenda e no fuso corretos.
- Ausência de preço, disponibilidade ou confirmação inventados.
- Pausa humana respeitada durante geração e entrega.
- Falhas de ferramentas sem ação duplicada.
- Ausência de credenciais e endereço da Central no conteúdo exibido.

Combinar avaliação manual com verificações automáticas objetivas. Uma nota dada por outro modelo é auxiliar e não comprova, sozinha, a qualidade.

## 12. Direção visual e identidade Pulsoo

Referência do usuário: [Raycast — Refero Styles](https://styles.refero.design/style/3b6a17f0-3bdf-418c-a95e-0b89e5a8b2f8).

A página descreve fundo quase preto (#040506), superfícies próximas (#07080a / #111214), bordas finas, tipografia Inter e coral (#ff6363) como destaque contido. Aplicar essa direção a um painel operacional, com hierarquia clara, navegação lateral e poucos elementos decorativos.

Proposta de adaptação clara: fundo #F6F7F8, superfícies #FFFFFF, texto #16181D e bordas #E2E4E8. Usar coral em ações e indicadores com variantes ajustadas para legibilidade. São tokens iniciais nossos, não tokens extraídos do modo claro da referência.

Prever Claro / Escuro / Sistema, preferência persistida, foco visível, estados de erro/sucesso e revisão de contraste nos dois temas. A estrutura e as funções permanecem iguais entre os modos.

### Nome definido

Nome do produto: **Pulsoo**. Grafia de apresentação com dois “o” ao final, sem “by Seelva”. Slug técnico sugerido: pulsoo.

O produto pertence à linha Seelva, mas a marca exibida será Pulsoo. Remover alternativas de nome das decisões ativas. Domínio e registro de marca ainda não foram verificados. A pasta Atendimento permanece como caminho de trabalho.

## 13. Voz: transcrição e respostas faladas

Separar os conectores de fala do modelo que conduz o atendimento. O Pulsoo deve permitir trocar a transcrição ou a voz sem reescrever o perfil e a memória.

### Áudio recebido

    Áudio pela Central
      -> obtenção autorizada no backend
      -> validação e armazenamento temporário
      -> transcrição
      -> memória e processamento do turno
      -> resposta por texto ou voz conforme configuração

AssemblyAI é a opção inicial sugerida pelo usuário para notas de voz. Sua documentação confirma crédito inicial de até US$ 50 no teste gratuito; após consumo, é necessário habilitar saldo/plano para continuar. Esse crédito não é recorrente, não comprova o saldo de uma conta específica e não deve ser tratado como custo operacional permanentemente zero. Verificado em 03/11/2026. Fonte: [AssemblyAI — teste gratuito](https://support.assemblyai.com/articles/5370767329-can-i-sign-up-for-free).

O conector deve persistir ID do trabalho e estado, processar conclusão por callback autenticado ou consulta com intervalo controlado e impedir que callbacks repetidos produzam novos turnos. Registrar duração, modelo e opções usadas. A API disponibiliza transcrição assíncrona e duração do áudio no resultado. Fonte: [AssemblyAI — transcrição](https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/transcripts/submit).

Limitar tamanho, duração, formatos e tempo de espera. Baixar o arquivo da Central no servidor e enviar ao provedor sem revelar o domínio da Central ao navegador ou em links de mídia. Usar upload quando suportado, em vez de depender de URL privada ou de longa duração. Não enviar dados de autenticação da Central ao serviço de transcrição.

Manter ordem de mensagens de texto e áudio. Se a transcrição ainda estiver pendente, não avançar o histórico como se o conteúdo tivesse sido compreendido. Falha ou texto ambíguo exige tratamento explícito e, quando necessário, pergunta ao lead.

Prever segundo conector de transcrição, como OpenAI, habilitado por perfil e orçamento. Crédito esgotado não deve acionar outro serviço pago silenciosamente fora da política configurada. Qualidade em português, nomes próprios, datas e valores precisa ser comparada em amostras reais antes de eleger a opção mais econômica.

### Resposta por voz com ElevenLabs

A ElevenLabs será o conector inicial de síntese de fala. Ela oferece geração de áudio a partir de texto e opções de voz/modelo; disponibilidade depende do acesso contratado. Fonte: [ElevenLabs — Text to Speech](https://elevenlabs.io/docs/overview/capabilities/text-to-speech).

Configurações propostas:

- Texto, voz ou resposta adaptada à preferência do contato.
- Voz escolhida, modelo e idioma por perfil.
- Pronúncia de marca, nomes, siglas, números e valores.
- Velocidade e parâmetros expressivos quando suportados pelo modelo.
- Tamanho/duração máxima, horário e teto de consumo.
- Regra para voz com texto complementar, sem duplicar a resposta inteira por padrão.
- Alternativa em texto quando síntese ou envio falhar, conforme resultado conhecido da entrega.

Separar o texto falado de conteúdo que deve continuar escrito, como link, chave, endereço e dados de agendamento. A normalização para fala não pode mudar preço, data ou política comercial. Voz disponível pela API deve ser testada com a conta configurada.

Gerar um áudio por resposta como padrão; a divisão configurável em balões aplica-se ao texto. Custos e efeitos de uma eventual divisão em vários áudios precisam de regra própria.

Validar/converter o formato para o que o canal aceitar. Um MP3 gerado pelo provedor não garante apresentação como nota de voz em todos os canais. A Central precisa oferecer envio de áudio/mídia e sinalizar capacidades de Evolution e oficial; homologar formato, autenticação de upload e resultado de entrega.

Checar pausa humana antes da síntese quando possível e novamente antes do envio. Persistir o artefato e o resultado para evitar nova cobrança de síntese e reenvio desnecessário na mesma tentativa. Retenção e acesso do áudio temporário devem ser configurados.

O laboratório permite ouvir a prévia e avaliar pronúncia, clareza, naturalidade, duração, latência e custo. Prévia com provedor real pode consumir crédito mesmo sem enviar ao lead.

## 14. Google Sheets e recursos do Drive

### Operações previstas

| Recurso | Capacidades |
|---|---|
| Linhas e células | Consultar, inserir, atualizar, limpar valores e excluir linhas |
| Abas | Criar, renomear, configurar e excluir |
| Arquivo de planilha | Criar, renomear e remover conforme permissões do Google Drive |
| Integração do atendimento | Cadastrar contato, atualizar situação e gravar resumo/próximo passo |

Criar arquivos e alterar estrutura/conteúdo são capacidades da API Sheets. Excluir linhas é diferente de limpar valores; apagar uma aba é diferente de apagar o arquivo inteiro. Fontes: [Sheets — planilhas](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets), [requisições estruturais](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/request).

A remoção do arquivo completo pertence ao Drive. O conector deve oferecer envio à lixeira, com restauração quando aplicável; exclusão definitiva é uma ação distinta, disponível somente quando explicitamente habilitada na política da operação. Fonte: [Drive — lixeira e exclusão](https://developers.google.com/workspace/drive/api/guides/delete).

### Uso no atendimento

Fluxo inicial sugerido: no primeiro contato, cadastrar ou atualizar por identificador estável; após qualificação, handoff ou conclusão, gravar um resumo e o próximo passo. Resumo por mensagem é opcional, pois aumenta consumo e altera a frequência de gravação.

Campos candidatos: contato_id, conversa_id, nome, telefone, data de entrada, necessidade, serviço, etapa, responsável, agenda, status de agendamento, resumo, próximo passo e última atualização. Usar somente dados disponíveis e destinos aprovados. Não incluir URL da Central, segredos ou transcrição integral por padrão.

PostgreSQL guarda estado, memória, vínculos e fila de sincronização; a Central permanece como registro comercial. Sheets é um destino operacional adicional. Uma falha de sincronização não deve impedir a resposta ao lead nem resultar em cadastros duplicados.

### Regras do conector

- Múltiplas conexões e planilhas por instalação, com aliases de credenciais nas variáveis do servidor.
- Cadastro dos arquivos/abas autorizados e mapeamento de colunas no painel.
- Criação de nova planilha a partir de modelo de colunas, com vínculo persistido após sucesso.
- Identificador estável por registro; não tratar número da linha como identidade permanente, pois ordenação/inserção desloca posições.
- Atualização dos campos geridos pelo Pulsoo preservando fórmulas e colunas da equipe.
- Fila persistente, tentativas limitadas e reconciliação de intenção antes de repetir criação ou append após timeout.
- Controle de conflito entre escrita humana e sincronização, com política por campo e revisão do estado atual.
- Registro de ação, origem, alvo, valores alterados e resultado, com retenção definida.
- Credencial e ferramenta limitam recursos e ações; mensagem do lead não pode escolher livremente planilhas ou pedir exclusão fora da política.
- Exclusão por regra deve mostrar o alvo e registrar a intenção; remoção em massa e de arquivo completo têm permissão independente das rotinas de cadastro.

Textos recebidos e resumos devem ser gravados como valores literais, sem executar fórmulas vindas da conversa. A API oferece RAW para preservar valores sem interpretá-los. Fonte: [Sheets — interpretação de valores](https://developers.google.com/workspace/sheets/api/reference/rest/v4/ValueInputOption).

Ferramentas de administração e ferramentas liberadas para o agente são conjuntos configuráveis. Ter um conector capaz de excluir arquivos não implica liberar essa ação em toda conversa.

No laboratório, usar uma planilha simulada por padrão. Homologação pode usar arquivo de teste autorizado, com prévia das alterações e identificação clara do ambiente.

## 15. IA com foco em OpenAI e múltiplos modelos

OpenAI é a prioridade para o primeiro conector de atendimento. Proposta: usar Responses API e SDK oficial no servidor, mantendo memória/estado operacional no PostgreSQL. A documentação oficial cobre geração de texto e uso de ferramentas; modelos e parâmetros serão fixados após comparação no laboratório. Fonte: [OpenAI Docs — geração de texto](https://developers.openai.com/api/docs/guides/text).

Permitir mais de um perfil de agente e configuração de modelo por tarefa:

| Tarefa | Configuração |
|---|---|
| Atendimento principal | Modelo escolhido por operação e ferramentas autorizadas |
| Classificação/extração | Modelo próprio, se reduzir custo mantendo qualidade |
| Resumos e compactação | Modelo separado e execução controlada |
| Avaliação de atendimento | Modelo avaliador opcional, somado à revisão humana |
| Transcrição | Conector independente, inicialmente AssemblyAI |
| Síntese de voz | Conector independente, inicialmente ElevenLabs |
| Busca em documentos | Embeddings e indexação conforme a estratégia adotada |

Ter mais de um modelo não exige chamar todos a cada mensagem. O roteamento pode ser determinístico por tarefa, etapa, canal ou perfil; evitar um classificador extra quando uma regra simples resolver.

Permitir provedores alternativos por adapter, com credenciais próprias, matriz de capacidades e testes de ferramentas, limites e respostas estruturadas. Um endpoint compatível não comprova comportamento idêntico. A lista final de conectores além de OpenAI permanece a priorizar.

Um único agente é responsável pela resposta de cada turno. Troca de perfil/modelo preserva estado confirmado e não gera duas respostas ao lead. Resumos nunca registram como enviado um texto que não chegou ao canal.

Contingência configurável para indisponibilidade, limite de taxa e timeout. Limitar tentativas e gasto total do turno; erros de credencial/configuração precisam ser visíveis, sem desvio permanente para outra conta. Uma ferramenta com efeito externo já executada não deve ser repetida pela simples troca de modelo.

O laboratório compara versões e modelos pelos mesmos cenários, incluindo contexto, naturalidade, ferramentas, custo e latência. Mudanças de provedor ou de versão só entram em produção após publicação do perfil.

## 16. Dashboard operacional, consumo e custos

### Visão operacional

Prever filtros por período, agente/perfil, modelo, canal e integração. Indicadores candidatos:

- Contatos e conversas atendidas, em andamento, qualificadas e transferidas.
- Qualificações completas, perguntas pendentes e motivos de encaminhamento.
- Agendamentos propostos, confirmados, remarcados e cancelados.
- Vendas apenas quando houver confirmação observável pela operação.
- Tempo de resposta, espera na fila e latência por etapa.
- Mensagens por texto/voz e duração de áudio recebido/gerado.
- Sucesso, falha, repetição e latência de ferramentas.
- Falhas de sincronização, fila pendente e saúde das conexões.
- Resolução automática somente com critério e fonte definidos.

Cada cartão precisa de definição, denominador e origem; ausência de dado aparece como indisponível. Pausa humana não equivale automaticamente a falha e agendamento não equivale a venda.

### Consumo e valor monetário

Separar três camadas no painel:

1. Uso observado: tokens, segundos/minutos, caracteres/créditos, chamadas e recursos consumidos pelo Pulsoo.
2. Custo estimado: uso observado multiplicado pela tarifa e condições configuradas para aquela versão, serviço e período.
3. Cobrança conciliada: dados financeiros consultados/importados do provedor, quando disponíveis e autorizados, com data de atualização.

Não apresentar estimativa como fatura nem consumo da conta inteira como gasto deste cliente.

| Serviço | Medição e limites |
|---|---|
| OpenAI e outros LLMs | Uso por chamada/modelo/tarefa, cache quando informado, repetição e tentativas |
| AssemblyAI | Duração transcrita, modelo e recursos cobrados; saldo somente se obtido de fonte confirmada |
| ElevenLabs | Caracteres/créditos, voz/modelo e consumo de síntese; plano e excedente separados |
| Sheets, Calendar e Cal.com | Chamadas, quotas, falhas e eventuais custos contratuais; não inventar cobrança por chamada |
| Canal de mensagem | Entrega e custo apenas quando Central/provedor fornecerem dados suficientes |
| Infraestrutura | Custo configurado/importado, claramente separado do consumo variável de APIs |

A OpenAI informa tokens de entrada e saída; a contagem de saída pode incluir conteúdo não visível, portanto não deve ser estimada contando apenas palavras exibidas. Fonte: [OpenAI Docs — contagem de tokens](https://developers.openai.com/api/docs/guides/token-counting).

Há APIs organizacionais de uso/custos da OpenAI. A consulta depende de permissões, escopo e granularidade disponibilizados; dados agregados precisam ser conciliados com os registros locais. Não distribuir credencial administrativa global entre instalações de clientes. Se necessário, um coletor interno separado consulta e entrega somente as métricas autorizadas; sem esse acesso, o painel continua com medição local e estimativa. Fonte: [OpenAI Docs — uso organizacional](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage).

A ElevenLabs disponibiliza dados de assinatura, consumo, limites e excedentes. Eles podem representar a conta/workspace e não uma conversa; é necessário separar consumo local de consumo compartilhado. Fonte: [ElevenLabs — assinatura e consumo](https://elevenlabs.io/docs/api-reference/user/subscription/get).

O saldo da AssemblyAI não foi comprovado por uma API de billing nesta pesquisa. Exibir gasto estimado e permitir informação manual com origem/data até confirmar consulta oficial disponível para a conta.

Registrar uso em PostgreSQL por execução, etapa, modelo, serviço, ID externo e ambiente. Separar produção, laboratório, resumos, embeddings e avaliação. Chamadas falhas ou repetidas podem ter consumo; ausência de métrica não significa custo zero.

Tarifas devem ser versionadas, com moeda, unidade, vigência e fonte. Não fixar preços atuais neste planejamento. Guardar valor na moeda de origem; BRL opcional com câmbio e data explícitos. Separar taxa de assinatura, franquia, crédito promocional, desconto e excedente para não somar a mesma cobrança duas vezes.

Exibir evolução diária, distribuição por serviço/tarefa/modelo, custo médio por conversa e qualificação, projeção mensal e percentual do orçamento. Custo por agendamento confirmado usa apenas confirmações reais como denominador. Sem quantidade válida, não calcular.

Prever alertas e tetos configuráveis por instalação, serviço e tarefa. Definir reação ao teto: suspender recurso opcional, usar alternativa já autorizada ou encaminhar. Não prometer teto financeiro exato só com medição atrasada ou estimada; reservar orçamento para chamadas em andamento e permitir reativação pelo responsável.

### Integrações futuras

Organizar catálogo com contrato comum: autenticação no servidor, capacidades, ferramentas com schema, política de tentativa, teste de conexão, medição e erros normalizados. Prioridade atual: Central, OpenAI, ElevenLabs, AssemblyAI, Cal.com/Google Calendar e Sheets/Drive. Novos conectores entram quando houver uma operação e um teste de aceite definidos.

## 17. Próximas definições e ordem de execução

Nome definido: Pulsoo. O catálogo completo acima descreve o produto desejado; a execução será incremental, preservando voz, planilhas, múltiplos modelos e indicadores como requisitos das fases seguintes.

Pendências:

- Primeira operação real, limite de atuação e exemplo de fluxo n8n a substituir.
- Responsável pelo acesso administrativo, publicação de perfis e resolução de falhas.
- Modelos OpenAI iniciais e provedores adicionais prioritários.
- Voz ElevenLabs disponível na conta, preferência de áudio e amostras em português para avaliação.
- Credenciais e condição de crédito/saldo de cada provedor, sem inserir segredos no documento.
- Conector de agenda inicial e profissionais/serviços envolvidos.
- Planilhas, mapeamento de colunas e política de criação/edição/exclusão.
- Volume, concorrência, retenção, backup e teto de custo.
- Contrato mínimo de mídia, histórico, estado e handoff na Central.

Ordem proposta e critérios de saída:

1. Fechar um perfil real e os contratos mínimos com a Central.
2. Validar texto, PostgreSQL, fila, pausa humana e entrega persistente.
3. Disponibilizar laboratório, publicação de rascunhos e medição por etapa.
4. Homologar transcrição AssemblyAI e voz ElevenLabs pelo caminho de mídia da Central.
5. Homologar um conector de agenda com múltiplos recursos.
6. Entregar Sheets/Drive com cadastro, resumos e operações autorizadas, incluindo recuperação de falhas.
7. Consolidar dashboard, custos estimados/conciliados, modelos por tarefa e alternativas de provedor.
8. Validar Evolution e canal oficial com a matriz de capacidades; replicar uma segunda instalação sem alterações de código.

Casos adicionais obrigatórios: crédito de transcrição esgotado; áudio ilegível; erro de pronúncia/dados; pausa humana durante síntese; falha parcial de envio; timeout após criação de reserva/linha; reordenação manual do Sheets; exclusão fora de escopo; troca de modelo após ferramenta executada; custo sem métrica e uso compartilhado de conta. Testar que voz, transcrição, exports e diagnósticos não revelem a URL da Central.

A implementação local inicial foi iniciada nesta versão. Não houve implantação externa, alteração da Central, conexão de contas ou reservas, envios e exclusões reais. O detalhamento abaixo distingue capacidades implementadas de evoluções planejadas. Não altera produtos comerciais, preços, contratos ou promessas vigentes da Seelva.


## 18. Catálogo por operação e por nicho

Decisão de produto: manter produtos e serviços como dados configuráveis, e não como regras fixas de um nicho no código.

Base implementada: nome, categoria, descrição, unidade, preço em centavos e estado ativo/arquivado. Esses dados alimentam a consulta do agente, a seleção de itens e o cálculo de proposta.

Evoluções previstas: duração, profissional/recurso elegível, informações exigidas antes da oferta, variações, condições de pagamento, regras de pacote, fontes aprovadas e campos adicionais por perfil de operação. Campos novos precisam de validação e definição de como entram no documento e nas ferramentas.

Em uma clínica, o catálogo pode organizar serviços e valores administrativos aprovados. O agente não deve transformar descrição de serviço em diagnóstico, indicação de tratamento ou promessa de resultado. Encaminhamentos e questões clínicas exigem o fluxo definido pelo responsável da operação.

Mudanças no catálogo não alteram propostas já emitidas. Arquivar um serviço impede novas propostas com ele e preserva as anteriores.

## 19. Documentos, propostas e aprovação

Fluxo escolhido:

    Evento de mudança de etapa
      -> regra da operação
      -> contato + notas autorizadas + catálogo + modelo
      -> proposta com snapshot e cálculo determinístico
      -> aprovação humana da versão
      -> fila durável
      -> envio pela Central
      -> registro e conciliação do resultado

### Modelos locais e Google Docs/Drive

O aplicativo já permite cadastrar um modelo textual local, com título, introdução, condições e validade, e gerar PDF da proposta.

O caminho Google planejado é: cadastrar um modelo e pasta autorizados -> copiar o original pelo Drive -> persistir ID da cópia -> substituir campos no Docs -> conferir campos obrigatórios -> exportar e guardar o artefato -> vincular a versão à aprovação. A cópia não substitui o modelo original.

A base contém métodos HTTP de cópia e substituição, com teste de contrato. Ainda não implementa o job completo de emissão Google, upload de DOCX/PDF como modelo, composição avançada de layout nem envio de anexo pela Central.

Referências: [Google Docs — preenchimento de modelo](https://developers.google.com/workspace/docs/api/how-tos/merge), [Drive — cópia](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/copy).

### Dados do lead

Notas internas locais já podem ser cadastradas e alteradas. O contrato atual da Central ainda exige uma extensão para leitura confiável de notas/histórico. O aplicativo não presume que esses dados venham no webhook.

Antes de gerar uma proposta, validar contato, serviços, quantidades, campos necessários e validade. A IA poderá ajudar a organizar o texto a partir de fontes aprovadas; não poderá inventar preço, condição ou autorização de desconto.

Notas internas não entram automaticamente no documento externo. A configuração do modelo decide quais campos podem ser usados; na base atual, existe placeholder explícito cliente.notas, ausente do modelo padrão. A operação deve selecionar dados apropriados ao destinatário.

### Aprovação e grupo de aviso

A primeira implementação usa aviso por webhook com link para o Pulsoo. O responsável revisa no painel autenticado; decisão e hash da versão ficam registrados. Um “sim” solto no grupo não constitui aprovação nesta base.

O grupo/canal precisa de provedor e contrato homologados. Não presumir que um webhook genérico envie a um grupo WhatsApp ou que recursos de grupo da Evolution existam no canal oficial.

A base exige aprovação humana em toda proposta. Qualquer modo de emissão automática sem revisão será uma política futura explícita, com catálogo, modelo, limites e critérios testados. Não nasce liberado por pedido do lead.

Uma versão aprovada não pode ser silenciosamente modificada antes de enviar. Hoje, alteração significa criar outra proposta e obter nova aprovação. Versões relacionadas, prazo de decisão e delegação entre revisores são evolução.

### Referência Fazer AI

A documentação de documentos da Fazer AI reforça a separação entre modelo, emissão, conteúdo persistido e entrega. Utilizamos essa estrutura como referência de desenho e validamos os contratos próprios do Pulsoo. Não instalamos a aplicação da Fazer AI nem copiamos seu código; sua condição de uso em produção não comprova a nossa implementação. Fonte: [documentos](https://github.com/fazer-ai/agents/blob/main/docs/documents.md).

## 20. Estado real da primeira implementação

Entrega 0.1.0 iniciada em 03/11/2026. O projeto está nesta pasta, com package-lock, TypeScript, backend Fastify/Node, painel React/Vite, Dockerfile e Compose.

| Área | Implementado nesta base | Ainda necessário |
|---|---|---|
| Visual | Painel claro/escuro/sistema e responsividade | Ajustes a partir do uso real |
| Catálogo | Cadastro, edição, arquivamento e cálculo | Campos e regras específicos por nicho |
| Contatos | Cadastro e notas locais | Notas/histórico vindos da Central |
| Propostas | Modelo textual, snapshot, PDF e fila | Importação, Google Docs completo e anexos |
| Aprovação | Painel autenticado por versão | Canal real homologado e múltiplos revisores |
| Automação | Regra de mudança de etapa e HMAC | Motor completo de atendimento por mensagem |
| OpenAI | Laboratório real quando configurado | Atendimento autônomo de produção |
| Voz/transcrição | Cliente AssemblyAI, cliente ElevenLabs e prévia real de voz | Processamento durável de áudio e entrega pelo canal |
| Google e Cal.com | Clientes HTTP com contratos testados em simulação | OAuth, autorização de recursos e homologação real |
| Dados | Driver PostgreSQL e demonstração local persistente | Validação do banco e restauração no ambiente alvo |
| Indicadores | Uso registrado no laboratório e trilha de ações | Tarifas, projeções, faturas e indicadores completos |

A demonstração está restrita ao loopback, usa dados fictícios e nunca chama serviços externos. Produção recusa demonstração, exige PostgreSQL, HTTPS e credenciais administrativas apropriadas.

Verificações: TypeScript e build passaram; 25 testes passaram e 1 teste PostgreSQL ficou condicionado a banco disponível. A árvore de dependências de produção não apresentou alertas no npm audit desta entrega. Revisão de navegador cobriu temas, criação de proposta, cálculo, solicitação de aprovação, envio simulado, laboratório e navegação móvel. PDF de exemplo renderizado e inspecionado.

O Docker Desktop não respondeu à consulta do daemon nesta sessão; a imagem e o PostgreSQL real não foram executados. Não há afirmação de implantação, capacidade validada ou integração externa homologada.

Detalhes executáveis e contratos: [README](README.md), [contratos](docs/CONTRATOS.md), [evidências da entrega](docs/ENTREGA-0.1.md).

Prioridade seguinte: validar PostgreSQL/Docker e fechar o contrato mínimo de histórico/notas/mídia na Central; depois ligar motor de mensagens e homologar um fluxo real de ponta a ponta, preservando o escopo completo de voz, agendas, propostas, planilhas e custos.
