import Link from "next/link";
import { activityTypeLabel, reportFilterSchema, reportPercentage } from "@asisteam/core";
import { getGroup } from "@/lib/groups";
import { getActivityTypes } from "@/lib/activities";
import { getGroupAttendanceReport, parseReportFilters, reportPageHref, type ReportSearchParams } from "@/lib/reports";
import { ReportFilters } from "./report-filters";
import { ReportTable } from "./report-table";
import { GroupStatsContent } from "./group-stats";

export const metadata = { title: "Reportes del grupo" };

export default async function GroupReportsPage({ params, searchParams }: {
  params: Promise<{ groupId: string }>; searchParams: Promise<ReportSearchParams>;
}) {
  const group = await getGroup((await params).groupId);
  if (!group.roles.includes("ADMIN")) return GroupStatsContent({ group, query: await searchParams });
  const parsed = parseReportFilters(await searchParams);
  const filter = parsed.success ? parsed.data : reportFilterSchema.parse({});
  const [types, result] = await Promise.all([
    getActivityTypes(group.id, true),
    parsed.success ? getGroupAttendanceReport(group.id, filter)
      : Promise.resolve({ report: null, error: "Revisa los filtros: usa fechas válidas, un rango ordenado y tipos de actividad del grupo." }),
  ]);
  const report = result.report;
  const cell = "px-3 py-3 text-right tabular-nums";
  return <>
    <header><h1 className="text-2xl font-semibold">Reportes del grupo</h1><p className="mt-2 text-muted-foreground">Asistencia y puntualidad de {group.name}.</p></header>
    <ReportFilters key={JSON.stringify(filter)} groupId={group.id} filter={filter} types={types} />
    {result.error && <p role="alert" className="rounded-md border border-destructive p-4">{result.error}</p>}
    {report && <>
      <p className="text-sm">Período: <time dateTime={report.period.from}>{report.period.from}</time> al <time dateTime={report.period.to}>{report.period.to}</time> · America/Santiago</p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[["Asistencia promedio", reportPercentage(report.totals.average_attendance_pct)], ["Actividades realizadas", String(report.totals.activities)],
          ["Mejor asistencia", report.totals.best_full_name ?? "Sin datos"], ["Tasa de atrasos", reportPercentage(report.totals.late_rate)]].map(([label, value]) => <div key={label} className="rounded-lg border p-4"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-2 break-words text-xl font-semibold">{value}</dd></div>)}
      </dl>
      {report.totals.convened === 0 && <section className="space-y-2 rounded-lg border p-4">
        <p>No hay asistencia registrada en este período.</p>
        <p className="text-sm text-muted-foreground">Cambia el período o los tipos de actividad y aplica los filtros.</p>
        {!report.has_activities && <Link href={`/groups/${group.id}/activities/new`} className="block underline">Crear primera actividad</Link>}
      </section>}
      <ReportTable report={report} />
      {report.by_athlete.length === 0 && report.totals.athletes > 0 && <p>No hay deportistas en esta página. <Link href={reportPageHref(group.id, filter, 1)} className="underline">Volver a la primera página</Link></p>}
      <nav aria-label="Páginas del reporte" className="flex flex-wrap gap-5">
        {report.page > 1 && <Link href={reportPageHref(group.id, filter, report.page - 1)} className="underline">Anterior</Link>}
        {report.page * report.page_size < report.totals.athletes && <Link href={reportPageHref(group.id, filter, report.page + 1)} className="underline">Siguiente</Link>}
      </nav>
      <p className="text-sm text-muted-foreground">Asistencia = (presentes + atrasos) / (convocadas − justificados). Los justificados no penalizan. Sin datos significa denominador cero. El promedio usa los porcentajes individuales disponibles; el total del grupo usa los conteos sumados. Verde: ≥ 85 %; ámbar: 70–84.9 %; rojo: &lt; 70 %.</p>
      {report.by_activity_type.length > 0 && <section className="space-y-3">
        <h2 className="text-xl font-semibold">Por tipo de actividad</h2>
        <div className="overflow-x-auto rounded-lg border" role="region" aria-label="Asistencia por tipo" tabIndex={0}><table className="w-full text-sm">
          <thead className="bg-muted"><tr><th scope="col" className="px-3 py-3 text-left">Tipo</th><th scope="col" className={cell}>Actividades</th><th scope="col" className={cell}>Asistencia</th><th scope="col" className={cell}>Tasa de atrasos</th></tr></thead>
          <tbody>{report.by_activity_type.map((type) => <tr key={type.activity_type_id} className="border-t">
            <th scope="row" className="min-w-40 px-3 py-3 text-left font-medium">{activityTypeLabel(type.name, type.is_system)}</th>
            <td className={cell}>{type.activities}</td><td className={cell}>{reportPercentage(type.attendance_pct)}
              {type.attendance_pct !== null && <div aria-hidden className="mt-1 h-2 w-full rounded bg-muted"><div className="h-2 rounded" style={{ width: `${type.attendance_pct}%`, backgroundColor: type.color }} /></div>}
            </td><td className={cell}>{reportPercentage(type.late_rate)}</td>
          </tr>)}</tbody>
        </table></div>
      </section>}
      {report.trend.length > 0 && <section className="space-y-3"><h2 className="text-xl font-semibold">Evolución semanal</h2>
        <p className="text-sm text-muted-foreground">Promedio de porcentajes por deportista con datos en cada semana, dentro del período seleccionado.</p>
        <table className="w-full rounded-lg border text-sm"><thead className="bg-muted"><tr><th scope="col" className="px-3 py-3 text-left">Semana del lunes</th><th scope="col" className={cell}>Convocadas</th><th scope="col" className={cell}>Asistencia promedio</th></tr></thead>
          <tbody>{report.trend.map((week) => <tr key={week.week_from} className="border-t"><th scope="row" className="px-3 py-3 text-left font-medium">{week.week_from}</th><td className={cell}>{week.convened}</td><td className={cell}>{reportPercentage(week.attendance_pct)}</td></tr>)}</tbody>
        </table>
      </section>}
    </>}
  </>;
}
