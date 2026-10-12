import { useState } from "react";
import { Form, Link, redirectDocument, useActionData, useLoaderData, useNavigation, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { httpSchemas, invitationErrorMessages, MEMBERSHIP_ROLE_LABELS } from "@asisteam/core/browser";
import { ApiClientError } from "@asisteam/api-client";
import { actionMessage, browserApi } from "../api";
import { changedSession, CredentialsFields, registration } from "../auth-context";
import { Alert, Button, Card, CardHeader, CardContent, CardTitle, Page } from "../ui";
function invitationMessage(error: unknown) {
  return error instanceof ApiClientError ? invitationErrorMessages[error.error.code] ?? actionMessage(error) : actionMessage(error);
}
export async function loader({ request, params }: LoaderFunctionArgs) {
  const parsed = httpSchemas.InvitationToken.safeParse({ token: params.token });
  if (!parsed.success) return { error: "La invitación no está disponible.", preview: null, session: null };
  const api = browserApi(request.signal);
  try {
    const preview = await api.previewInvitation({ body: parsed.data });
    const session = await api.getWebSession().catch(error => {
      if (error instanceof ApiClientError && error.status === 401) return null;
      throw error;
    });
    return { preview, session, error: null };
  } catch (error) {
    if (error instanceof ApiClientError && [404, 410].includes(error.status)) return { error: invitationMessage(error), preview: null, session: null };
    throw error;
  }
}
export async function action({ request, params }: ActionFunctionArgs) {
  const form = await request.formData(), mode = form.get("mode"), token = httpSchemas.InvitationToken.safeParse({ token: params.token });
  if (!token.success || !["session", "login", "register", "claim"].includes(String(mode))) return { error: "La invitación no está disponible." };
  const api = browserApi(request.signal);
  try {
    if (mode === "register" || mode === "claim") {
      const parsed = (mode === "claim" ? httpSchemas.InvitationClaim.shape.registration : httpSchemas.InvitationRegistration.shape.registration).safeParse(registration(form, mode === "claim"));
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del registro." };
      const accepted = mode === "claim" ? await api.claimInvitation({ body: { ...token.data, registration: parsed.data } }) : await api.registerInvitation({ body: { ...token.data, registration: parsed.data as Parameters<typeof api.registerInvitation>[0]["body"]["registration"] } });
      try { await api.webLogin({ body: { email: parsed.data.email, password: parsed.data.password } }); changedSession(); }
      catch { return { error: "Tu cuenta quedó activada. Inicia sesión desde el acceso habitual para entrar a tu grupo." }; }
      return redirectDocument(accepted.membership_status === "PENDING" ? "/welcome" : accepted.membership_status !== "ACTIVE" ? "/groups" : `/groups/${accepted.group_id}${mode === "claim" ? "/me/history" : ""}`);
    }
    if (mode === "login") {
      const parsed = httpSchemas.AuthLogin.safeParse({ email: form.get("email"), password: form.get("password") });
      if (!parsed.success) return { error: "Revisa tu email y contraseña." };
      await api.webLogin({ body: parsed.data }); changedSession();
    }
    const session = await api.getWebSession();
    if (!session.accepted) return redirectDocument("/accept-terms?return_to=" + encodeURIComponent(`/invitations/${params.token}`));
    const accepted = await api.acceptInvitation({ body: token.data });
    return redirectDocument(accepted.membership_status === "PENDING" ? "/welcome" : accepted.membership_status !== "ACTIVE" ? "/groups" : `/groups/${accepted.group_id}`);
  } catch (error) { return { error: invitationMessage(error) }; }
}
export function Component() {
  const { preview, session, error } = useLoaderData<typeof loader>(), data = useActionData() as { error: string } | undefined, nav = useNavigation();
  const [mode, setMode] = useState(preview?.managed_activation ? "claim" : session ? "session" : "login");
  return <Page><title>Aceptar invitación · Asisteam</title><Card><CardHeader><CardTitle as="h1">{preview?.managed_activation ? "Activar mi cuenta" : "Aceptar invitación"}</CardTitle>
    {preview && <p>{preview.managed_activation ? `Activa tu acceso personal a ${preview.group_name}. Conservarás tus grupos y tu historial de asistencia.` : `Te invitaron a ${preview.group_name} como ${MEMBERSHIP_ROLE_LABELS[preview.role]}.`}</p>}
  </CardHeader><CardContent className="space-y-4">
    {error ? <Alert>{error}</Alert> : <>
      {!preview?.managed_activation && <fieldset disabled={nav.state !== "idle"} className="flex flex-wrap gap-3"><legend>Cómo aceptar</legend>
        {([...(session ? ["session"] : []), "login", "register"]).map(value => <label key={value} className="flex min-h-control items-center gap-2"><input type="radio" name="accept-mode" value={value} checked={mode === value} onChange={() => setMode(value)} />{value === "session" ? "Usar mi sesión" : value === "login" ? "Ya tengo cuenta" : "Crear mi cuenta"}</label>)}
      </fieldset>}
      <Form method="post" className="space-y-4" key={mode}><input type="hidden" name="mode" value={mode} />
        {mode === "session" ? <p>Usar la sesión iniciada en este navegador.</p> : <CredentialsFields creating={mode === "register" || mode === "claim"} profile={mode === "register"} />}
        {data?.error && <Alert>{data.error}</Alert>}
        <Button busy={nav.state !== "idle"}>{mode === "claim" ? "Activar mi cuenta y ver mi historial" : mode === "register" ? "Activar cuenta y aceptar" : mode === "login" ? "Iniciar sesión y aceptar" : "Aceptar invitación"}</Button>
      </Form>
    </>}
    <p><Link to="/login" className="underline">Ir a iniciar sesión</Link></p>
  </CardContent></Card></Page>;
}
