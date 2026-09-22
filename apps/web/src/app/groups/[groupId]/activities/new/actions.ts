"use server";

import { revalidatePath } from "next/cache";
import { ACTIVITY_ERROR_MESSAGES, activityFormSchema, activityScopeSchema, chileDateTimeToUtc } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";
import { isGroupId } from "@/lib/group-routing";

export type CreateActivityResult = { activityId: string } | { error: { code: string; message: string; details: Record<string, string[] | undefined> } };

export async function createActivity(groupId: string, input: unknown): Promise<CreateActivityResult> {
  if (!isGroupId(groupId)) return { error: { code: "group_not_found", message: ACTIVITY_ERROR_MESSAGES.group_not_found!, details: {} } };
  const parsed = activityFormSchema.safeParse(input);
  if (!parsed.success) return { error: { code: "invalid_activity", message: "Revisa los campos indicados.", details: parsed.error.flatten().fieldErrors } };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: { code: "authentication_required", message: ACTIVITY_ERROR_MESSAGES.authentication_required!, details: {} } };
  const value = parsed.data;
  const { data, error } = await supabase.rpc("create_activity", {
    p_group_id: groupId, p_activity_type_id: value.activity_type_id, p_title: value.title,
    p_location: value.location || undefined, p_description: value.description || undefined,
    p_starts_at: chileDateTimeToUtc(value.starts_at), p_ends_at: chileDateTimeToUtc(value.ends_at),
    ...(value.recurrence_rule ? { p_recurrence_rule: value.recurrence_rule } : {}),
  });
  if (error || !data) {
    const code = error && Object.hasOwn(ACTIVITY_ERROR_MESSAGES, error.message) ? error.message : "activity_create_failed";
    return { error: { code, message: ACTIVITY_ERROR_MESSAGES[code] ?? "No pudimos crear la actividad. Vuelve a intentarlo.", details: {} } };
  }
  revalidatePath(`/groups/${groupId}/activities`);
  return { activityId: data };
}

type MutationResult = { affected: number } | { error: { code: string; message: string; details: Record<string, string[] | undefined> } };
function failure(code: string): MutationResult {
  return { error: { code, message: ACTIVITY_ERROR_MESSAGES[code] ?? "No pudimos guardar el cambio. Vuelve a intentarlo.", details: {} } };
}

export async function updateActivity(groupId: string, activityId: string, input: unknown, scope: unknown): Promise<MutationResult> {
  if (!isGroupId(groupId) || !isGroupId(activityId)) return failure("activity_not_found");
  const parsedScope = activityScopeSchema.safeParse(scope);
  if (!parsedScope.success) return failure("invalid_activity_scope");
  const parsed = activityFormSchema.safeParse(input);
  if (!parsed.success) return { error: { code: "invalid_activity", message: "Revisa los campos indicados.", details: parsed.error.flatten().fieldErrors } };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure("authentication_required");
  const value = parsed.data;
  const { data, error } = await supabase.rpc("update_activity", {
    p_group_id: groupId, p_activity_id: activityId, p_scope: parsedScope.data,
    p_activity_type_id: value.activity_type_id, p_title: value.title,
    p_description: value.description || undefined, p_location: value.location || undefined,
    p_starts_at: chileDateTimeToUtc(value.starts_at), p_ends_at: chileDateTimeToUtc(value.ends_at),
  });
  if (error || data === null) return failure(error && Object.hasOwn(ACTIVITY_ERROR_MESSAGES, error.message) ? error.message : "activity_update_failed");
  revalidatePath(`/groups/${groupId}/activities`, "layout");
  return { affected: data };
}

export async function deleteActivity(groupId: string, activityId: string, scope: unknown, confirmAttendance: boolean): Promise<MutationResult> {
  if (!isGroupId(groupId) || !isGroupId(activityId)) return failure("activity_not_found");
  const parsed = activityScopeSchema.safeParse(scope);
  if (!parsed.success) return failure("invalid_activity_scope");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure("authentication_required");
  const { data, error } = await supabase.rpc("delete_activity", {
    p_group_id: groupId, p_activity_id: activityId, p_scope: parsed.data, p_confirm_attendance: confirmAttendance === true,
  });
  if (error || data === null) return failure(error && Object.hasOwn(ACTIVITY_ERROR_MESSAGES, error.message) ? error.message : "activity_delete_failed");
  revalidatePath(`/groups/${groupId}/activities`, "layout");
  return { affected: data };
}
