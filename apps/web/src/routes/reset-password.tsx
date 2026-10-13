import { AuthPage } from "../components/auth-page";
import { useEffect } from "react";
import { Link, useActionData, useLoaderData, useLocation, useNavigation, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { httpSchemas } from "@asisteam/core/browser";
import { actionMessage, browserApi } from "../api";
import { SubmissionForm, useFieldValidation, authPath, changedSession } from "../auth-context";
import {PasswordInput} from "../components/ui/password-input";
import { Alert, Button, Field } from "../ui";
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
  const {errors,validation}=useFieldValidation();
  const data = useActionData() as { error?: string; success?: boolean } | undefined, { valid } = useLoaderData<typeof loader>(), nav = useNavigation(), location = useLocation(), url = new URL(location.pathname + location.search, window.location.origin);
  useEffect(() => { if (data?.success) window.history.replaceState(window.history.state, "", authPath("/reset-password", url)); }, [data?.success, location.key]);
  return <AuthPage title="Restablecer contraseña" description="Elige una nueva contraseña para tu cuenta."><title>Restablecer contraseña · Asisteam</title>
    {data?.success ? <p role="status">Tu contraseña fue actualizada. Ya puedes iniciar sesión con ella.</p> : !valid ? <Alert>El enlace es inválido o está incompleto. Solicita uno nuevo.</Alert> : <SubmissionForm method="post" className="space-y-4">
      {data?.error && <Alert>{data.error}</Alert>}
      <Field id="password" label="Nueva contraseña" error={errors.password} help="Entre 10 y 128 caracteres."><PasswordInput {...validation("password")} visibilityLabel="nueva contraseña" name="password" autoComplete="new-password" minLength={10} maxLength={128} required /></Field>
      <Field id="confirmPassword" label="Confirmar nueva contraseña" error={errors.confirmPassword}><PasswordInput {...validation("confirmPassword")} visibilityLabel="confirmación de contraseña" name="confirmPassword" autoComplete="new-password" minLength={10} maxLength={128} required /></Field>
      <Button busy={nav.state !== "idle"}>Guardar nueva contraseña</Button>
    </SubmissionForm>}
    <Link to={authPath("/login", url)} className="underline">Iniciar sesión</Link><p><Link to={authPath("/forgot-password", url)} className="underline">Solicitar un nuevo enlace</Link></p>
  </AuthPage>;
}
