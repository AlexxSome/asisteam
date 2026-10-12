import { Form, useRevalidator } from "react-router";
import { ATTENDANCE_STATUS_LABELS, activityDateTimeInput, formatActivityDateTime, httpSchemas, reportPercentage } from "@asisteam/core/browser";
import { ActionLink, Button } from "../ui";
import { attendanceStatusClasses, reportAttendanceClass } from "../attendance-presentation";
import { ShellIcon, type ShellIconName } from "./shell-icon";
import { activityLabel } from "./group-home-panels";

type Dashboard = ReturnType<typeof httpSchemas.GroupDashboard.parse>;
const surface = "min-w-0 space-y-4 rounded-lg border bg-surface p-4 md:p-6";

export function DashboardRetry({ label }: { label: string }) {
  const revalidator = useRevalidator();
  return <div className="space-y-2" aria-busy={revalidator.state === "loading"}>
    <p role="alert">No pudimos cargar {label}. Los datos de esta región no están disponibles.</p>
    <Button variant="secondary" busy={revalidator.state === "loading"} onClick={() => revalidator.revalidate()}>Reintentar {label}</Button>
    {revalidator.state === "loading" && <p role="status">Cargando {label}…</p>}
  </div>;
}

function Indicator({ title, value, detail, icon, tone }: { title: string; value: string | number; detail: string; icon: ShellIconName; tone: string }) {
  return <div className="relative min-w-0 space-y-1 rounded-lg border bg-surface p-4 pl-[72px]">
    <dt className="text-small"><span className={`absolute left-4 top-4 flex size-11 items-center justify-center rounded-md ${tone}`}><ShellIcon name={icon}/></span>{title}</dt>
    <dd className="text-display tabular-nums">{value}</dd><dd className="text-small text-muted-foreground">{detail}</dd>
  </div>;
}

export function AdminHomePanels({ group, dashboard }: { group: { id: string; name: string }; dashboard: Dashboard }) {
  const base = `/groups/${group.id}`, selected = dashboard.selected_activity, context = dashboard.context;
  const errors = dashboard.secondary_errors ?? [], indicators = dashboard.indicators;
  const records = context?.records;
  const pageHref = (page: number) => `?${new URLSearchParams({ records_page: String(page), day_page: String(dashboard.today.page), ...(dashboard.wards ? { wards_page: String(dashboard.wards.page) } : {}), ...(selected ? { activity_id: selected.id } : {}) })}`;
  return <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(320px,4fr)]">
    <section aria-labelledby="upcoming-heading" className={`${surface} xl:col-start-1 xl:row-start-2`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="upcoming-heading" className="text-h2">Próximas actividades</h2><ActionLink href={`${base}/activities`}>Ver actividades</ActionLink></div>
      {dashboard.upcoming.length ? <ul className="space-y-3">{dashboard.upcoming.map(activity => {
        const date = new Date(activity.starts_at);
        return <li key={activity.id} className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)] gap-3 rounded-lg md:grid-cols-[56px_minmax(0,1fr)_auto] border p-3">
          <div aria-hidden="true" className="rounded-md bg-info-subtle p-2 text-center text-primary">
            <p className="text-caption uppercase">{new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", weekday: "short" }).format(date)}</p>
            <p className="text-2xl font-semibold tabular-nums">{activityDateTimeInput(activity.starts_at).slice(8,10)}</p>
            <p className="text-caption uppercase">{new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", month: "short" }).format(date)}</p>
          </div>
          <div className="min-w-0 space-y-1"><h3 className="break-words text-h3">{activity.title}</h3>
            <p className="text-small text-muted-foreground">{activityLabel(activity, dashboard.now)}</p>
            <p className="text-small"><time dateTime={activity.starts_at}>{formatActivityDateTime(activity.starts_at)}</time> – <time dateTime={activity.ends_at}>{activityDateTimeInput(activity.ends_at).slice(0,10) === activityDateTimeInput(activity.starts_at).slice(0,10) ? new Intl.DateTimeFormat("es-CL",{timeZone:"America/Santiago",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(activity.ends_at)) : formatActivityDateTime(activity.ends_at)}</time></p>
            <p className="break-words text-small">{activity.location || "Lugar por confirmar"}</p>
          </div>
          <ActionLink className="col-start-2 justify-self-start md:col-start-3 md:row-start-1 md:self-center" aria-label={`Ver detalle de ${activity.title}`} href={`${base}/activities/${activity.id}`}>Ver detalle</ActionLink>
        </li>;
      })}</ul> : <p>{dashboard.previous ? "No hay próximas actividades." : "Aún no hay actividades. Crea tu primer entrenamiento cuando estés listo."}</p>}
      <p className="text-small text-muted-foreground">Horarios de Chile · America/Santiago</p>
      {dashboard.today.total > 1 && <Form method="get" className="space-y-2 border-t pt-3">
        <label htmlFor="home-activity" className="block font-semibold">Actividad del día</label>
        <select key={selected?.id ?? group.id} id="home-activity" name="activity_id" defaultValue={selected?.id ?? ""} className="min-h-11 w-full rounded-md border border-input bg-surface px-3">
          {selected && !dashboard.today.data.some(row => row.id === selected.id) && <option value={selected.id}>{selected.title}</option>}
          {dashboard.today.data.map(row => <option key={row.id} value={row.id}>{row.title} · {formatActivityDateTime(row.starts_at)}</option>)}
        </select>
        <input type="hidden" name="day_page" value={dashboard.today.page}/>
        {dashboard.wards && <input type="hidden" name="wards_page" value={dashboard.wards.page}/>}
        <Button type="submit">Ver actividad</Button>
        <p className="text-small">{dashboard.today.total} actividades hoy</p>
        {dashboard.today.page > 1 && <ActionLink href={`?day_page=${dashboard.today.page-1}${selected ? `&activity_id=${selected.id}` : ""}${dashboard.wards ? `&wards_page=${dashboard.wards.page}` : ""}`}>Actividades anteriores del día</ActionLink>}
        {dashboard.today.page * 50 < dashboard.today.total && <ActionLink href={`?day_page=${dashboard.today.page+1}${selected ? `&activity_id=${selected.id}` : ""}${dashboard.wards ? `&wards_page=${dashboard.wards.page}` : ""}`}>Más actividades del día</ActionLink>}
      </Form>}
    </section>
    <section aria-labelledby="pending-heading" className={`${surface} xl:col-start-2 xl:row-start-3`}>
      <h2 id="pending-heading" className="text-h2">Pendientes del grupo</h2>
      {errors.includes("pending") || dashboard.pending === null ? <DashboardRetry label="aprobaciones"/> : <div className="space-y-2 rounded-md border border-warning bg-warning-subtle p-3">
        <p className="font-semibold text-warning">{dashboard.pending ? `${dashboard.pending} incorporaciones por revisar` : "No hay solicitudes pendientes."}</p>
        <p className="text-small">Revisa vínculo de apoderado y consentimiento antes de activar a menores.</p>
      </div>}
      <ActionLink href={`${base}/members/pending`}>Revisar aprobaciones</ActionLink>
    </section>
    <section aria-label="Indicadores del grupo" className="min-w-0 space-y-2 xl:col-span-2 xl:row-start-1">
      <dl className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Indicator title="Deportistas activos" value={indicators?.active_athletes ?? "No disponible"} detail="En este grupo" icon="people" tone="bg-success-subtle text-success"/>
        <Indicator title="Actividades esta semana" value={indicators?.week_activities ?? "No disponible"} detail={`${dashboard.periods.week.from} al ${dashboard.periods.week.to}`} icon="calendar" tone="bg-info-subtle text-primary"/>
        <Indicator title="Asistencia del mes" value={indicators ? reportPercentage(indicators.monthly.attendance_pct).replace(".",",") : "No disponible"} detail={`Total ponderado · ${dashboard.periods.month.from} al ${dashboard.periods.month.to}`} icon="report" tone={indicators ? `bg-warning-subtle ${reportAttendanceClass(indicators.monthly.attendance_pct)}` : "bg-neutral-subtle text-neutral"}/>
        <Indicator title="Por aprobar" value={errors.includes("pending") || dashboard.pending === null ? "No disponible" : dashboard.pending} detail="Incorporaciones pendientes" icon="people" tone="bg-info-subtle text-primary"/>
      </dl>
      <p className="text-small text-muted-foreground">{group.name} · America/Santiago. Total ponderado: Presente + Atrasado sobre Presente + Atrasado + Ausente; Justificado no penaliza.</p>
    </section>
    <section aria-labelledby="context-heading" className={`${surface} xl:col-start-2 xl:row-start-2`}>
      <h2 id="context-heading" className="text-h2">Resumen de la actividad</h2>
      {selected && context ? <>
        <h3 className="break-words text-h3">{selected.title}</h3>
        <p className="text-small"><time dateTime={selected.starts_at}>{formatActivityDateTime(selected.starts_at)}</time> · {activityLabel(selected,dashboard.now)}</p>
        {context.phase === "preparation" ? <p>Preparación: esta actividad aún no comienza. No hay porcentaje realizado.</p> : <p className="space-y-1"><strong className={`block text-display tabular-nums ${reportAttendanceClass(context.counts.attendance_pct)}`}>{reportPercentage(context.counts.attendance_pct).replace(".",",")}</strong><span>Asistencia</span></p>}
        <dl className="divide-y border-y">{(["PRESENT","LATE","ABSENT","EXCUSED"] as const).map((status,index) => <div key={status} className="flex min-h-11 items-center justify-between gap-2 py-2 text-small"><dt><span className={`mr-2 inline-block rounded-md border px-2 py-1 ${attendanceStatusClasses[status]}`}>{ATTENDANCE_STATUS_LABELS[status]}</span></dt><dd className="font-semibold tabular-nums">{[context.counts.present,context.counts.late,context.counts.absent,context.counts.excused][index]}</dd></div>)}</dl>
        <p className="text-small">{context.recorded} registros · ({context.counts.present} + {context.counts.late}) / {context.counts.present+context.counts.late+context.counts.absent}</p>
        <p className="text-small">Sin marcar: {context.unmarked} de {context.active_athletes} deportistas convocables.</p>
        <p className="text-small text-muted-foreground">Sin marcar no equivale a Ausente ni entra en el porcentaje. Justificado no penaliza.</p>
        <ActionLink href={`${base}/activities/${context.activity_id}/attendance`}>Abrir asistencia de {selected.title}</ActionLink>
      </> : <p>No hay actividad seleccionada hoy. Elige un encuentro en Actividades para tomar o revisar su asistencia.</p>}
    </section>
    <section aria-labelledby="records-heading" className={`${surface} xl:col-start-1 xl:row-start-3 xl:row-span-2`}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="records-heading" className="text-h2">Registros de la actividad</h2>{selected && <ActionLink href={`${base}/activities/${selected.id}`}>Ver actividad</ActionLink>}</div>
      {selected && records ? <>
        <p className="break-words text-small">{selected.title} · <time dateTime={selected.starts_at}>{formatActivityDateTime(selected.starts_at)}</time></p>
        <div role="region" aria-label="Tabla de registros de la actividad, desplazamiento horizontal" tabIndex={0} className="overflow-x-auto rounded-md border focus-visible:outline-2 focus-visible:outline-focus">
          <table className="w-full min-w-[480px] text-left text-small"><caption className="p-3 text-left text-muted-foreground">Registros de {selected.title}; orden por nombre y membresía.</caption>
            <thead><tr className="border-b"><th scope="col" className="p-3">Deportista</th><th scope="col" className="p-3">Actividad</th><th scope="col" className="p-3">Estado</th></tr></thead>
            <tbody>{records.data.map(record => <tr key={record.membership_id} className="border-b last:border-0"><th scope="row" className="max-w-64 break-words p-3 font-normal">{record.full_name}</th><td className="max-w-64 break-words p-3">{selected.title}</td><td className="p-3"><span className={`inline-block rounded-md border px-2 py-1 ${attendanceStatusClasses[record.status]}`}>{ATTENDANCE_STATUS_LABELS[record.status]}</span></td></tr>)}</tbody>
          </table>
        </div>
        {!records.data.length && <p>{records.total ? "No hay registros en esta página." : "Todavía no hay registros de asistencia en esta actividad."}</p>}
        <p className="text-small text-muted-foreground">Mostrando {records.data.length} de {records.total} registros · Página {records.page}</p>
        {(records.page > 1 || records.page*4 < records.total) && <nav aria-label="Páginas de registros" className="flex flex-wrap gap-2">{records.page > 1 && <ActionLink href={pageHref(records.page-1)}>Registros anteriores</ActionLink>}{records.page*4 < records.total && <ActionLink href={pageHref(records.page+1)}>Más registros</ActionLink>}</nav>}
      </> : <p>No hay registros que mostrar sin una actividad seleccionada hoy.</p>}
    </section>
    <section aria-labelledby="latest-announcement-heading" className={`${surface} xl:col-start-2 xl:row-start-4`}>
      <h2 id="latest-announcement-heading" className="text-h2">Último anuncio</h2>
      {errors.includes("latest_announcement") ? <DashboardRetry label="anuncio"/> : dashboard.latest_announcement ? <div className="space-y-2"><h3 className="break-words text-h3">{dashboard.latest_announcement.title}</h3><p className="text-small text-muted-foreground"><time dateTime={dashboard.latest_announcement.created_at}>{formatActivityDateTime(dashboard.latest_announcement.created_at)}</time></p><p className="line-clamp-2 whitespace-pre-wrap break-words text-small">{dashboard.latest_announcement.body}</p></div> : <p>No hay anuncios publicados.</p>}
      <ActionLink href={`${base}/announcements`}>Ver anuncios</ActionLink>
    </section>
  </div>;
}
