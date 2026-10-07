import Link from "next/link";
import { attendancePeriodFilterSchema, canManageAttendance, formatActivityDateTime } from "@asisteam/core";
import { ActionLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AttendanceSummary } from "@/components/attendance-history";
import { getGroup, getGroupCapacity } from "@/lib/groups";
import { getHomeActivities, homeActivityLabel } from "@/lib/activities";
import { getMyAttendanceHistory } from "@/lib/attendance-history";
import { getGuardianTasks } from "@/lib/wards";
import { memberOperation } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { JoinAsAthlete } from "./join-as-athlete";
import { GettingStarted } from "./getting-started";

export const metadata = { title: "Inicio del grupo" };

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const group = await getGroup((await params).groupId);
  const isAdmin = group.roles.includes("ADMIN");
  const managesAttendance = canManageAttendance(group.roles);
  const [agenda, capacity, personal, guardianTasks, pending] = await Promise.all([
    getHomeActivities(group.id),
    isAdmin ? getGroupCapacity(group.id) : null,
    group.roles.includes("ATHLETE") ? getMyAttendanceHistory(group.id, attendancePeriodFilterSchema.parse({ period: "month" }), 1) : null,
    group.roles.includes("GUARDIAN") ? getGuardianTasks(group.id) : null,
    isAdmin ? (async () => {
      const client = await createClient();
      // The RPC's total_count is computed before this response limit.
      const { data, error } = await memberOperation(() => client.rpc("list_pending_athletes", { p_group_id: group.id }).select("total_count").limit(1), async api => [{ total_count: (await api.getPendingSummary({ params: { groupId: group.id } })).total }]);
      if (error) throw new Error("No pudimos cargar las aprobaciones pendientes. Vuelve a intentarlo.");
      return data?.[0]?.total_count ?? 0;
    })() : null,
  ]);
  const base = `/groups/${group.id}`;
  const next = agenda.next;
  const previous = agenda.previous;
  return <>
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
          {managesAttendance && <ActionLink href={`${base}/activities/${next.id}/attendance`} variant="primary">Tomar asistencia</ActionLink>}
          <ActionLink href={`${base}/activities/${next.id}`} variant={managesAttendance ? "secondary" : "default"}>Ver actividad</ActionLink>
        </div>
      </> : <EmptyState title={previous ? "No hay próximas actividades" : "Aún no hay actividades"}
        action={<ActionLink href={isAdmin ? `${base}/activities/new` : `${base}/activities`} variant="secondary">{isAdmin ? "Crear actividad" : "Ver agenda del grupo"}</ActionLink>}>
        {isAdmin ? "Programa el próximo encuentro para que el equipo pueda organizarse." : "Cuando el administrador programe un encuentro, aparecerá aquí."}
      </EmptyState>}
      {(next || isAdmin) && <Link href={`${base}/activities`} className="inline-flex min-h-11 items-center underline">Ver agenda del grupo</Link>}
      {previous && <div className="space-y-1 border-t pt-4">
        <h3 className="font-semibold">{homeActivityLabel(previous, agenda.now)}: <span className="break-words">{previous.title}</span></h3>
        {previous.starts_at && <p className="break-words text-sm text-muted-foreground"><time dateTime={previous.starts_at}>{formatActivityDateTime(previous.starts_at)}</time> · {previous.location || "Lugar por confirmar"}</p>}
        <Link href={`${base}/activities/${previous.id}${managesAttendance ? "/attendance" : ""}`} className="inline-flex min-h-11 items-center underline">{managesAttendance ? "Revisar asistencia anterior" : "Ver actividad anterior"}</Link>
        <Link href={`${base}/activities?period=past`} className="ml-0 inline-flex min-h-11 items-center underline sm:ml-5">Ver todas las anteriores</Link>
      </div>}
    </section>
    {isAdmin && <section className="space-y-2 rounded-lg border p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Aprobaciones pendientes <span className="tabular-nums">({pending})</span></h2>
      <p className="text-muted-foreground">{pending ? "Revisa los requisitos de apoderado y consentimiento antes de confirmar cada incorporación." : "No hay solicitudes pendientes."}</p>
      <ActionLink href={`${base}/members/pending`} variant="secondary">Revisar aprobaciones</ActionLink>
    </section>}
    {personal && <section id="my-attendance" className="space-y-3 rounded-lg border p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Mi asistencia</h2>
      {personal.history ? <AttendanceSummary history={personal.history} /> : <p role="alert">{personal.error}</p>}
      <p className="text-sm text-muted-foreground">Solo corresponde a este grupo.</p>
      <Link href={`${base}/me/history?period=month`} className="inline-flex min-h-11 items-center underline">Ver mi historial de asistencia</Link>
      <Link href="/groups#agenda" className="block min-h-11 py-2 underline">Mi agenda de todos los grupos</Link>
    </section>}
    {guardianTasks && <section id="my-wards" className="space-y-3 rounded-lg border p-4 sm:p-5">
      <h2 className="text-lg font-semibold">Mis pupilos</h2>
      <p>Altas por consentir: {guardianTasks.consents} · Solicitudes de activación de cuenta: {guardianTasks.activations}. Solo este grupo.</p>
      <Link className="block min-h-11 py-2 underline" href={`${base}/members/consent`}>Revisar consentimientos y activaciones</Link>
      <Link className="block min-h-11 py-2 underline" href="/wards" prefetch={false}>Ver mis pupilos, próximas actividades y asistencia</Link>
    </section>}
    {isAdmin && <GettingStarted groupId={group.id} capacity={capacity} hasActivities={Boolean(next || previous)} />}
    <details className="rounded-lg border p-4 sm:p-5">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold">{isAdmin ? "Administración del grupo" : "Acerca del grupo"}</summary>
      {group.sport && <p className="mt-2 text-muted-foreground">{group.sport}</p>}
      {group.description && <p className="mt-3 whitespace-pre-wrap break-words">{group.description}</p>}
      {isAdmin && <nav aria-label="Administración del grupo" className="mt-3 space-y-2">
        <p>Código de invitación: <span className="font-mono tracking-widest">{group.invite_code}</span></p>
        <Link href={`${base}/settings#invite`} className="block min-h-11 py-2 underline">Invitar con código o enlace</Link>
        <Link href={`${base}/activities/new`} className="block min-h-11 py-2 underline">Crear actividad</Link>
        <Link href={`${base}/members/new`} className="block min-h-11 py-2 underline">Crear cuenta gestionada</Link>
        <Link href={`${base}/members`} className="block min-h-11 py-2 underline">Gestionar integrantes</Link>
        <Link href={`${base}/guardians`} className="block min-h-11 py-2 underline">Registrar y vincular apoderado</Link>
      </nav>}
    </details>
    {isAdmin && !group.roles.includes("ATHLETE") && <JoinAsAthlete groupId={group.id} />}
  </>;
}
