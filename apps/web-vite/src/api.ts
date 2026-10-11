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
  if (!value || value.length > 2048 || /[\\\r\n]/.test(value)) return "/groups";
  if (/^\/(?:groups(?:\/[0-9a-f-]{36}(?:\/me\/history)?)?|welcome|join|profile|wards(?:\/[0-9a-f-]{36})*|invitations\/[A-Za-z0-9_-]{22,256})$/.test(value)) return value;
  if (/^\/join\?code=[A-Za-z0-9]{8}$/.test(value)) return value;
  return "/groups";
}
function requestDestination(request: Request) {
  const url = new URL(request.url);
  return safeReturn(url.pathname === "/join" ? url.pathname + url.search : url.pathname);
}
export function sessionError(error: unknown, request: Request): never {
  if (error instanceof ApiClientError && error.status === 401)
    throw redirect(
      "/login?return_to=" +
        encodeURIComponent(requestDestination(request)),
    );
  if (
    error instanceof ApiClientError &&
    error.error.code === "account_consent_required"
  )
    throw redirect(
      "/accept-terms?return_to=" +
        encodeURIComponent(requestDestination(request)),
    );
  throw error;
}
export async function requireSession(request: Request, consent = true) {
  try {
    const session = await browserApi(request.signal).getWebSession();
    if (consent && !session.accepted)
      throw redirect(
        "/accept-terms?return_to=" +
          encodeURIComponent(requestDestination(request)),
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
