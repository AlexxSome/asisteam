"use server";

import { revalidatePath } from "next/cache";
import { membershipReviewSchema, MEMBERSHIP_REVIEW_ERROR_MESSAGES } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";

export type MembershipReviewResult = { success: true } | { error: { code: string; message: string; details: Record<string, never> } };

export async function reviewMembership(input: unknown): Promise<MembershipReviewResult> {
  const fail = (code: string): MembershipReviewResult => ({ error: {
    code, message: MEMBERSHIP_REVIEW_ERROR_MESSAGES[code] ?? MEMBERSHIP_REVIEW_ERROR_MESSAGES.unavailable!, details: {},
  } });
  const parsed = membershipReviewSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_membership_review");
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return fail("authentication_required");
    const { group_id, membership_id, decision } = parsed.data;
    const { error } = await supabase.rpc(decision === "approve" ? "approve_membership" : "reject_pending_membership", {
      p_group_id: group_id, p_membership_id: membership_id,
    });
    if (error) return fail(Object.hasOwn(MEMBERSHIP_REVIEW_ERROR_MESSAGES, error.message) ? error.message : "unavailable");
    revalidatePath(`/groups/${group_id}`, "layout");
    revalidatePath("/groups");
    return { success: true };
  } catch { return fail("unavailable"); }
}
