import { notFound } from "next/navigation";
import { attendanceHistorySchema, attendancePeriodFilterSchema, type AttendancePeriodFilter } from "@asisteam/core";
import { getGroup } from "@/lib/groups";
import { createClient } from "@/lib/supabase/server";
import { isGroupId } from "@/lib/group-routing";
import type { ReportSearchParams } from "./reports";

export function parseHistoryFilters(query: ReportSearchParams) {
  const ids = query.activity_type_id;
  return attendancePeriodFilterSchema.safeParse({
    period: query.period, from: query.period === "season" ? undefined : query.from || undefined,
    to: query.period === "custom" ? query.to || undefined : undefined,
    activity_type_ids: ids ? (Array.isArray(ids) ? ids : [ids]) : [], page: query.page,
  });
}

export function historyPageHref(groupId: string, filter: AttendancePeriodFilter, page = 1, athleteUserId?: string) {
  const query = new URLSearchParams({ period: filter.period, page: String(page) });
  if (filter.period !== "season" && filter.from) query.set("from", filter.from);
  if (filter.period === "custom" && filter.to) query.set("to", filter.to);
  for (const id of filter.activity_type_ids) query.append("activity_type_id", id);
  return `/groups/${groupId}/${athleteUserId ? `wards/${athleteUserId}` : "me"}/history?${query}`;
}

export async function getWardAttendanceHistory(groupId: string, athleteUserId: string, filter: AttendancePeriodFilter, pageSize = 50) {
  if (!isGroupId(athleteUserId)) notFound();
  const group = await getGroup(groupId);
  if (!group.roles.includes("GUARDIAN")) notFound();
  const supabase = await createClient();
  // El vínculo, la edad y ambas membresías se verifican de nuevo en la base.
  const { data, error } = await supabase.rpc("get_ward_attendance_history", {
    p_group_id: group.id, p_athlete_user_id: athleteUserId,
    p_period: filter.period, p_from: filter.from, p_to: filter.to,
    p_activity_type_ids: filter.activity_type_ids, p_page: filter.page, p_page_size: pageSize,
  });
  if (["PT401", "PT403", "PT404"].includes(error?.code ?? "")) notFound();
  if (error?.code === "PT400") return { history: null, error: "Revisa el período y los tipos de actividad seleccionados." };
  if (error) throw new Error("No pudimos cargar el historial del pupilo. Vuelve a intentarlo.");
  const parsed = attendanceHistorySchema.safeParse(data);
  if (!parsed.success) throw new Error("No pudimos leer el historial del pupilo. Vuelve a intentarlo.");
  return { history: parsed.data, error: null };
}

export async function getMyAttendanceHistory(groupId: string, filter: AttendancePeriodFilter, pageSize = 50) {
  const group = await getGroup(groupId);
  if (!group.roles.includes("ATHLETE")) notFound();
  const supabase = await createClient();
  // La base resuelve la membership propia a partir del JWT en cada lectura.
  const { data, error } = await supabase.rpc("get_my_attendance_history", {
    p_group_id: group.id, p_period: filter.period, p_from: filter.from, p_to: filter.to,
    p_activity_type_ids: filter.activity_type_ids, p_page: filter.page, p_page_size: pageSize,
  });
  if (["PT401", "PT403", "PT404"].includes(error?.code ?? "")) notFound();
  if (error?.code === "PT400") return { history: null, error: "Revisa el período y los tipos de actividad seleccionados." };
  if (error) throw new Error("No pudimos cargar tu historial. Vuelve a intentarlo.");
  const parsed = attendanceHistorySchema.safeParse(data);
  if (!parsed.success) throw new Error("No pudimos leer tu historial. Vuelve a intentarlo.");
  return { history: parsed.data, error: null };
}
