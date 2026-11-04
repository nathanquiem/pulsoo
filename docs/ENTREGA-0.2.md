# Entrega 0.2 — simplificação e follow-up
Data: 03/11/2026. Implementação local; sem deploy ou conexões externas.

## Escopo
- Cinco áreas fixas; Comercial condicional.
- Módulos desligados por padrão, bloqueios na API e especialistas.
- Principal com delegação OpenAI a especialistas isolados, sem ferramentas de escrita.
- Memória de mensagens e fila durável de resposta/follow-up no mesmo repositório PostgreSQL.
- Cadência de 1 a 5 etapas, horários/dias/fuso e limite diário por conversa.
- Cancelamento por nova mensagem, pausa, encerramento, opt-out e mudança de configuração.
- Pausa local persistente; áudio recebido interrompe a cadência até processamento do conteúdo.
- Registro Central somente após confirmação: tarefa concluída, instante original, ID permanente, retry independente do envio.
- Recuperação de geração interrompida; envio em andamento torna-se incerto e requer conciliação.
- Demonstração de fila no laboratório, sem tarefa/mensagem externa.

## Central
Alterações locais no projeto irmão Central by Seelva:
- POST /api/v1/tarefas/concluidas, escopo tarefas:escrever.
- Confere empresa, contato, conversa, mensagem de saída de automação externa com envio confirmado e responsável ativo.
- Conflito se mesmo ID tentar representar outra execução.
- Migração 070 aceita novo escopo e emite tarefa.concluida em inserção já concluída. Não amplia chaves existentes.
- Contrato incluído na documentação dinâmica e no guia.

## Evidências e limites
TypeScript, testes e build do Pulsoo verificados. A contagem final e a revisão visual estão registradas ao fim deste documento.
Central: build passou; testes do contrato passaram; migrações 001 a 070 e regressões de banco passaram em PGlite, incluindo preservação do instante e evento concluído.
Nenhuma migração aplicada remotamente. Nenhum envio/reserva/tarefa real. PostgreSQL nativo/Docker do Pulsoo ainda condicionado a ambiente disponível.

## Referências
- Fazer AI: graph.md, service-window.md e nudge.ts, consultados para separar atendimento, verificação de silêncio e horários.
- Delegação ampla ainda estava em issue aberta: https://github.com/fazer-ai/agents/issues/56. Não apresentada como capacidade pronta copiada.
- OpenAI: https://developers.openai.com/api/docs/guides/function-calling.
Nenhum código Fazer AI incorporado. A implementação e os contratos são próprios.

## Verificação final
- Pulsoo: npm run check e npm run build aprovados; npm test com 43 casos, 42 aprovados e 1 PostgreSQL condicional ignorado.
- Central: npm run build e 2 testes do contrato aprovados. db:test:v2 aprovado com migrações 001–070, isolamento/RLS e regressões de formulário/tracking. PGlite é banco descartável de teste, não homologação do PostgreSQL da VPS.
- Navegador: cinco itens fixos; Comercial aparece/desaparece com módulos; salvar cadência; especialistas condicionais; laboratório de follow-up; execução de fila simulada; memória e registro com data/hora; pausa manual; tema claro/escuro; menu móvel a 390px sem overflow horizontal; console sem erros/avisos.
- Teste da fila ocorreu fora do expediente de São Paulo: a primeira tentativa ficou aguardando. Foi usado temporariamente um fuso em expediente para executar o cenário e depois restaurado America/Sao_Paulo, 09:00–18:00. Módulos e atendimento automático ficaram desligados.
- Capturas: pulsoo-modular.png, pulsoo-followup-desktop.png e pulsoo-followup-mobile.png na pasta de visualizações da sessão.
- Servidor/aba de QA encerrados após revisão. Execute npm start para abrir novamente.

## Homologação inicial na VPS — 04/11/2026

- Código operacional a73778d publicado e implantado no recurso exclusivo do Pulsoo no Coolify. PostgreSQL saudável, HTTPS válido e /health com HTTP 200. Sem login, /api/bootstrap retorna 401; webhook sem assinatura retorna 401.
- Operador confirmou ativação do webhook na Central. Isso não comprova atendimento de ponta a ponta.
- Laboratório OpenAI real autenticado: uma mensagem fictícia gerou uma consulta ao especialista de contexto e resposta do principal. Painel registrou três chamadas e 1.134 tokens; nenhuma mensagem/tarefa foi enviada à Central. Tarifas e custo monetário continuam desconhecidos.
- Limites padrão: uma delegação por turno, histórico recente de 24.000 caracteres, saída do principal de 700 tokens. Cancelamento é revalidado antes de chamadas subsequentes; uso permanece registrado quando etapa posterior falha.
- Verificações: TypeScript e build aprovados; 52 testes, 51 aprovados, um teste condicional de PostgreSQL descartável ignorado. npm audit --omit=dev: nenhuma vulnerabilidade conhecida na consulta desta data.
- Atendimento automático e módulos comerciais continuam desligados. Próximo passo depende do roteiro aprovado da operação e isolamento do contato de homologação. Voz, transcrição, notas externas e ferramentas Google/agendas continuam nos limites descritos no README.
- A implantação foi validada na VPS; backup/restauração e atendimento real com pausa humana, follow-up e tarefa concluída ainda precisam de homologação específica.
