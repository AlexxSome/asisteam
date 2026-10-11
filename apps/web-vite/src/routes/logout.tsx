import { redirectDocument, type ActionFunctionArgs } from "react-router";
import { changedSession } from "../session-events";
import { actionMessage, browserApi } from "../api";
import { Alert, Page } from "../ui";
import { useActionData } from "react-router";
export function loader() {
  return null;
}
export async function action({ request }: ActionFunctionArgs) {
  try {
    await browserApi(request.signal).webLogout({ body: {} });
    changedSession();
    return redirectDocument("/login");
  } catch (error) {
    return { error: actionMessage(error) };
  }
}
export function Component() {
  const data = useActionData() as { error: string } | undefined;
  return (
    <Page>
      <h1>Cerrar sesión</h1>
      <Alert>{data?.error ?? "Vuelve a intentar cerrar sesión."}</Alert>
    </Page>
  );
}
