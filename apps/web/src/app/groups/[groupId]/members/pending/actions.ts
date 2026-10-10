"use server";
import { memberOperation } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { MEMBERSHIP_REVIEW_ERROR_MESSAGES,membershipReviewSchema } from "@asisteam/core";
import { revalidatePath } from "next/cache";
export type MembershipReviewResult = {
    success: true;
} | {
    error: {
        code: string;
        message: string;
        details: Record<string, never>;
    };
};
export async function reviewMembership(input: unknown): Promise<MembershipReviewResult> {
    const fail = (code: string): MembershipReviewResult => ({ error: {
            code, message: MEMBERSHIP_REVIEW_ERROR_MESSAGES[code] ?? MEMBERSHIP_REVIEW_ERROR_MESSAGES.unavailable!, details: {},
        } });
    const parsed = membershipReviewSchema.safeParse(input);
    if (!parsed.success)
        return fail("invalid_membership_review");
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user)
            return fail("authentication_required");
        const { group_id, membership_id, decision } = parsed.data;
        const { error } = await memberOperation(async (api) => { await api[decision === "approve" ? "approveMembership" : "rejectMembership"]({ params: { groupId: group_id, membershipId: membership_id } }); return null; });
        if (error)
            return fail(Object.hasOwn(MEMBERSHIP_REVIEW_ERROR_MESSAGES, error.message) ? error.message : "unavailable");
        revalidatePath(`/groups/${group_id}`, "layout");
        revalidatePath("/groups");
        return { success: true };
    }
    catch {
        return fail("unavailable");
    }
}
