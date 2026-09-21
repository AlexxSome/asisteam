"use server";

import { revalidatePath } from "next/cache";
import { GROUP_ERROR_MESSAGES, groupFormSchema } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";

export type CreateGroupResult = { groupId: string } | {
  error: { code: string; message: string; details: Record<string, string[] | undefined> };
};

export async function createGroup(input: unknown): Promise<CreateGroupResult> {
  const parsed = groupFormSchema.safeParse(input);
  if (!parsed.success) return { error: { code: "invalid_group", message: "Revisa los campos indicados.", details: parsed.error.flatten().fieldErrors } };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: { code: "authentication_required", message: GROUP_ERROR_MESSAGES.authentication_required!, details: {} } };
  const { name, sport, description, logo_url } = parsed.data;
  const { data, error } = await supabase.rpc("create_group", {
    p_name: name, p_sport: sport, p_description: description || undefined, p_logo_url: logo_url || undefined,
  });
  if (error || !data) {
    const code = error && Object.hasOwn(GROUP_ERROR_MESSAGES, error.message) ? error.message : "group_create_failed";
    return { error: { code, message: GROUP_ERROR_MESSAGES[code] ?? "No pudimos crear el grupo. Vuelve a intentarlo.", details: {} } };
  }
  revalidatePath("/groups");
  return { groupId: data };
}
