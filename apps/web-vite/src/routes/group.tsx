import { useEffect } from "react";
import { Form, Link, useLoaderData, useActionData, useRouteLoaderData, type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { canManageAttendance, formatActivityDateTime, activityDateTimeInput, reportPercentage, type AttendanceHistory } from "@asisteam/core/browser";
import { browserApi, requireSession, sessionError, actionMessage } from "../api";
import { groupData } from "../group-data";
import { Page, Button, Alert } from "../ui";
import { EmptyState } from "../../../web/src/components/ui/empty-state";
import { GettingStarted } from "../components/getting-started";
function homeActivityLabel(activity:{starts_at:string|null;ends_at:string|null},now:string){
 if(!activity.starts_at||!activity.ends_at)return "Actividad";
 if(Date.parse(activity.starts_at)<=Date.parse(now)&&Date.parse(activity.ends_at)>=Date.parse(now))return "En curso";
 const today=activityDateTimeInput(activity.starts_at).slice(0,10)===activityDateTimeInput(now).slice(0,10);
 return Date.parse(activity.ends_at)<Date.parse(now)?today?"Anterior de hoy":"Anterior":today?"Hoy":"Próxima";
}
function AttendanceSummary({history}:{history:Pick<AttendanceHistory,"period"|"totals">}){return <div><p>Asistencia del mes: <strong>{reportPercentage(history.totals.attendance_pct)}</strong></p><p className="text-small">Período: {history.period.from} al {history.period.to} · America/Santiago</p>{history.totals.attendance_pct===null && <p>Sin convocatorias evaluables en este período.</p>}</div>;}
export async function loader({request,params}:LoaderFunctionArgs){
 const group=await groupData(request,params.groupId),api=browserApi(request.signal),isAdmin=group.access==="admin";
 try {
  const [agenda,capacity,personal,pending,guardianTasks]=await Promise.all([
   api.getHomeActivities({query:{group_ids:group.id}}),
   isAdmin?api.getGroupBilling({params:{groupId:group.id},query:{page:1}}):null,
   group.roles.includes("ATHLETE")?api.getMyAttendanceHistory({params:{groupId:group.id},query:{period:"month",page:1,page_size:1,activity_type_ids:""}}):null,
   isAdmin?api.getPendingSummary({params:{groupId:group.id}}):null,
   group.roles.includes("GUARDIAN")?(async()=>{
    let consents=0;for(let page=1;;page++){const rows=(await api.listMembershipOnboarding({query:{group_id:group.id,as_guardian:true,page}})).data;consents+=rows.filter(row=>row.can_consent).length;if(page*50>=(rows[0]?.total_count??0))break;}
    const activations=await api.listManagedActivations({params:{groupId:group.id},query:{page:1}});return {consents,activations:activations.data[0]?.total_count??0};
   })():null
  ]);
  return {group,agenda,capacity,personal:personal?{period:personal.period,totals:personal.totals}:null,pending:pending?.total??null,guardianTasks};
 }catch(error){return sessionError(error,request);}
}
export async function action({request,params}:ActionFunctionArgs){const group=await groupData(request,params.groupId,true);try{await browserApi(request.signal).joinAsAthlete({params:{groupId:group.id}});return {ok:true,message:"Tu rol de deportista fue incorporado."};}catch(error){return {ok:false,message:actionMessage(error)};}}
export function Component(){
 const {group,agenda,capacity,personal,guardianTasks,pending}=useLoaderData<typeof loader>();
 const result=useActionData<typeof action>();
 const session=useRouteLoaderData("private") as Awaited<ReturnType<typeof requireSession>>;
 useEffect(()=>{document.cookie=`asisteam-group-${session.user_id}=${group.id}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol==="https:"?"; Secure":""}`;},[group.id,session.user_id]);
 const isAdmin=group.access==="admin",managesAttendance=canManageAttendance(group.roles);
    const base = `/groups/${group.id}`;
    const next = agenda.next;
    const previous = agenda.previous;
    return <Page><title>Inicio del grupo · Asisteam</title><p className="text-h2">{group.name}</p>
    <header><h1 className="text-2xl font-semibold">Inicio</h1>
      <p className="mt-2 break-words text-muted-foreground">Tu actividad y tareas en {group.name}.</p></header>
    <section aria-labelledby="next-activity-heading" className="space-y-4 rounded-lg border p-4 sm:p-5">
      <h2 id="next-activity-heading" className="text-xl font-semibold">{next && homeActivityLabel(next, agenda.now) === "En curso" ? "Actividad en curso" : "Próxima actividad"}</h2>
      {next ? <>
        <p className="text-sm font-medium text-muted-foreground">{homeActivityLabel(next, agenda.now)} · America/Santiago</p>
        <h3 className="break-words text-lg font-semibold">{next.title}</h3>
        {next.starts_at && <p><time dateTime={next.starts_at}>{formatActivityDateTime(next.starts_at)}</time></p>}
        <p className="break-words">{next.location || "Lugar por confirmar"}</p>
        <div className="flex flex-wrap gap-3">
          {managesAttendance && <Link to={`${base}/activities/${next.id}/attendance`}>Tomar asistencia</Link>}
          <Link to={`${base}/activities/${next.id}`}>Ver actividad</Link>
        </div>
      </> : <EmptyState title={previous ? "No hay próximas actividades" : "Aún no hay actividades"} action={<Link to={isAdmin ? `${base}/activities/new` : `${base}/activities`}>{isAdmin ? "Crear actividad" : "Ver agenda del grupo"}</Link>}>
        {isAdmin ? "Programa el próximo encuentro para que el equipo pueda organizarse." : "Cuando el administrador programe un encuentro, aparecerá aquí."}
      </EmptyState>}
      {(next || isAdmin) && <Link to={`${base}/activities`} className="inline-flex min-h-11 items-center underline">Ver agenda del grupo</Link>}
      {previous && <div className="space-y-1 border-t pt-4">
        <h3 className="font-semibold">{homeActivityLabel(previous, agenda.now)}: <span className="break-words">{previous.title}</span></h3>
        {previous.starts_at && <p className="break-words text-sm text-muted-foreground"><time dateTime={previous.starts_at}>{formatActivityDateTime(previous.starts_at)}</time> · {previous.location || "Lugar por confirmar"}</p>}
        <Link to={`${base}/activities/${previous.id}${managesAttendance ? "/attendance" : ""}`} className="inline-flex min-h-11 items-center underline">{managesAttendance ? "Revisar asistencia anterior" : "Ver actividad anterior"}</Link>
        <Link to={`${base}/activities?period=past`} className="ml-0 inline-flex min-h-11 items-center underline sm:ml-5">Ver todas las anteriores</Link>
      </div>}
    </section>
    {isAdmin && <section className="space-y-2 rounded-lg border p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Aprobaciones pendientes <span className="tabular-nums">({pending})</span></h2>
      <p className="text-muted-foreground">{pending ? "Revisa los requisitos de apoderado y consentimiento antes de confirmar cada incorporación." : "No hay solicitudes pendientes."}</p>
      <Link to={`${base}/members/pending`}>Revisar aprobaciones</Link>
    </section>}
    {personal && <section id="my-attendance" className="space-y-3 rounded-lg border p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Mi asistencia</h2>
      <AttendanceSummary history={personal}/>
      <p className="text-sm text-muted-foreground">Solo corresponde a este grupo.</p>
      <Link to={`${base}/me/history?period=month`} className="inline-flex min-h-11 items-center underline">Ver mi historial de asistencia</Link>
      <Link to="/groups#agenda" className="block min-h-11 py-2 underline">Mi agenda de todos los grupos</Link>
    </section>}
    {guardianTasks && <section id="my-wards" className="space-y-3 rounded-lg border p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Mis pupilos</h2>
      <p>Altas por consentir: {guardianTasks.consents} · Solicitudes de activación de cuenta: {guardianTasks.activations}. Solo este grupo.</p>
      <Link className="block min-h-11 py-2 underline" to={`${base}/members/consent`}>Revisar consentimientos y activaciones</Link>
      <Link className="block min-h-11 py-2 underline" to="/wards">Ver mis pupilos, próximas actividades y asistencia</Link>
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
    {isAdmin && !group.roles.includes("ATHLETE") && <Form method="post"><Button>Unirme también como deportista</Button>{result && <Alert tone={result.ok ? "success" : "error"}>{result.message}</Alert>}</Form>}
  </Page>;
}
