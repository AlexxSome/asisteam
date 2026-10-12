import { Link, redirectDocument, useActionData, useLoaderData, useLocation, useNavigation, type ActionFunctionArgs } from "react-router";
import {ApiClientError} from "@asisteam/api-client";
import { httpSchemas } from "@asisteam/core/browser";
import { actionMessage, browserApi } from "../api";
import { SubmissionForm, authPath, changedSession, CredentialsFields, destination, registration, SocialButtons } from "../auth-context";
import { Alert, Button, Card, CardHeader, CardContent, CardTitle, Page } from "../ui";
import { loader, socialAction } from "./login";
export { loader,shouldRevalidate } from "./login";
export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  if (form.has("provider")) return socialAction(request, form);
  const parsed = httpSchemas.AuthRegister.safeParse(registration(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del registro." };
  try {
    await browserApi(request.signal).webRegister({ body: parsed.data });
    changedSession();
    const url = new URL(request.url);
    return redirectDocument(url.searchParams.has("return_to") || url.searchParams.has("invite_code") ? destination(url) : "/welcome");
  } catch (error) { return { error: error instanceof ApiClientError && error.status<500 ? "No pudimos crear tu cuenta. Revisa los datos y la contraseña o inicia sesión si ya tienes acceso." : actionMessage(error) }; }
}
export function Component() {
  const data = useActionData() as { error: string } | undefined, nav = useNavigation(), { providers } = useLoaderData<typeof loader>();
  const location = useLocation(), url = new URL(location.pathname + location.search, window.location.origin);
  return <Page><title>Crear cuenta · Asisteam</title><Card><CardHeader><CardTitle as="h1">Crear cuenta</CardTitle></CardHeader><CardContent className="space-y-4">
    {data?.error && <Alert>{data.error}</Alert>}<SocialButtons providers={providers} />
    <SubmissionForm method="post" className="space-y-4"><CredentialsFields creating profile /><Button busy={nav.state !== "idle"}>Crear cuenta</Button></SubmissionForm>
    <p><Link to={authPath("/login", url)} className="underline">Ya tengo cuenta</Link></p>
  </CardContent></Card></Page>;
}
