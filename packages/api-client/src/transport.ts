import { httpOperations, httpSchemas } from "@asisteam/core/runtime";
import type { z } from "zod";

const messages: Record<number, string> = {
  400: "Revisa los datos de la solicitud.", 401: "Inicia sesión para continuar.",
  403: "No tienes permiso para realizar esta acción.", 404: "El recurso no existe o no tienes acceso.",
  409: "La operación entra en conflicto con el estado actual.", 422: "No se cumplen las condiciones para realizar esta acción.",
  429: "Demasiadas solicitudes. Vuelve a intentarlo.", 502: "La respuesta del servicio no es válida.",
  503: "El servicio no está disponible. Vuelve a intentarlo.", 504: "La solicitud excedió el tiempo permitido.",
};
export class ApiClientError extends Error {
  readonly error: { code: string; message: string; details: Record<string, never> };
  constructor(readonly status: number, code: string, readonly requestId?: string) {
    super(messages[status] ?? "No pudimos procesar la solicitud.");
    this.name = "ApiClientError";
    // Never retain raw remote bodies, exceptions, URLs or tokens on an error.
    this.error = { code, message: this.message, details: {} };
  }
}
export type ApiClientOptions = {
  origin: string;
  accessToken?: () => Promise<string | null>;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
  authProxy?: { secret: string; clientIp: string };
  nativeAuth?: boolean;
  web?: { csrfToken: () => Promise<string | null> };
  invitationProxy?: { secret: string; clientIp: string };
};
type Input = { params?: object; query?: object; body?: unknown };
type Operation = {
  method: string; path: string; authenticated: boolean; status: number;
  params?: keyof typeof httpSchemas; query?: keyof typeof httpSchemas;
  body?: keyof typeof httpSchemas; response: keyof typeof httpSchemas;
};
export function apiOrigin(value: string): string {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/"
      || !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
      throw new Error("invalid_origin");
    }
    return url.origin;
  } catch { throw new ApiClientError(400, "invalid_api_configuration"); }
}
function parse(schema: z.ZodTypeAny, value: unknown, status = 400) {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiClientError(status, status === 400 ? "invalid_request" : "invalid_response");
  return result.data;
}
export class ApiTransport {
  private readonly origin: string;
  private readonly timeoutMs: number;
  constructor(private readonly options: ApiClientOptions) {
    this.origin = apiOrigin(options.origin);
    this.timeoutMs = options.timeoutMs ?? 5000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 120000) throw new ApiClientError(400, "invalid_api_configuration");
  }
  protected async execute<T>(operationId: keyof typeof httpOperations, input: Input): Promise<T> {
    const operation: Operation = httpOperations[operationId];
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiClientError(400, "invalid_request");
    const allowed = ["params", "query", "body"].filter(key => key in operation);
    if (Object.keys(input).some(key => !allowed.includes(key))) throw new ApiClientError(400, "invalid_request");
    const params = parse(httpSchemas[operation.params ?? "Empty"], input.params ?? {});
    const query = parse(httpSchemas[operation.query ?? "Empty"], input.query ?? {});
    const body = operation.body ? parse(httpSchemas[operation.body], input.body) : undefined;
    const cookieMode = !!this.options.web;
    const webOperation = operation.path.startsWith('/web-api/v1/');
    if (webOperation && !cookieMode || cookieMode && (this.options.authProxy || this.options.invitationProxy || this.options.accessToken)) throw new ApiClientError(400, 'invalid_api_configuration');
    // Token-returning native Auth operations are never available over cookies.
    if (cookieMode && operation.path.startsWith('/api/v1/auth/')) throw new ApiClientError(400, 'invalid_request');
    let path = cookieMode && operation.path.startsWith('/api/v1/') && operation.path !== '/api/v1/health' && operation.path !== '/api/v1/ready' ? operation.path.replace('/api/v1/', '/web-api/v1/') : operation.path;
    for (const [key, value] of Object.entries(params)) path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
    const url = new URL(path, this.origin);
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new ApiClientError(504, "request_timeout")); }, this.timeoutMs);
    });
    const request = async () => {
      const headers: Record<string, string> = { accept: "application/json" };
      if (operation.authenticated && !cookieMode) {
        const token = await this.options.accessToken?.();
        if (!token || /[\r\n]/.test(token)) throw new ApiClientError(401, "authentication_required");
        headers.authorization = `Bearer ${token}`;
      }
      if (controller.signal.aborted) throw new ApiClientError(504, "request_timeout");
      if (!cookieMode && (operationId === "previewInvitation" || operationId === "acceptInvitation" || operationId === "registerInvitation" || operationId === "claimInvitation")) {
        const proxy = this.options.invitationProxy;
        if (!proxy?.secret || !proxy.clientIp || /[\r\n]/.test(proxy.secret + proxy.clientIp)) throw new ApiClientError(401, "authentication_required");
        headers["x-asisteam-proxy"] = proxy.secret; headers["x-asisteam-client-ip"] = proxy.clientIp;
      }
      if (this.options.nativeAuth) headers['x-asisteam-native-auth']='1';
      if (this.options.authProxy && operation.path.startsWith('/api/v1/auth/')) {
        const proxy=this.options.authProxy;
        if (!proxy.secret || !proxy.clientIp || /[\r\n]/.test(proxy.secret+proxy.clientIp)) throw new ApiClientError(401,'authentication_required');
        headers['x-asisteam-auth-proxy']=proxy.secret;headers['x-asisteam-client-ip']=proxy.clientIp;
      }
      if (cookieMode && !['GET', 'HEAD'].includes(operation.method)) {
        const csrf = await this.options.web!.csrfToken();
        if (!csrf || !/^[a-f0-9]{64}$/.test(csrf)) throw new ApiClientError(403, 'permission_denied');
        headers['x-csrf-token'] = csrf;
      }
      if (body !== undefined || cookieMode && !['GET', 'HEAD'].includes(operation.method)) headers["content-type"] = "application/json";
      if (controller.signal.aborted) throw new ApiClientError(504, 'request_timeout');
      const response = await (this.options.fetch ?? globalThis.fetch)(url, {
        method: operation.method, headers, ...(body === undefined ? cookieMode && !['GET', 'HEAD'].includes(operation.method) ? { body: '{}' } : {} : { body: JSON.stringify(body) }),
        cache: "no-store", credentials: cookieMode ? "same-origin" : "omit", redirect: "error", signal: controller.signal,
      });
      const rawId = response.headers.get("x-request-id");
      const requestId = rawId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId) ? rawId : undefined;
      // Read the body inside the deadline; a stalled body must also time out.
      let payload: unknown;
      try { payload = await response.json(); }
      catch { throw new ApiClientError(502, "invalid_response", requestId); }
      if (!response.ok) {
        const error = httpSchemas.ApiError.safeParse(payload);
        const code = error.success && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(error.data.error.code) ? error.data.error.code : "invalid_response";
        throw new ApiClientError(response.status, code, requestId);
      }
      if (response.status !== operation.status) throw new ApiClientError(502, "invalid_response", requestId);
      return parse(httpSchemas[operation.response], payload, 502) as T;
    };
    try { return await Promise.race([request(), deadline]); }
    catch (error) {
      if (error instanceof ApiClientError) throw error;
      throw new ApiClientError(controller.signal.aborted ? 504 : 503, controller.signal.aborted ? "request_timeout" : "service_unavailable");
    } finally { clearTimeout(timer); }
  }
}
