import { nativeAuthEnabled } from './api/native-auth-config';
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
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Project only public capability flags; never send the settings response to a client. */
export async function getSocialProviderAvailability(): Promise<SocialProviderAvailability> {
  if (!socialAuthOrigin()) return { google: false, apple: false };
  const unknown = { google: null, apple: null };
  try {
    if (nativeAuthEnabled()) return await new ApiClient({origin:process.env.ASISTEAM_API_ORIGIN??'',timeoutMs:3000}).getSocialProviders();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return unknown;
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key }, cache: "no-store", signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return unknown;
    const settings: unknown = await response.json();
    if (!settings || typeof settings !== "object" || !("external" in settings)) return unknown;
    const external = settings.external;
    if (!external || typeof external !== "object") return unknown;
    return {
      google: "google" in external && typeof external.google === "boolean" ? external.google : null,
      apple: "apple" in external && typeof external.apple === "boolean" ? external.apple : null,
    };
  } catch {
    return unknown;
  }
}
