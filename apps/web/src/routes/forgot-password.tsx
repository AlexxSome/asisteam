import { Link, useActionData, useLocation, useNavigation, type ActionFunctionArgs } from "react-router";
import { httpSchemas } from "@asisteam/core/browser";
import { actionMessage, browserApi } from "../api";
import { SubmissionForm, useFieldValidation, authPath, inviteCode } from "../auth-context";
import { Alert, Button, Field, Input, Page } from "../ui";
export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData(), parsed = httpSchemas.WebRecovery.safeParse({ email: form.get("email"), invite_code: inviteCode(new URL(request.url)) });
  if (!parsed.success) return { error: "Revisa tu email." };
  try { return await browserApi(request.signal).webRecovery({ body: parsed.data }); }
  catch (error) { return { error: actionMessage(error) }; }
}
export function Component() {
  const {errors,validation}=useFieldValidation();
  const data = useActionData() as { error?: string; message?: string } | undefined, nav = useNavigation(), location = useLocation(), url = new URL(location.pathname + location.search, window.location.origin);
  return <Page><title>Recuperar contraseña · Asisteam</title><h1>Recuperar contraseña</h1>
    {data?.message ? <><p role="status">{data.message}</p><p>Abre el enlace en este navegador o en otro dispositivo. Después inicia sesión con tu nueva contraseña.</p></> : <SubmissionForm method="post" className="space-y-4">{data?.error && <Alert>{data.error}</Alert>}
      <Field id="email" label="Email" error={errors.email}><Input {...validation("email")} name="email" type="email" autoComplete="email" maxLength={254} required /></Field><Button busy={nav.state !== "idle"}>Enviar instrucciones</Button></SubmissionForm>}
    <Link to={authPath("/login", url)} className="underline">Volver a iniciar sesión</Link>
  </Page>;
}
