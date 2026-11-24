export type Transport = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;
export class IntegrationError extends Error {
  constructor(
    public code: string,
    public uncertain = false,
    public httpStatus?: number,
  ) {
    super(code);
  }
}
export class HttpClient {
  constructor(private transport: Transport = fetch) {}
  async response(url: string, init: RequestInit = {}): Promise<Response> {
    try {
      const result = await this.transport(url, {
        ...init,
        redirect: "error",
        signal: init.signal ?? AbortSignal.timeout(20000),
      });
      if (!result.ok) {
        const knownCode = await providerErrorCode(result);
        throw new IntegrationError(
          knownCode ??
            (result.status === 401 || result.status === 403
              ? "credencial_ou_permissao_invalida"
              : result.status === 429
                ? "limite_do_provedor"
                : "provedor_recusou_operacao"),
          !["GET", "HEAD"].includes(init.method ?? "GET") &&
            result.status >= 500,
          result.status,
        );
      }
      return result;
    } catch (e) {
      if (e instanceof IntegrationError) throw e;
      throw new IntegrationError(
        "falha_de_comunicacao",
        !["GET", "HEAD"].includes(init.method ?? "GET"),
      );
    }
  }
  async json<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await this.response(url, init);
    try {
      return (await response.json()) as T;
    } catch {
      throw new IntegrationError(
        "resposta_do_provedor_invalida",
        !["GET", "HEAD"].includes(init.method ?? "GET"),
      );
    }
  }
}
export const jsonBody = (body: unknown) => JSON.stringify(body);
export function externalId(id: string) {
  if (!/^[\w.@-]{1,200}$/.test(id))
    throw new IntegrationError("identificador_externo_invalido");
  return encodeURIComponent(id);
}

const safeProviderCodes = new Set([
  "quota_exceeded",
  "missing_permissions",
  "invalid_api_key",
  "voice_not_found",
  "payment_required",
  "detected_unusual_activity",
  "paid_plan_required",
  "nota_limite_excedido",
  "nota_conflitante",
  "nota_invalida",
  "nota_indisponivel",
  "idempotencia_conflitante",
  "escopo_insuficiente",
  "empresa_inativa",
  "automacao_pausada",
  "contato_nao_encontrado",
  "conversa_nao_encontrada",
]);
async function providerErrorCode(
  response: Response,
): Promise<string | undefined> {
  if (
    !response.headers.get("content-type")?.includes("application/json") ||
    !response.body
  ) {
    await response.body?.cancel().catch(() => undefined);
    return;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) return;
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const detail = body?.detail ?? body?.error;
    if (
      detail?.status === "api_key_id_used_as_api_key" ||
      detail?.code === "api_key_id_used_as_api_key"
    )
      return "id_da_chave_usado_no_lugar_do_segredo";
    return [body?.erro, detail?.status, detail?.code].find((code) =>
      safeProviderCodes.has(code),
    );
  } catch {
    return;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
