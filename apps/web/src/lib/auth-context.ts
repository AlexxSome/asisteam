import { joinCodeSchema } from "@asisteam/core";

export type AuthSearchParams = { invite_code?: string | string[] };
export const RECOVERY_INVITE_COOKIE = "asisteam-recovery-invite";

export function parseInviteCode(value: unknown): string | undefined {
  const parsed = joinCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

// Only a validated group code travels between these fixed routes. Never copy
// arbitrary search params, recovery tokens, QR payloads or a client-provided URL.
export function authPath(path: "/login" | "/register" | "/forgot-password" | "/reset-password", inviteCode?: string): string {
  const code = parseInviteCode(inviteCode);
  return code ? `${path}?invite_code=${encodeURIComponent(code)}` : path;
}

export function invitationDestination(inviteCode: unknown, fallback: "/" | "/welcome" = "/welcome"): string {
  const code = parseInviteCode(inviteCode);
  return code ? `/join?code=${encodeURIComponent(code)}` : fallback;
}
