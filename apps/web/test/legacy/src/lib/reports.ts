// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
import { notFound } from "next/navigation";
import { ApiClientError } from "@asisteam/api-client";
import { moduleTransport } from "@legacy/lib/api/config";
import { createServerApiClient } from "@legacy/lib/api/server";
import { canManageAttendance, groupAttendanceReportSchema, groupStatsSchema, reportFilterSchema, type ReportFilter } from "@asisteam/core";
import { getGroup } from "@legacy/lib/groups";
import { createClient } from "@legacy/lib/supabase/server";

export type ReportSearchParams = Record<string, string | string[] | undefined>;
export function parseReportFilters(query: ReportSearchParams) {
  const ids = query.activity_type_id;
  return reportFilterSchema.safeParse({
    period: query.period, from: query.period === "season" ? undefined : query.from || undefined,
    to: query.period === "custom" ? query.to || undefined : undefined,
    activity_type_ids: ids ? (Array.isArray(ids) ? ids : [ids]) : [],
    include_inactive: query.include_inactive === "true", page: query.page, sort: query.sort,
  });
}

export function reportPageHref(groupId: string, filter: ReportFilter, page: number) {
  const query = new URLSearchParams({ period: filter.period, sort: filter.sort, page: String(page) });
  if (filter.period !== "season" && filter.from) query.set("from", filter.from);
  if (filter.period === "custom" && filter.to) query.set("to", filter.to);
  if (filter.include_inactive) query.set("include_inactive", "true");
  for (const id of filter.activity_type_ids) query.append("activity_type_id", id);
  return `/groups/${groupId}/reports?${query}`;
}

export async function getGroupAttendanceReport(groupId: string, filter: ReportFilter) {
  const group = await getGroup(groupId);
  if (!canManageAttendance(group.roles)) notFound();
  if (moduleTransport("reports") === "nest") {
    try {
      const report = await createServerApiClient().getGroupAttendanceReport({ params: { groupId: group.id },
        query: { ...filter, activity_type_ids: filter.activity_type_ids.join(","), page_size: 50 } });
      return { report, error: null };
    } catch (error) {
      if (error instanceof ApiClientError && [401, 403, 404].includes(error.status)) notFound();
      if (error instanceof ApiClientError && error.status === 400) return { report: null, error: "Revisa el período y los tipos de actividad seleccionados." };
      throw error;
    }
  }
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
  if (moduleTransport("reports") === "nest") {
    try {
      return { report: await createServerApiClient().getGroupStats({ params: { groupId }, query: { page, page_size: pageSize } }), error: null };
    } catch (error) {
      if (error instanceof ApiClientError && [401, 404].includes(error.status)) notFound();
      if (error instanceof ApiClientError && error.status === 403 && error.error.code === "group_stats_disabled") return { report: null, error: null };
      if (error instanceof ApiClientError && error.status === 400) return { report: null, error: "Revisa la página seleccionada." };
      throw error;
    }
  }
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
