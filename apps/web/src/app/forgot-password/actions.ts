"use server";

import { passwordRecoverySchema, type PasswordRecoveryInput } from "@asisteam/core";
import { createRecoveryClient } from "@/lib/supabase/recovery";
import { cookies } from "next/headers";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { parseInviteCode, RECOVERY_INVITE_COOKIE } from "@/lib/auth-context";

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
      const supabase = createRecoveryClient();
      // La plantilla usa SiteURL y TokenHash; funciona también en otro
      // navegador y no depende de una cookie PKCE del navegador solicitante.
      await supabase.auth.resetPasswordForEmail(parsed.data.email);
    } catch {
      // Tanto errores de red como respuestas del proveedor (incluido 429)
      // mantienen el mismo resultado público, sin revelar cuentas ni PII.
    }
  }

  return { message: "Si el email existe, enviamos instrucciones" };
}
