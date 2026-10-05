import Link from "next/link";
import { notFound } from "next/navigation";
import { attendancePeriodFilterSchema } from "@asisteam/core";
import { AttendanceHistoryContent } from "@/components/attendance-history";
import { getGroup } from "@/lib/groups";
import { getWard } from "@/lib/wards";
import { getActivityTypes } from "@/lib/activities";
import { getWardAttendanceHistory, parseHistoryFilters } from "@/lib/attendance-history";
import type { ReportSearchParams } from "@/lib/reports";
import { ReportFilters } from "../../../reports/report-filters";

export const metadata = { title: "Historial de asistencia del pupilo" };
export const dynamic = "force-dynamic";

export default async function WardHistoryPage({ params, searchParams }: {
  params: Promise<{ groupId: string; athleteUserId: string }>; searchParams: Promise<ReportSearchParams>;
}) {
  const { groupId, athleteUserId } = await params;
  const group = await getGroup(groupId);
  if (!group.roles.includes("GUARDIAN")) notFound();
  const ward = await getWard(athleteUserId);
  if (!ward.groups.some((item) => item.group_id === group.id && item.membership_status === "ACTIVE")) notFound();
  const parsed = parseHistoryFilters(await searchParams);
  const filter = parsed.success ? parsed.data : attendancePeriodFilterSchema.parse({});
  const [types, result] = await Promise.all([
    getActivityTypes(group.id, true),
    parsed.success ? getWardAttendanceHistory(group.id, ward.athlete_user_id, filter)
      : Promise.resolve({ history: null, error: "Revisa los filtros: usa fechas válidas, un rango ordenado y tipos de actividad del grupo." }),
  ]);
  const filters = <ReportFilters key={JSON.stringify(filter)} groupId={group.id} filter={filter} types={types} personal athleteUserId={ward.athlete_user_id} />;
  return <>
    <Link href={`/wards/${ward.athlete_user_id}`} prefetch={false} className="inline-block py-2 underline">Volver al perfil del pupilo</Link>
    <header><h1 className="text-h1">Historial de asistencia del pupilo</h1>
      <p className="mt-2 text-muted-foreground">{ward.full_name} · {group.name}</p></header>
    {result.error && <p role="alert" className="rounded-md border border-destructive p-4">{result.error}</p>}
    {result.history ? <AttendanceHistoryContent history={result.history} filter={filter} athleteUserId={ward.athlete_user_id} filters={filters} /> : filters}
  </>;
}
