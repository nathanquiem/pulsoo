# Entrega inicial Pulsoo 0.1.0

Data: 03/11/2026. Desenvolvimento local, sem publicação e sem contas externas conectadas.

## Resultado

Base funcional criada em Aplicativos/Atendimento. A demonstração permite usar o catálogo, criar propostas, gerar PDF, solicitar aprovação, aprovar/rejeitar, simular envio e conversar com o agente de teste.

Aprovação real utiliza um único administrador autenticado nesta fase. O job de envio usa somente a API pública da Central e uma intenção idempotente. Aviso a grupo/canal é um webhook configurável com link autenticado para revisão.

O pipeline de atendimento autônomo em produção ainda não está ativo. Os clientes de integrações não equivalem a homologação externa. As limitações estão explícitas no painel e no README.

## Verificação executada

- npm run check: passou.
- npm run build: passou. Avisos não impeditivos de diretiva use client da biblioteca de ícones em bundle React local.
- npm test: 26 casos, 25 passaram, 1 PostgreSQL condicional não executado.
- npm audit --omit=dev: nenhum alerta na árvore consultada.
- Recepção de evento: assinatura inválida, empresa divergente e duplicidade testadas.
- Aprovação: hash divergente recusado e concorrência gera apenas um envio.
- Falhas: timeout/5xx e interrupção exigem conciliação; não são reenviados automaticamente.
- Privacidade: teste de resposta pública sem domínio/token da Central.
- Contratos HTTP: Central, OAuth Google, cópia Drive, substituição Docs, RAW no Sheets e criação Cal.com testados com transportes simulados.
- Navegador: sem erros de console observados; temas claro/escuro, cadastro de proposta com quantidade 2 e total correto, solicitação de aprovação e envio simulado confirmados.
- Laboratório: consulta de preços do catálogo sem chamada externa.
- Móvel: navegação e layout revisados em 390 × 844; largura de conteúdo não excedeu a área útil. Menu fechado removido da navegação por teclado.
- PDF: exemplo A4 de uma página renderizado com Poppler e inspecionado; texto e total legíveis, sem sobreposição ou corte na amostra.

## Limites da validação

Docker Desktop foi iniciado, mas o daemon não respondeu às consultas desta sessão. Não foi possível subir a imagem ou executar o teste PostgreSQL. O driver, migração e compose precisam dessa validação antes de uso real.

Nenhuma chave real foi buscada, copiada ou cadastrada. Não houve mensagem, proposta, reserva, escrita Sheets ou alteração Drive em conta externa.

A prévia utilizou arquivo local persistente apenas no modo de demonstração. Isso não substitui a validação do banco de produção.

O teste de PDF verificou uma amostra simples. Templates longos e múltiplas páginas exigirão casos adicionais e revisão de layout antes de serem liberados para uso.

## Próximo marco

Banco real e restauração -> contrato mínimo com a Central -> motor de turnos e memória -> áudio -> um conector de agenda -> emissão Google e sincronização Sheets -> custos e múltiplos modelos.

Manter um fluxo por vez homologado de ponta a ponta e perfis configuráveis para replicar a mesma base entre clientes.
