// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
import { ApiClientError } from "@asisteam/api-client";
import { moduleTransport } from "@legacy/lib/api/config";
import { createServerApiClient } from "@legacy/lib/api/server";
import { notFound } from "next/navigation";
import { cache } from "react";
import { activityDateTimeInput } from "@asisteam/core";
import { createClient } from "@legacy/lib/supabase/server";
import { getGroup, getMyGroups } from "@legacy/lib/groups";
import { isGroupId } from "@/lib/group-routing";
import { getWard } from "@legacy/lib/wards";

const activityColumns = "id, group_id, activity_type_id, title, description, location, starts_at, ends_at, activity_type_name, activity_type_color, is_system_type, recurrence_rule, recurrence_source_id" as const;
export const ACTIVITY_PAGE_SIZE = 50;
export type ActivityPeriod = "upcoming" | "past";
export type ActivitySearchParams = { page?: string | string[]; period?: string | string[] };

export function parseActivitySearch({ page = "1", period = "upcoming" }: ActivitySearchParams): { page: number; period: ActivityPeriod } {
  if (typeof page !== "string" || !/^\d+$/.test(page)
    || !Number.isSafeInteger(Number(page)) || Number(page) < 1 || Number(page) > 1000000
    || (period !== "upcoming" && period !== "past")) notFound();
  return { page: Number(page), period };
}

export async function getActivityTypes(groupId: string, includeInactive = false) {
  await getGroup(groupId);
  if (moduleTransport("activities") === "nest") {
    const client = createServerApiClient();
    const types = [];
    for (let page = 1; ; page++) {
      const result = await client.listActivityTypes({ params: { groupId }, query: { page, include_inactive: includeInactive } });
      types.push(...result.data);
      if (!result.hasNext) return types;
    }
  }
  const supabase = await createClient();
  const types: { id: string; name: string; group_id: string | null; color: string | null; is_active: boolean | null }[] = [];
  for (let offset = 0; ; offset += 100) {
    let query = supabase.from("v_activity_types")
      .select("id, group_id, name, color, is_active");
    if (!includeInactive) query = query.eq("is_active", true);
    const { data, error } = await query
      .or(`group_id.is.null,group_id.eq.${groupId}`).order("name").order("id").range(offset, offset + 99);
    if (error) throw new Error("No pudimos cargar los tipos de actividad. Vuelve a intentarlo.");
    types.push(...(data ?? []).flatMap((type) => type.id && type.name ? [{ ...type, id: type.id, name: type.name }] : []));
    if ((data?.length ?? 0) < 100) return types;
  }
}

export async function getActivities(groupId: string, page = 1, period: ActivityPeriod = "upcoming") {
  await getGroup(groupId);
  parseActivitySearch({ page: String(page), period });
  if (moduleTransport("activities") === "nest") return createServerApiClient().listGroupActivities({ params: { groupId }, query: { page, period } });
  return loadActivities([groupId], page, period);
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
  if (!groupIds.length) return { activities: [], hasNext: false };
  if (moduleTransport("activities") === "nest") return createServerApiClient().listActivities({ query: { group_ids: groupIds.join(","), page, period } });
  const supabase = await createClient();
  const offset = (page - 1) * ACTIVITY_PAGE_SIZE;
  const query = supabase.from("v_group_activities").select(activityColumns).in("group_id", groupIds);
  const now = new Date().toISOString();
  const { data, error } = await (period === "upcoming" ? query.gte("starts_at", now) : query.lt("starts_at", now))
    .order("starts_at", { ascending: period === "upcoming" }).order("id")
    .range(offset, offset + ACTIVITY_PAGE_SIZE);
  if (error) throw new Error("No pudimos cargar las actividades. Vuelve a intentarlo.");
  return { activities: (data ?? []).slice(0, ACTIVITY_PAGE_SIZE), hasNext: (data?.length ?? 0) > ACTIVITY_PAGE_SIZE };
}

export async function getActivity(groupId: string, activityId: string) {
  await getGroup(groupId);
  if (!isGroupId(activityId)) notFound();
  if (moduleTransport("activities") === "nest") {
    try { return await createServerApiClient().getActivity({ params: { groupId, activityId } }); }
    catch (error) { if (error instanceof ApiClientError && error.status === 404) notFound(); throw error; }
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_group_activities").select(activityColumns)
    .eq("group_id", groupId).eq("id", activityId).maybeSingle();
  if (error) throw new Error("No pudimos cargar la actividad. Vuelve a intentarlo.");
  if (!data) notFound();
  return data;
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
  if (!groupIds.length) return { next: null, previous: null, now };
  if (moduleTransport("activities") === "nest") return createServerApiClient().getHomeActivities({ query: { group_ids: groupIds.join(",") } });
  const client = await createClient();
  const columns = "id, group_id, title, location, starts_at, ends_at" as const;
  const query = () => client.from("v_group_activities").select(columns).in("group_id", groupIds);
  const [next, previous] = await Promise.all([
    query().gte("ends_at", now).order("starts_at").order("id").limit(1),
    query().lt("ends_at", now).order("starts_at", { ascending: false }).order("id").limit(1),
  ]);
  if (next.error || previous.error) throw new Error("No pudimos cargar las actividades. Vuelve a intentarlo.");
  return { next: next.data?.[0] ?? null, previous: previous.data?.[0] ?? null, now };
}

export function homeActivityLabel(activity: { starts_at: string | null; ends_at: string | null }, now: string) {
  if (!activity.starts_at || !activity.ends_at) return "Actividad";
  if (Date.parse(activity.starts_at) <= Date.parse(now) && Date.parse(activity.ends_at) >= Date.parse(now)) return "En curso";
  const today = activityDateTimeInput(activity.starts_at).slice(0, 10) === activityDateTimeInput(now).slice(0, 10);
  return Date.parse(activity.ends_at) < Date.parse(now) ? (today ? "Anterior de hoy" : "Anterior") : (today ? "Hoy" : "Próxima");
}
