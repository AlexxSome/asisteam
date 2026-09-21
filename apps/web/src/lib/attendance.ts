import { notFound } from "next/navigation";
import { attendanceSavedRecordsSchema, type AttendanceRosterRow } from "@asisteam/core";
import { getGroup } from "@/lib/groups";
import { getActivity } from "@/lib/activities";
import { createClient } from "@/lib/supabase/server";

export async function getAttendance(groupId: string, activityId: string) {
  const group = await getGroup(groupId);
  // El middleware entrega HTTP403 antes del streaming. Esta comprobación
  // mantiene la defensa al reutilizar el loader fuera de esa ruta.
  if (!group.roles.includes("ADMIN")) notFound();
  const activity = await getActivity(groupId, activityId);
  const supabase = await createClient();
  const roster: AttendanceRosterRow[] = [];
  const saved = new Map<string, { status: AttendanceRosterRow["status"]; note: string | null }>();
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.from("v_attendance_admin")
      .select("membership_id, status, note").eq("activity_id", activityId).eq("group_id", groupId)
      .order("membership_id").range(offset, offset + 99);
    if (error) throw new Error("No pudimos cargar la asistencia. Vuelve a intentarlo.");
    for (const record of attendanceSavedRecordsSchema.parse(data ?? [])) saved.set(record.membership_id, { status: record.status, note: record.note ?? null });
    if ((data?.length ?? 0) < 100) break;
  }
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.from("v_attendance_roster")
      .select("membership_id, full_name, avatar_url").eq("group_id", groupId)
      .order("full_name").order("membership_id").range(offset, offset + 99);
    if (error) throw new Error("No pudimos cargar los deportistas. Vuelve a intentarlo.");
    for (const row of data ?? []) {
      if (!row.membership_id || !row.full_name) continue;
      roster.push({ membership_id: row.membership_id, full_name: row.full_name, avatar_url: row.avatar_url,
        status: saved.get(row.membership_id)?.status ?? null, note: saved.get(row.membership_id)?.note ?? null });
    }
    if ((data?.length ?? 0) < 100) break;
  }
  return { activity, roster };
}
