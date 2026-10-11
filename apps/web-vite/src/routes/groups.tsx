import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { browserApi, requireSession, sessionError } from "../api";
import { Card, CardContent, CardHeader, CardTitle, Page } from "../ui";
export async function loader({ request }: LoaderFunctionArgs) {
  await requireSession(request);
  try {
    return await browserApi(request.signal).listMyGroups({
      query: { page: 1, page_size: 50 },
    });
  } catch (error) {
    return sessionError(error, request);
  }
}
export function Component() {
  const groups = useLoaderData<typeof loader>();
  return (
    <Page>
      <title>Mis grupos · Asisteam</title>
      <h1>Mis grupos</h1>
      {groups.data.length === 0 ? (
        <p>Aún no perteneces a un grupo.</p>
      ) : (
        <ul className="space-y-4">
          {groups.data.map((group) => (
            <li key={group.id}>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <Link
                      to={"/groups/" + group.id}
                      className="text-primary underline"
                    >
                      {group.name}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p>{group.sport}</p>
                  <p className="text-small text-neutral">
                    Roles: {group.roles.join(", ")}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
