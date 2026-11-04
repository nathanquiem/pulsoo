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
