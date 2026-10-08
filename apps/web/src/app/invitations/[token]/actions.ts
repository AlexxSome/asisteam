"use server";

import { nativeAuthEnabled } from '@/lib/api/native-auth-config';
import { assertAuthOrigin, nativeAuthClient, setNativeCookies } from '@/lib/api/native-auth';
import { ApiClient, ApiClientError } from "@asisteam/api-client";
import { moduleTransport } from "@/lib/api/config";
import { memberOperation } from "@/lib/members";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { invitationErrorMessages, invitationRegistrationSchema, invitationTokenSchema, loginSchema, managedClaimSchema,
  type InvitationAcceptance, type InvitationPreview } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";
import { accountConsentPath } from "@/lib/account-consent-routing";

type Result<T> = { data: T; error?: never } | { error: string; data?: never };

async function invoke<T>(body: unknown, accessToken?: string): Promise<Result<T>> {
  const secret = process.env.INVITATION_PROXY_SECRET;
  if (!secret) return { error: invitationErrorMessages.unavailable! };
  const incoming = await headers();
  // Vercel sobrescribe X-Forwarded-For con la IP del cliente. Otros hosts
  // deben sanearlo en su proxy de entrada; nunca confiar en headers arbitrarios.
  const ip = incoming.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  try {
    if (moduleTransport("invitations") === "nest") {
      const api = new ApiClient({ origin: process.env.ASISTEAM_API_ORIGIN ?? "", timeoutMs: 15000,
        nativeAuth:nativeAuthEnabled(),invitationProxy: { secret, clientIp: ip }, accessToken: async () => accessToken ?? null });
      const input = body as { action: "preview" | "accept" | "register" | "claim"; token: string; registration?: unknown };
      const value = input.action === "preview" ? await api.previewInvitation({body:{token:input.token}})
        : input.action === "accept" ? await api.acceptInvitation({body:{token:input.token}})
        : input.action === "claim" ? await api.claimInvitation({body:{token:input.token,registration:managedClaimSchema.parse(input.registration)}})
        : await api.registerInvitation({body:{token:input.token,registration:invitationRegistrationSchema.parse(input.registration)}});
      return {data:value as T};
    }
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
  } catch (error) {
    return { error: error instanceof ApiClientError ? invitationErrorMessages[error.error.code] ?? invitationErrorMessages.unavailable! : invitationErrorMessages.unavailable! };
  }
}

export async function previewInvitation(token: string): Promise<Result<InvitationPreview>> {
  if (!invitationTokenSchema.safeParse(token).success) return { error: invitationErrorMessages.invitation_not_available! };
  return invoke({ action: "preview", token });
}

export async function acceptInvitation(token: string, mode: "session" | "login" | "register" | "claim", input?: unknown): Promise<{ error: string } | { pending: true } | undefined> {
  if (!invitationTokenSchema.safeParse(token).success || !["session", "login", "register", "claim"].includes(mode)) {
    return { error: invitationErrorMessages.invitation_not_available! };
  }
  if(nativeAuthEnabled()){
    await assertAuthOrigin();
    if(mode==='register'||mode==='claim'){
      const schema=mode==='claim'?managedClaimSchema:invitationRegistrationSchema,parsed=schema.safeParse(input);
      if(!parsed.success)return{error:invitationErrorMessages.invalid_registration!};
      const accepted=await invoke<InvitationAcceptance>({action:mode,token,registration:parsed.data});
      if(accepted.error)return{error:accepted.error};
      if(!accepted.data)return{error:invitationErrorMessages.unavailable!};
      try{await setNativeCookies(await(await nativeAuthClient()).loginPassword({body:{email:parsed.data.email,password:parsed.data.password}}));}
      catch{return{error:'Tu cuenta quedó activada. Inicia sesión desde el acceso habitual para entrar a tu grupo.'};}
      if(accepted.data.membership_status==='PENDING')return{pending:true};
      redirect(mode==='claim'?`/groups/${accepted.data.group_id}/me/history`:`/groups/${accepted.data.group_id}`);
    }
    if(mode==='login'){
      const parsed=loginSchema.safeParse(input);if(!parsed.success)return{error:'Email o contraseña incorrectos'};
      try{await setNativeCookies(await(await nativeAuthClient()).loginPassword({body:parsed.data}));}catch{return{error:'Email o contraseña incorrectos'};}
    }
  }
  const supabase = await createClient();
  let accepted: Result<InvitationAcceptance>;
  if (mode === "register" || mode === "claim") {
    const parsed = (mode === "claim" ? managedClaimSchema : invitationRegistrationSchema).safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? invitationErrorMessages.invalid_registration! };
    accepted = await invoke({ action: mode, token, registration: parsed.data });
    if (accepted.error) return { error: accepted.error };
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    if (error) return { error: "Tu cuenta quedó activada. Inicia sesión desde el acceso habitual para entrar a tu grupo." };
  } else {
    if (mode === "login" && !nativeAuthEnabled()) {
      const parsed = loginSchema.safeParse(input);
      if (!parsed.success) return { error: "Email o contraseña incorrectos" };
      const { error } = await supabase.auth.signInWithPassword(parsed.data);
      if (error) return { error: "Email o contraseña incorrectos" };
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: invitationErrorMessages.authentication_required! };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.user.id !== user.id) return { error: invitationErrorMessages.authentication_required! };
    const { data: acceptedTerms, error: consentError } = await memberOperation(() => supabase.rpc("has_account_consent"), async api => (await api.getCurrentAccountConsent()).accepted);
    if (consentError) return { error: invitationErrorMessages.unavailable! };
    if (acceptedTerms !== true) redirect(accountConsentPath(`/invitations/${token}`));
    accepted = await invoke({ action: "accept", token }, session.access_token);
    if (accepted.error) return { error: accepted.error };
  }
  if (!accepted.data) return { error: invitationErrorMessages.unavailable! };
  if (accepted.data.membership_status === "PENDING") return { pending: true };
  if (accepted.data.membership_status !== "ACTIVE") redirect("/groups");
  if (mode === "claim") redirect(`/groups/${accepted.data.group_id}/me/history`);
  redirect(`/groups/${accepted.data.group_id}`);
}
