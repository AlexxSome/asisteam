import Link from "next/link";
import { activityTypeLabel, formatActivityDateTime } from "@asisteam/core";
import { getAttendance } from "@/lib/attendance";
import { AttendanceSheet } from "./attendance-sheet";

export const metadata = { title: "Tomar asistencia" };

export default async function AttendancePage({ params }: { params: Promise<{ groupId: string; activityId: string }> }) {
  const { groupId, activityId } = await params;
  const { activity, roster } = await getAttendance(groupId, activityId);
  return <>
    <Link href={`/groups/${groupId}/activities/${activityId}`} className="underline">Volver a la actividad</Link>
    <header className="space-y-2"><h1 className="break-words text-2xl font-semibold">Tomar asistencia · {activity.title}</h1>
      <p>{activityTypeLabel(activity.activity_type_name ?? "", !!activity.is_system_type)} · {activity.starts_at && formatActivityDateTime(activity.starts_at)} (Chile)</p>
    </header>
    {activity.starts_at && new Date(activity.starts_at).getTime() - Date.now() > 2 * 60 * 60 * 1000 &&
      <p className="rounded-md border border-amber-500 bg-amber-50 p-3 text-amber-950">Esta actividad aún no comienza; puedes registrar asistencia anticipada.</p>}
    {roster.length ? <AttendanceSheet key={activityId} groupId={groupId} activityId={activityId} initialRows={roster} /> :
      <p>Este grupo aún no tiene deportistas activos.</p>}
  </>;
}
