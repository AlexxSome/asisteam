import { checkinPath,SOCIAL_AUTH_ERROR,socialLoginContextSchema,type SocialLoginContext } from '@asisteam/core';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import 'server-only';
import { accountConsentPath } from '../account-consent-routing';
import { socialAuthOrigin,SOCIAL_CONTEXT_COOKIE } from '../social-auth';
import { nativeAuthClient,setNativeCookies } from './native-auth';
import { authCookieSettings } from './native-auth-config';
export const SOCIAL_TRANSACTION_COOKIE = 'asisteam-oauth-transaction';
export function socialTransactionSettings(provider: string, maxAge = 600) {
    return { ...authCookieSettings(maxAge), path: '/auth/callback/' + provider,
        ...(provider === 'apple' ? { sameSite: 'none' as const, secure: true } : {}) };
}
export async function saveSocialTransaction(provider: string, transaction: string, context: SocialLoginContext = {}) {
    const routing = socialLoginContextSchema.parse(context);
    const store = await cookies();
    // Only one browser flow is active; switching providers cannot reuse a prior flow.
    for (const p of ['google', 'apple']) {
        store.set(SOCIAL_TRANSACTION_COOKIE, '', socialTransactionSettings(p, 0));
        store.set(SOCIAL_CONTEXT_COOKIE, '', socialTransactionSettings(p, 0));
    }
    // Routing context is not authentication evidence. Only the API's encrypted
    // transaction authorizes login; this cookie preserves a validated invite on retry.
    const retry = routing.invite_code ? { invite_code: routing.invite_code } : {};
    store.set(SOCIAL_CONTEXT_COOKIE, JSON.stringify(retry), socialTransactionSettings(provider));
    store.set(SOCIAL_TRANSACTION_COOKIE, transaction, socialTransactionSettings(provider));
}
export async function completeSocialCallback(request: Request, provider: string) {
    const origin = socialAuthOrigin(), headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
    if (!origin)
        return NextResponse.json({ error: { code: 'social_auth_unavailable', message: SOCIAL_AUTH_ERROR, details: {} } }, { status: 503, headers });
    let destination = '/login?social_error=1';
    if (provider !== 'google' && provider !== 'apple')
        return NextResponse.redirect(new URL(destination, origin), { status: 303, headers });
    const store = await cookies(), transaction = store.get(SOCIAL_TRANSACTION_COOKIE)?.value;
    try {
        const routing = socialLoginContextSchema.parse(JSON.parse(store.get(SOCIAL_CONTEXT_COOKIE)?.value ?? '{}'));
        if (routing.invite_code) destination = '/login?invite_code=' + routing.invite_code + '&social_error=1';
    } catch { /* An invalid retry context cannot choose a redirect. */ }
    store.set(SOCIAL_TRANSACTION_COOKIE, '', socialTransactionSettings(provider, 0));
    store.set(SOCIAL_CONTEXT_COOKIE, '', socialTransactionSettings(provider, 0));
    try {
        if (!transaction)
            throw new Error('Unavailable transaction');
        const callbackUrl = new URL(request.url), host = request.headers.get('host');
        // Next may reconstruct request.url with its internal hostname. Compare the
        // received host to the configured allowlist; never use it for redirects.
        if (callbackUrl.pathname !== '/auth/callback/' + provider || (host ? host !== new URL(origin).host : callbackUrl.origin !== origin))
            throw new Error('Invalid callback');
        if (request.method !== (provider === 'apple' ? 'POST' : 'GET'))
            throw new Error('Invalid callback method');
        let parameters: URLSearchParams;
        if (provider === 'apple') {
            if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))
                throw new Error('Invalid callback body');
            const reader = request.body?.getReader();
            if (!reader)
                throw new Error('Missing body');
            let size = 0;
            const chunks: Uint8Array[] = [];
            try {
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    size += value.length;
                    if (size > 16384)
                        throw new Error('Large callback');
                    chunks.push(value);
                }
            }
            finally {
                await reader.cancel();
            }
            parameters = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
        }
        else
            parameters = new URL(request.url).searchParams;
        if (parameters.has('error') || parameters.getAll('code').length !== 1 || parameters.getAll('state').length !== 1)
            throw new Error('Invalid response');
        const result = await (await nativeAuthClient()).completeSocialLogin({ body: { provider, code: parameters.get('code')!, state: parameters.get('state')!, transaction } });
        await setNativeCookies(result.tokens);
        destination = result.linked ? '/profile?social_linked=1' : result.context.checkin ? checkinPath(result.context.checkin) : result.context.invite_code ? '/join?code=' + result.context.invite_code : '/welcome';
        const api = await nativeAuthClient(result.tokens.access_token);
        // Missing consent evidence never grants access. Keep the authenticated
        // destination/context while sending the user through acceptance again.
        const accepted = await api.getCurrentAccountConsent().then(value => value.accepted).catch(() => false);
        if (!accepted)
            destination = accountConsentPath(destination);
    }
    catch { /* Public failures do not reveal claims, token exchange or linking conflicts. */ }
    return NextResponse.redirect(new URL(destination, origin), { status: 303, headers });
}
