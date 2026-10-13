import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { RouterLink as Link } from "../navigation";
import { Page, ActionLink } from "../ui";
import { browserApi, sessionError } from "../api";
import { groupData } from "../group-data";
import { activityTypeLabel, canManageAttendance, activityDateTimeInput, activityRecurrenceSummary, formatActivityDateTime } from "@asisteam/core/browser";
import { activityReturnLink, activityReturnQuery } from "../../src/lib/group-routing";
import { queryObject, allTypes, activityData } from "../activity-data";
import { PageHeader } from "../components/ui/page-header";
import { ActivityDateMark } from "../components/activity-date-mark";
export async function loader({request,params}:LoaderFunctionArgs){
 const group=await groupData(request,params.groupId);
 try { const activity=await activityData(request,group.id,params.activityId);return {groupId:group.id,activityId:activity.id,activity,group,query:queryObject(request)}; }catch(error){return sessionError(error,request);}
}
export function Component(){
 const {groupId,activityId,activity,group,query}=useLoaderData<typeof loader>();
 const back=activityReturnLink(groupId,query);
  return <Page className="max-w-7xl px-0 py-0 md:px-0">
    <nav aria-label="Regreso de actividad" className="flex flex-wrap gap-2"><ActionLink href={back.href}>{back.label}</ActionLink><ActionLink href={`/groups/${groupId}`}>Inicio del grupo</ActionLink></nav>
    <div className="flex min-w-0 items-start gap-3"><ActivityDateMark startsAt={activity.starts_at}/><PageHeader title={activity.title} description={group.name}>
    {canManageAttendance(group.roles) && <ActionLink href={`/groups/${groupId}/activities/${activityId}/attendance${activityReturnQuery(query)}`} variant="primary">Tomar asistencia</ActionLink>}
    </PageHeader></div>
    <section aria-label="Información de la actividad" className="min-w-0 space-y-4 rounded-lg border bg-surface p-4 md:p-6">
    {activity.recurrence_rule && <p className="text-small text-muted-foreground">{activityRecurrenceSummary(activity.recurrence_rule)}</p>}
    <p className="flex items-center gap-2"><span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: activity.activity_type_color ?? undefined }} />{activityTypeLabel(activity.activity_type_name ?? "", !!activity.is_system_type)}</p>
    <dl className="grid gap-4 sm:grid-cols-2">
      <div><dt className="font-medium">Inicio</dt><dd>{activity.starts_at && formatActivityDateTime(activity.starts_at)}</dd></div>
      <div><dt className="font-medium">Término</dt><dd>{activity.ends_at && formatActivityDateTime(activity.ends_at)}</dd></div>
      <div><dt className="font-medium">Zona horaria</dt><dd>Chile · America/Santiago</dd></div>
      <div><dt className="font-medium">Lugar</dt><dd className="break-words">{activity.location || "Lugar por confirmar"}</dd></div>
    </dl>
    {activity.description && <p className="whitespace-pre-wrap break-words">{activity.description}</p>}
    </section>
    {(group.roles.includes("ATHLETE") || group.roles.includes("GUARDIAN")) && <section aria-labelledby="activity-history" className="space-y-3 rounded-lg border p-4">
      <h2 id="activity-history" className="text-lg font-semibold">Consultar asistencia</h2>
      <p className="text-sm text-muted-foreground">Revisa el estado y las notas autorizadas en el historial de este grupo.</p>
      <div className="flex flex-wrap gap-4">
        {group.roles.includes("ATHLETE") && <Link className="inline-flex min-h-11 items-center underline" href={`/groups/${groupId}/me/history`}>Ver mi historial de asistencia</Link>}
        {group.roles.includes("GUARDIAN") && <Link className="inline-flex min-h-11 items-center underline" href={query?.from === "wards" && back.href.startsWith("/wards/")
          ? `/groups/${groupId}/wards/${query.ward}/history` : "/wards"}>{query?.from === "wards" && back.href.startsWith("/wards/") ? "Ver historial de mi pupilo" : "Elegir pupilo y ver su historial"}</Link>}
      </div>
    </section>}
    {group.access === "admin" && <section aria-label="Gestionar esta actividad" className="rounded-lg border bg-surface p-4"><div className="flex flex-wrap gap-3">
      <ActionLink href={`/groups/${groupId}/activities/${activityId}/edit${activityReturnQuery(query)}`} variant="secondary">Editar actividad</ActionLink>
      <ActionLink href={`/groups/${groupId}/activities/${activityId}/qr`} variant="secondary">Mostrar QR de asistencia</ActionLink>
    </div></section>}
  </Page>;
}
