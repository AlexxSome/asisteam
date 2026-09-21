"use server";

import { revalidatePath } from "next/cache";
import { SEND_INVITATION_ERROR_MESSAGES, sendInvitationRequestSchema, sentInvitationSchema, type SentInvitation } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";

export type SendInvitationResult = { invitation: SentInvitation } | { error: { code: string; message: string; details: Record<string, never> } };
const fail = (code: string): SendInvitationResult => ({ error: {
  code, message: SEND_INVITATION_ERROR_MESSAGES[code] ?? SEND_INVITATION_ERROR_MESSAGES.unavailable!, details: {},
} });

export async function sendInvitation(input: unknown): Promise<SendInvitationResult> {
  const parsed = sendInvitationRequestSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_invitation");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("authentication_required");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return fail("authentication_required");
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-invitation`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(20_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(parsed.data),
    });
    const body = await response.json();
    // También puede haber una emisión persistida cuyo email no se confirmó.
    revalidatePath(`/groups/${parsed.data.group_id}/invitations/new`);
    if (!response.ok || body.error) {
      const code = typeof body.error?.code === "string" && Object.hasOwn(SEND_INVITATION_ERROR_MESSAGES, body.error.code)
        ? body.error.code : "unavailable";
      return fail(code);
    }
    const invitation = sentInvitationSchema.safeParse(body.invitation);
    return invitation.success ? { invitation: invitation.data } : fail("unavailable");
  } catch {
    revalidatePath(`/groups/${parsed.data.group_id}/invitations/new`);
    return fail("unavailable");
  }
}
