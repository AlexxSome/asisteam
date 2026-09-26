import Link from "next/link";
import { attendancePeriodFilterSchema, reportAttendanceTone, reportPercentage } from "@asisteam/core";
import { getMyAttendanceHistory } from "@/lib/attendance-history";
import { getGroupStats, type ReportSearchParams } from "@/lib/reports";
import { StatsTable } from "./stats-table";

export async function GroupStatsContent({ group, query }: {
  group: { id: string; name: string; roles: string[] }; query: ReportSearchParams;
}) {
  const page = typeof query.page === "string" ? Number(query.page) : query.page === undefined ? 1 : NaN;
  const [result, personal] = await Promise.all([
    Number.isInteger(page) && page >= 1 && page <= 1000000
      ? getGroupStats(group.id, page)
      : Promise.resolve({ report: null, error: "Revisa la página seleccionada." }),
    group.roles.includes("ATHLETE")
      ? getMyAttendanceHistory(group.id, attendancePeriodFilterSchema.parse({ period: "season" }))
      : Promise.resolve(null),
  ]);
  const report = result.report;
  const own = personal?.history?.totals;
  return <>
    <header><h1 className="text-2xl font-semibold">Reportes de asistencia</h1><p className="mt-2 text-muted-foreground">{group.name} · temporada completa.</p></header>
    {group.roles.includes("ATHLETE") && <section aria-labelledby="my-attendance-heading" className="space-y-4 rounded-lg border p-4">
      <h2 id="my-attendance-heading" className="text-xl font-semibold">Mi asistencia</h2>
      {personal?.error && <p role="alert">{personal.error}</p>}
      {own && <>
        <p className={`text-3xl font-semibold ${reportAttendanceTone(own.attendance_pct)}`}>{reportPercentage(own.attendance_pct)}</p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[["Convocadas", own.convened], ["Presentes", own.present], ["Atrasos", own.late], ["Ausentes", own.absent], ["Justificados", own.excused], ["Tasa de atrasos", reportPercentage(own.late_rate)]].map(([label, value]) => <div key={label}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-semibold tabular-nums">{value}</dd></div>)}
        </dl>
        {own.convened === 0 && <p>Aún no tienes actividades con asistencia registrada en este grupo.</p>}
        <p className="text-sm text-muted-foreground">Los atrasos cuentan como asistencia. Los justificados no penalizan. Sin datos indica que no hay convocatorias evaluables.</p>
      </>}
      <Link href={`/groups/${group.id}/me/history?period=season`} prefetch={false} className="block underline">Ver mi historial de asistencia</Link>
    </section>}
    {result.error ? <p role="alert">{result.error} <Link href={`/groups/${group.id}/reports`} prefetch={false} className="underline">Volver al inicio</Link></p>
      : !report && <p>El administrador no ha habilitado las estadísticas del grupo para tus roles actuales.</p>}
    {report && <section aria-labelledby="group-stats-heading" className="space-y-4">
      <h2 id="group-stats-heading" className="text-xl font-semibold">Estadísticas del grupo</h2>
      <p className="text-sm text-muted-foreground">Solo nombres, fotos autorizadas y métricas agregadas. Los justificados no penalizan; los atrasos cuentan como asistencia. Sin datos indica que no hay convocatorias evaluables.</p>
      {report.totals.convened === 0 && <p>Aún no hay asistencia registrada en esta temporada.</p>}
      <StatsTable report={report} />
      {report.members.length === 0 && report.totals.athletes > 0 && <p>No hay deportistas en esta página.</p>}
      <nav aria-label="Páginas de estadísticas" className="flex flex-wrap gap-5">
        {report.page > 1 && <Link href={`/groups/${group.id}/reports?page=${report.page - 1}`} prefetch={false} className="underline">Anterior</Link>}
        {report.page * report.page_size < report.totals.athletes && <Link href={`/groups/${group.id}/reports?page=${report.page + 1}`} prefetch={false} className="underline">Siguiente</Link>}
      </nav>
    </section>}
    {group.roles.includes("GUARDIAN") && <nav aria-label="Asistencia personal" className="flex flex-wrap gap-5">
      <Link href={`/groups/${group.id}#my-wards`} className="underline">Mis pupilos</Link>
    </nav>}
  </>;
}
