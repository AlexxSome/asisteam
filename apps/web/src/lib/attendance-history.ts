import { notFound } from "next/navigation";
import { attendanceHistorySchema, attendancePeriodFilterSchema, type AttendancePeriodFilter } from "@asisteam/core";
import { getGroup } from "@/lib/groups";
import { createClient } from "@/lib/supabase/server";
import type { ReportSearchParams } from "./reports";

export function parseHistoryFilters(query: ReportSearchParams) {
  const ids = query.activity_type_id;
  return attendancePeriodFilterSchema.safeParse({
    period: query.period, from: query.from || undefined, to: query.to || undefined,
    activity_type_ids: ids ? (Array.isArray(ids) ? ids : [ids]) : [], page: query.page,
  });
}

export function historyPageHref(groupId: string, filter: AttendancePeriodFilter, page = 1) {
  const query = new URLSearchParams({ period: filter.period, page: String(page) });
  if (filter.from) query.set("from", filter.from);
  if (filter.to) query.set("to", filter.to);
  for (const id of filter.activity_type_ids) query.append("activity_type_id", id);
  return `/groups/${groupId}/me/history?${query}`;
}

export async function getMyAttendanceHistory(groupId: string, filter: AttendancePeriodFilter) {
  const group = await getGroup(groupId);
  if (!group.roles.includes("ATHLETE")) notFound();
  const supabase = await createClient();
  // La base resuelve la membership propia a partir del JWT en cada lectura.
  const { data, error } = await supabase.rpc("get_my_attendance_history", {
    p_group_id: group.id, p_period: filter.period, p_from: filter.from, p_to: filter.to,
    p_activity_type_ids: filter.activity_type_ids, p_page: filter.page, p_page_size: 50,
  });
  if (["PT401", "PT403", "PT404"].includes(error?.code ?? "")) notFound();
  if (error?.code === "PT400") return { history: null, error: "Revisa el período y los tipos de actividad seleccionados." };
  if (error) throw new Error("No pudimos cargar tu historial. Vuelve a intentarlo.");
  const parsed = attendanceHistorySchema.safeParse(data);
  if (!parsed.success) throw new Error("No pudimos leer tu historial. Vuelve a intentarlo.");
  return { history: parsed.data, error: null };
}
