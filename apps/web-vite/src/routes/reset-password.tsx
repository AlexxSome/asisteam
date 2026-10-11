import { useEffect } from "react";
import { Form, Link, useActionData, useLoaderData, useLocation, useNavigation, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { httpSchemas } from "@asisteam/core/browser";
import { actionMessage, browserApi } from "../api";
import { authPath, changedSession } from "../auth-context";
import { Alert, Button, Field, Input, Page } from "../ui";
export function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url), token = url.searchParams.getAll("token").length === 1 ? url.searchParams.get("token") : null;
  return { valid: httpSchemas.AuthReset.shape.token.safeParse(token).success };
}
export async function action({ request }: ActionFunctionArgs) {
  const url = new URL(request.url), form = await request.formData();
  const parsed = httpSchemas.AuthReset.safeParse({ token: url.searchParams.getAll("token").length === 1 ? url.searchParams.get("token") : null, password: form.get("password") });
  if (!parsed.success) return { error: "Revisa el enlace y la contraseña (10 a 128 caracteres)." };
  if (form.get("confirmPassword") !== parsed.data.password) return { error: "Las contraseñas no coinciden." };
  try { await browserApi(request.signal).webReset({ body: parsed.data }); changedSession(); return { success: true }; }
  catch (error) { return { error: actionMessage(error) }; }
}
export function Component() {
  const data = useActionData() as { error?: string; success?: boolean } | undefined, { valid } = useLoaderData<typeof loader>(), nav = useNavigation(), location = useLocation(), url = new URL(location.pathname + location.search, window.location.origin);
  useEffect(() => { if (data?.success) window.history.replaceState(window.history.state, "", authPath("/reset-password", url)); }, [data?.success, location.key]);
  return <Page><title>Restablecer contraseña · Asisteam</title><h1>Restablecer contraseña</h1>
    {data?.success ? <p role="status">Tu contraseña fue actualizada. Ya puedes iniciar sesión con ella.</p> : !valid ? <Alert>El enlace es inválido o está incompleto. Solicita uno nuevo.</Alert> : <Form method="post" className="space-y-4">
      {data?.error && <Alert>{data.error}</Alert>}
      <Field id="password" label="Nueva contraseña" help="Entre 10 y 128 caracteres."><Input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></Field>
      <Field id="confirmPassword" label="Confirmar nueva contraseña"><Input name="confirmPassword" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></Field>
      <Button busy={nav.state !== "idle"}>Guardar nueva contraseña</Button>
    </Form>}
    <Link to={authPath("/login", url)} className="underline">Iniciar sesión</Link><p><Link to={authPath("/forgot-password", url)} className="underline">Solicitar un nuevo enlace</Link></p>
  </Page>;
}
