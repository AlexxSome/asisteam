"use server";

import { ApiClientError } from "@asisteam/api-client";
import { moduleTransport } from "@/lib/api/config";
import { createServerApiClient } from "@/lib/api/server";
import { revalidatePath } from "next/cache";
import { ACTIVITY_TYPE_ERROR_MESSAGES, activityTypeSchema, activityTypeUpdateSchema } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";
import { isGroupId } from "@/lib/group-routing";

export type ActivityTypeResult = { id: string } | {
  error: { code: string; message: string; details: Record<string, string[] | undefined> };
};
function failure(code: string, details: Record<string, string[] | undefined> = {}): ActivityTypeResult {
  return { error: { code, message: ACTIVITY_TYPE_ERROR_MESSAGES[code]!, details } };
}

async function saveType(groupId: string, input: unknown, typeId?: string): Promise<ActivityTypeResult> {
  if (!isGroupId(groupId)) return failure("group_not_found");
  if (typeId !== undefined && !isGroupId(typeId)) return failure("activity_type_not_found");
  const parsed = (typeId === undefined ? activityTypeSchema : activityTypeUpdateSchema).safeParse(input);
  if (!parsed.success) return failure("invalid_activity_type", parsed.error.flatten().fieldErrors);
  if (moduleTransport("activities") === "nest") {
    try {
      const client = createServerApiClient();
      const result = typeId === undefined
        ? await client.createActivityType({ params: { groupId }, body: activityTypeSchema.parse(parsed.data) })
        : await client.updateActivityType({ params: { groupId, typeId }, body: activityTypeUpdateSchema.parse(parsed.data) });
      revalidatePath(`/groups/${groupId}`, "layout");
      return result;
    } catch (error) {
      if (error instanceof ApiClientError) return failure(Object.hasOwn(ACTIVITY_TYPE_ERROR_MESSAGES, error.error.code) ? error.error.code : "activity_type_save_failed");
      throw error;
    }
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure("authentication_required");
  const group = await supabase.from("v_group_detail").select("id, roles").eq("id", groupId).maybeSingle();
  if (group.error) return failure("activity_type_save_failed");
  if (!group.data) return failure("group_not_found");
  if (!group.data.roles?.includes("ADMIN")) return failure("admin_required");

  // RLS vuelve a comprobar ADMIN al escribir; el cliente no elige id ni mueve el grupo.
  const { data, error } = typeId === undefined
    ? await supabase.from("activity_types").insert({ group_id: groupId, name: parsed.data.name, color: parsed.data.color }).select("id").single()
    : await supabase.from("activity_types").update(parsed.data).eq("id", typeId).eq("group_id", groupId).select("id").maybeSingle();
  if (error) {
    const code = error.code === "23505" ? "activity_type_name_exists"
      : error.code === "42501" ? "admin_required"
      : error.code === "23514" ? "invalid_activity_type" : "activity_type_save_failed";
    return failure(code);
  }
  if (!data) return failure("activity_type_not_found");
  revalidatePath(`/groups/${groupId}`, "layout");
  return { id: data.id };
}

export async function createActivityType(groupId: string, input: unknown): Promise<ActivityTypeResult> {
  return saveType(groupId, input);
}

export async function updateActivityType(groupId: string, typeId: string, input: unknown): Promise<ActivityTypeResult> {
  // Un argumento omitido nunca debe convertir una edición en una creación.
  if (!isGroupId(typeId)) return failure("activity_type_not_found");
  return saveType(groupId, input, typeId);
}
