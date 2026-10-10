import { createServerApiClient } from "@/lib/api/server";
import { isGroupId } from "@/lib/group-routing";
import { getGroup } from "@/lib/groups";
import { ApiClientError } from "@asisteam/api-client";
import { attendancePeriodFilterSchema,httpSchemas,type AttendancePeriodFilter } from "@asisteam/core";
import { ZodError } from "zod";
import { notFound } from "next/navigation";
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
    if (filter.period !== "season" && filter.from)
        query.set("from", filter.from);
    if (filter.period === "custom" && filter.to)
        query.set("to", filter.to);
    for (const id of filter.activity_type_ids)
        query.append("activity_type_id", id);
    return `/groups/${groupId}/${athleteUserId ? `wards/${athleteUserId}` : "me"}/history?${query}`;
}
export async function getWardAttendanceHistory(groupId: string, athleteUserId: string, filter: AttendancePeriodFilter, pageSize = 50) {
    if (!isGroupId(athleteUserId))
        notFound();
    const group = await getGroup(groupId);
    if (!group.roles.includes("GUARDIAN"))
        notFound();
    {
        try {
            const history = await createServerApiClient().getWardAttendanceHistory({ params: { groupId: group.id, athleteUserId },
                query: { ...filter, activity_type_ids: filter.activity_type_ids.join(","), page_size: pageSize } });
            return { history: httpSchemas.AttendanceHistory.parse(history), error: null };
        }
        catch (error) {
            if (error instanceof ApiClientError && [401, 403, 404].includes(error.status))
                notFound();
            if (error instanceof ApiClientError && error.status === 400)
                return { history: null, error: "Revisa el período y los tipos de actividad seleccionados." };
            throw Object.assign(new Error(error instanceof ZodError ? "No pudimos leer el historial del pupilo." : "No pudimos cargar el historial del pupilo.", { cause: error }), error instanceof ApiClientError ? { status: error.status } : {});
        }
    }
}
export async function getMyAttendanceHistory(groupId: string, filter: AttendancePeriodFilter, pageSize = 50) {
    const group = await getGroup(groupId);
    if (!group.roles.includes("ATHLETE"))
        notFound();
    {
        try {
            const history = await createServerApiClient().getMyAttendanceHistory({ params: { groupId: group.id },
                query: { ...filter, activity_type_ids: filter.activity_type_ids.join(","), page_size: pageSize } });
            return { history: httpSchemas.AttendanceHistory.parse(history), error: null };
        }
        catch (error) {
            if (error instanceof ApiClientError && [401, 403, 404].includes(error.status))
                notFound();
            if (error instanceof ApiClientError && error.status === 400)
                return { history: null, error: "Revisa el período y los tipos de actividad seleccionados." };
            throw Object.assign(new Error(error instanceof ZodError ? "No pudimos leer tu historial." : "No pudimos cargar tu historial.", { cause: error }), error instanceof ApiClientError ? { status: error.status } : {});
        }
    }
}
