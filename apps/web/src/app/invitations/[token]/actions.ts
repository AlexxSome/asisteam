"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { invitationErrorMessages, invitationRegistrationSchema, invitationTokenSchema, loginSchema,
  type InvitationAcceptance, type InvitationPreview } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";

type Result<T> = { data: T; error?: never } | { error: string; data?: never };

async function invoke<T>(body: unknown, accessToken?: string): Promise<Result<T>> {
  const secret = process.env.INVITATION_PROXY_SECRET;
  if (!secret) return { error: invitationErrorMessages.unavailable! };
  const incoming = await headers();
  // Vercel sobrescribe X-Forwarded-For con la IP del cliente. Otros hosts
  // deben sanearlo en su proxy de entrada; nunca confiar en headers arbitrarios.
  const ip = incoming.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/accept-invitation`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", "x-asisteam-proxy": secret, "x-asisteam-client-ip": ip,
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(body),
    });
    const value = await response.json();
    if (!response.ok || value.error) {
      return { error: invitationErrorMessages[value.error?.code] ?? invitationErrorMessages.unavailable! };
    }
    return { data: value as T };
  } catch {
    return { error: invitationErrorMessages.unavailable! };
  }
}

export async function previewInvitation(token: string): Promise<Result<InvitationPreview>> {
  if (!invitationTokenSchema.safeParse(token).success) return { error: invitationErrorMessages.invitation_not_available! };
  return invoke({ action: "preview", token });
}

export async function acceptInvitation(token: string, mode: "session" | "login" | "register", input?: unknown): Promise<{ error: string } | { pending: true } | undefined> {
  if (!invitationTokenSchema.safeParse(token).success || !["session", "login", "register"].includes(mode)) {
    return { error: invitationErrorMessages.invitation_not_available! };
  }
  const supabase = await createClient();
  let accepted: Result<InvitationAcceptance>;
  if (mode === "register") {
    const parsed = invitationRegistrationSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? invitationErrorMessages.invalid_registration! };
    accepted = await invoke({ action: "register", token, registration: parsed.data });
    if (accepted.error) return { error: accepted.error };
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    if (error) return { error: "Tu cuenta quedó activada. Inicia sesión desde el acceso habitual para entrar a tu grupo." };
  } else {
    if (mode === "login") {
      const parsed = loginSchema.safeParse(input);
      if (!parsed.success) return { error: "Email o contraseña incorrectos" };
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      if (error) return { error: "Email o contraseña incorrectos" };
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: invitationErrorMessages.authentication_required! };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: invitationErrorMessages.authentication_required! };
    accepted = await invoke({ action: "accept", token }, session.access_token);
    if (accepted.error) return { error: accepted.error };
  }
  if (!accepted.data) return { error: invitationErrorMessages.unavailable! };
  if (accepted.data.membership_status === "PENDING") return { pending: true };
  redirect(`/groups/${accepted.data.group_id}`);
}
