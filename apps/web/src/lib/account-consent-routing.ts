import { joinCodeSchema } from "@asisteam/core";

/** Retorno local acotado; nunca transporta tokens de recuperación ni query arbitraria. */
export function consentReturnPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || /[\\\r\n]/.test(value)) return "/welcome";
  const url = new URL(value, "https://asisteam.invalid");
  if (url.origin !== "https://asisteam.invalid") return "/welcome";
  if (url.pathname === "/join") {
    const code = joinCodeSchema.safeParse(url.searchParams.getAll("code").length === 1 ? url.searchParams.get("code") : null);
    return code.success ? `/join?code=${code.data}` : "/join";
  }
  if (/^\/(?:welcome|profile|check-in|groups(?:\/[a-zA-Z0-9_-]+)*|wards(?:\/[a-zA-Z0-9_-]+)*|invitations\/[a-zA-Z0-9_-]{22,256})$/.test(url.pathname)) return url.pathname;
  return "/welcome";
}

export function accountConsentPath(destination: string): string {
  const returnTo = consentReturnPath(destination);
  // El QR sigue en fragmento: no termina en query, registros HTTP ni Server Actions.
  const fragment = returnTo === "/check-in" ? new URL(destination, "https://asisteam.invalid").hash : "";
  return `/accept-terms?return_to=${encodeURIComponent(returnTo)}${fragment}`;
}
