import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroup } from "@/lib/groups";
import { isGroupId } from "@/lib/group-routing";

const activityColumns = "id, group_id, activity_type_id, title, description, location, starts_at, ends_at, activity_type_name, activity_type_color, is_system_type" as const;
export const ACTIVITY_PAGE_SIZE = 50;

export async function getActivityTypes(groupId: string) {
  await getGroup(groupId);
  const supabase = await createClient();
  const types: { id: string; name: string; group_id: string | null; color: string | null; is_active: boolean | null }[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.from("v_activity_types")
      .select("id, group_id, name, color, is_active").eq("is_active", true)
      .or(`group_id.is.null,group_id.eq.${groupId}`).order("name").order("id").range(offset, offset + 99);
    if (error) throw new Error("No pudimos cargar los tipos de actividad. Vuelve a intentarlo.");
    types.push(...(data ?? []).flatMap((type) => type.id && type.name ? [{ ...type, id: type.id, name: type.name }] : []));
    if ((data?.length ?? 0) < 100) return types;
  }
}

export async function getActivities(groupId: string, page = 1) {
  await getGroup(groupId);
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) notFound();
  const supabase = await createClient();
  const offset = (page - 1) * ACTIVITY_PAGE_SIZE;
  const { data, error } = await supabase.from("v_group_activities").select(activityColumns)
    .eq("group_id", groupId).order("starts_at", { ascending: false }).order("id")
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
