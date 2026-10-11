import { useEffect } from "react";
import { Link, useRouteLoaderData, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { httpSchemas, MEMBERSHIP_ROLE_LABELS } from "@asisteam/core/browser";
import { browserApi, requireSession, sessionError } from "../api";
import { Page } from "../ui";
export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireSession(request);
  const parsed = httpSchemas.GroupParams.safeParse(params);
  if (!parsed.success) throw new Response(null, { status: 404 });
  try {
    return await browserApi(request.signal).getGroup({ params: parsed.data });
  } catch (error) {
    return sessionError(error, request);
  }
}
export function Component() {
  const group = useLoaderData<typeof loader>();
  const session = useRouteLoaderData("private") as Awaited<ReturnType<typeof requireSession>>;
  useEffect(() => {
    document.cookie = `asisteam-group-${session.user_id}=${group.id}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  }, [group.id, session.user_id]);
  return (
    <Page>
      <title>Grupo · Asisteam</title>
      <h1>{group.name}</h1>
      <p>{group.sport}</p>
      <p className="text-small text-neutral">
        Roles:{" "}
        {group.roles.map((role) => MEMBERSHIP_ROLE_LABELS[role]).join(", ")}
      </p>
      {group.description && <p>{group.description}</p>}
      <Link to="/groups" className="text-primary underline">
        Cambiar grupo
      </Link>
    </Page>
  );
}
