import Link from "next/link";
import { notFound } from "next/navigation";
import { ATTENDANCE_STATUS_LABELS, activityTypeLabel, attendancePeriodFilterSchema, formatActivityDateTime, reportAttendanceTone, reportPercentage } from "@asisteam/core";
import { getGroup } from "@/lib/groups";
import { getActivityTypes } from "@/lib/activities";
import { getMyAttendanceHistory, historyPageHref, parseHistoryFilters } from "@/lib/attendance-history";
import type { ReportSearchParams } from "@/lib/reports";
import { ReportFilters } from "../../reports/report-filters";

export const metadata = { title: "Mi historial de asistencia" };
const statusColors = {
  PRESENT: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  LATE: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  ABSENT: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  EXCUSED: "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-200",
};

export default async function MyHistoryPage({ params, searchParams }: {
  params: Promise<{ groupId: string }>; searchParams: Promise<ReportSearchParams>;
}) {
  const group = await getGroup((await params).groupId);
  if (!group.roles.includes("ATHLETE")) notFound();
  const parsed = parseHistoryFilters(await searchParams);
  const filter = parsed.success ? parsed.data : attendancePeriodFilterSchema.parse({});
  const [types, result] = await Promise.all([
    getActivityTypes(group.id, true),
    parsed.success ? getMyAttendanceHistory(group.id, filter)
      : Promise.resolve({ history: null, error: "Revisa los filtros: usa fechas válidas, un rango ordenado y tipos de actividad del grupo." }),
  ]);
  const history = result.history;
  return <>
    <header><h1 className="text-2xl font-semibold">Mi historial de asistencia</h1>
      <p className="mt-2 text-muted-foreground">{history && `${history.full_name} · `}{group.name}</p></header>
    <ReportFilters key={JSON.stringify(filter)} groupId={group.id} filter={filter} types={types} personal />
    {result.error && <p role="alert" className="rounded-md border border-destructive p-4">{result.error}</p>}
    {history && <>
      <p className="text-sm">Período: <time dateTime={history.period.from}>{history.period.from}</time> al <time dateTime={history.period.to}>{history.period.to}</time> · America/Santiago</p>
      <section aria-label="Resumen de mi asistencia" className="space-y-4 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">Mi asistencia del período</h2>
        <p className={`text-3xl font-semibold ${reportAttendanceTone(history.totals.attendance_pct)}`}>{reportPercentage(history.totals.attendance_pct)}</p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[["Convocadas", history.totals.convened], ["Presente", history.totals.present], ["Atrasado", history.totals.late], ["Ausente", history.totals.absent], ["Justificado", history.totals.excused], ["Tasa de atrasos", reportPercentage(history.totals.late_rate)]].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}
        </dl>
        <p className="text-sm text-muted-foreground">Los atrasos cuentan como asistencia. Los justificados no penalizan. Sin datos significa que no hay convocatorias evaluables en este período.</p>
      </section>
      {history.totals.convened === 0 ? <section className="space-y-2 rounded-lg border p-4">
        <p>{filter.period === "season" && filter.activity_type_ids.length === 0 ? "Aún no tienes actividades con asistencia registrada." : "No hay asistencia registrada en este período con los filtros seleccionados."}</p>
        <Link href={historyPageHref(group.id, attendancePeriodFilterSchema.parse({ period: "season" }))} className="block underline">Ver toda la temporada</Link>
      </section> : <section aria-label="Actividades de mi historial" className="space-y-3">
        <h2 className="text-xl font-semibold">Actividades</h2>
        <ol className="space-y-3">{history.records.map((record) => <li key={record.id} className="space-y-2 rounded-lg border p-4">
          <time dateTime={record.starts_at} className="text-sm text-muted-foreground">{formatActivityDateTime(record.starts_at)}</time>
          <h3 className="break-words font-semibold"><Link href={`/groups/${group.id}/activities/${record.activity_id}`} className="underline">{record.title}</Link></h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border px-3 py-1 text-sm"><span aria-hidden className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: record.activity_type_color }} />{activityTypeLabel(record.activity_type_name, record.is_system_type)}</span>
            <span className={`rounded-full px-3 py-1 text-sm ${statusColors[record.status]}`}>{ATTENDANCE_STATUS_LABELS[record.status]}</span>
          </div>
          {record.note && <p className="whitespace-pre-wrap break-words text-sm"><span className="font-medium">Nota: </span>{record.note}</p>}
        </li>)}</ol>
        {history.records.length === 0 && <p>No hay registros en esta página. <Link href={historyPageHref(group.id, filter)} className="underline">Volver a la primera página</Link></p>}
      </section>}
      <nav aria-label="Páginas de mi historial" className="flex flex-wrap gap-5">
        {history.page > 1 && <Link href={historyPageHref(group.id, filter, history.page - 1)} className="underline">Anterior</Link>}
        {history.page * history.page_size < history.totals.convened && <Link href={historyPageHref(group.id, filter, history.page + 1)} className="underline">Siguiente</Link>}
      </nav>
    </>}
  </>;
}
