import { ApiClient } from '@asisteam/api-client';
import type { SOCIAL_PROVIDERS } from "@asisteam/core";
export type SocialProviderAvailability = Record<(typeof SOCIAL_PROVIDERS)[number], boolean | null>;
export const SOCIAL_CONTEXT_COOKIE = "asisteam-oauth-context";
export const SOCIAL_CALLBACK_PATH = "/auth/callback";
// Origen explícito: no confiar en Host, X-Forwarded-Host ni un next enviado por el cliente.
export function socialAuthOrigin(): string | null {
    const value = process.env.ASISTEAM_SITE_URL
        ?? (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
    try {
        const url = new URL(value);
        const local = process.env.NODE_ENV !== "production"
            && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        if ((url.protocol !== "https:" && !(local && url.protocol === "http:"))
            || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
            return null;
        return url.origin;
    }
    catch {
        return null;
    }
}
/** Project only public capability flags; never send the settings response to a client. */
export async function getSocialProviderAvailability(): Promise<SocialProviderAvailability> {
    if (!socialAuthOrigin())
        return { google: false, apple: false };
    const unknown = { google: null, apple: null };
    try {
        return await new ApiClient({ origin: process.env.ASISTEAM_API_ORIGIN ?? '', timeoutMs: 3000 }).getSocialProviders();
    }
    catch {
        return unknown;
    }
}
