import { createServerApiClient } from "@/lib/api/server";
import { isGroupId } from "@/lib/group-routing";
import { getGroup,getMyGroups } from "@/lib/groups";
import { getWard } from "@/lib/wards";
import { ApiClientError } from "@asisteam/api-client";
import { activityDateTimeInput } from "@asisteam/core";
import { notFound } from "next/navigation";
import { cache } from "react";
export const ACTIVITY_PAGE_SIZE = 50;
export type ActivityPeriod = "upcoming" | "past";
export type ActivitySearchParams = {
    page?: string | string[];
    period?: string | string[];
};
export function parseActivitySearch({ page = "1", period = "upcoming" }: ActivitySearchParams): {
    page: number;
    period: ActivityPeriod;
} {
    if (typeof page !== "string" || !/^\d+$/.test(page)
        || !Number.isSafeInteger(Number(page)) || Number(page) < 1 || Number(page) > 1000000
        || (period !== "upcoming" && period !== "past"))
        notFound();
    return { page: Number(page), period };
}
export async function getActivityTypes(groupId: string, includeInactive = false) {
    await getGroup(groupId);
    {
        const client = createServerApiClient();
        const types = [];
        for (let page = 1;; page++) {
            const result = await client.listActivityTypes({ params: { groupId }, query: { page, include_inactive: includeInactive } });
            types.push(...result.data);
            if (!result.hasNext)
                return types;
        }
    }
}

export async function getActivities(groupId: string, page = 1, period: ActivityPeriod = "upcoming") {
    await getGroup(groupId);
    parseActivitySearch({ page: String(page), period });
    return createServerApiClient().listGroupActivities({ params: { groupId }, query: { page, period } });
}
export async function getMyActivities(page = 1, period: ActivityPeriod = "upcoming") {
    const { groups } = await getMyGroups();
    const result = await loadActivities(groups.map((group) => group.id), page, period);
    const names = new Map(groups.map((group) => [group.id, group.name]));
    return {
        ...result,
        activities: result.activities.map((activity) => ({ ...activity, group_name: names.get(activity.group_id ?? "") ?? "" })),
    };
}
export async function getWardActivities(athleteUserId: string, page = 1, period: ActivityPeriod = "upcoming") {
    const ward = await getWard(athleteUserId);
    // C10: la agenda depende de las membresías activas de este pupilo,
    // no de todos los grupos a los que pertenece su apoderado.
    const groups = ward.groups.flatMap((group) => group.membership_status === "ACTIVE" && group.group_id
        ? [{ id: group.group_id, name: group.name }] : []);
    const result = await loadActivities(groups.map((group) => group.id), page, period);
    const names = new Map(groups.map((group) => [group.id, group.name]));
    return {
        ...result,
        ward,
        activities: result.activities.map((activity) => ({ ...activity, group_name: names.get(activity.group_id ?? "") ?? "" })),
    };
}
async function loadActivities(groupIds: string[], page: number, period: ActivityPeriod) {
    parseActivitySearch({ page: String(page), period });
    if (!groupIds.length)
        return { activities: [], hasNext: false };
    return createServerApiClient().listActivities({ query: { group_ids: groupIds.join(","), page, period } });
}
export async function getActivity(groupId: string, activityId: string) {
    await getGroup(groupId);
    if (!isGroupId(activityId))
        notFound();
    {
        try {
            return await createServerApiClient().getActivity({ params: { groupId, activityId } });
        }
        catch (error) {
            if (error instanceof ApiClientError && error.status === 404)
                notFound();
            throw error;
        }
    }
}
/** Request-scoped: the same group can appear under several wards. */
export const getHomeActivities = cache(async (groupId: string) => {
    await getGroup(groupId);
    return loadHomeActivities([groupId]);
});
export async function getWardHomeActivities(athleteUserId: string) {
    const ward = await getWard(athleteUserId);
    return loadHomeActivities(ward.groups.flatMap(group => group.membership_status === "ACTIVE" && group.group_id ? [group.group_id] : []));
}
async function loadHomeActivities(groupIds: string[]) {
    const now = new Date().toISOString();
    if (!groupIds.length)
        return { next: null, previous: null, now };
    return createServerApiClient().getHomeActivities({ query: { group_ids: groupIds.join(",") } });
}
export function homeActivityLabel(activity: {
    starts_at: string | null;
    ends_at: string | null;
}, now: string) {
    if (!activity.starts_at || !activity.ends_at)
        return "Actividad";
    if (Date.parse(activity.starts_at) <= Date.parse(now) && Date.parse(activity.ends_at) >= Date.parse(now))
        return "En curso";
    const today = activityDateTimeInput(activity.starts_at).slice(0, 10) === activityDateTimeInput(now).slice(0, 10);
    return Date.parse(activity.ends_at) < Date.parse(now) ? (today ? "Anterior de hoy" : "Anterior") : (today ? "Hoy" : "Próxima");
}
