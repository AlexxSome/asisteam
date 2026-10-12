import { useEffect } from "react";
import { Link, useLoaderData, useRouteLoaderData, type LoaderFunctionArgs } from "react-router";
import { httpSchemas, MEMBERSHIP_ROLE_LABELS } from "@asisteam/core/browser";
import { browserApi, requireSession, sessionError } from "../api";
import { groupData } from "../group-data";
import { Page } from "../ui";
import { GroupHomePanels } from "../components/group-home-panels";
import {JoinAsAthlete} from "../components/join-as-athlete";
import { GettingStarted } from "../components/getting-started";
function parseDashboardQuery(request:Request){
 const input=Object.fromEntries(new URL(request.url).searchParams);
 const result=httpSchemas.DashboardQuery.safeParse(Object.fromEntries(Object.entries(input).map(([key,value])=>[key,["records_page","day_page","wards_page"].includes(key)&&/^\d+$/.test(value)?Number(value):value])));
 if(!result.success)throw new Response(null,{status:400});
 return result.data;
}
export async function loader({request,params}:LoaderFunctionArgs){
 const group=await groupData(request,params.groupId),api=browserApi(request.signal),isAdmin=group.access==="admin";
 try {
  const [dashboard,capacity]=await Promise.all([
   api.getGroupDashboard({params:{groupId:group.id},query:parseDashboardQuery(request)}),
   isAdmin?api.getGroupBilling({params:{groupId:group.id},query:{page:1}}):null,
  ]);
  return {group,dashboard,agenda:{next:dashboard.upcoming[0]??null,previous:dashboard.previous,now:dashboard.now},capacity,personal:dashboard.personal?{period:{type:"month" as const,...dashboard.periods.month,timezone:dashboard.periods.timezone},totals:dashboard.personal.monthly}:null,pending:dashboard.pending,guardianTasks:dashboard.guardian_tasks};
 }catch(error){return sessionError(error,request);}
}
export function Component(){
 const {group,dashboard,agenda,capacity,pending}=useLoaderData<typeof loader>();
 const session=useRouteLoaderData("private") as Awaited<ReturnType<typeof requireSession>>;
 useEffect(()=>{document.cookie=`asisteam-group-${session.user_id}=${group.id}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol==="https:"?"; Secure":""}`;},[group.id,session.user_id]);
 const isAdmin=group.access==="admin";
    const base = `/groups/${group.id}`;
    const next = dashboard.selected_activity??agenda.next;
    const previous = agenda.previous;
    return <Page className="max-w-7xl lg:px-8"><title>Inicio del grupo · Asisteam</title>
    <header className="space-y-2">
      <p className="break-words text-h2">{group.name}</p>
      <h1 className="text-h1">Inicio</h1>
      <p className="text-small text-muted-foreground"><time dateTime={dashboard.now}>{new Intl.DateTimeFormat("es-CL",{timeZone:"America/Santiago",weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(new Date(dashboard.now))}</time> · America/Santiago</p>
      <p className="break-words text-muted-foreground">Tu actividad y tareas en {group.name}.</p>
      <p className="text-small">Tus roles en este grupo: {group.roles.map(role=>MEMBERSHIP_ROLE_LABELS[role]).join(" · ")}</p>
    </header>
    <GroupHomePanels group={group} dashboard={dashboard}/>
    {isAdmin && <section className="space-y-2 rounded-lg border p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Aprobaciones pendientes <span className="tabular-nums">({pending})</span></h2>
      <p className="text-muted-foreground">{pending ? "Revisa los requisitos de apoderado y consentimiento antes de confirmar cada incorporación." : "No hay solicitudes pendientes."}</p>
      <Link to={`${base}/members/pending`}>Revisar aprobaciones</Link>
    </section>}
    {isAdmin && <GettingStarted groupId={group.id} capacity={capacity} hasActivities={Boolean(next || previous)}/>}
    <details className="rounded-lg border p-4 sm:p-5">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">{isAdmin ? "Administración del grupo" : "Acerca del grupo"}</summary>
      {group.sport && <p className="mt-2 text-muted-foreground">{group.sport}</p>}
      {group.description && <p className="mt-3 whitespace-pre-wrap break-words">{group.description}</p>}
      {isAdmin && <nav aria-label="Administración del grupo" className="mt-3 space-y-2">
        <p>Código de invitación: <span className="font-mono tracking-widest">{group.access === "admin" ? group.invite_code : ""}</span></p>
        <Link to={`${base}/settings#invite`} className="block min-h-11 py-2 underline">Invitar con código o enlace</Link>
        <Link to={`${base}/activities/new`} className="block min-h-11 py-2 underline">Crear actividad</Link>
        <Link to={`${base}/members/new`} className="block min-h-11 py-2 underline">Crear cuenta gestionada</Link>
        <Link to={`${base}/members`} className="block min-h-11 py-2 underline">Gestionar integrantes</Link>
        <Link to={`${base}/guardians`} className="block min-h-11 py-2 underline">Registrar y vincular apoderado</Link>
      </nav>}
    </details>
    {isAdmin && !group.roles.includes("ATHLETE") && <JoinAsAthlete groupId={group.id}/>}
  </Page>;
}
