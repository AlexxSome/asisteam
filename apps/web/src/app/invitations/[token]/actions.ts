"use server";
import { accountConsentPath } from "@/lib/account-consent-routing";
import { assertAuthOrigin,nativeAuthClient,setNativeCookies } from '@/lib/api/native-auth';
import { memberOperation } from "@/lib/members";
import { createClient } from "@/lib/supabase/server";
import { ApiClient,ApiClientError } from "@asisteam/api-client";
import { invitationErrorMessages,invitationRegistrationSchema,invitationTokenSchema,loginSchema,managedClaimSchema,type InvitationAcceptance,type InvitationPreview } from "@asisteam/core";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
type Result<T> = {
    data: T;
    error?: never;
} | {
    error: string;
    data?: never;
};
async function invoke<T>(body: unknown, accessToken?: string): Promise<Result<T>> {
    const secret = process.env.INVITATION_PROXY_SECRET;
    if (!secret)
        return { error: invitationErrorMessages.unavailable! };
    const incoming = await headers();
    // Vercel sobrescribe X-Forwarded-For con la IP del cliente. Otros hosts
    // deben sanearlo en su proxy de entrada; nunca confiar en headers arbitrarios.
    const ip = incoming.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    try {
        {
            const api = new ApiClient({ origin: process.env.ASISTEAM_API_ORIGIN ?? "", timeoutMs: 15000,
                nativeAuth: true, invitationProxy: { secret, clientIp: ip }, accessToken: async () => accessToken ?? null });
            const input = body as {
                action: "preview" | "accept" | "register" | "claim";
                token: string;
                registration?: unknown;
            };
            const value = input.action === "preview" ? await api.previewInvitation({ body: { token: input.token } })
                : input.action === "accept" ? await api.acceptInvitation({ body: { token: input.token } })
                    : input.action === "claim" ? await api.claimInvitation({ body: { token: input.token, registration: managedClaimSchema.parse(input.registration) } })
                        : await api.registerInvitation({ body: { token: input.token, registration: invitationRegistrationSchema.parse(input.registration) } });
            return { data: value as T };
        }
    }
    catch (error) {
        return { error: error instanceof ApiClientError ? invitationErrorMessages[error.error.code] ?? invitationErrorMessages.unavailable! : invitationErrorMessages.unavailable! };
    }
}
export async function previewInvitation(token: string): Promise<Result<InvitationPreview>> {
    if (!invitationTokenSchema.safeParse(token).success)
        return { error: invitationErrorMessages.invitation_not_available! };
    return invoke({ action: "preview", token });
}
export async function acceptInvitation(token: string, mode: "session" | "login" | "register" | "claim", input?: unknown): Promise<{
    error: string;
} | {
    pending: true;
} | undefined> {
    if (!invitationTokenSchema.safeParse(token).success || !["session", "login", "register", "claim"].includes(mode)) {
        return { error: invitationErrorMessages.invitation_not_available! };
    }
    {
        await assertAuthOrigin();
        if (mode === 'register' || mode === 'claim') {
            const schema = mode === 'claim' ? managedClaimSchema : invitationRegistrationSchema, parsed = schema.safeParse(input);
            if (!parsed.success)
                return { error: invitationErrorMessages.invalid_registration! };
            const accepted = await invoke<InvitationAcceptance>({ action: mode, token, registration: parsed.data });
            if (accepted.error)
                return { error: accepted.error };
            if (!accepted.data)
                return { error: invitationErrorMessages.unavailable! };
            try {
                await setNativeCookies(await (await nativeAuthClient()).loginPassword({ body: { email: parsed.data.email, password: parsed.data.password } }));
            }
            catch {
                return { error: 'Tu cuenta quedó activada. Inicia sesión desde el acceso habitual para entrar a tu grupo.' };
            }
            if (accepted.data.membership_status === 'PENDING')
                return { pending: true };
            if (accepted.data.membership_status !== 'ACTIVE') redirect('/groups');
            redirect(mode === 'claim' ? `/groups/${accepted.data.group_id}/me/history` : `/groups/${accepted.data.group_id}`);
        }
        if (mode === 'login') {
            const parsed = loginSchema.safeParse(input);
            if (!parsed.success)
                return { error: 'Email o contraseña incorrectos' };
            try {
                await setNativeCookies(await (await nativeAuthClient()).loginPassword({ body: parsed.data }));
            }
            catch {
                return { error: 'Email o contraseña incorrectos' };
            }
        }
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: invitationErrorMessages.authentication_required! };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.user.id !== user.id) return { error: invitationErrorMessages.authentication_required! };
    const { data: acceptedTerms, error: consentError } = await memberOperation(async api => (await api.getCurrentAccountConsent()).accepted);
    if (consentError) return { error: invitationErrorMessages.unavailable! };
    if (acceptedTerms !== true) redirect(accountConsentPath(`/invitations/${token}`));
    const accepted = await invoke<InvitationAcceptance>({ action: "accept", token }, session.access_token);
    if (accepted.error) return { error: accepted.error };
    if (!accepted.data) return { error: invitationErrorMessages.unavailable! };
    if (accepted.data.membership_status === "PENDING") return { pending: true };
    if (accepted.data.membership_status !== "ACTIVE") redirect("/groups");
    redirect(`/groups/${accepted.data.group_id}`);
}
