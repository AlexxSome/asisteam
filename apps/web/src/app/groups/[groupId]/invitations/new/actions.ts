"use server";
import { createServerApiClient } from "@/lib/api/server";
import { createSessionClient } from "@/lib/api/session";
import { ApiClientError } from "@asisteam/api-client";
import { SEND_INVITATION_ERROR_MESSAGES,sendInvitationRequestSchema,sentInvitationSchema,type SentInvitation } from "@asisteam/core";
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
    const sessionClient = await createSessionClient();
    const { data: { user } } = await sessionClient.auth.getUser();
    if (!user)
        return fail("authentication_required");
    const { data: { session } } = await sessionClient.auth.getSession();
    if (!session)
        return fail("authentication_required");
    try {
        {
            const response = await createServerApiClient().sendInvitation({ body: parsed.data });
            const result = { invitation: sentInvitationSchema.strip().parse(response.invitation) };
            revalidatePath(`/groups/${parsed.data.group_id}/invitations/new`);
            return result;
        }
    }
    catch (error) {
        revalidatePath(`/groups/${parsed.data.group_id}/invitations/new`);
        return fail(error instanceof ApiClientError && Object.hasOwn(SEND_INVITATION_ERROR_MESSAGES, error.error.code) ? error.error.code : "unavailable");
    }
}
