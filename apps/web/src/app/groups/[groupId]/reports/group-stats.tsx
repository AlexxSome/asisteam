import Link from "next/link";
import { getGroupStats, type ReportSearchParams } from "@/lib/reports";
import { StatsTable } from "./stats-table";

export async function GroupStatsContent({ group, query }: {
  group: { id: string; name: string; roles: string[] }; query: ReportSearchParams;
}) {
  const page = typeof query.page === "string" ? Number(query.page) : query.page === undefined ? 1 : NaN;
  const result = Number.isInteger(page) && page >= 1 && page <= 1000000
    ? await getGroupStats(group.id, page)
    : { report: null, error: "Revisa la página seleccionada." };
  const report = result.report;
  return <>
    <header><h1 className="text-2xl font-semibold">Estadísticas del grupo</h1><p className="mt-2 text-muted-foreground">{group.name} · temporada completa.</p></header>
    {result.error ? <p role="alert">{result.error} <Link href={`/groups/${group.id}/reports`} prefetch={false} className="underline">Volver al inicio</Link></p>
      : !report && <p>El administrador no ha habilitado las estadísticas del grupo para tus roles actuales.</p>}
    {report && <>
      <p className="text-sm text-muted-foreground">Solo nombres, fotos autorizadas y métricas agregadas. Los justificados no penalizan; los atrasos cuentan como asistencia. Sin datos indica que no hay convocatorias evaluables.</p>
      {report.totals.convened === 0 && <p>Aún no hay asistencia registrada en esta temporada.</p>}
      <StatsTable report={report} />
      {report.members.length === 0 && report.totals.athletes > 0 && <p>No hay deportistas en esta página.</p>}
      <nav aria-label="Páginas de estadísticas" className="flex flex-wrap gap-5">
        {report.page > 1 && <Link href={`/groups/${group.id}/reports?page=${report.page - 1}`} prefetch={false} className="underline">Anterior</Link>}
        {report.page * report.page_size < report.totals.athletes && <Link href={`/groups/${group.id}/reports?page=${report.page + 1}`} prefetch={false} className="underline">Siguiente</Link>}
      </nav>
    </>}
    <nav aria-label="Asistencia personal" className="flex flex-wrap gap-5">
      {group.roles.includes("ATHLETE") && <Link href={`/groups/${group.id}#my-attendance`} className="underline">Mi asistencia</Link>}
      {group.roles.includes("GUARDIAN") && <Link href={`/groups/${group.id}#my-wards`} className="underline">Mis pupilos</Link>}
    </nav>
  </>;
}
