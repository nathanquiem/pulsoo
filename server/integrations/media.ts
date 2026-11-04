import { HttpClient, IntegrationError, jsonBody } from "./http.js";
export class MediaClient {
  constructor(
    private keys: { eleven: string; assembly: string },
    private http = new HttpClient(),
  ) {}
  async synthesize(
    text: string,
    voiceId: string,
    model = "eleven_multilingual_v2",
  ) {
    if (!this.keys.eleven)
      throw new IntegrationError("elevenlabs_nao_configurada");
    if (!/^[\w-]+$/.test(voiceId) || !text.trim() || text.length > 4000)
      throw new IntegrationError("voz_ou_texto_invalido");
    const response = await this.http.response(
      "https://api.elevenlabs.io/v1/text-to-speech/" + voiceId,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.keys.eleven,
          "Content-Type": "application/json",
        },
        body: jsonBody({ text, model_id: model }),
      },
    );
    return Buffer.from(await response.arrayBuffer());
  }
  async transcribe(audio: Buffer) {
    if (!this.keys.assembly)
      throw new IntegrationError("assemblyai_nao_configurada");
    const upload = await this.http.json<{ upload_url: string }>(
      "https://api.assemblyai.com/v2/upload",
      {
        method: "POST",
        headers: {
          authorization: this.keys.assembly,
          "Content-Type": "application/octet-stream",
        },
        body: new Uint8Array(audio),
      },
    );
    return this.http.json<{ id: string; status: string }>(
      "https://api.assemblyai.com/v2/transcript",
      {
        method: "POST",
        headers: {
          authorization: this.keys.assembly,
          "Content-Type": "application/json",
        },
        body: jsonBody({
          audio_url: upload.upload_url,
          language_code: "pt",
          speech_models: ["universal-2"],
        }),
      },
    );
  }
  async transcript(id: string) {
    if (!this.keys.assembly)
      throw new IntegrationError("assemblyai_nao_configurada");
    if (!/^[\w-]+$/.test(id))
      throw new IntegrationError("transcricao_invalida");
    return this.http.json<{
      id: string;
      status: string;
      text: string | null;
      audio_duration: number | null;
    }>("https://api.assemblyai.com/v2/transcript/" + id, {
      headers: { authorization: this.keys.assembly },
    });
  }
}
