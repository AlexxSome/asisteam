import { Form, Link, redirect, redirectDocument, useActionData, useLoaderData, useLocation, useNavigation, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { httpSchemas, SOCIAL_AUTH_ERROR } from "@asisteam/core/browser";
import { ApiClientError } from "@asisteam/api-client";
import { actionMessage, browserApi } from "../api";
import { authPath, changedSession, CredentialsFields, destination, inviteCode, SocialButtons } from "../auth-context";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Page } from "../ui";
export async function loader({ request }: LoaderFunctionArgs) {
  const api = browserApi(request.signal), target = destination(new URL(request.url));
  try {
    const session = await api.getWebSession();
    return redirect(session.accepted ? target : "/accept-terms?return_to=" + encodeURIComponent(target));
  } catch (error) {
    if (!(error instanceof ApiClientError && error.status === 401)) throw error;
  }
  const providers = await api.webSocialProviders().catch(() => null);
  return { providers };
}
export async function socialAction(request: Request, form: FormData) {
  const url = new URL(request.url);
  const parsed = httpSchemas.SocialStart.safeParse({ provider: form.get("provider"), context: inviteCode(url) ? { invite_code: inviteCode(url) } : {} });
  if (!parsed.success) return { error: SOCIAL_AUTH_ERROR };
  try {
    const result = await browserApi(request.signal).webSocialStart({ body: parsed.data });
    // Nest constructs this URL from configured providers; no caller-selected redirect.
    return redirectDocument(result.authorization_url);
  } catch { return { error: SOCIAL_AUTH_ERROR }; }
}
export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  if (form.has("provider")) return socialAction(request, form);
  const parsed = httpSchemas.AuthLogin.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Revisa tu email y contraseña." };
  try {
    await browserApi(request.signal).webLogin({ body: parsed.data });
    changedSession();
    return redirectDocument(destination(new URL(request.url)));
  } catch (error) { return { error: error instanceof ApiClientError && error.status === 401 ? "Email o contraseña incorrectos" : actionMessage(error) }; }
}
export function Component() {
  const data = useActionData() as { error: string } | undefined, nav = useNavigation();
  const { providers } = useLoaderData<typeof loader>(), location = useLocation(), url = new URL(location.pathname + location.search, window.location.origin);
  return <Page><title>Iniciar sesión · Asisteam</title><Card>
    <CardHeader><p className="text-h2 text-primary">Asisteam</p><CardTitle as="h1">Iniciar sesión</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      {url.searchParams.has("social_error") && <Alert>{SOCIAL_AUTH_ERROR}</Alert>}
      {data?.error && <Alert>{data.error}</Alert>}
      {inviteCode(url) && <p>Después de iniciar sesión podrás unirte como deportista con el código compartido.</p>}
      <SocialButtons providers={providers} />
      <Form method="post" className="space-y-4"><CredentialsFields /><Button busy={nav.state !== "idle"}>{nav.state === "submitting" ? "Ingresando…" : "Ingresar"}</Button></Form>
      <p><Link to={authPath("/forgot-password", url)} className="underline">Olvidé mi contraseña</Link></p>
      <p>¿No tienes cuenta? <Link to={authPath("/register", url)} className="underline">Crear cuenta</Link></p>
    </CardContent></Card><p><Link to="/legal/2026-09-21" className="text-primary underline">Condiciones de uso y privacidad</Link></p></Page>;
}
