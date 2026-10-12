import { RouterLink as Link } from "../navigation";
import { reportAttendanceClass } from "../attendance-presentation";
import { reportPercentage } from "@asisteam/core/browser";
import { StatsTable } from "./stats-table";
import type { StatsData } from "../report-data";
export function GroupStatsContent({data}:{data:StatsData}){
 const {group,result,personal,wards,wardReports,page,wardPage}=data;
 const pageHref=(groupPage:number,selectedWardPage:number)=>`/groups/${group.id}/reports?page=${groupPage}${selectedWardPage>1?`&ward_page=${selectedWardPage}`:""}`;
  const report = result.report;
  const own = personal?.history?.totals;
  return <>
    <header><h1 className="text-h1">Reportes de asistencia</h1><p className="mt-2 text-muted-foreground">{group.name} · temporada completa.</p></header>
    {group.roles.includes("ATHLETE") && <section aria-labelledby="my-attendance-heading" className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <h2 id="my-attendance-heading" className="text-h2">Mi asistencia</h2>
      {personal?.error && <p role="alert">{personal.error}</p>}
      {own && <>
        <p className={`text-display tabular-nums ${reportAttendanceClass(own.attendance_pct)}`}>{reportPercentage(own.attendance_pct)}</p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[["Convocadas", own.convened], ["Presentes", own.present], ["Atrasos", own.late], ["Ausentes", own.absent], ["Justificados", own.excused], ["Tasa de atrasos", reportPercentage(own.late_rate)]].map(([label, value]) => <div key={label}><dt className="text-small text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}
        </dl>
        {own.convened === 0 && <p>Aún no tienes actividades con asistencia registrada en este grupo.</p>}
        <p className="text-small text-muted-foreground">Los atrasos cuentan como asistencia. Los justificados no penalizan. Sin datos indica que no hay convocatorias evaluables.</p>
      </>}
      <Link href={`/groups/${group.id}/me/history?period=season`} prefetch={false} className="block underline">Ver mi historial de asistencia</Link>
    </section>}
    {wards && <section aria-labelledby="ward-attendance-heading" className="space-y-4">
      <h2 id="ward-attendance-heading" className="text-h2">Asistencia de mis pupilos</h2>
      <p className="text-small text-muted-foreground">Métricas de temporada de tus pupilos activos en este grupo, disponibles independientemente de las estadísticas grupales.</p>
      {wardReports.length === 0 && <p>No hay pupilos activos en esta página del grupo.</p>}
      {wardReports.map((ward) => <section key={ward.athlete_user_id} aria-labelledby={`ward-${ward.athlete_user_id}`} className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <h3 id={`ward-${ward.athlete_user_id}`} className="text-h3">{ward.full_name}</h3>
        {ward.error && <p role="alert">{ward.error}</p>}
        {ward.history && <>
          <p className={`text-display tabular-nums ${reportAttendanceClass(ward.history.totals.attendance_pct)}`}>{reportPercentage(ward.history.totals.attendance_pct)}</p>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[["Convocadas", ward.history.totals.convened], ["Presentes", ward.history.totals.present], ["Atrasos", ward.history.totals.late], ["Ausentes", ward.history.totals.absent], ["Justificados", ward.history.totals.excused], ["Tasa de atrasos", reportPercentage(ward.history.totals.late_rate)]].map(([label, value]) => <div key={label}><dt className="text-small text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}
          </dl>
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
