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
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.length > 2048 || /[\\\r\n]/.test(value)) return "/groups";
  if (/^\/(?:groups(?:\/new|\/[0-9a-f-]{36}(?:\/me\/history|\/settings(?:\/visibility)?|\/members(?:\/(?:new|pending|consent))?|\/guardians|\/invitations\/new)?)?|me\/history|welcome|join|profile(?:\/birthdate-requests)?|wards(?:\/[0-9a-f-]{36})*|invitations\/[A-Za-z0-9_-]{22,256})$/.test(value)) return value;
  const context=/^(\/groups\/[0-9a-f-]{36}\/(?:members\/(?:pending|consent)|guardians))\?(membership|athlete)=([0-9a-f-]{36})$/.exec(value);
  if(context && ((context[2]==="athlete" && context[1]!.endsWith("/consent")) || (context[2]==="membership" && !context[1]!.endsWith("/consent")))) return value;
  const route=/^\/groups\/[0-9a-f-]{36}\/(?:activities(?:\/(?:new|[0-9a-f-]{36}(?:\/(?:edit|attendance))?))?|activity-types|reports|me\/history|wards\/[0-9a-f-]{36}\/history)$/;
  const parsed=new URL(value,"http://return.invalid");
  if(route.test(parsed.pathname) && !parsed.hash){
    const allowed:Record<string,RegExp>={period:/^(?:upcoming|past|week|month|custom|season)$/,page:/^[1-9]\d{0,5}$|^1000000$/,ward_page:/^[1-9]\d{0,5}$|^1000000$/,from:/^(?:group|agenda|wards|\d{4}-\d{2}-\d{2})$/,ward:/^[0-9a-f-]{36}$/,to:/^\d{4}-\d{2}-\d{2}$/,activity_type_id:/^[0-9a-f-]{36}$/,sort:/^(?:attendance|name)$/,include_inactive:/^true$/};
    if(Array.from(parsed.searchParams).every(([key,item])=>allowed[key]?.test(item)))return parsed.pathname+parsed.search;
  }
  if (value === "/check-in" || value === "/") return value;
  const capability = new URL(value,"http://return.invalid");
  if(/^\/groups\/[0-9a-f-]{36}\/(?:billing|announcements|activities\/[0-9a-f-]{36}\/qr)$/.test(capability.pathname) && !capability.hash){
    const entries=Array.from(capability.searchParams);
    if(entries.length === 0 || (entries.length === 1 && entries[0]![0] === "page" && /^[1-9]\d{0,5}$|^1000000$/.test(entries[0]![1]) && !capability.pathname.endsWith("/qr"))) return capability.pathname+capability.search;
  }
  if (/^\/join\?code=[A-Za-z0-9]{8}$/.test(value)) return value;
  return "/groups";
}
function requestDestination(request: Request) {
  const url = new URL(request.url);
  const destination=safeReturn(url.pathname + url.search);
  return destination === "/groups" && url.pathname !== "/join" ? safeReturn(url.pathname) : destination;
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
  return error instanceof ApiClientError && error.status < 500
    ? error.message
    : "No pudimos conectar. Vuelve a intentarlo.";
}
