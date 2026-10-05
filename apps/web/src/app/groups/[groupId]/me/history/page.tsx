import { notFound } from "next/navigation";
import { attendancePeriodFilterSchema } from "@asisteam/core";
import { getGroup } from "@/lib/groups";
import { getActivityTypes } from "@/lib/activities";
import { getMyAttendanceHistory, parseHistoryFilters } from "@/lib/attendance-history";
import { AttendanceHistoryContent } from "@/components/attendance-history";
import type { ReportSearchParams } from "@/lib/reports";
import { ReportFilters } from "../../reports/report-filters";

export const metadata = { title: "Mi historial de asistencia" };
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
  const filters = <ReportFilters key={JSON.stringify(filter)} groupId={group.id} filter={filter} types={types} personal />;
  return <>
    <header><h1 className="text-h1">Mi historial de asistencia</h1>
      <p className="mt-2 text-muted-foreground">{history && `${history.full_name} · `}{group.name}</p></header>
    {result.error && <p role="alert" className="rounded-md border border-destructive p-4">{result.error}</p>}
    {history ? <AttendanceHistoryContent history={history} filter={filter} filters={filters} /> : filters}
  </>;
}
