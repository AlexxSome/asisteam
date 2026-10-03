"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { checkinInputSchema, checkinPath, joinCodeSchema, loginSchema, socialLoginSchema, SOCIAL_AUTH_ERROR, type LoginInput, type CheckinInput, type SocialLoginInput } from "@asisteam/core";

import { createClient } from "@/lib/supabase/server";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { SOCIAL_CALLBACK_PATH, SOCIAL_CONTEXT_COOKIE, socialAuthOrigin } from "@/lib/social-auth";

export type LoginResult = { error: string } | undefined;

const INVALID_CREDENTIALS_ERROR = "Email o contraseña incorrectos";

/**
 * Inicio de sesión con email y contraseña (HU-GEN-02, AUT-01).
 * Contrato de docs/07-api-y-backend.md §2.1: Supabase Auth
 * `signInWithPassword`. Anti-enumeración (docs/07 §7.3): todo fallo de
 * credenciales responde el mismo mensaje genérico, sin distinguir email
 * inexistente de contraseña incorrecta (criterio 2 de HU-GEN-02).
 *
 * Criterio 3 (cuentas MANAGED): el constraint users_managed_has_no_auth_user
 * garantiza que una cuenta MANAGED nunca tiene fila en auth.users, así que
 * signInWithPassword siempre falla para su email y cae en el mismo mensaje
 * genérico de arriba — no requiere una verificación aparte.
 */
export async function loginUser(input: LoginInput, inviteCode?: string, checkin?: CheckinInput): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: INVALID_CREDENTIALS_ERROR };
  }

  const { email, password } = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.status === 429) {
      return { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." };
    }
    return { error: INVALID_CREDENTIALS_ERROR };
  }

  const parsedCode = joinCodeSchema.safeParse(inviteCode);
  const parsedCheckin = checkinInputSchema.safeParse(checkin);
  if (parsedCheckin.success) redirect(checkinPath(parsedCheckin.data));
  redirect(parsedCode.success ? `/join?code=${parsedCode.data}` : "/");
}

export async function loginWithSocial(input: SocialLoginInput): Promise<LoginResult> {
  const parsed = socialLoginSchema.safeParse(input);
  const origin = socialAuthOrigin();
  if (!parsed.success || !origin) return { error: SOCIAL_AUTH_ERROR };

  let destination: string;
  try {
    const supabase = await createClient();
    const { provider, ...context } = parsed.data;
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${origin}${SOCIAL_CALLBACK_PATH}`, skipBrowserRedirect: true },
    });
    if (error || !data.url) return { error: SOCIAL_AUTH_ERROR };
    // No incluir el token QR en redirectTo, en la URL de OAuth ni en el Referer.
    (await cookies()).set(SOCIAL_CONTEXT_COOKIE, JSON.stringify(context), {
      ...authCookieOptions(), path: SOCIAL_CALLBACK_PATH, maxAge: 600,
    });
    destination = data.url;
  } catch {
    return { error: SOCIAL_AUTH_ERROR };
  }
  redirect(destination);
}
