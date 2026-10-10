"use server";
import { assertAuthOrigin,nativeAuthClient } from '@/lib/api/native-auth';
import { parseInviteCode,RECOVERY_INVITE_COOKIE } from "@/lib/auth-context";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { passwordRecoverySchema,type PasswordRecoveryInput } from "@asisteam/core";
import { cookies } from "next/headers";
export async function requestPasswordRecovery(input: PasswordRecoveryInput, inviteCode?: string) {
    const parsed = passwordRecoverySchema.safeParse(input);
    if (parsed.success) {
        // Return context only, not an authentication token. The email/token flow
        // remains unchanged and still works without this browser's cookie.
        const code = parseInviteCode(inviteCode);
        (await cookies()).set(RECOVERY_INVITE_COOKIE, code ?? "", {
            ...authCookieOptions(), path: "/reset-password", maxAge: code ? 3600 : 0,
        });
        try {
            {
                await assertAuthOrigin();
                await (await nativeAuthClient()).requestRecovery({ body: parsed.data });
            }
        }
        catch { /* Recovery keeps anti-enumeration even when delivery fails. */
        }
    }
    return { message: "Si el email existe, enviamos instrucciones" };
}
