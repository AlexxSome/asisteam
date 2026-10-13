import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { formatActivityDateTime } from "@asisteam/core/browser";
import { Page, ActionLink } from "../ui";
import { groupData } from "../group-data";
import { activityData } from "../activity-data";
import { browserApi, sessionError } from "../api";
import { QrDisplay } from "../components/qr-display";
import { PageHeader } from "../components/ui/page-header";
export async function loader({request,params}:LoaderFunctionArgs){
 const group=await groupData(request,params.groupId,true);
 try {const [activity,settings]=await Promise.all([activityData(request,group.id,params.activityId),browserApi(request.signal).getQrSettings({params:{groupId:group.id}})]);return {group,activity,settings};}catch(error){return sessionError(error,request);}
}
export function Component(){
 const {group,activity,settings}=useLoaderData<typeof loader>();
 return <Page className="max-w-5xl p-0 md:p-0"><title>Asistencia con QR · Asisteam</title><meta name="robots" content="noindex,nofollow"/>
 <ActionLink href={`/groups/${group.id}/activities/${activity.id}`} className="px-0">Volver a la actividad</ActionLink>
 <PageHeader title={activity.title} description={`Inicio: ${formatActivityDateTime(activity.starts_at)} (Chile).`}><p className="text-small text-muted-foreground">Asistencia con QR · {group.name}</p></PageHeader>
 <QrDisplay key={activity.id} groupId={group.id} activityId={activity.id} initialSettings={settings}/></Page>;
}
