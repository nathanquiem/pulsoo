# Aviso humano pelo n8n
Contrato 1.0 do Pulsoo. O aviso pode ir a grupo ou contato sem passar pela API de grupos da Central. Não foi publicado nenhum workflow no n8n por esta alteração.

## Configuração da instalação
No Coolify, somente runtime:
- HUMAN_NOTIFICATION_WEBHOOK_URL: URL HTTPS de produção do novo webhook do n8n.
- HUMAN_NOTIFICATION_WEBHOOK_SECRET: segredo compartilhado de pelo menos 32 caracteres.
Nunca colocar estas credenciais no prompt ou no frontend. O segredo permanece no servidor e no n8n.

Em Agente > Fluxo e ferramentas > Destino, escolher Webhook de aviso (n8n). O identificador de destino é opcional se o workflow do n8n resolve um destino fixo. Não permitir que texto do lead escolha o destinatário.

## Recebimento
POST JSON com headers:
- Idempotency-Key: UUID do encaminhamento.
- X-Pulsoo-Timestamp: Unix timestamp em segundos.
- X-Pulsoo-Signature: sha256= + HMAC-SHA256 hexadecimal de timestamp + "." + corpo JSON bruto, com o segredo compartilhado.
Verificar assinatura sobre bytes originais e janela de cinco minutos antes de executar qualquer envio. Não usar JSON reserializado como substituto do corpo bruto.

Exemplo fictício:
~~~json
{
  "version": "1.0",
  "event": "human_handoff.requested",
  "id": "3c29c028-4aa5-409b-bd2d-a20783561004",
  "createdAt": "2026-11-05T12:00:00.000Z",
  "destination": "destino-configurado",
  "lead": {"id":"contato-id","name":"Lead fictício","phone":"5511999990000","conversationId":"conversa-id","opportunityId":"oportunidade-id","stage":"etapa-id"},
  "qualification": [{"key":"necessidade","label":"Necessidade","value":"Avaliação"},{"key":"medidas","label":"Medidas","value":null}],
  "photosReceived": 2,
  "reason": "Qualificação concluída",
  "summary": "ATENDIMENTO PARA A EQUIPE\nNome: Lead fictício\n...",
  "nextStep": "Avaliar o pedido com a equipe",
  "callback": {"url":"https://pulsoo.exemplo/api/webhooks/human-notifications","method":"POST","auth":"HMAC-SHA256"}
}
~~~
O snapshot é congelado ao solicitar o humano. Não inclui chaves, URL da Central ou arquivos de mídia. summary já vem formatado para enviar; qualification permite outro layout no n8n. null significa pendência.

## Fluxo recomendado no n8n
1. Webhook POST com corpo bruto, respondendo com Respond to Webhook.
2. Validar HMAC, timestamp, versão, evento, UUID e destino autorizado. Em falha, responder 401/422 e não enviar.
3. Reservar id em armazenamento persistente com unicidade e estado processing. Se já confirmado, devolver o mesmo recibo; se processing, devolver 202 aceito sem reenviar. Falha incerta exige conferência do provedor.
4. Enviar summary ao grupo/contato usando credencial do provedor já cadastrada no n8n. Registrar o ID da mensagem confirmado pelo provedor. Não usar uma nova IA para montar esse aviso.
5. Responder somente depois da confirmação, dentro do timeout de 20s do Pulsoo:
~~~json
{"notification":{"id":"UUID-original","status":"sent","messageId":"ID-confirmado-pelo-provedor"}}
~~~
O status sent significa aceito/enviado pelo provedor, não comprova leitura pelo destinatário. HTTP 200 genérico ou ok:true não confirma o aviso.

## Confirmação assíncrona
Para operações mais longas, o n8n pode responder 202:
~~~json
{"accepted":true,"id":"UUID-original"}
~~~
Depois do envio confirmado, chamar POST no callback da instalação:
~~~json
{"id":"UUID-original","status":"sent","messageId":"ID-confirmado"}
~~~
Se houver falha conhecida:
~~~json
{"id":"UUID-original","status":"failed","error":"provider_rejected"}
~~~
error aceita destination_rejected, provider_rejected ou delivery_failed. Não enviar o erro bruto do provedor, chave ou URL interna.

Assinar o callback com X-Pulsoo-Timestamp e X-Pulsoo-Signature pelo mesmo algoritmo/segredo. Usar a URL fixa desta instalação, não uma URL arbitrária recebida de terceiros. O Pulsoo valida assinatura, UUID existente, tipo webhook e despacho iniciado. Recibos repetidos iguais são aceitos; mensagem conflitante depois de confirmado retorna 409.

HTTP 202 fica aguardando confirmação. Timeout ou retorno inválido fica incerto; não há retry cego. Um callback válido ainda pode conciliar um envio incerto. A IA continua pausada no encaminhamento mesmo se o aviso falhar.

## Homologação
Validar assinatura inválida sem envio, destino indevido, repetição do mesmo UUID, confirmação síncrona, callback, timeout e recibo conflitante. Primeiro usar dados fictícios e destino autorizado de teste. Só depois habilitar a operação.

Referências: [Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/) e [Respond to Webhook](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.respondtowebhook/). O modo de teste registra o webhook somente durante escuta; usar URL de produção após publicar.
