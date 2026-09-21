"use server";

import { revalidatePath } from "next/cache";
import { GROUP_ERROR_MESSAGES } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";
import { isGroupId } from "@/lib/group-routing";

type JoinAthleteResult = { success: true } | { error: { code: string; message: string; details: Record<string, never> } };

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
