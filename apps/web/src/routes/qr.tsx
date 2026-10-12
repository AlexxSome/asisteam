import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { formatActivityDateTime } from "@asisteam/core/browser";
import { Page, ActionLink } from "../ui";
import { groupData } from "../group-data";
import { activityData } from "../activity-data";
import { browserApi, sessionError } from "../api";
import { QrDisplay } from "../components/qr-display";
export async function loader({request,params}:LoaderFunctionArgs){
 const group=await groupData(request,params.groupId,true);
 try {const [activity,settings]=await Promise.all([activityData(request,group.id,params.activityId),browserApi(request.signal).getQrSettings({params:{groupId:group.id}})]);return {group,activity,settings};}catch(error){return sessionError(error,request);}
}
export function Component(){
 const {group,activity,settings}=useLoaderData<typeof loader>();
 return <Page><title>Asistencia con QR · Asisteam</title><meta name="robots" content="noindex,nofollow"/>
 <ActionLink href={`/groups/${group.id}/activities/${activity.id}`} className="px-0">Volver a la actividad</ActionLink>
 <header className="space-y-1"><p className="text-caption font-medium text-muted-foreground">Asistencia con QR</p><h1 className="break-words text-xl font-semibold">{activity.title}</h1><p>Inicio: {formatActivityDateTime(activity.starts_at)} (Chile).</p></header>
 <QrDisplay key={activity.id} groupId={group.id} activityId={activity.id} initialSettings={settings}/></Page>;
}
