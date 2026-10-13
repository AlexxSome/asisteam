import { AuthPage } from "../components/auth-page";
import {
  ACCOUNT_TERMS_VERSION,
  accountConsentSchema,
} from "@asisteam/core/browser";
import {
  Form,
  redirect,
  useActionData,
  useNavigation,
  Link,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import {
  actionMessage,
  browserApi,
  requireSession,
  safeReturn,
  sessionError,
} from "../api";
import { Alert, Button } from "../ui";
import { Notice } from "./legal";
import {SubmissionForm,TermsField} from "../auth-context";
export async function loader({ request }: LoaderFunctionArgs) {
  const session = await requireSession(request, false);
  return session.accepted
    ? redirect(safeReturn(new URL(request.url).searchParams.get("return_to")))
    : null;
}
export async function action({ request }: ActionFunctionArgs) {
  await requireSession(request, false);
  const form = await request.formData();
  const parsed = accountConsentSchema.safeParse({
    terms_accepted: form.get("terms_accepted") === "on",
    terms_version: form.get("terms_version"),
  });
  if (!parsed.success)
    return { error: "Debes aceptar las condiciones de uso y privacidad." };
  try {
    await browserApi(request.signal).acceptAccountTerms({ body: parsed.data });
    return redirect(
      safeReturn(new URL(request.url).searchParams.get("return_to")),
    );
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 401)
      return sessionError(error, request);
    return { error: actionMessage(error) };
  }
}
export function Component() {
  const data = useActionData() as { error: string } | undefined,
    nav = useNavigation();
  return (
    <AuthPage title="Revisa las condiciones de uso y privacidad">
      <title>Revisa las condiciones · Asisteam</title>
      <p>Antes de aceptar, abre las <Link to={`/legal/${ACCOUNT_TERMS_VERSION}#condiciones`} target="_blank" rel="noopener noreferrer">condiciones de uso</Link> y el <Link to={`/legal/${ACCOUNT_TERMS_VERSION}#privacidad`} target="_blank" rel="noopener noreferrer">aviso de privacidad</Link>.</p>
      <Notice />
      <SubmissionForm method="post" className="space-y-4">
        {data?.error && <Alert>{data.error}</Alert>}
        <TermsField legalLink={false}/>
        <Button busy={nav.state !== "idle"}>Aceptar y continuar</Button>
      </SubmissionForm>
      <Form method="post" action="/logout"><Button variant="secondary" busy={nav.state!=="idle"}>Salir sin aceptar</Button></Form>
    </AuthPage>
  );
}
