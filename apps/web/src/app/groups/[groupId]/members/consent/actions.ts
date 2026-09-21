"use server";

import { revalidatePath } from "next/cache";
import { managedConsentSchema, MANAGED_MEMBER_ERROR_MESSAGES } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";

export async function consentManagedMember(input: unknown): Promise<{ success: true } | { error: { code: string; message: string; details: Record<string, never> } }> {
  const fail = (code: string) => ({ error: { code, message: MANAGED_MEMBER_ERROR_MESSAGES[code] ?? MANAGED_MEMBER_ERROR_MESSAGES.unavailable!, details: {} } });
  const parsed = managedConsentSchema.safeParse(input);
  if (!parsed.success) return fail("consent_required");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("authentication_required");
  try {
    const { error } = await supabase.rpc("consent_managed_member", {
      p_membership_id: parsed.data.membership_id, p_accepted: parsed.data.accepted,
    });
    if (error) return fail(Object.hasOwn(MANAGED_MEMBER_ERROR_MESSAGES, error.message) ? error.message : "unavailable");
    revalidatePath("/groups/[groupId]", "layout");
    return { success: true };
  } catch { return fail("unavailable"); }
}
