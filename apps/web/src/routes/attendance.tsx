import { useLoaderData,type LoaderFunctionArgs,useRevalidator } from "react-router";
import { canManageAttendance,activityTypeLabel,formatActivityDateTime,type AttendanceRosterRow } from "@asisteam/core/browser";
import { browserApi,sessionError } from "../api";
import { groupData } from "../group-data";
import { activityData,queryObject } from "../activity-data";
import { activityReturnQuery,activityReturnLink } from "../lib/group-routing";
import { ActionLink,Alert,Button } from "../ui";
import { AttendanceSheet } from "../components/attendance-sheet";
import { EmptyState } from "../../src/components/ui/empty-state";
export async function loader({request,params}:LoaderFunctionArgs){
 const group=await groupData(request,params.groupId);
 if(!canManageAttendance(group.roles))throw new Response(null,{status:403});
 try{
 const activity=await activityData(request,group.id,params.activityId),api=browserApi(request.signal),roster:AttendanceRosterRow[]=[];let canEditNotes=false;
 for(let page=1;;page++){const result=await api.getAttendanceRoster({params:{groupId:group.id,activityId:activity.id},query:{page}});roster.push(...result.roster);canEditNotes=result.canEditNotes;if(!result.hasNext)break;}
 return {groupId:group.id,groupName:group.name,activity,roster,canEditNotes,loadedAt:Date.now(),query:queryObject(request)};
 }catch(error){return sessionError(error,request);}
}
export function Component(){const {groupId,groupName,activity,roster,canEditNotes,loadedAt,query}=useLoaderData<typeof loader>(),revalidator=useRevalidator();
 const back=activityReturnLink(groupId,query);
 return <div className="mx-auto w-full max-w-5xl"><div className="space-y-3"><ActionLink href={`/groups/${groupId}/activities/${activity.id}${activityReturnQuery(query)}`}>Volver a la actividad</ActionLink><header className="min-w-0 space-y-1"><h1 className="text-h1 [overflow-wrap:anywhere]">Tomar asistencia</h1><p className="font-semibold [overflow-wrap:anywhere]">{activity.title}</p><p className="text-small text-muted-foreground">{formatActivityDateTime(activity.starts_at)} · Chile</p></header>
 {Date.parse(activity.starts_at)-Date.now()>7200000&&<Alert tone="warning">Esta actividad aún no comienza; puedes registrar asistencia anticipada.</Alert>}
 {roster.length?<AttendanceSheet key={`${groupId}:${activity.id}:${loadedAt}`} groupId={groupId} activityId={activity.id} initialRows={roster} canEditNotes={canEditNotes}/>:<EmptyState title="Aún no hay deportistas para tomar asistencia" action={canEditNotes?<><ActionLink href={`/groups/${groupId}/members/new`} variant="primary">Agregar deportista</ActionLink><ActionLink href={`/groups/${groupId}/invitations/new`}>Invitar por email</ActionLink><ActionLink href={`/groups/${groupId}/members/pending`}>Revisar pendientes</ActionLink></>:<ActionLink href={`/groups/${groupId}/activities/${activity.id}`}>Volver a la actividad</ActionLink>}>Este grupo aún no tiene deportistas activos.</EmptyState>}
 <section aria-label="Contexto y actualización" className="space-y-2 rounded-lg border bg-surface p-3">
 <p className="[overflow-wrap:anywhere] text-small">{groupName} · {activityTypeLabel(activity.activity_type_name,activity.is_system_type)} · {activity.location || "Lugar por confirmar"}</p>
 <Button variant="secondary" busy={revalidator.state!=="idle"} onClick={()=>void revalidator.revalidate()}>Actualizar asistencia</Button>
 <ActionLink href={back.href}>{back.label}</ActionLink><ActionLink href={`/groups/${groupId}`}>Inicio del grupo</ActionLink>
 </section></div></div>;
}
