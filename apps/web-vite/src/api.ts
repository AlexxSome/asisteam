import { ApiClient, ApiClientError } from "@asisteam/api-client";
import { redirect } from "react-router";
// Request-scoped transport: DTOs belong only to loaders, never a second cache.
export function browserApi(signal?: AbortSignal) {
  let api: ApiClient;
  const transport: typeof fetch = (input, init) =>
    fetch(input, {
      ...init,
      signal:
        signal && init?.signal
          ? AbortSignal.any([signal, init.signal])
          : (signal ?? init?.signal),
    });
  api = new ApiClient({
    origin: window.location.origin,
    fetch: transport,
    web: { csrfToken: async () => (await api.getWebCsrf()).csrf_token },
  });
  return api;
}
export function safeReturn(value: string | null) {
  if (!value || !/^\/(?:groups(?:\/[0-9a-f-]{36})?|welcome)$/.test(value))
    return "/groups";
  return value;
}
export function sessionError(error: unknown, request: Request): never {
  if (error instanceof ApiClientError && error.status === 401)
    throw redirect(
      "/login?return_to=" +
        encodeURIComponent(safeReturn(new URL(request.url).pathname)),
    );
  if (
    error instanceof ApiClientError &&
    error.error.code === "account_consent_required"
  )
    throw redirect(
      "/accept-terms?return_to=" +
        encodeURIComponent(safeReturn(new URL(request.url).pathname)),
    );
  throw error;
}
export async function requireSession(request: Request, consent = true) {
  try {
    const session = await browserApi(request.signal).getWebSession();
    if (consent && !session.accepted)
      throw redirect(
        "/accept-terms?return_to=" +
          encodeURIComponent(safeReturn(new URL(request.url).pathname)),
      );
    return session;
  } catch (error) {
    return sessionError(error, request);
  }
}
export function actionMessage(error: unknown) {
  return error instanceof ApiClientError
    ? error.message
    : "No pudimos conectar. Vuelve a intentarlo.";
}
