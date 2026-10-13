import { MEMBERSHIP_ROLE_LABELS } from "@asisteam/core/browser";
import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { browserApi, requireSession, sessionError } from "../api";
import { ActivityAgenda, ActivityPeriodLinks } from "../components/activity-agenda";
import { ActionLink, Page } from "../ui";
import { PageHeader } from "../components/ui/page-header";
import { GroupLogo } from "../components/app-shell";
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
  return <Page className="max-w-7xl px-0 py-0 md:px-0 [overflow-wrap:anywhere]">
    <title>Mis grupos · Asisteam</title>
    <PageHeader title="Mis grupos" description="Elige un grupo para consultar sus actividades y las tareas disponibles para tus roles.">
      <nav aria-label="Acciones de mis grupos" className="flex flex-wrap gap-3 pt-2">
        <ActionLink href="/groups/new" variant="secondary">Crear un grupo</ActionLink>
        <ActionLink href="/join" variant="secondary">Unirme con código</ActionLink>
      </nav>
    </PageHeader>
    {groups.data.length === 0 ? <section className="space-y-3 rounded-lg border border-border bg-surface p-4 md:p-6">
      <h2>Aún no perteneces a un grupo.</h2><p>Crea tu grupo o usa el código compartido por un administrador. Si tienes una solicitud pendiente, revisa sus próximos pasos.</p>
      <ActionLink href="/welcome">Revisar mi primer uso</ActionLink>
    </section> : <ul className="grid gap-4 md:grid-cols-2">
      {groups.data.map(group => <li key={group.id} className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-4 md:p-6">
        <div className="flex min-w-0 items-start gap-3"><GroupLogo src={group.logo_url} name={group.name}/><div className="min-w-0 space-y-1"><h2 className="text-h2">{group.name}</h2><p className="text-small text-muted-foreground">{group.sport}</p></div></div>
        <p className="text-small">Roles: {group.roles.map(role => MEMBERSHIP_ROLE_LABELS[role]).join(" · ")}</p>
        <ActionLink href={"/groups/" + group.id} variant="secondary" className="mt-auto self-start" aria-label={`Abrir grupo · ${group.name}`}>Abrir grupo</ActionLink>
      </li>)}
    </ul>}
    <section id="agenda" aria-labelledby="agenda-title" className="space-y-4 border-t border-border pt-6">
      <h2 id="agenda-title" className="text-h2">Mi agenda global</h2><p className="text-small text-muted-foreground">Actividades de todos tus grupos · Horarios de Chile · America/Santiago. Cada actividad conserva su grupo; no se combinan métricas.</p>
      <div className="rounded-lg border border-border bg-surface p-4"><ActivityPeriodLinks path="/groups" period={groups.period} label="Período de mi agenda" anchor="#agenda"/></div>
      {groups.agenda.activities.length ? <ActivityAgenda activities={groups.agenda.activities} page={groups.page} period={groups.period} context={{from:"agenda"}}/> : <p className="rounded-lg border border-border bg-surface p-4">No hay actividades en este período.</p>}
      <nav aria-label="Páginas de mi agenda" className="flex flex-wrap gap-3">{groups.page>1 && <ActionLink href={`/groups?period=${groups.period}&page=${groups.page-1}#agenda`} variant="secondary">Anterior</ActionLink>}{groups.agenda.hasNext && <ActionLink href={`/groups?period=${groups.period}&page=${groups.page+1}#agenda`} variant="secondary">Siguiente</ActionLink>}</nav>
    </section>
    <nav aria-label="Cuenta" className="flex flex-wrap gap-3 border-t border-border pt-4"><ActionLink href="/profile">Mi perfil</ActionLink><ActionLink href="/profile#privacy">Consultar ayuda y soporte</ActionLink></nav>
  </Page>;
}
