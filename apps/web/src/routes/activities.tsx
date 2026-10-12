import { useLoaderData,type LoaderFunctionArgs } from "react-router";
import { browserApi,sessionError } from "../api";
import { groupData } from "../group-data";
import { canManageAttendance, httpSchemas } from "@asisteam/core/browser";
import { Page,ActionLink } from "../ui";
import { ActivityAgenda,ActivityPeriodLinks } from "../components/activity-agenda";
import { EmptyState } from "../../src/components/ui/empty-state";
import { PageHeader } from "../components/ui/page-header";
export async function loader({request,params}:LoaderFunctionArgs){
 const group=await groupData(request,params.groupId),query=new URL(request.url).searchParams;
 const filter=httpSchemas.GroupActivityQuery.safeParse({page:query.has("page")?Number(query.get("page")):1,period:query.get("period")??"upcoming"});
 if(!filter.success || query.getAll("page").length>1 || query.getAll("period").length>1)throw new Response(null,{status:404});
 try{return {group,...filter.data,...await browserApi(request.signal).listGroupActivities({params:{groupId:group.id},query:filter.data})};}catch(error){return sessionError(error,request);}
}
export function Component(){const {group,page,period,activities,hasNext}=useLoaderData<typeof loader>(),base=`/groups/${group.id}/activities`;
 return <Page className="max-w-7xl px-0 py-0 md:px-0"><PageHeader title="Actividades" description={`${group.name} · Horarios de Chile (America/Santiago)`}>
 {group.access === "admin"&&<ActionLink href={`${base}/new?from=group&period=${period}&page=${page}`} variant="primary">Crear actividad</ActionLink>}</PageHeader>
 <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-surface p-3"><ActivityPeriodLinks path={base} period={period} label="Período de actividades"/><ActionLink href="/groups#agenda">Mi agenda de todos los grupos</ActionLink></div>
 {activities.length?<ActivityAgenda activities={activities} page={page} period={period} context={{from:"group"}} canTakeAttendance={canManageAttendance(group.roles)}/>:<EmptyState title={page>1?"No hay actividades en esta página":period==="upcoming"?"No hay próximas actividades":"No hay actividades pasadas"} action={page>1?<ActionLink href={`${base}?period=${period}`}>Volver a la primera página</ActionLink>:<>{group.access === "admin"&&<ActionLink href={`${base}/new?from=group&period=${period}&page=${page}`} variant="primary">Crear actividad</ActionLink>}<ActionLink href={`${base}?period=${period==="upcoming"?"past":"upcoming"}`}>{period==="upcoming"?"Ver actividades pasadas":"Ver próximas actividades"}</ActionLink></>}>Las actividades del período seleccionado aparecerán aquí.</EmptyState>}
 <nav aria-label="Páginas de actividades" className="flex gap-3">{page>1&&<ActionLink href={`${base}?period=${period}&page=${page-1}`}>Anterior</ActionLink>}{hasNext&&<ActionLink href={`${base}?period=${period}&page=${page+1}`}>Siguiente</ActionLink>}</nav>
 {group.access === "admin"&&<details className="rounded-lg border bg-surface p-3"><summary className="min-h-11 cursor-pointer py-2 font-semibold">Gestión de actividades</summary><ActionLink href={`/groups/${group.id}/activity-types`}>Tipos de actividad</ActionLink></details>}</Page>;
}
