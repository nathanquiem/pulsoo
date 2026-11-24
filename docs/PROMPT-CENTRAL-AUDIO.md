# Contrato de leitura de áudio na Central

Pedido para implementar na Central, mediante aprovação do responsável pela Central.

- Adicionar `GET /api/v1/conversas/{conversaId}/mensagens/{mensagemId}/midia`.
- Autenticar via `Authorization: Bearer <chave de integração da Central>` com escopo dedicado `midias:ler`. Validar os dois UUIDs, o vínculo da mensagem à conversa e a empresa derivada da chave. Mensagem de outra empresa ou de outra conversa deve retornar 404.
- Servir somente áudio de entrada para este contrato. Reutilizar a resolução de mídia do canal na Central (oficial ou Evolution), respeitando a separação de empresas e o armazenamento privado. Não expor credenciais, URL externa do provedor, URL assinada, dados de sessão ou caminho do storage ao Pulsoo.
- Responder 200 com os bytes, `Content-Type` de áudio (por exemplo `audio/ogg; codecs=opus`) e `Cache-Control: private, no-store`. Sem redirecionamento. Limite de 16 MiB, incluindo downloads sem Content-Length. Sem áudio disponível, retornar 404. Para escopo ausente, retornar 403 conforme o padrão da API.
- Não alterar o webhook atual. O Pulsoo usa `atendimento.conversa_id` e `mensagem.id` recebidos sob assinatura para solicitar os bytes pelo servidor.
- Homologar áudio real recebido pelo WhatsApp em cada canal utilizado, chave sem escopo, ID que não pertence à conversa e mídia indisponível. Só conceder o escopo à chave usada pelo Pulsoo depois dessa verificação.

O Pulsoo usa a credencial AssemblyAI já configurada. A operação escolhe entre texto, voz ou voz apenas para mensagens de áudio. A resposta em voz usa ElevenLabs e o envio autenticado de áudio da Central. O teste de voz em Integrações usa uma frase sintética para verificar ElevenLabs e AssemblyAI. O arquivo é processado em memória e o texto reconhecido entra na conversa. Se o arquivo ou a transcrição estiver indisponível, o atendimento pede que o lead envie por escrito.
