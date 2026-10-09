import { createServerApiClient } from "@/lib/api/server";
import { getGroup } from "@/lib/groups";
import { ApiClientError } from "@asisteam/api-client";
import { canManageAttendance,reportFilterSchema,type ReportFilter } from "@asisteam/core";
import { notFound } from "next/navigation";
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
    if (filter.period !== "season" && filter.from)
        query.set("from", filter.from);
    if (filter.period === "custom" && filter.to)
        query.set("to", filter.to);
    if (filter.include_inactive)
        query.set("include_inactive", "true");
    for (const id of filter.activity_type_ids)
        query.append("activity_type_id", id);
    return `/groups/${groupId}/reports?${query}`;
}
export async function getGroupAttendanceReport(groupId: string, filter: ReportFilter) {
    const group = await getGroup(groupId);
    if (!canManageAttendance(group.roles))
        notFound();
    {
        try {
            const report = await createServerApiClient().getGroupAttendanceReport({ params: { groupId: group.id },
                query: { ...filter, activity_type_ids: filter.activity_type_ids.join(","), page_size: 50 } });
            return { report, error: null };
        }
        catch (error) {
            if (error instanceof ApiClientError && [401, 403, 404].includes(error.status))
                notFound();
            if (error instanceof ApiClientError && error.status === 400)
                return { report: null, error: "Revisa el período y los tipos de actividad seleccionados." };
            throw error;
        }
    }
}
export async function getGroupStats(groupId: string, page = 1, pageSize = 50) {
    await getGroup(groupId);
    {
        try {
            return { report: await createServerApiClient().getGroupStats({ params: { groupId }, query: { page, page_size: pageSize } }), error: null };
        }
        catch (error) {
            if (error instanceof ApiClientError && [401, 404].includes(error.status))
                notFound();
            if (error instanceof ApiClientError && error.status === 403 && error.error.code === "group_stats_disabled")
                return { report: null, error: null };
            if (error instanceof ApiClientError && error.status === 400)
                return { report: null, error: "Revisa la página seleccionada." };
            throw error;
        }
    }
}
