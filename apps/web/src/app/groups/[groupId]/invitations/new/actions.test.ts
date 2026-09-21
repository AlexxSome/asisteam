import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), getSession: vi.fn(), fetch: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser, getSession: mock.getSession } }) }));
import { sendInvitation } from "./actions";
const groupId = "23000000-0000-4000-8000-000000000201";
const invitation = { id: "23000000-0000-4000-8000-000000000301", status: "PENDING", expires_at: "2026-09-29T12:00:00Z" };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("fetch", mock.fetch);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  mock.getUser.mockResolvedValue({ data: { user: { id: "verified-actor" } } });
  mock.getSession.mockResolvedValue({ data: { session: { access_token: "verified-jwt" } } });
  mock.fetch.mockResolvedValue(new Response(JSON.stringify({ invitation })));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("emisión desde Server Action", () => {
  it("rechaza roles o identidades inyectadas antes de llamar al backend", async () => {
    for (const extra of [{ role: "ADMIN" }, { invited_user_id: "victim" }, { p_auth_user_id: "other" }, { token: "chosen" }]) {
      expect(await sendInvitation({ action: "send", group_id: groupId, email: "test@example.test", role: "ATHLETE", ...extra })).toHaveProperty("error.code", "invalid_invitation");
    }
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it("sin sesión no emite", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect(await sendInvitation({ action: "send", group_id: groupId, email: "test@example.test", role: "ATHLETE" })).toHaveProperty("error.code", "authentication_required");
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it("usa el JWT verificado, normaliza email y proyecta la respuesta", async () => {
    mock.fetch.mockResolvedValue(new Response(JSON.stringify({ invitation: { ...invitation, token: "private", account_status: "INVITED", invited_user_id: "private" } })));
    expect(await sendInvitation({ action: "send", group_id: groupId, email: " TEST@Example.test ", role: "GUARDIAN" })).toEqual({ invitation });
    const [url, options] = mock.fetch.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:54321/functions/v1/send-invitation");
    expect(options.headers.Authorization).toBe("Bearer verified-jwt");
    expect(JSON.parse(options.body)).toEqual({ action: "send", group_id: groupId, email: "test@example.test", role: "GUARDIAN" });
  });
  it("reenvía por ID y revalida lista también tras fallo de correo", async () => {
    mock.fetch.mockResolvedValue(new Response(JSON.stringify({ error: { code: "email_delivery_failed", message: "provider private" } }), { status: 503 }));
    const result = await sendInvitation({ action: "resend", group_id: groupId, invitation_id: invitation.id });
    expect(result).toHaveProperty("error.code", "email_delivery_failed");
    expect(JSON.stringify(result)).not.toContain("provider private");
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${groupId}/invitations/new`);
    expect(JSON.parse(mock.fetch.mock.calls[0]![1].body)).toEqual({ action: "resend", group_id: groupId, invitation_id: invitation.id });
  });
  it("no confirma envío con respuesta inválida ni revela errores internos", async () => {
    mock.fetch.mockResolvedValue(new Response(JSON.stringify({ internal: "private" })));
    expect(await sendInvitation({ action: "send", group_id: groupId, email: "test@example.test", role: "ATHLETE" })).toHaveProperty("error.code", "unavailable");
    mock.fetch.mockRejectedValue(new Error("private-network-error"));
    const result = await sendInvitation({ action: "resend", group_id: groupId, invitation_id: invitation.id });
    expect(result).toHaveProperty("error.code", "unavailable");
    expect(JSON.stringify(result)).not.toContain("private-network-error");
  });
});
