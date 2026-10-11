import {
  Form,
  Link,
  redirect,
  redirectDocument,
  useActionData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { loginSchema } from "@asisteam/core/browser";
import { ApiClientError } from "@asisteam/api-client";
import { actionMessage, browserApi, safeReturn } from "../api";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Page,
} from "../ui";
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const session = await browserApi(request.signal).getWebSession();
    return redirect(
      session.accepted
        ? safeReturn(new URL(request.url).searchParams.get("return_to"))
        : "/accept-terms",
    );
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null;
    throw error;
  }
}
export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Revisa tu email y contraseña." };
  try {
    await browserApi(request.signal).webLogin({ body: parsed.data });
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("asisteam-web-session");
      channel.postMessage("changed");
      channel.close();
    }
    return redirectDocument(
      safeReturn(new URL(request.url).searchParams.get("return_to")),
    );
  } catch (error) {
    return { error: actionMessage(error) };
  }
}
export function Component() {
  const data = useActionData() as { error: string } | undefined,
    navigation = useNavigation();
  return (
    <Page>
      <title>Iniciar sesión · Asisteam</title>
      <Card>
        <CardHeader>
          <p className="text-h2 text-primary">Asisteam</p>
          <CardTitle as="h1">Iniciar sesión</CardTitle>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            {data?.error && <Alert>{data.error}</Alert>}
            <Field id="email" label="Email">
              <Input
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
              />
            </Field>
            <Field id="password" label="Contraseña">
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </Field>
            <Button busy={navigation.state !== "idle"}>
              {navigation.state === "submitting" ? "Ingresando…" : "Ingresar"}
            </Button>
          </Form>
        </CardContent>
      </Card>
      <p>
        <Link to="/legal/2026-09-21" className="text-primary underline">
          Condiciones de uso y privacidad
        </Link>
      </p>
    </Page>
  );
}
