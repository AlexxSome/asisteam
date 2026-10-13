import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { RouterLink as Link } from "../navigation";
import { Page } from "../ui";
import { activityTypeLabel, reportPercentage } from "@asisteam/core/browser";
import { reportData, reportPageHref } from "../report-data";
import { ReportFilters, ReportFiltersLink } from "../components/report-filters";
import { ReportTable, ReportTableRegion, reportNameCell } from "../components/report-table";
import { PageHeader } from "../components/ui/page-header";
import { ReportSummary } from "../components/report-summary";
import { GroupStatsContent } from "../components/group-stats";
export const loader=({request,params}:LoaderFunctionArgs)=>reportData(request,params.groupId);
export function Component(){
 const data=useLoaderData<typeof loader>();
 if(data.kind==="stats")return <Page className="max-w-7xl px-0 py-0 md:px-0"><GroupStatsContent key={data.group.id} data={data}/></Page>;
 const {group,filter,types,result}=data,report=result.report;
 const cell="whitespace-nowrap px-2 py-3 text-right tabular-nums";
  return <Page className="max-w-7xl px-0 py-0 md:px-0">
    <PageHeader title="Reportes del grupo" description={`Asistencia y puntualidad de ${group.name}.`} />
    {!report && <ReportFilters key={`${group.id}:${JSON.stringify(filter)}`} groupId={group.id} filter={filter} types={types} />}
    {report && <>
      <p className="break-words text-small">{group.name} · Período: <time dateTime={report.period.from}>{report.period.from}</time> al <time dateTime={report.period.to}>{report.period.to}</time> · America/Santiago</p>
      <ReportSummary label="Resumen del reporte" items={[
        {label:"Asistencia total ponderada",value:report.totals.attendance_pct,percentage:true,attendance:true,description:"Conteos sumados del grupo; todas las páginas."},
        {label:"Promedio individual",value:report.totals.average_attendance_pct,percentage:true,attendance:true,description:"Media de porcentajes individuales con datos."},
        {label:"Actividades realizadas",value:report.totals.activities,description:"Actividades del período seleccionado."},
        {label:"Tasa de atrasos",value:report.totals.late_rate,percentage:true,description:"Atrasos sobre presentes y atrasos."},
      ]}><p className="break-words text-small text-muted-foreground">Mejor asistencia: {report.totals.best_full_name ?? "Sin datos"}.</p></ReportSummary>
    </>}
    {result.error && <p role="alert" className="rounded-md border border-destructive p-4">{result.error}</p>}
    {report && <>
      {report.totals.convened === 0 && <section className="space-y-2 rounded-lg border border-border bg-surface p-4">
        <p>No hay asistencia registrada en este período.</p>
        <p className="text-small text-muted-foreground">Cambia el período o los tipos de actividad y aplica los filtros.</p>
        {!report.has_activities && group.access === "admin" && <Link href={`/groups/${group.id}/activities/new`} className="block underline">Crear primera actividad</Link>}
      </section>}
      <ReportFiltersLink />
      <p className="text-small text-muted-foreground">Página {report.page} · {report.totals.athletes} deportistas en el filtro. Los totales incluyen todas las páginas.</p>
      <section className="space-y-4"><h2 id="athlete-report-heading" className="text-h2">Resumen por deportista</h2><ReportTable report={report} /></section>
      {report.by_athlete.length === 0 && report.totals.athletes > 0 && <p>No hay deportistas en esta página. <Link href={reportPageHref(group.id, filter, 1)} className="underline">Volver a la primera página</Link></p>}
      <nav aria-label="Páginas del reporte" className="flex flex-wrap gap-5">
        {report.page > 1 && <Link href={reportPageHref(group.id, filter, report.page - 1)} className="underline">Anterior</Link>}
        {report.page * report.page_size < report.totals.athletes && <Link href={reportPageHref(group.id, filter, report.page + 1)} className="underline">Siguiente</Link>}
      </nav>
      <ReportFilters key={`${group.id}:${JSON.stringify(filter)}`} groupId={group.id} filter={filter} types={types} />
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
  </Page>;
}
