import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroup, getMyGroups } from "@/lib/groups";
import { isGroupId } from "@/lib/group-routing";

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

async function loadActivities(groupIds: string[], page: number, period: ActivityPeriod) {
  parseActivitySearch({ page: String(page), period });
  if (!groupIds.length) return { activities: [], hasNext: false };
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
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_group_activities").select(activityColumns)
    .eq("group_id", groupId).eq("id", activityId).maybeSingle();
  if (error) throw new Error("No pudimos cargar la actividad. Vuelve a intentarlo.");
  if (!data) notFound();
  return data;
}
