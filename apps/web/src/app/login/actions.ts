"use server";
import { nativeAuthEnabled, NATIVE_ACCESS_COOKIE, NATIVE_REFRESH_COOKIE } from '@/lib/api/native-auth-config';
import { assertAuthOrigin, nativeAuthClient, setNativeCookies, clearNativeCookies } from '@/lib/api/native-auth';
import { ApiClientError } from '@asisteam/api-client';

import { redirect, RedirectType } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { checkinInputSchema, checkinPath, joinCodeSchema, loginSchema, socialLoginSchema, SOCIAL_AUTH_ERROR, type LoginInput, type CheckinInput, type SocialLoginInput } from "@asisteam/core";

import { createClient } from "@/lib/supabase/server";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { SOCIAL_CALLBACK_PATH, SOCIAL_CONTEXT_COOKIE, socialAuthOrigin } from "@/lib/social-auth";

export type LoginResult = { error: string } | undefined;

const INVALID_CREDENTIALS_ERROR = "Email o contraseña incorrectos";

export async function signOutUser(): Promise<{ error: string }> {
  const failure = { error: "No pudimos cerrar tu sesión. Vuelve a intentarlo." };
  try {
    if(nativeAuthEnabled()&&((await cookies()).get(NATIVE_ACCESS_COOKIE)||(await cookies()).get(NATIVE_REFRESH_COOKIE))){
      await assertAuthOrigin();
      const store=await cookies(),access=store.get(NATIVE_ACCESS_COOKIE)?.value,refresh=store.get(NATIVE_REFRESH_COOKIE)?.value;
      let token=access;
      const api=await nativeAuthClient(access);
      try{await api.logoutSession();}catch(error){
        if(!(error instanceof ApiClientError)||error.status!==401)throw error;
        if(refresh){
          try { token=(await api.refreshSession({body:{refresh_token:refresh}})).access_token;await(await nativeAuthClient(token)).logoutSession(); }
          catch (refreshError) { if (!(refreshError instanceof ApiClientError) || refreshError.status !== 401) throw refreshError; }
        }
      }
      await clearNativeCookies();
    }else{
    const supabase = await createClient({ requireCookieWrites: true });
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return failure;
    }
  } catch {
    return failure;
  }

  // Invalida también las páginas privadas visitadas en el Router Cache.
  revalidatePath("/", "layout");
  redirect("/login", RedirectType.replace);
}

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
  let error: {status?:number}|null=null;
  if(nativeAuthEnabled()){
    try{await assertAuthOrigin();await setNativeCookies(await(await nativeAuthClient()).loginPassword({body:{email,password}}));}
    catch(failure){error={status:failure instanceof ApiClientError?failure.status:503};}
  }else{
    const supabase = await createClient();
    error=(await supabase.auth.signInWithPassword({ email, password })).error;
  }

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

  if (nativeAuthEnabled()) {
    let url: string;
    try {
      await assertAuthOrigin();
      const { provider, ...context } = parsed.data;
      const result = await (await nativeAuthClient()).startSocialLogin({ body: { provider, context } });
      const { saveSocialTransaction } = await import('@/lib/api/social-auth');
      await saveSocialTransaction(provider, result.transaction);
      url = result.authorization_url;
    } catch { return { error: SOCIAL_AUTH_ERROR }; }
    redirect(url);
  }
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

/** Explicit linking proves the current Nest session before redirecting. */
export async function linkWithSocial(input: SocialLoginInput): Promise<LoginResult> {
  const parsed = socialLoginSchema.safeParse(input);
  if (!parsed.success) return { error: SOCIAL_AUTH_ERROR };
  let url: string;
  try {
    if (!nativeAuthEnabled()) return { error: SOCIAL_AUTH_ERROR };
    await assertAuthOrigin();
    const result = await (await nativeAuthClient()).startSocialLink({ body: { provider: parsed.data.provider, context: {} } });
    const { saveSocialTransaction } = await import('@/lib/api/social-auth');
    await saveSocialTransaction(parsed.data.provider, result.transaction);
    url = result.authorization_url;
  } catch { return { error: SOCIAL_AUTH_ERROR }; }
  redirect(url);
}
