import Link from "next/link";
import { ATTENDANCE_STATUS_LABELS, activityTypeLabel, attendancePeriodFilterSchema, formatActivityDateTime, reportAttendanceTone, reportPercentage, type AttendanceHistory, type AttendancePeriodFilter } from "@asisteam/core";
import { historyPageHref } from "@/lib/attendance-history";

const statusColors = {
  PRESENT: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  LATE: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  ABSENT: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  EXCUSED: "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-200",
};

export function AttendanceHistoryContent({ history, filter, athleteUserId }: {
  history: AttendanceHistory; filter: AttendancePeriodFilter; athleteUserId?: string;
}) {
  const ward = Boolean(athleteUserId);
  const pageHref = (nextFilter: AttendancePeriodFilter, page = 1) => historyPageHref(history.group_id, nextFilter, page, athleteUserId);
  return <>
      <p className="text-sm">Período: <time dateTime={history.period.from}>{history.period.from}</time> al <time dateTime={history.period.to}>{history.period.to}</time> · America/Santiago</p>
      <section aria-label={ward ? "Resumen de asistencia del pupilo" : "Resumen de mi asistencia"} className="space-y-4 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">{ward ? "Asistencia del pupilo en el período" : "Mi asistencia del período"}</h2>
        {history.totals.convened === 0
          ? <p className="text-lg font-semibold text-muted-foreground">Sin actividades en el período</p>
          : <p className={`text-3xl font-semibold ${reportAttendanceTone(history.totals.attendance_pct)}`}>{reportPercentage(history.totals.attendance_pct)}</p>}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[["Convocadas", history.totals.convened], ["Presente", history.totals.present], ["Atrasado", history.totals.late], ["Ausente", history.totals.absent], ["Justificado", history.totals.excused], ["Tasa de atrasos", reportPercentage(history.totals.late_rate)]].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}
        </dl>
        <p className="text-sm text-muted-foreground">Los atrasos cuentan como asistencia. Los justificados no penalizan. Sin datos significa que no hay convocatorias evaluables en este período.</p>
      </section>
      {history.totals.convened === 0 ? <section className="space-y-2 rounded-lg border p-4">
        <p>{filter.period === "season" && filter.activity_type_ids.length === 0 ? (ward ? "Tu pupilo aún no tiene actividades con asistencia registrada." : "Aún no tienes actividades con asistencia registrada.") : "No hay asistencia registrada en este período con los filtros seleccionados."}</p>
        <Link href={pageHref(attendancePeriodFilterSchema.parse({ period: "season" }))} className="block underline">Ver toda la temporada</Link>
      </section> : <section aria-label={ward ? "Actividades del historial del pupilo" : "Actividades de mi historial"} className="space-y-3">
        <h2 className="text-xl font-semibold">Actividades</h2>
        <ol className="space-y-3">{history.records.map((record) => <li key={record.id} className="space-y-2 rounded-lg border p-4">
          <time dateTime={record.starts_at} className="text-sm text-muted-foreground">{formatActivityDateTime(record.starts_at)}</time>
          <h3 className="break-words font-semibold"><Link href={`/groups/${history.group_id}/activities/${record.activity_id}`} className="underline">{record.title}</Link></h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border px-3 py-1 text-sm"><span aria-hidden className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: record.activity_type_color }} />{activityTypeLabel(record.activity_type_name, record.is_system_type)}</span>
            <span className={`rounded-full px-3 py-1 text-sm ${statusColors[record.status]}`}>{ATTENDANCE_STATUS_LABELS[record.status]}</span>
          </div>
          {record.note && <p className="whitespace-pre-wrap break-words text-sm"><span className="font-medium">Nota: </span>{record.note}</p>}
        </li>)}</ol>
        {history.records.length === 0 && <p>No hay registros en esta página. <Link href={pageHref(filter)} className="underline">Volver a la primera página</Link></p>}
      </section>}
      <nav aria-label={ward ? "Páginas del historial del pupilo" : "Páginas de mi historial"} className="flex flex-wrap gap-5">
        {history.page > 1 && <Link href={pageHref(filter, history.page - 1)} className="underline">Anterior</Link>}
        {history.page * history.page_size < history.totals.convened && <Link href={pageHref(filter, history.page + 1)} className="underline">Siguiente</Link>}
      </nav>
  </>;
}
