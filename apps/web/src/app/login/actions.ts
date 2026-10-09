"use server";
import { assertAuthOrigin,clearNativeCookies,nativeAuthClient,setNativeCookies } from '@/lib/api/native-auth';
import { NATIVE_ACCESS_COOKIE,NATIVE_REFRESH_COOKIE } from '@/lib/api/native-auth-config';
import { socialAuthOrigin } from "@/lib/social-auth";
import { ApiClientError } from '@asisteam/api-client';
import { checkinInputSchema,checkinPath,joinCodeSchema,loginSchema,SOCIAL_AUTH_ERROR,socialLoginSchema,type CheckinInput,type LoginInput,type SocialLoginInput } from "@asisteam/core";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect,RedirectType } from "next/navigation";
export type LoginResult = {
    error: string;
} | undefined;
const INVALID_CREDENTIALS_ERROR = "Email o contraseña incorrectos";
export async function signOutUser(): Promise<{
    error: string;
}> {
    const failure = { error: "No pudimos cerrar tu sesión. Vuelve a intentarlo." };
    try {
        if (((await cookies()).get(NATIVE_ACCESS_COOKIE) || (await cookies()).get(NATIVE_REFRESH_COOKIE))) {
            await assertAuthOrigin();
            const store = await cookies(), access = store.get(NATIVE_ACCESS_COOKIE)?.value, refresh = store.get(NATIVE_REFRESH_COOKIE)?.value;
            let token = access;
            const api = await nativeAuthClient(access);
            try {
                await api.logoutSession();
            }
            catch (error) {
                if (!(error instanceof ApiClientError) || error.status !== 401)
                    throw error;
                if (refresh) {
                    try {
                        token = (await api.refreshSession({ body: { refresh_token: refresh } })).access_token;
                        await (await nativeAuthClient(token)).logoutSession();
                    }
                    catch (refreshError) {
                        if (!(refreshError instanceof ApiClientError) || refreshError.status !== 401)
                            throw refreshError;
                    }
                }
            }
            await clearNativeCookies();
        }
        else { await assertAuthOrigin(); await clearNativeCookies(); }
    }
    catch {
        return failure;
    }
    // Invalida también las páginas privadas visitadas en el Router Cache.
    revalidatePath("/", "layout");
    redirect("/login", RedirectType.replace);
}
/** Password access preserves generic credential errors and MANAGED rejection in native Auth. */
export async function loginUser(input: LoginInput, inviteCode?: string, checkin?: CheckinInput): Promise<LoginResult> {
    const parsed = loginSchema.safeParse(input);
    if (!parsed.success) {
        return { error: INVALID_CREDENTIALS_ERROR };
    }
    const { email, password } = parsed.data;
    let error: {
        status?: number;
    } | null = null;
    {
        try {
            await assertAuthOrigin();
            await setNativeCookies(await (await nativeAuthClient()).loginPassword({ body: { email, password } }));
        }
        catch (failure) {
            error = { status: failure instanceof ApiClientError ? failure.status : 503 };
        }
    }
    if (error) {
        if (error.status === 429) {
            return { error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." };
        }
        return { error: INVALID_CREDENTIALS_ERROR };
    }
    const parsedCode = joinCodeSchema.safeParse(inviteCode);
    const parsedCheckin = checkinInputSchema.safeParse(checkin);
    if (parsedCheckin.success)
        redirect(checkinPath(parsedCheckin.data));
    redirect(parsedCode.success ? `/join?code=${parsedCode.data}` : "/");
}
export async function loginWithSocial(input: SocialLoginInput): Promise<LoginResult> {
    const parsed = socialLoginSchema.safeParse(input);
    const origin = socialAuthOrigin();
    if (!parsed.success || !origin)
        return { error: SOCIAL_AUTH_ERROR };
    {
        let url: string;
        try {
            await assertAuthOrigin();
            const { provider, ...context } = parsed.data;
            const result = await (await nativeAuthClient()).startSocialLogin({ body: { provider, context } });
            const { saveSocialTransaction } = await import('@/lib/api/social-auth');
            await saveSocialTransaction(provider, result.transaction);
            url = result.authorization_url;
        }
        catch {
            return { error: SOCIAL_AUTH_ERROR };
        }
        redirect(url);
    }
}
/** Explicit linking proves the current Nest session before redirecting. */
export async function linkWithSocial(input: SocialLoginInput): Promise<LoginResult> {
    const parsed = socialLoginSchema.safeParse(input);
    if (!parsed.success)
        return { error: SOCIAL_AUTH_ERROR };
    let url: string;
    try {
        ;
        await assertAuthOrigin();
        const result = await (await nativeAuthClient()).startSocialLink({ body: { provider: parsed.data.provider, context: {} } });
        const { saveSocialTransaction } = await import('@/lib/api/social-auth');
        await saveSocialTransaction(parsed.data.provider, result.transaction);
        url = result.authorization_url;
    }
    catch {
        return { error: SOCIAL_AUTH_ERROR };
    }
    redirect(url);
}
