"use server";

import { revalidatePath } from "next/cache";
import { forbidden } from "next/navigation";
import { GROUP_ERROR_MESSAGES, groupFormSchema } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";
import { isGroupId } from "@/lib/group-routing";

type JoinAthleteResult = { success: true } | { error: { code: string; message: string; details: Record<string, never> } };

type GroupActionError = { error: { code: string; message: string; details: Record<string, string[] | undefined> } };
const groupError = (code: string, fallback?: string): GroupActionError => ({
  error: { code, message: fallback ?? GROUP_ERROR_MESSAGES[code] ?? "No pudimos completar la acción. Vuelve a intentarlo.", details: {} },
});

export async function updateGroup(groupId: string, input: unknown): Promise<{ success: true } | GroupActionError> {
  if (!isGroupId(groupId)) return groupError("group_not_found");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return groupError("authentication_required");
  const { data: group, error: readError } = await supabase.from("v_group_detail")
    .select("roles").eq("id", groupId).maybeSingle();
  if (readError) return groupError("group_update_failed");
  if (!group) return groupError("group_not_found");
  if (!group.roles?.includes("ADMIN")) forbidden();
  const parsed = groupFormSchema.safeParse(input);
  if (!parsed.success) return { error: { code: "invalid_group", message: GROUP_ERROR_MESSAGES.invalid_group!, details: parsed.error.flatten().fieldErrors } };
  const { name, sport, description, logo_url } = parsed.data;
  const { data, error } = await supabase.from("groups")
    .update({ name, sport, description: description || null, logo_url: logo_url || null })
    .eq("id", groupId).select("id").maybeSingle();
  if (error || !data) return groupError("group_update_failed");
  revalidatePath("/groups", "layout");
  return { success: true };
}

export async function rotateInviteCode(groupId: string): Promise<{ code: string } | GroupActionError> {
  if (!isGroupId(groupId)) return groupError("group_not_found");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return groupError("authentication_required");
  const { data, error } = await supabase.rpc("rotate_invite_code", { p_group_id: groupId });
  if (error || !data) {
    const code = error && ["group_not_found", "admin_required", "invite_code_unavailable"].includes(error.message)
      ? error.message : "invite_code_rotate_failed";
    return groupError(code, code === "admin_required" ? "Solo un administrador activo puede regenerar el código." : undefined);
  }
  revalidatePath(`/groups/${groupId}`, "layout");
  return { code: data };
}

export async function joinAsAthlete(groupId: string): Promise<JoinAthleteResult> {
  if (!isGroupId(groupId)) return { error: { code: "group_not_found", message: GROUP_ERROR_MESSAGES.group_not_found!, details: {} } };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: { code: "authentication_required", message: GROUP_ERROR_MESSAGES.authentication_required!, details: {} } };
  const { data, error } = await supabase.rpc("join_group_as_athlete", { p_group_id: groupId });
  if (error || !data) {
    const code = error && Object.hasOwn(GROUP_ERROR_MESSAGES, error.message) ? error.message : "membership_create_failed";
    return { error: { code, message: GROUP_ERROR_MESSAGES[code] ?? "No pudimos agregarte como deportista. Vuelve a intentarlo.", details: {} } };
  }
  revalidatePath("/groups", "layout");
  return { success: true };
}
