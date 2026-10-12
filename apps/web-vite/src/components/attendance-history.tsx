import { ReportTableRegion, reportNameCell } from "./report-table";
import type { ReactNode } from "react";
import { reportAttendanceClass, attendanceStatusClasses } from "../attendance-presentation";
import { RouterLink as Link } from "../navigation";
import { ATTENDANCE_STATUS_LABELS, activityTypeLabel, attendancePeriodFilterSchema, formatActivityDateTime, reportPercentage, type AttendanceHistory, type AttendancePeriodFilter } from "@asisteam/core/browser";
import { historyPageHref } from "../report-data";

/** Only the authorized monthly totals reach the home; no individual records. */
export function AttendanceSummary({ history }: { history: Pick<AttendanceHistory, "period" | "totals"> }) {
  return <div className="space-y-1">
    <p className="text-sm">Asistencia del mes: <strong className={reportAttendanceClass(history.totals.attendance_pct)}>{reportPercentage(history.totals.attendance_pct)}</strong></p>
    <p className="text-sm text-muted-foreground">Período: <time dateTime={history.period.from}>{history.period.from}</time> al <time dateTime={history.period.to}>{history.period.to}</time> · America/Santiago</p>
    {history.totals.attendance_pct === null && <p className="text-sm text-muted-foreground">Sin convocatorias evaluables en este período.</p>}
  </div>;
}

export function AttendanceHistoryContent({ history, filter, athleteUserId, filters }: {
  history: AttendanceHistory; filter: AttendancePeriodFilter; athleteUserId?: string; filters?: ReactNode;
}) {
  const ward = Boolean(athleteUserId);
  const pageHref = (nextFilter: AttendancePeriodFilter, page = 1) => historyPageHref(history.group_id, nextFilter, page, athleteUserId);
  return <>
      <p className="text-small">Período: <time dateTime={history.period.from}>{history.period.from}</time> al <time dateTime={history.period.to}>{history.period.to}</time> · America/Santiago</p>
      <section aria-label={ward ? "Resumen de asistencia del pupilo" : "Resumen de mi asistencia"} className="space-y-4 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-h2">{ward ? "Asistencia del pupilo en el período" : "Mi asistencia del período"}</h2>
        {history.totals.convened === 0
          ? <p className="text-h3 text-muted-foreground">Sin datos · Sin actividades en el período</p>
          : <p className={`text-display tabular-nums ${reportAttendanceClass(history.totals.attendance_pct)}`}>{reportPercentage(history.totals.attendance_pct)}</p>}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[["Convocadas", history.totals.convened], ["Presente", history.totals.present], ["Atrasado", history.totals.late], ["Ausente", history.totals.absent], ["Justificado", history.totals.excused], ["Tasa de atrasos", reportPercentage(history.totals.late_rate)]].map(([label, value]) => <div key={label}><dt className="text-small text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}
        </dl>
        <p className="text-small text-muted-foreground">Los atrasos cuentan como asistencia. Los justificados no penalizan. Sin datos significa que no hay convocatorias evaluables en este período.</p>
      </section>
      {filters}
      {history.totals.convened === 0 ? <section className="space-y-2 rounded-lg border border-border bg-surface p-4">
        <p>{filter.period === "season" && filter.activity_type_ids.length === 0 ? (ward ? "Tu pupilo aún no tiene actividades con asistencia registrada." : "Aún no tienes actividades con asistencia registrada.") : "No hay asistencia registrada en este período con los filtros seleccionados."}</p>
        <Link href={pageHref(attendancePeriodFilterSchema.parse({ period: "season" }))} className="block underline">Ver toda la temporada</Link>
      </section> : <section aria-label={ward ? "Actividades del historial del pupilo" : "Actividades de mi historial"} className="space-y-3">
        <h2 className="text-h2">Actividades</h2>
        <ReportTableRegion label={ward ? "Historial del pupilo" : "Mi historial"}>
          <table className="w-full text-small"><caption className="sr-only">Actividades convocadas del período · página {history.page}</caption>
            <thead className="bg-muted"><tr>{["Actividad", "Fecha (Chile)", "Tipo", "Estado", "Nota"].map(label=><th key={label} scope="col" className="px-3 py-3 text-left">{label}</th>)}</tr></thead>
            <tbody>{history.records.map(record=><tr key={record.id} className="border-t border-border">
              <th scope="row" className={`${reportNameCell} bg-surface font-medium`}><Link href={`/groups/${history.group_id}/activities/${record.activity_id}`} className="underline">{record.title}</Link></th>
              <td className="whitespace-nowrap px-3 py-3"><time dateTime={record.starts_at}>{formatActivityDateTime(record.starts_at)}</time></td>
              <td className="px-3 py-3">{activityTypeLabel(record.activity_type_name,record.is_system_type)}</td>
              <td className="whitespace-nowrap px-3 py-3"><span className={`rounded-full px-3 py-1 ${attendanceStatusClasses[record.status]}`}>{ATTENDANCE_STATUS_LABELS[record.status]}</span></td>
              <td className="min-w-40 whitespace-pre-wrap break-words px-3 py-3">{record.note || "Sin nota"}</td>
            </tr>)}</tbody>
          </table>
        </ReportTableRegion>
        {history.records.length === 0 && <p>No hay registros en esta página. <Link href={pageHref(filter)} className="underline">Volver a la primera página</Link></p>}
      </section>}
      <nav aria-label={ward ? "Páginas del historial del pupilo" : "Páginas de mi historial"} className="flex flex-wrap gap-5">
        {history.page > 1 && <Link href={pageHref(filter, history.page - 1)} className="underline">Anterior</Link>}
        {history.page * history.page_size < history.totals.convened && <Link href={pageHref(filter, history.page + 1)} className="underline">Siguiente</Link>}
      </nav>
  </>;
}
