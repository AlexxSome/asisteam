import { notFound } from "next/navigation";
import { groupAttendanceReportSchema, groupStatsSchema, reportFilterSchema, type ReportFilter } from "@asisteam/core";
import { getGroup } from "@/lib/groups";
import { createClient } from "@/lib/supabase/server";

export type ReportSearchParams = Record<string, string | string[] | undefined>;
export function parseReportFilters(query: ReportSearchParams) {
  const ids = query.activity_type_id;
  return reportFilterSchema.safeParse({
    period: query.period, from: query.from || undefined, to: query.to || undefined,
    activity_type_ids: ids ? (Array.isArray(ids) ? ids : [ids]) : [],
    include_inactive: query.include_inactive === "true", page: query.page, sort: query.sort,
  });
}

export function reportPageHref(groupId: string, filter: ReportFilter, page: number) {
  const query = new URLSearchParams({ period: filter.period, sort: filter.sort, page: String(page) });
  if (filter.from) query.set("from", filter.from);
  if (filter.to) query.set("to", filter.to);
  if (filter.include_inactive) query.set("include_inactive", "true");
  for (const id of filter.activity_type_ids) query.append("activity_type_id", id);
  return `/groups/${groupId}/reports?${query}`;
}

export async function getGroupAttendanceReport(groupId: string, filter: ReportFilter) {
  const group = await getGroup(groupId);
  if (!group.roles.includes("ADMIN")) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_group_attendance_report", {
    p_group_id: group.id, p_period: filter.period, p_from: filter.from, p_to: filter.to,
    p_activity_type_ids: filter.activity_type_ids, p_include_inactive: filter.include_inactive,
    p_page: filter.page, p_page_size: 50, p_sort: filter.sort,
  });
  if (error?.code === "PT403" || error?.code === "PT404") notFound();
  if (error?.code === "PT400") return { report: null, error: "Revisa el período y los tipos de actividad seleccionados." };
  if (error) throw new Error("No pudimos cargar el reporte. Vuelve a intentarlo.");
  const parsed = groupAttendanceReportSchema.safeParse(data);
  if (!parsed.success) throw new Error("No pudimos leer el reporte. Vuelve a intentarlo.");
  return { report: parsed.data, error: null };
}

export async function getGroupStats(groupId: string, page = 1, pageSize = 50) {
  await getGroup(groupId);
  const supabase = await createClient();
  // La RPC reevalúa el permiso en cada consulta, incluida una revocación
  // posterior a la lectura del layout. No se cachean reportes entre peticiones.
  const { data, error } = await supabase.rpc("get_group_stats", { p_group_id: groupId, p_page: page, p_page_size: pageSize });
  if (error?.code === "PT404" || error?.code === "PT401") notFound();
  if (error?.code === "PT403") return { report: null, error: null };
  if (error?.code === "PT400") return { report: null, error: "Revisa la página seleccionada." };
  if (error) throw new Error("No pudimos cargar las estadísticas. Vuelve a intentarlo.");
  const parsed = groupStatsSchema.safeParse(data);
  if (!parsed.success) throw new Error("No pudimos leer las estadísticas. Vuelve a intentarlo.");
  return { report: parsed.data, error: null };
}
