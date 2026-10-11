import {
  ACCOUNT_TERMS_VERSION,
  accountConsentSchema,
} from "@asisteam/core/browser";
import {
  Form,
  redirect,
  useActionData,
  useNavigation,
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
import { Alert, Button, Page } from "../ui";
import { Notice } from "./legal";
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
    <Page>
      <title>Revisa las condiciones · Asisteam</title>
      <h1>Revisa las condiciones de uso y privacidad</h1>
      <Notice />
      <Form method="post" className="space-y-4">
        {data?.error && <Alert>{data.error}</Alert>}
        <input
          type="hidden"
          name="terms_version"
          value={ACCOUNT_TERMS_VERSION}
        />
        <label className="flex min-h-control items-center gap-3">
          <input type="checkbox" name="terms_accepted" required />
          Acepto las condiciones de uso y privacidad
        </label>
        <Button busy={nav.state !== "idle"}>Aceptar y continuar</Button>
      </Form>
    </Page>
  );
}
