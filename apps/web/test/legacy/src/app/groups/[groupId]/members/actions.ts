// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
"use server";

import { revalidatePath } from "next/cache";
import { MEMBER_MANAGEMENT_ERRORS, coachAssignmentSchema, managedActivationSchema, managedMemberUpdateSchema, memberStatusSchema } from "@asisteam/core";
import { invitationOperation } from "@legacy/lib/invitations";
import { memberOperation } from "@legacy/lib/members";
import { createClient } from "@legacy/lib/supabase/server";
import { sendInvitation } from "@legacy/app/groups/[groupId]/invitations/new/actions";

export type MemberResult = { success: true; birthdatePending?: boolean; consentPending?: boolean } | { error: { code: string; message: string; details: Record<string, never> } };
const fail = (code: string): MemberResult => ({ error: { code,
  message: MEMBER_MANAGEMENT_ERRORS[code] ?? MEMBER_MANAGEMENT_ERRORS.unavailable!, details: {},
} });

export async function requestManagedActivation(input: unknown): Promise<MemberResult> {
  const parsed = managedActivationSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_activation_request");
  try {
    const client = await createClient();
    if (!(await client.auth.getUser()).data.user) return fail("authentication_required");
    const { group_id, membership_id } = parsed.data;
    const { data, error } = await invitationOperation(() => client.rpc("request_managed_activation", { p_group_id: group_id, p_membership_id: membership_id }), async api => (await api.requestManagedActivation({params:{groupId:group_id,membershipId:membership_id}})).status);
    if (error) return fail(Object.hasOwn(MEMBER_MANAGEMENT_ERRORS, error.message) ? error.message : "unavailable");
    revalidatePath(`/groups/${group_id}/members/consent`);
    if (data === "CONSENT_PENDING") return { success: true, consentPending: true };
    if (data !== "READY") return fail("unavailable");
    const sent = await sendInvitation({ action: "activate", group_id, membership_id });
    return "error" in sent ? sent : { success: true };
  } catch { return fail("unavailable"); }
}

export async function updateManagedMember(input: unknown): Promise<MemberResult> {
  const parsed = managedMemberUpdateSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_managed_member");
  try {
    const client = await createClient();
    if (!(await client.auth.getUser()).data.user) return fail("authentication_required");
    const { group_id, membership_id, profile } = parsed.data;
    const { data, error } = await memberOperation(() => client.rpc("update_managed_member", {
      p_group_id: group_id, p_membership_id: membership_id, p_full_name: profile.full_name,
      p_birthdate: profile.birthdate, p_email: profile.email || undefined, p_phone: profile.phone ?? undefined,
    }), async api => (await api.updateManagedMember({ params: { groupId: group_id, membershipId: membership_id }, body: profile })).status);
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
    const { error } = await memberOperation(() => client.rpc(action === "deactivate" ? "deactivate_membership" : "reactivate_membership", {
      p_group_id: group_id, p_membership_id: membership_id,
    }), async api => { await api[action === "deactivate" ? "deactivateMembership" : "reactivateMembership"]({ params: { groupId: group_id, membershipId: membership_id } }); return null; });
    if (error) return fail(Object.hasOwn(MEMBER_MANAGEMENT_ERRORS, error.message) ? error.message : "unavailable");
    revalidatePath("/groups", "layout");
    return { success: true };
  } catch { return fail("unavailable"); }
}

export async function assignMemberCoach(input: unknown): Promise<MemberResult> {
  const parsed = coachAssignmentSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_member_request");
  try {
    const client = await createClient();
    if (!(await client.auth.getUser()).data.user) return fail("authentication_required");
    const { group_id, membership_id } = parsed.data;
    const { error } = await memberOperation(() => client.rpc("assign_member_coach", {
      p_group_id: group_id, p_membership_id: membership_id,
    }), async api => { await api.assignMemberCoach({ params: { groupId: group_id, membershipId: membership_id } }); return null; });
    if (error) return fail(Object.hasOwn(MEMBER_MANAGEMENT_ERRORS, error.message) ? error.message : "unavailable");
    revalidatePath("/groups", "layout");
    return { success: true };
  } catch { return fail("unavailable"); }
}
