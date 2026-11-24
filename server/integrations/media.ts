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
    voiceNote = false,
  ) {
    if (!this.keys.eleven)
      throw new IntegrationError("elevenlabs_nao_configurada");
    if (!/^[\w-]+$/.test(voiceId) || !text.trim() || text.length > 4000)
      throw new IntegrationError("voz_ou_texto_invalido");
    const response = await this.http.response(
      "https://api.elevenlabs.io/v1/text-to-speech/" +
        voiceId +
        (voiceNote ? "?output_format=opus_48000_32" : ""),
      {
        method: "POST",
        headers: {
          "xi-api-key": this.keys.eleven,
          "Content-Type": "application/json",
        },
        body: jsonBody({ text, model_id: model }),
      },
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    if (
      !bytes.length ||
      bytes.length > 16 * 1024 * 1024 ||
      (voiceNote &&
        (bytes.toString("ascii", 0, 4) !== "OggS" ||
          !bytes.subarray(0, 1024).includes(Buffer.from("OpusHead"))))
    )
      throw new IntegrationError("elevenlabs_audio_invalido");
    return bytes;
  }
  async transcribe(
    audio: Buffer,
    canSubmit: () => Promise<boolean> = async () => true,
  ) {
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
    if (!(await canSubmit()))
      throw new IntegrationError("transcricao_cancelada");
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
