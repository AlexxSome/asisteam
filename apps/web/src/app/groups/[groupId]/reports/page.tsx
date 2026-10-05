import Link from "next/link";
import { canManageAttendance, activityTypeLabel, reportFilterSchema, reportPercentage } from "@asisteam/core";
import { getGroup } from "@/lib/groups";
import { getActivityTypes } from "@/lib/activities";
import { getGroupAttendanceReport, parseReportFilters, reportPageHref, type ReportSearchParams } from "@/lib/reports";
import { ReportFilters } from "./report-filters";
import { ReportTable, ReportTableRegion, reportNameCell } from "./report-table";
import { GroupStatsContent } from "./group-stats";

export const metadata = { title: "Reportes del grupo" };

export default async function GroupReportsPage({ params, searchParams }: {
  params: Promise<{ groupId: string }>; searchParams: Promise<ReportSearchParams>;
}) {
  const group = await getGroup((await params).groupId);
  if (!canManageAttendance(group.roles)) return GroupStatsContent({ group, query: await searchParams });
  const parsed = parseReportFilters(await searchParams);
  const filter = parsed.success ? parsed.data : reportFilterSchema.parse({});
  const [types, result] = await Promise.all([
    getActivityTypes(group.id, true),
    parsed.success ? getGroupAttendanceReport(group.id, filter)
      : Promise.resolve({ report: null, error: "Revisa los filtros: usa fechas válidas, un rango ordenado y tipos de actividad del grupo." }),
  ]);
  const report = result.report;
  const cell = "whitespace-nowrap px-3 py-3 text-right tabular-nums";
  return <>
    <header><h1 className="text-h1">Reportes del grupo</h1><p className="mt-2 text-muted-foreground">Asistencia y puntualidad de {group.name}.</p></header>
    {report && <section aria-label="Resumen del reporte" className="space-y-3">
      <p className="text-small">Período: <time dateTime={report.period.from}>{report.period.from}</time> al <time dateTime={report.period.to}>{report.period.to}</time> · America/Santiago</p>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Promedio individual", reportPercentage(report.totals.average_attendance_pct)], ["Asistencia total ponderada", reportPercentage(report.totals.attendance_pct)],
          ["Actividades realizadas", String(report.totals.activities)], ["Tasa de atrasos", reportPercentage(report.totals.late_rate)]].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border border-border bg-surface p-3"><dt className="text-small text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-h2 tabular-nums">{value}</dd></div>)}
      </dl>
      <p className="text-small text-muted-foreground">Mejor asistencia: {report.totals.best_full_name ?? "Sin datos"}. Promedio individual: media de porcentajes con datos. Total ponderado: conteos sumados del grupo.</p>
    </section>}
    <ReportFilters key={JSON.stringify(filter)} groupId={group.id} filter={filter} types={types} />
    {result.error && <p role="alert" className="rounded-md border border-destructive p-4">{result.error}</p>}
    {report && <>
      {report.totals.convened === 0 && <section className="space-y-2 rounded-lg border border-border bg-surface p-4">
        <p>No hay asistencia registrada en este período.</p>
        <p className="text-small text-muted-foreground">Cambia el período o los tipos de actividad y aplica los filtros.</p>
        {!report.has_activities && group.roles.includes("ADMIN") && <Link href={`/groups/${group.id}/activities/new`} className="block underline">Crear primera actividad</Link>}
      </section>}
      <p className="text-small text-muted-foreground">Página {report.page} · {report.totals.athletes} deportistas en el filtro. Los totales incluyen todas las páginas.</p>
      <ReportTable report={report} />
      {report.by_athlete.length === 0 && report.totals.athletes > 0 && <p>No hay deportistas en esta página. <Link href={reportPageHref(group.id, filter, 1)} className="underline">Volver a la primera página</Link></p>}
      <nav aria-label="Páginas del reporte" className="flex flex-wrap gap-5">
        {report.page > 1 && <Link href={reportPageHref(group.id, filter, report.page - 1)} className="underline">Anterior</Link>}
        {report.page * report.page_size < report.totals.athletes && <Link href={reportPageHref(group.id, filter, report.page + 1)} className="underline">Siguiente</Link>}
      </nav>
      <p className="text-small text-muted-foreground">Asistencia = (presentes + atrasos) / (convocadas − justificados). Los justificados no penalizan. Sin datos significa denominador cero. El promedio usa los porcentajes individuales disponibles; el total del grupo usa los conteos sumados. Verde: ≥ 85 %; ámbar: 70–84.9 %; rojo: &lt; 70 %.</p>
      {report.by_activity_type.length > 0 && <section className="space-y-3">
        <h2 className="text-h2">Por tipo de actividad</h2>
        <ReportTableRegion label="Asistencia por tipo"><table className="w-full text-small">
          <caption className="sr-only">Asistencia por tipo de actividad en el período seleccionado</caption>
          <thead className="bg-muted"><tr><th scope="col" className={`${reportNameCell} bg-muted`}>Tipo</th><th scope="col" className={cell}>Actividades</th><th scope="col" className={cell}>Asistencia</th><th scope="col" className={cell}>Tasa de atrasos</th></tr></thead>
          <tbody>{report.by_activity_type.map((type) => <tr key={type.activity_type_id} className="border-t border-border">
            <th scope="row" className={`${reportNameCell} bg-surface font-medium`}>{activityTypeLabel(type.name, type.is_system)}</th>
            <td className={cell}>{type.activities}</td><td className={cell}>{reportPercentage(type.attendance_pct)}
              {type.attendance_pct !== null && <div aria-hidden className="mt-1 h-2 w-full rounded bg-muted"><div className="h-2 rounded" style={{ width: `${type.attendance_pct}%`, backgroundColor: type.color }} /></div>}
            </td><td className={cell}>{reportPercentage(type.late_rate)}</td>
          </tr>)}</tbody>
        </table></ReportTableRegion>
      </section>}
      {report.trend.length > 0 && <section className="space-y-3"><h2 className="text-h2">Evolución semanal</h2>
        <p className="text-small text-muted-foreground">Promedio de porcentajes por deportista con datos en cada semana, dentro del período seleccionado.</p>
        <ReportTableRegion label="Evolución semanal"><table className="w-full text-small"><caption className="sr-only">Promedio individual por semana del período seleccionado</caption><thead className="bg-muted"><tr><th scope="col" className={`${reportNameCell} bg-muted`}>Semana del lunes</th><th scope="col" className={cell}>Convocadas</th><th scope="col" className={cell}>Asistencia promedio</th></tr></thead>
          <tbody>{report.trend.map((week) => <tr key={week.week_from} className="border-t border-border"><th scope="row" className={`${reportNameCell} bg-surface font-medium`}>{week.week_from}</th><td className={cell}>{week.convened}</td><td className={cell}>{reportPercentage(week.attendance_pct)}</td></tr>)}</tbody>
        </table></ReportTableRegion>
      </section>}
    </>}
  </>;
}
