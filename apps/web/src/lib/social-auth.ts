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
