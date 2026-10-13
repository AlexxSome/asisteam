import { RouterLink as Link } from "../navigation";
import { PageHeader } from "./ui/page-header";
import { ReportSummary } from "./report-summary";
import type { AttendanceHistory } from "@asisteam/core/browser";
import { StatsTable } from "./stats-table";
import type { StatsData } from "../report-data";
function PersonalSummary({ totals, label }: { totals: AttendanceHistory["totals"]; label: string }) {
  return <ReportSummary label={label} items={[
    {label:"Asistencia de temporada",value:totals.attendance_pct,percentage:true,attendance:true,description:"Solo actividades con registro en este grupo."},
    {label:"Convocadas",value:totals.convened,description:"Actividades con asistencia registrada."},
    {label:"Justificados",value:totals.excused,description:"Se excluyen del denominador."},
    {label:"Tasa de atrasos",value:totals.late_rate,percentage:true,description:"Atrasos sobre presentes y atrasos."},
  ]}><p className="text-small">Presentes: {totals.present} · Atrasos: {totals.late} · Ausentes: {totals.absent}</p></ReportSummary>;
}
export function GroupStatsContent({data}:{data:StatsData}){
 const {group,result,personal,wards,wardReports,page,wardPage}=data;
 const pageHref=(groupPage:number,selectedWardPage:number)=>`/groups/${group.id}/reports?page=${groupPage}${selectedWardPage>1?`&ward_page=${selectedWardPage}`:""}`;
  const report = result.report;
  const own = personal?.history?.totals;
  return <>
    <PageHeader title="Reportes de asistencia" description={`${group.name} · temporada completa · America/Santiago.`} />
    {group.roles.includes("ATHLETE") && <section aria-labelledby="my-attendance-heading" className="space-y-4 min-w-0">
      <h2 id="my-attendance-heading" className="text-h2">Mi asistencia</h2>
      {personal?.error && <p role="alert">{personal.error}</p>}
      {own && <>
        <PersonalSummary totals={own} label="Resumen de mi asistencia de temporada" />
        {own.convened === 0 && <p>Aún no tienes actividades con asistencia registrada en este grupo.</p>}
        <p className="text-small text-muted-foreground">Los atrasos cuentan como asistencia. Los justificados no penalizan. Sin datos indica que no hay convocatorias evaluables.</p>
      </>}
      <Link href={`/groups/${group.id}/me/history?period=season`} prefetch={false} className="block underline">Ver mi historial de asistencia</Link>
    </section>}
    {wards && <section aria-labelledby="ward-attendance-heading" className="space-y-4">
      <h2 id="ward-attendance-heading" className="text-h2">Asistencia de mis pupilos</h2>
      <p className="text-small text-muted-foreground">Métricas de temporada de tus pupilos activos en este grupo, disponibles independientemente de las estadísticas grupales.</p>
      {wardReports.length === 0 && <p>No hay pupilos activos en esta página del grupo.</p>}
      {wardReports.map((ward) => <section key={ward.athlete_user_id} aria-labelledby={`ward-${ward.athlete_user_id}`} className="space-y-3 min-w-0">
        <h3 id={`ward-${ward.athlete_user_id}`} className="break-words text-h3">{ward.full_name}</h3>
        {ward.error && <p role="alert">{ward.error}</p>}
        {ward.history && <>
          <PersonalSummary totals={ward.history.totals} label={`Resumen de temporada de ${ward.full_name}`} />
          {ward.history.totals.convened === 0 && <p>Tu pupilo aún no tiene actividades con asistencia registrada en este grupo.</p>}
        </>}
        <Link href={`/groups/${group.id}/wards/${ward.athlete_user_id}/history?period=season`} prefetch={false} className="block underline">Ver historial de {ward.full_name}</Link>
      </section>)}
      <nav aria-label="Páginas de pupilos" className="flex flex-wrap gap-5">
        {wardPage > 1 && <Link href={pageHref(page, wardPage - 1)} prefetch={false} className="underline">Pupilos anteriores</Link>}
        {wards.hasNext && <Link href={pageHref(page, wardPage + 1)} prefetch={false} className="underline">Más pupilos</Link>}
      </nav>
    </section>}
    {result.error ? <p role="alert">{result.error} <Link href={`/groups/${group.id}/reports`} prefetch={false} className="underline">Volver al inicio</Link></p>
      : !report && <p>El administrador no ha habilitado las estadísticas del grupo para tus roles actuales.</p>}
    {report && <section aria-labelledby="group-stats-heading" className="space-y-4">
      <h2 id="group-stats-heading" className="text-h2">Estadísticas del grupo</h2>
      <p className="text-small text-muted-foreground">Solo nombres, fotos autorizadas y métricas agregadas. Los justificados no penalizan; los atrasos cuentan como asistencia. Sin datos indica que no hay convocatorias evaluables.</p>
      {report.totals.convened === 0 && <p>Aún no hay asistencia registrada en esta temporada.</p>}
      <ReportSummary label="Resumen agregado del grupo" items={[
        {label:"Asistencia total ponderada",value:report.totals.attendance_pct,percentage:true,attendance:true,description:"Conteos sumados de todos los deportistas activos del grupo."},
        {label:"Deportistas activos",value:report.totals.athletes,description:"Totales de todas las páginas de esta temporada."},
        {label:"Convocadas",value:report.totals.convened,description:"Registros de asistencia de esta temporada."},
        {label:"Tasa de atrasos",value:report.totals.late_rate,percentage:true,description:"Atrasos sobre presentes y atrasos del grupo."},
      ]} />
      <StatsTable report={report} />
      {report.members.length === 0 && report.totals.athletes > 0 && <p>No hay deportistas en esta página.</p>}
      <nav aria-label="Páginas de estadísticas" className="flex flex-wrap gap-5">
        {report.page > 1 && <Link href={pageHref(report.page - 1, wardPage)} prefetch={false} className="underline">Anterior</Link>}
        {report.page * report.page_size < report.totals.athletes && <Link href={pageHref(report.page + 1, wardPage)} prefetch={false} className="underline">Siguiente</Link>}
      </nav>
    </section>}
    {group.roles.includes("GUARDIAN") && <nav aria-label="Asistencia personal" className="flex flex-wrap gap-5">
      <Link href={`/groups/${group.id}#my-wards`} className="underline">Mis pupilos</Link>
    </nav>}
  </>;
}
