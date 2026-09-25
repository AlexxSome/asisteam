import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { invitationRegistrationSchema } from "../../../packages/core/src/schemas/register.ts";
import { INVITATION_TERMS_VERSION, invitationErrorMessages, invitationRequestSchema } from "../../../packages/core/src/schemas/invitation.ts";

const encoder = new TextEncoder();
async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
async function hash(value: string) {
  return Array.from(await digest(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
const statuses: Record<string, number> = {
  invitation_expired: 410, invitation_not_available: 404, authentication_required: 401,
  invalid_registration: 400, registration_failed: 422, guardian_consent_required: 422,
  birthdate_confirmation_required: 422, athlete_birthdate_required: 422,
  group_member_limit: 422, user_group_limit: 422, rate_limit: 429, unavailable: 503,
};

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const allowed = (Deno.env.get("INVITATION_ALLOWED_ORIGINS") ?? "https://app.asisteam.cl,https://staging.asisteam.cl").split(",");
  const headers: Record<string, string> = {
    "Content-Type": "application/json", "Cache-Control": "private, no-store", "Vary": "Origin",
    "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
  };
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
  const fail = (code: string) => json({ error: {
    code, message: invitationErrorMessages[code] ?? invitationErrorMessages.unavailable, details: {},
  } }, statuses[code] ?? 400);
  if (origin && !allowed.includes(origin)) return json({ error: { code: "forbidden_origin", message: "Origen no permitido", details: {} } }, 403);
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  if (request.method !== "POST") return json({ error: { code: "method_not_allowed", message: "Método no permitido", details: {} } }, 405);

  try {
    // El endpoint web es un proxy de confianza. Secreto independiente de service_role:
    // permite conservar el límite por IP del navegador detrás de Server Actions.
    const secret = Deno.env.get("INVITATION_PROXY_SECRET");
    const supplied = request.headers.get("x-asisteam-proxy") ?? "";
    if (!secret) return fail("unavailable");
    if (!timingSafeEqual(await digest(secret), await digest(supplied))) return fail("authentication_required");
    const ip = request.headers.get("x-asisteam-client-ip");
    if (!ip || ip.length > 128) return fail("authentication_required");
    if (Number(request.headers.get("content-length") ?? 0) > 16_384) return fail("invalid_registration");
    const body = await request.text();
    if (body.length > 16_384) return fail("invalid_registration");
    const parsed = invitationRequestSchema.safeParse(JSON.parse(body));
    if (!parsed.success) return fail("invitation_not_available");
    const input = parsed.data;
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: allowedAttempt, error: limitError } = await admin.rpc("consume_invitation_attempt", {
      p_key: await hash(`${secret}:${input.action === "preview" ? "preview" : "accept"}:${ip}`),
    });
    if (limitError) return fail("unavailable");
    if (!allowedAttempt) return fail("rate_limit");
    const tokenHash = await hash(input.token);
    const { data: context, error: contextError } = await admin.rpc("invitation_context", { p_token_hash: tokenHash });
    if (contextError || !context) return fail("unavailable");
    if (context.error) return fail(context.error);
    if (input.action === "preview") return json({ group_name: context.group_name, role: context.role });

    if (input.action === "register") {
      const registration = invitationRegistrationSchema.safeParse(input.registration);
      if (!registration.success) return fail("invalid_registration");
      if (!context.email || registration.data.email.toLowerCase() !== context.email.toLowerCase()
        || !["INVITED", "MANAGED"].includes(context.account_status)) return fail("registration_failed");
      const { full_name, email, password, birthdate, phone } = registration.data;
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
      const nonceHash = await hash(nonce);
      const { error: prepareError } = await admin.rpc("prepare_invitation_registration", {
        p_token_hash: tokenHash, p_nonce_hash: nonceHash, p_email: email,
        p_registration: { full_name, birthdate, phone: phone ?? null, terms_version: INVITATION_TERMS_VERSION },
      });
      if (prepareError) return fail("unavailable");
      const { data: created, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name, birthdate, phone: phone ?? null, invitation_registration_nonce: nonce },
      });
      await admin.rpc("cancel_invitation_registration", { p_nonce_hash: nonceHash });
      if (error) {
        // El trigger revierte Auth si falla. Una carrera con expires_at también
        // debe persistir EXPIRED fuera de esa transacción revertida.
        const { data: current } = await admin.rpc("invitation_context", { p_token_hash: tokenHash });
        return fail(current?.error ?? "registration_failed");
      }
      const { data: result, error: resultError } = await admin.rpc("invitation_registration_result", {
        p_token_hash: tokenHash, p_auth_user_id: created.user!.id,
      });
      if (resultError || !result) return fail("unavailable");
      return json(result);
    }

    const bearer = request.headers.get("authorization")?.replace(/^Bearer /i, "");
    if (!bearer) return fail("authentication_required");
    const { data: { user }, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !user) return fail("authentication_required");
    const { data, error } = await admin.rpc("accept_invitation", { p_token_hash: tokenHash, p_auth_user_id: user.id });
    if (error || !data) return fail("unavailable");
    return data.error ? fail(data.error) : json(data);
  } catch {
    // No registrar payload, contraseñas, token, IP ni PII.
    return fail("unavailable");
  }
});
