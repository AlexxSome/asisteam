"use server";

import { revalidatePath } from "next/cache";
import { MEMBER_MANAGEMENT_ERRORS, managedMemberUpdateSchema, memberStatusSchema } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";

export type MemberResult = { success: true; birthdatePending?: boolean } | { error: { code: string; message: string; details: Record<string, never> } };
const fail = (code: string): MemberResult => ({ error: { code,
  message: MEMBER_MANAGEMENT_ERRORS[code] ?? MEMBER_MANAGEMENT_ERRORS.unavailable!, details: {},
} });

export async function updateManagedMember(input: unknown): Promise<MemberResult> {
  const parsed = managedMemberUpdateSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_managed_member");
  try {
    const client = await createClient();
    if (!(await client.auth.getUser()).data.user) return fail("authentication_required");
    const { group_id, membership_id, profile } = parsed.data;
    const { data, error } = await client.rpc("update_managed_member", {
      p_group_id: group_id, p_membership_id: membership_id, p_full_name: profile.full_name,
      p_birthdate: profile.birthdate, p_email: profile.email || undefined, p_phone: profile.phone ?? undefined,
    });
    if (error) return fail(Object.hasOwn(MEMBER_MANAGEMENT_ERRORS, error.message) ? error.message : "unavailable");
    // El perfil es global: invalida sus apariciones en todos los grupos.
    revalidatePath("/groups", "layout");
    revalidatePath("/profile/birthdate-requests");
    return { success: true, birthdatePending: data === "BIRTHDATE_PENDING" };
  } catch { return fail("unavailable"); }
}

export async function changeMemberStatus(input: unknown): Promise<MemberResult> {
  const parsed = memberStatusSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_member_request");
  try {
    const client = await createClient();
    if (!(await client.auth.getUser()).data.user) return fail("authentication_required");
    const { group_id, membership_id, action } = parsed.data;
    const { error } = await client.rpc(action === "deactivate" ? "deactivate_membership" : "reactivate_membership", {
      p_group_id: group_id, p_membership_id: membership_id,
    });
    if (error) return fail(Object.hasOwn(MEMBER_MANAGEMENT_ERRORS, error.message) ? error.message : "unavailable");
    revalidatePath("/groups", "layout");
    return { success: true };
  } catch { return fail("unavailable"); }
}
