# Pulsoo
Aplicativo independente por cliente. Identidade: Pulsoo, sem “by Seelva”.
Consulte PLANEJAMENTO-ATENDIMENTO.md, README.md e docs/CONTRATOS.md.
Não alterar a Central implicitamente. Nunca expor sua URL ou tokens no cliente.
Estado e memória em PostgreSQL na produção. Modo local é explícito e não faz chamadas externas.
Preços são inteiros em centavos. IA não calcula totais nem concede desconto.
Aprovação é humana, autenticada e vinculada ao snapshot. Alteração cria nova proposta.
Escrita remota incerta nunca pode ser repetida às cegas.
Atualize o estado real de implementação e rode npm run check, npm test e npm run build.
Não adicionar credenciais, dados reais ou cópias de código da Fazer AI sem conferir licença.
