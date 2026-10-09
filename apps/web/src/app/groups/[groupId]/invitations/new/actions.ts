"use server";
import { createServerApiClient } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import { ApiClientError } from "@asisteam/api-client";
import { SEND_INVITATION_ERROR_MESSAGES,sendInvitationRequestSchema,type SentInvitation } from "@asisteam/core";
import { revalidatePath } from "next/cache";
export type SendInvitationResult = {
    invitation: SentInvitation;
} | {
    error: {
        code: string;
        message: string;
        details: Record<string, never>;
    };
};
const fail = (code: string): SendInvitationResult => ({ error: {
        code, message: SEND_INVITATION_ERROR_MESSAGES[code] ?? SEND_INVITATION_ERROR_MESSAGES.unavailable!, details: {},
    } });
export async function sendInvitation(input: unknown): Promise<SendInvitationResult> {
    const parsed = sendInvitationRequestSchema.safeParse(input);
    if (!parsed.success)
        return fail("invalid_invitation");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user)
        return fail("authentication_required");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session)
        return fail("authentication_required");
    try {
        {
            const result = await createServerApiClient().sendInvitation({ body: parsed.data });
            revalidatePath(`/groups/${parsed.data.group_id}/invitations/new`);
            return result;
        }
    }
    catch (error) {
        revalidatePath(`/groups/${parsed.data.group_id}/invitations/new`);
        return fail(error instanceof ApiClientError && Object.hasOwn(SEND_INVITATION_ERROR_MESSAGES, error.error.code) ? error.error.code : "unavailable");
    }
}
