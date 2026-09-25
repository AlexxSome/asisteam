import { SEND_INVITATION_ERROR_MESSAGES, sendInvitationRequestSchema, sentInvitationSchema } from "../../../packages/core/src/schemas/invitation.ts";
import { MEMBERSHIP_ROLE_LABELS } from "../../../packages/core/src/enums.ts";

type InvitationClient = {
  auth: { getUser(jwt: string): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  rpc(name: "issue_invitation" | "issue_managed_activation", args: {
    p_auth_user_id: string; p_group_id: string; p_token_hash: string;
    p_email?: string; p_role?: string; p_invitation_id?: string; p_membership_id?: string;
  }): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
type Options = {
  client: InvitationClient;
  resendApiKey?: string;
  emailFrom?: string;
  webUrl?: string;
  allowedOrigins: string[];
  // Permite probar el transporte sin correos reales; producción usa fetch.
  sendEmail?: typeof fetch;
};
const statuses: Record<string, number> = {
  authentication_required: 401, group_not_found: 404, admin_required: 403,
  invalid_invitation: 400, invitation_not_available: 404, invitation_send_rate_limited: 429,
  email_delivery_failed: 503, unavailable: 503,
  managed_account_required: 409, managed_email_required: 422, membership_not_found: 404,
  guardian_consent_required: 422, activation_request_changed: 409, activation_sender_required: 403,
};

export function createSendInvitationHandler(options: Options) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const headers: Record<string, string> = {
      "Content-Type": "application/json", "Cache-Control": "private, no-store", "Vary": "Origin",
      "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
    };
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
    const fail = (code: string) => json({ error: {
      code, message: SEND_INVITATION_ERROR_MESSAGES[code] ?? SEND_INVITATION_ERROR_MESSAGES.unavailable, details: {},
    } }, statuses[code] ?? 503);
    if (origin && !options.allowedOrigins.includes(origin)) {
      return json({ error: { code: "forbidden_origin", message: "Origen no permitido", details: {} } }, 403);
    }
    if (origin) headers["Access-Control-Allow-Origin"] = origin;
    if (request.method === "OPTIONS") {
      headers["Access-Control-Allow-Methods"] = "POST";
      headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type, x-client-info";
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      return json({ error: { code: "method_not_allowed", message: "Método no permitido", details: {} } }, 405);
    }
    try {
      const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
      if (!bearer) return fail("authentication_required");
      const { data: { user }, error: authError } = await options.client.auth.getUser(bearer);
      if (authError || !user) return fail("authentication_required");
      if (Number(request.headers.get("content-length") ?? 0) > 4096) return fail("invalid_invitation");
      const raw = await request.text();
      if (raw.length > 4096) return fail("invalid_invitation");
      let body: unknown;
      try { body = JSON.parse(raw); } catch { return fail("invalid_invitation"); }
      const parsed = sendInvitationRequestSchema.safeParse(body);
      if (!parsed.success) return fail("invalid_invitation");
      // Fallar antes de persistir si el despliegue carece de configuración.
      if (!options.resendApiKey || !options.emailFrom || !options.webUrl) return fail("unavailable");
      const webUrl = new URL(options.webUrl);
      if (webUrl.protocol !== "https:" && !(webUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(webUrl.hostname))) {
        return fail("unavailable");
      }
      if (webUrl.username || webUrl.password || webUrl.pathname !== "/" || webUrl.search || webUrl.hash) return fail("unavailable");
      const input = parsed.data;
      const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      const tokenHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      const { data, error } = await options.client.rpc(input.action === "activate" ? "issue_managed_activation" : "issue_invitation", {
        p_auth_user_id: user.id, p_group_id: input.group_id, p_token_hash: tokenHash,
        ...(input.action === "send" ? { p_email: input.email, p_role: input.role }
          : input.action === "activate" ? { p_membership_id: input.membership_id } : { p_invitation_id: input.invitation_id }),
      });
      if (error || !data) {
        const code = error && Object.hasOwn(SEND_INVITATION_ERROR_MESSAGES, error.message) ? error.message : "unavailable";
        return fail(code);
      }
      const invitation = sentInvitationSchema.safeParse(data);
      const delivery = data as { email?: unknown; group_name?: unknown; role?: unknown };
      if (!invitation.success || typeof delivery.email !== "string" || typeof delivery.group_name !== "string"
        || (delivery.role !== "ATHLETE" && delivery.role !== "GUARDIAN")) return fail("unavailable");
      const link = new URL(`/invitations/${token}`, webUrl).href;
      const role = MEMBERSHIP_ROLE_LABELS[delivery.role];
      // El texto plano evita interpolar nombres del grupo como HTML. El token
      // vive solo en memoria y en el email; no sale en la respuesta al ADMIN.
      try {
        const response = await (options.sendEmail ?? fetch)("https://api.resend.com/emails", {
          method: "POST", signal: AbortSignal.timeout(10_000),
          headers: { Authorization: `Bearer ${options.resendApiKey}`, "Content-Type": "application/json",
            "Idempotency-Key": `invitation-${invitation.data.id}` },
          body: JSON.stringify({ from: options.emailFrom, to: [delivery.email], subject: "Invitación a Asisteam",
            text: `Te invitaron al grupo ${delivery.group_name} como ${role}.\n\nAcepta la invitación en este enlace:\n${link}\n\nEl enlace vence en 7 días y es de un solo uso. Si recibiste un reenvío, el enlace anterior ya no funciona.\n\nSi no esperabas esta invitación, puedes ignorar este correo.` }),
        });
        const receipt = response.ok ? await response.json() : null;
        if (!response.ok || typeof receipt?.id !== "string") return fail("email_delivery_failed");
      } catch { return fail("email_delivery_failed"); }
      return json({ invitation: invitation.data });
    } catch {
      // No registrar emails, tokens, respuestas del proveedor ni credenciales.
      return fail("unavailable");
    }
  };
}
