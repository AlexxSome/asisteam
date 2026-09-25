import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { createSendInvitationHandler } from "../../../../../../../../supabase/functions/send-invitation/handler";

const groupId = "23000000-0000-4000-8000-000000000201";
const invitation = { id: "23000000-0000-4000-8000-000000000301", status: "PENDING", expires_at: "2026-09-29T12:00:00+00:00" };
const requestBody = { action: "send", group_id: groupId, email: "test@example.test", role: "ATHLETE" };
const mock = { getUser: vi.fn(), rpc: vi.fn(), mail: vi.fn() };
const client = { auth: { getUser: mock.getUser }, rpc: mock.rpc } as unknown as SupabaseClient;
const options = { client, resendApiKey: "synthetic-key", emailFrom: "Asisteam <invites@example.test>",
  webUrl: "https://app.example.test", allowedOrigins: ["https://app.example.test"], sendEmail: mock.mail };
const request = (body: unknown = requestBody, headers: Record<string,string> = { Authorization: "Bearer verified-jwt" }) =>
  new Request("http://edge.test/send-invitation", { method: "POST", headers, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "verified-user" } }, error: null });
  mock.rpc.mockResolvedValue({ data: { ...invitation, email: "test@example.test", role: "ATHLETE", group_name: "Club <script>" }, error: null });
  mock.mail.mockResolvedValue(new Response(JSON.stringify({ id: "receipt" })));
});
describe("handler send-invitation", () => {
  it("valida JWT con Auth y nunca acepta identidad del cuerpo", async () => {
    const handler = createSendInvitationHandler(options);
    expect((await handler(request(requestBody, {}))).status).toBe(401);
    expect((await handler(request({ ...requestBody, p_auth_user_id: "other" }))).status).toBe(400);
    mock.getUser.mockResolvedValue({ data: { user: null }, error: new Error("jwt invalid") });
    expect((await handler(request())).status).toBe(401);
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.mail).not.toHaveBeenCalled();
  });
  it("solo lleva SHA-256 a SQL y el token plano solo al email", async () => {
    const response = await createSendInvitationHandler(options)(request());
    expect(await response.json()).toEqual({ invitation });
    expect(mock.getUser).toHaveBeenCalledWith("verified-jwt");
    const [, init] = mock.mail.mock.calls[0]!;
    const email = JSON.parse(init.body);
    const token = email.text.match(/https:\/\/app.example.test\/invitations\/([a-f0-9]{64})/)[1];
    expect(mock.rpc).toHaveBeenCalledWith("issue_invitation", {
      p_auth_user_id: "verified-user", p_group_id: groupId, p_email: "test@example.test", p_role: "ATHLETE",
      p_token_hash: createHash("sha256").update(token).digest("hex"),
    });
    expect(email.to).toEqual(["test@example.test"]);
    expect(email.text).toContain("Club <script>");
    expect(email.html).toBeUndefined();
    expect(init.headers["Idempotency-Key"]).toBe(`invitation-${invitation.id}`);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("SQL niega autorización y cuota antes del correo", async () => {
    for (const [code, status] of [["admin_required",403], ["group_not_found",404], ["invitation_send_rate_limited",429]] as const) {
      mock.rpc.mockResolvedValue({ data: null, error: { message: code } });
      expect((await createSendInvitationHandler(options)(request())).status).toBe(status);
    }
    expect(mock.mail).not.toHaveBeenCalled();
  });
  it("activación resuelve destinatario en SQL y bloquea correo sin consentimiento", async () => {
    const body = { action: "activate", group_id: groupId, membership_id: "35000000-0000-4000-8000-000000000312" };
    expect((await createSendInvitationHandler(options)(request(body))).status).toBe(200);
    expect(mock.rpc).toHaveBeenCalledWith("issue_managed_activation", expect.objectContaining({
      p_auth_user_id: "verified-user", p_membership_id: body.membership_id, p_group_id: groupId,
    }));
    mock.mail.mockClear();
    mock.rpc.mockResolvedValue({ data: null, error: { message: "guardian_consent_required" } });
    expect((await createSendInvitationHandler(options)(request(body))).status).toBe(422);
    expect(mock.mail).not.toHaveBeenCalled();
  });
  it("fallo o respuesta incierta del proveedor no se anuncian como envío exitoso", async () => {
    for (const result of [new Response("private provider error", { status: 500 }), new Response("{}")]) {
      mock.mail.mockResolvedValue(result);
      const response = await createSendInvitationHandler(options)(request());
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error.code).toBe("email_delivery_failed");
      expect(JSON.stringify(body)).not.toContain("private provider");
    }
    mock.mail.mockRejectedValue(new Error("private timeout"));
    expect((await createSendInvitationHandler(options)(request())).status).toBe(503);
  });
  it("configuración incompleta o URL insegura no crea invitaciones", async () => {
    for (const extra of [{ resendApiKey: undefined }, { webUrl: "http://remote.test" }, { webUrl: "https://user:password@remote.test" }]) {
      expect((await createSendInvitationHandler({ ...options, ...extra })(request())).status).toBe(503);
    }
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("aplica CORS y rechaza JSON malformado o demasiado grande", async () => {
    const handler = createSendInvitationHandler(options);
    expect((await handler(request(requestBody, { Origin: "https://other.test" }))).status).toBe(403);
    const preflight = await handler(new Request("http://edge.test", { method: "OPTIONS", headers: { Origin: options.webUrl } }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(options.webUrl);
    expect((await handler(new Request("http://edge.test", { method: "POST", headers: { Authorization: "Bearer jwt" }, body: "{" }))).status).toBe(400);
    expect((await handler(request({ ...requestBody, email: "x".repeat(5000) })))).toHaveProperty("status", 400);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});
