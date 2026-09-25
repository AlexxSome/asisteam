"use server";

import { revalidatePath } from "next/cache";
import { activationReviewSchema, managedActivationSchema, managedConsentSchema, MANAGED_MEMBER_ERROR_MESSAGES, MEMBER_MANAGEMENT_ERRORS } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";
import { sendInvitation } from "../../invitations/new/actions";

export async function reviewManagedActivation(input: unknown): Promise<{ success: true } | { error: { code: string; message: string; details: Record<string, never> } }> {
  const fail = (code: string) => ({ error: { code, message: MEMBER_MANAGEMENT_ERRORS[code] ?? MEMBER_MANAGEMENT_ERRORS.unavailable!, details: {} } });
  const parsed = activationReviewSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_activation_request");
  try {
    const client = await createClient();
    if (!(await client.auth.getUser()).data.user) return fail("authentication_required");
    const { data, error } = await client.rpc("review_managed_activation", { p_request_id: parsed.data.request_id, p_accepted: parsed.data.accepted });
    if (error) return fail(Object.hasOwn(MEMBER_MANAGEMENT_ERRORS, error.message) ? error.message : "unavailable");
    const identity = managedActivationSchema.safeParse(data);
    if (!identity.success) return fail("unavailable");
    revalidatePath(`/groups/${identity.data.group_id}/members/consent`);
    if (!parsed.data.accepted) return { success: true };
    const sent = await sendInvitation({ action: "activate", ...identity.data });
    if ("error" in sent) return { error: { ...sent.error, message: `El consentimiento quedó registrado. ${sent.error.message} Puedes volver a intentar el envío.` } };
    return { success: true };
  } catch { return fail("unavailable"); }
}

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
