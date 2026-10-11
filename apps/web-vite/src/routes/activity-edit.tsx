import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { RouterLink as Link } from "../navigation";
import { Page, ActionLink } from "../ui";
import { browserApi, sessionError } from "../api";
import { groupData } from "../group-data";
import { activityTypeLabel, canManageAttendance, activityDateTimeInput, activityRecurrenceSummary, formatActivityDateTime } from "@asisteam/core/browser";
import { activityReturnLink, activityReturnQuery } from "../../../web/src/lib/group-routing";
import { queryObject, allTypes, activityData } from "../activity-data";
import { ActivityForm } from "../components/activity-form";
export async function loader({request,params}:LoaderFunctionArgs){
 const group=await groupData(request,params.groupId,true);
 try {
  const types=await allTypes(request,group.id),query=queryObject(request);
  const activity=params.activityId?await activityData(request,group.id,params.activityId):null;
  if(activity && !types.some(type=>type.id===activity.activity_type_id))types.push({id:activity.activity_type_id,name:activity.activity_type_name,group_id:activity.is_system_type?null:group.id,color:activity.activity_type_color,is_active:false});
  return {group,types,query,activity};
 }catch(error){return sessionError(error,request);}
}
export function Component(){
 const {group,types,query,activity}=useLoaderData<typeof loader>(),groupId=group.id;
 const detailQuery=activityReturnQuery(query),back=activityReturnLink(groupId,query);
 const returnHref=activity?`/groups/${groupId}/activities/${activity.id}${detailQuery}`:back.href;
 return <Page><Link href={returnHref} className="inline-flex min-h-11 items-center underline">{activity?"Volver a la actividad":"Volver a actividades"}</Link>
 <h1 className="text-2xl font-semibold">{activity?"Editar actividad":"Crear actividad"}</h1>
 {!activity && <Link href={`/groups/${groupId}/activity-types`} className="inline-block underline">Gestionar tipos de actividad</Link>}
 <ActivityForm key={`${groupId}:${activity?.id??"new"}`} groupId={groupId} types={types} returnHref={returnHref} detailQuery={detailQuery} agendaHref={back.href}
 activity={activity?{id:activity.id,recurring:!!activity.recurrence_rule,recurrenceSummary:activityRecurrenceSummary(activity.recurrence_rule),values:{title:activity.title,activity_type_id:activity.activity_type_id,description:activity.description??"",location:activity.location??"",starts_at:activityDateTimeInput(activity.starts_at),ends_at:activityDateTimeInput(activity.ends_at)}}:undefined}/></Page>;
}
