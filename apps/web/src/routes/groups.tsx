import { MEMBERSHIP_ROLE_LABELS } from "@asisteam/core/browser";
import { Link, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { browserApi, requireSession, sessionError } from "../api";
import { ActivityAgenda, ActivityPeriodLinks } from "../components/activity-agenda";
import { Card, CardContent, CardHeader, CardTitle, Page } from "../ui";
export async function loader({ request }: LoaderFunctionArgs) {
  await requireSession(request);
  try {
    const api=browserApi(request.signal),groups=await api.listMyGroups({query:{page:1,page_size:100}});
    const url=new URL(request.url),page=Number(url.searchParams.get("page")??1),period=url.searchParams.get("period")??"upcoming";
    if(!Number.isSafeInteger(page)||page<1||page>1000000||!["upcoming","past"].includes(period))throw new Response(null,{status:404});
    const selected=period as "upcoming"|"past";
    const agenda=groups.data.length?await api.listActivities({query:{group_ids:groups.data.map(group=>group.id).join(","),page,period:selected}}):{activities:[],hasNext:false};
    const names=new Map(groups.data.map(group=>[group.id,group.name]));
    return {...groups,page,period:selected,agenda:{...agenda,activities:agenda.activities.map(activity=>({...activity,group_name:names.get(activity.group_id)}))}};
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
                    Roles:{" "}
                    {group.roles
                      .map((role) => MEMBERSHIP_ROLE_LABELS[role])
                      .join(", ")}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <section id="agenda" aria-labelledby="agenda-title" className="space-y-4"><h2 id="agenda-title">Mi agenda global</h2><p>Actividades de todos tus grupos · Horarios de Chile · America/Santiago</p><ActivityPeriodLinks path="/groups" period={groups.period} label="Período de mi agenda" anchor="#agenda"/>{groups.agenda.activities.length?<ActivityAgenda activities={groups.agenda.activities} page={groups.page} period={groups.period} context={{from:"agenda"}}/>:<p>No hay actividades en este período.</p>}<nav aria-label="Páginas de mi agenda">{groups.page>1 && <Link to={`/groups?period=${groups.period}&page=${groups.page-1}#agenda`} className="inline-flex min-h-11 items-center underline">Anterior</Link>}{groups.agenda.hasNext && <Link to={`/groups?period=${groups.period}&page=${groups.page+1}#agenda`} className="inline-flex min-h-11 items-center underline">Siguiente</Link>}</nav></section>
      <nav aria-label="Cuenta" className="flex flex-wrap gap-5"><Link to="/groups/new" className="min-h-11 underline">Crear un grupo</Link><Link to="/join" className="min-h-11 underline">Unirme con código</Link><Link to="/profile" className="min-h-11 underline">Mi perfil</Link></nav>
    </Page>
  );
}
