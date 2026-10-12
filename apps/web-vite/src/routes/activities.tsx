import { useLoaderData,type LoaderFunctionArgs } from "react-router";
import { browserApi,sessionError } from "../api";
import { groupData } from "../group-data";
import { httpSchemas } from "@asisteam/core/browser";
import { Page,ActionLink } from "../ui";
import { ActivityAgenda,ActivityPeriodLinks } from "../components/activity-agenda";
import { EmptyState } from "../../../web/src/components/ui/empty-state";
export async function loader({request,params}:LoaderFunctionArgs){
 const group=await groupData(request,params.groupId),query=new URL(request.url).searchParams;
 const filter=httpSchemas.GroupActivityQuery.safeParse({page:query.has("page")?Number(query.get("page")):1,period:query.get("period")??"upcoming"});
 if(!filter.success || query.getAll("page").length>1 || query.getAll("period").length>1)throw new Response(null,{status:404});
 try{return {group,...filter.data,...await browserApi(request.signal).listGroupActivities({params:{groupId:group.id},query:filter.data})};}catch(error){return sessionError(error,request);}
}
export function Component(){const {group,page,period,activities,hasNext}=useLoaderData<typeof loader>(),base=`/groups/${group.id}/activities`;
 return <Page><div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-2xl font-semibold">Actividades</h1>{group.access === "admin"&&<div className="flex flex-wrap gap-4"><ActionLink href={`/groups/${group.id}/activity-types`}>Tipos de actividad</ActionLink><ActionLink href={`${base}/new?from=group&period=${period}&page=${page}`} variant="primary">Crear actividad</ActionLink></div>}</div>
 <ActivityPeriodLinks path={base} period={period} label="Período de actividades"/><ActionLink href="/groups#agenda">Mi agenda de todos los grupos</ActionLink><p className="text-sm text-muted-foreground">Horarios de Chile · America/Santiago</p>
 {activities.length?<ActivityAgenda activities={activities} page={page} period={period} context={{from:"group"}}/>:<EmptyState title={page>1?"No hay actividades en esta página":period==="upcoming"?"No hay próximas actividades":"No hay actividades pasadas"} action={page>1?<ActionLink href={`${base}?period=${period}`}>Volver a la primera página</ActionLink>:<>{group.access === "admin"&&<ActionLink href={`${base}/new?from=group&period=${period}&page=${page}`} variant="primary">Crear actividad</ActionLink>}<ActionLink href={`${base}?period=${period==="upcoming"?"past":"upcoming"}`}>{period==="upcoming"?"Ver actividades pasadas":"Ver próximas actividades"}</ActionLink></>}>Las actividades del período seleccionado aparecerán aquí.</EmptyState>}
 <nav aria-label="Páginas de actividades" className="flex gap-3">{page>1&&<ActionLink href={`${base}?period=${period}&page=${page-1}`}>Anterior</ActionLink>}{hasNext&&<ActionLink href={`${base}?period=${period}&page=${page+1}`}>Siguiente</ActionLink>}</nav></Page>;
}
