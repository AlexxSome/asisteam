import { useState } from "react";
import { Form } from "react-router";
import { httpSchemas, ATTENDANCE_STATUS_LABELS, formatActivityDateTime, activityDateTimeInput, reportPercentage, type AttendanceHistory } from "@asisteam/core/browser";
import { ActionLink, Button } from "../ui";
import { reportAttendanceClass, attendanceStatusClasses } from "../attendance-presentation";
import { EmptyState } from "./ui/empty-state";

type Dashboard = ReturnType<typeof httpSchemas.GroupDashboard.parse>;
type Group = { id: string; name: string };
const surface = "min-w-0 space-y-4 rounded-lg border bg-surface p-4 md:p-6";

function activityLabel(activity: Dashboard["upcoming"][number], now: string) {
  if (Date.parse(activity.starts_at) <= Date.parse(now) && Date.parse(activity.ends_at) >= Date.parse(now)) return "En curso";
  const today = activityDateTimeInput(activity.starts_at).slice(0, 10) === activityDateTimeInput(now).slice(0, 10);
  return Date.parse(activity.ends_at) < Date.parse(now) ? today ? "Anterior de hoy" : "Anterior" : today ? "Hoy" : "Próxima";
}

function MonthlyAttendance({ totals, period }: { totals: AttendanceHistory["totals"]; period: Dashboard["periods"]["month"] }) {
  return <div className="space-y-2">
    <p>Asistencia del mes: <strong className={`text-2xl tabular-nums ${reportAttendanceClass(totals.attendance_pct)}`}>{reportPercentage(totals.attendance_pct)}</strong></p>
    <p className="text-small text-muted-foreground">Período: {period.from} al {period.to} · America/Santiago</p>
    {totals.attendance_pct === null && <p>Sin convocatorias evaluables en este período.</p>}
    <p className="text-small">Presente: {totals.present} · Atrasado: {totals.late} · Ausente: {totals.absent} · Justificado: {totals.excused}</p>
    <p className="text-small text-muted-foreground">Presente + Atrasado sobre Presente + Atrasado + Ausente. Justificado no penaliza.</p>
  </div>;
}

function SelectedRecord({ record, activity }: { record: NonNullable<Dashboard["personal"]>["selected_record"]; activity: Dashboard["selected_activity"] }) {
  if (!activity) return <p className="text-small text-muted-foreground">No hay actividad seleccionada hoy.</p>;
  return <div className="space-y-2 border-t pt-3">
    <p className="break-words font-medium">Actividad seleccionada: {activity.title}</p>
    <p className="text-small"><time dateTime={activity.starts_at}>{formatActivityDateTime(activity.starts_at)}</time></p>
    <p>{record ? <span className={`inline-block rounded-md border px-2 py-1 ${attendanceStatusClasses[record.status]}`}>{ATTENDANCE_STATUS_LABELS[record.status]}</span> : "Sin marcar: todavía no hay un registro de asistencia."}</p>
    {record?.note && <p className="whitespace-pre-wrap break-words text-small">Nota: {record.note}</p>}
  </div>;
}

function pageHref(dashboard: Dashboard, field: "wards_page" | "day_page", page: number) {
  const query = new URLSearchParams({ [field]: String(page) });
  if (dashboard.selected_activity_id) query.set("activity_id", dashboard.selected_activity_id);
  if (field !== "wards_page" && dashboard.wards) query.set("wards_page", String(dashboard.wards.page));
  if (field !== "day_page") query.set("day_page", String(dashboard.today.page));
  return `?${query}`;
}

function GuardianPanel({ group, dashboard }: { group: Group; dashboard: Dashboard }) {
  const [selectedId, setSelectedId] = useState<string>();
  const wards = dashboard.wards;
  // Only already authorized, bounded ward DTOs are selectable. A revoked ward
  // falls back immediately; the parent key resets selection on group/page change.
  const ward = wards?.data.find(row => row.athlete_user_id === selectedId) ?? wards?.data[0];
  const base = `/groups/${group.id}`;
  return <section id="my-wards" aria-labelledby="my-wards-heading" className={surface}>
    <h2 id="my-wards-heading" className="text-h2">Mis pupilos</h2>
    <p className="break-words text-small">Grupo: {group.name}</p>
    {wards && wards.data.length > 1 && <div className="space-y-2">
      <label htmlFor="home-ward" className="block font-semibold">Seleccionar pupilo</label>
      <select id="home-ward" value={ward?.athlete_user_id ?? ""} onChange={event => setSelectedId(event.target.value)} className="min-h-11 w-full rounded-md border border-input bg-surface px-3">
        {wards.data.map(row => <option key={row.athlete_user_id} value={row.athlete_user_id}>{row.full_name}</option>)}
      </select>
    </div>}
    {ward ? <>
      <h3 className="break-words text-h3">{ward.full_name}</h3>
      <MonthlyAttendance totals={ward.monthly} period={dashboard.periods.month} />
      <SelectedRecord record={ward.selected_record} activity={dashboard.selected_activity} />
      <ActionLink href={`${base}/wards/${ward.athlete_user_id}/history?period=month`}>Ver historial de {ward.full_name} en {group.name}</ActionLink>
      <ActionLink href={`/wards/${ward.athlete_user_id}#agenda`}>Ver agenda de {ward.full_name}</ActionLink>
    </> : <p>{wards?.total ? "No hay pupilos en esta página." : "No hay pupilos con membresía activa en este grupo. Los pendientes conservan sus pasos de incorporación en Mis pupilos."}</p>}
    {wards && wards.total > 4 && <nav aria-label="Páginas de pupilos del grupo" className="space-y-2">
      <p className="text-small">Mostrando {wards.data.length} de {wards.total} pupilos · Página {wards.page}</p>
      {wards.page > 1 && <ActionLink href={pageHref(dashboard, "wards_page", wards.page - 1)}>Pupilos anteriores</ActionLink>}
      {wards.page * 4 < wards.total && <ActionLink href={pageHref(dashboard, "wards_page", wards.page + 1)}>Más pupilos</ActionLink>}
    </nav>}
    {dashboard.guardian_tasks && <div className="space-y-2 border-t pt-3">
      <h3 className="text-h3">Pasos pendientes en {group.name}</h3>
      <p>Altas por consentir: {dashboard.guardian_tasks.consents} · Solicitudes de activación de cuenta: {dashboard.guardian_tasks.activations}.</p>
      <p className="text-small text-muted-foreground">El administrador coordina el vínculo. El apoderado designado ratifica el tratamiento de datos de un alta gestionada para activar la membresía; un ingreso por código requiere además aprobación del administrador. El acceso propio se completa por invitación tras la autorización del apoderado. Una solicitud PENDING aún no habilita asistencia.</p>
      <ActionLink href={`${base}/members/consent`}>Revisar consentimientos y activaciones</ActionLink>
    </div>}
    <ActionLink href="/wards">Ver mis pupilos, próximas actividades y asistencia</ActionLink>
    <p className="text-small text-muted-foreground">Solo pupilos vigentes: al cumplir 18 años o retirarse el vínculo dejan de estar disponibles.</p>
  </section>;
}

/** UI-05 presents the server projection; it never downloads an ADMIN roster. */
export function GroupHomePanels({ group, dashboard }: { group: Group; dashboard: Dashboard }) {
  const base = `/groups/${group.id}`, operator = dashboard.access !== "member";
  const selected = dashboard.selected_activity, next = selected ?? dashboard.upcoming[0];
  const context = dashboard.context;
  return <>
    <section aria-labelledby="next-activity-heading" className={surface}>
      <h2 id="next-activity-heading" className="text-h2">{next && activityLabel(next, dashboard.now) === "En curso" ? "Actividad en curso" : next && Date.parse(next.ends_at) < Date.parse(dashboard.now) ? "Actividad anterior de hoy" : "Próxima actividad"}</h2>
      {next ? <div className="space-y-2">
        <p className="text-small text-muted-foreground">{activityLabel(next, dashboard.now)} · {group.name} · America/Santiago</p>
        <h3 className="break-words text-h3">{next.title}</h3>
        <p><time dateTime={next.starts_at}>{formatActivityDateTime(next.starts_at)}</time></p>
        <p className="break-words">{next.location || "Lugar por confirmar"}</p>
        <div className="flex flex-wrap gap-3">
          {operator && <ActionLink variant="primary" href={`${base}/activities/${next.id}/attendance`}>Tomar asistencia</ActionLink>}
          <ActionLink href={`${base}/activities/${next.id}`}>Ver actividad</ActionLink>
        </div>
      </div> : <EmptyState title={dashboard.previous ? "No hay próximas actividades" : "Aún no hay actividades"} action={<ActionLink href={dashboard.access === "admin" ? `${base}/activities/new` : `${base}/activities`}>{dashboard.access === "admin" ? "Crear actividad" : "Ver agenda del grupo"}</ActionLink>}>
        Cuando se programe un encuentro, aparecerá aquí.
      </EmptyState>}
      {dashboard.today.total > 1 && <Form method="get" className="space-y-2">
        <label className="block font-semibold" htmlFor="home-activity">Actividad del día</label>
        <select key={dashboard.selected_activity_id ?? group.id} id="home-activity" name="activity_id" defaultValue={dashboard.selected_activity_id ?? ""} className="min-h-11 w-full rounded-md border border-input bg-surface px-3">
          {selected && !dashboard.today.data.some(row => row.id === selected.id) && <option value={selected.id}>{selected.title}</option>}
          {dashboard.today.data.map(row => <option key={row.id} value={row.id}>{row.title} · {formatActivityDateTime(row.starts_at)}</option>)}
        </select>
        {dashboard.wards && <input type="hidden" name="wards_page" value={dashboard.wards.page} />}
        <input type="hidden" name="day_page" value={dashboard.today.page} />
        <Button type="submit">Ver actividad</Button>
        <p className="text-small">{dashboard.today.total} actividades hoy · America/Santiago</p>
        {dashboard.today.page > 1 && <ActionLink href={pageHref(dashboard, "day_page", dashboard.today.page - 1)}>Actividades anteriores del día</ActionLink>}
        {dashboard.today.page * 50 < dashboard.today.total && <ActionLink href={pageHref(dashboard, "day_page", dashboard.today.page + 1)}>Más actividades del día</ActionLink>}
      </Form>}
      {(next || dashboard.access === "admin") && <ActionLink href={`${base}/activities`}>Ver agenda del grupo</ActionLink>}
    </section>
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(320px,4fr)]">
      <div className="min-w-0 space-y-6">
        {dashboard.personal && <section id="my-attendance" aria-labelledby="my-attendance-heading" className={surface}>
          <h2 id="my-attendance-heading" className="text-h2">Mi asistencia</h2>
          <p className="break-words text-small">Grupo: {group.name}</p>
          <MonthlyAttendance totals={dashboard.personal.monthly} period={dashboard.periods.month} />
          <SelectedRecord record={dashboard.personal.selected_record} activity={selected} />
          <ActionLink href={`${base}/me/history?period=month`}>Ver mi historial de asistencia</ActionLink>
          <ActionLink href="/groups#agenda">Mi agenda de todos los grupos</ActionLink>
          <p className="text-small text-muted-foreground">Solo corresponde a este grupo.</p>
        </section>}
        {dashboard.wards && <GuardianPanel key={`${group.id}:${dashboard.wards.page}`} group={group} dashboard={dashboard} />}
        {dashboard.upcoming.length > 0 && <section aria-labelledby="upcoming-heading" className={surface}>
          <h2 id="upcoming-heading" className="text-h2">Próximas actividades</h2>
          <ul className="divide-y">{dashboard.upcoming.map(activity => <li key={activity.id} className="min-w-0 space-y-2 py-3">
            <p className="text-small text-muted-foreground">{activityLabel(activity, dashboard.now)} · {group.name}</p>
            <h3 className="break-words text-h3">{activity.title}</h3>
            <p className="text-small"><time dateTime={activity.starts_at}>{formatActivityDateTime(activity.starts_at)}</time></p>
            <p className="break-words text-small">{activity.location || "Lugar por confirmar"}</p>
            <ActionLink href={`${base}/activities/${activity.id}`}>Ver detalle de {activity.title}</ActionLink>
          </li>)}</ul>
        </section>}
        {dashboard.previous && <section aria-labelledby="previous-heading" className={surface}>
          <h2 id="previous-heading" className="text-h2">Actividad anterior</h2>
          <p className="break-words font-semibold">{dashboard.previous.title}</p>
          <p className="text-small"><time dateTime={dashboard.previous.starts_at}>{formatActivityDateTime(dashboard.previous.starts_at)}</time> · {dashboard.previous.location || "Lugar por confirmar"}</p>
          <ActionLink href={`${base}/activities/${dashboard.previous.id}${operator ? "/attendance" : ""}`}>{operator ? "Revisar asistencia anterior" : "Ver actividad anterior"}</ActionLink>
          <ActionLink href={`${base}/activities?period=past`}>Ver todas las anteriores</ActionLink>
        </section>}
      </div>
      <div className="min-w-0 space-y-6">
        {context && selected && <section aria-labelledby="context-heading" className={surface}>
          <h2 id="context-heading" className="text-h2">Resumen de la actividad</h2>
          <h3 className="break-words text-h3">{selected.title}</h3>
          <p className="text-small"><time dateTime={selected.starts_at}>{formatActivityDateTime(selected.starts_at)}</time> · {group.name}</p>
          {context.phase === "preparation" ? <p>Preparación: esta actividad aún no comienza. No hay porcentaje realizado.</p> : <p>Asistencia: <strong className={reportAttendanceClass(context.counts.attendance_pct)}>{reportPercentage(context.counts.attendance_pct)}</strong></p>}
          <p className="text-small">Presente: {context.counts.present} · Atrasado: {context.counts.late} · Ausente: {context.counts.absent} · Justificado: {context.counts.excused}</p>
          <p>Sin marcar: {context.unmarked} de {context.active_athletes} deportistas convocables.</p>
          <p className="text-small text-muted-foreground">Sin marcar no equivale a Ausente. Presente + Atrasado sobre Presente + Atrasado + Ausente; Justificado no penaliza.</p>
          {dashboard.access === "coach" && <p className="text-small">Puedes tomar y corregir estados. Las notas y el desmarcado corresponden al administrador.</p>}
          <ActionLink href={`${base}/activities/${context.activity_id}/attendance`}>Abrir asistencia de {selected.title}</ActionLink>
        </section>}
        {dashboard.indicators && <section aria-labelledby="group-metrics-heading" className={surface}>
          <h2 id="group-metrics-heading" className="text-h2">Resumen del grupo</h2>
          <p className="break-words text-small">{group.name} · Agregados autorizados</p>
          <dl className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <div><dt>Deportistas activos</dt><dd className="text-3xl font-semibold tabular-nums">{dashboard.indicators.active_athletes}</dd></div>
            <div><dt>Actividades esta semana</dt><dd className="text-3xl font-semibold tabular-nums">{dashboard.indicators.week_activities}</dd><dd className="text-small text-muted-foreground">{dashboard.periods.week.from} al {dashboard.periods.week.to} · America/Santiago</dd></div>
          </dl>
          <MonthlyAttendance totals={dashboard.indicators.monthly} period={dashboard.periods.month} />
          <p className="text-small text-muted-foreground">Total ponderado de este grupo; no promedia porcentajes individuales ni combina grupos.</p>
          <ActionLink href={`${base}/reports`}>Ver estadísticas del grupo</ActionLink>
        </section>}
        <section aria-labelledby="latest-announcement-heading" className={surface}>
          <h2 id="latest-announcement-heading" className="text-h2">Último anuncio</h2>
          {dashboard.latest_announcement ? <>
            <h3 className="break-words text-h3">{dashboard.latest_announcement.title}</h3>
            <p className="whitespace-pre-wrap break-words text-small">{dashboard.latest_announcement.body}</p>
          </> : <p>No hay anuncios publicados.</p>}
          <ActionLink href={`${base}/announcements`}>Ver anuncios</ActionLink>
        </section>
      </div>
    </div>
  </>;
}
