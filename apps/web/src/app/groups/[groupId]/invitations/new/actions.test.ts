import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), getSession: vi.fn(), review: vi.fn(), send: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser, getSession: mock.getSession } }) }));
vi.mock("@/lib/api/server", () => ({ createServerApiClient: () => ({ reviewManagedActivation:mock.review,sendInvitation:mock.send }) }));
import { sendInvitation } from "@/app/groups/[groupId]/invitations/new/actions";
import { reviewManagedActivation } from "@/app/groups/[groupId]/members/consent/actions";
const groupId = "23000000-0000-4000-8000-000000000201";
const invitation = { id: "23000000-0000-4000-8000-000000000301", status: "PENDING", expires_at: "2026-09-29T12:00:00Z" };
beforeEach(() => {
  vi.resetAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "verified-actor" } } });
  mock.getSession.mockResolvedValue({ data: { session: { access_token: "verified-jwt" } } });
  mock.send.mockResolvedValue({ invitation });
});
describe("HU-APO-07: decisión registrada antes del envío", () => {
  const requestId = "51000000-0000-4000-8000-000000000001";
  const identity = { group_id: groupId, membership_id: "51000000-0000-4000-8000-000000000002" };
  beforeEach(() => { mock.review.mockResolvedValue(identity); });
  it("rechaza sin enviar y usa solo la identidad devuelta por el servidor al aprobar", async () => {
    expect(await reviewManagedActivation({ request_id: requestId, accepted: false })).toEqual({ success: true });
    expect(mock.send).not.toHaveBeenCalled();
    expect(await reviewManagedActivation({ request_id: requestId, accepted: true })).toEqual({ success: true });
    expect(mock.review).toHaveBeenLastCalledWith({params:{requestId},body:{accepted:true}});
    expect(mock.send).toHaveBeenCalledWith({body:{action:"activate",...identity}});
  });
  it("distingue el fallo de email de un fallo al registrar la decisión", async () => {
    mock.send.mockRejectedValue(new ApiClientError(503,"email_delivery_failed"));
    expect(await reviewManagedActivation({ request_id: requestId, accepted: true })).toMatchObject({ approvalRecorded: true, error: { code: "email_delivery_failed" } });
    mock.review.mockRejectedValue(new ApiClientError(409,"activation_request_changed"));
    const rejected = await reviewManagedActivation({ request_id: requestId, accepted: true });
    expect(rejected).toHaveProperty("error.code", "activation_request_changed");
    expect(rejected).not.toHaveProperty("approvalRecorded");
    expect(mock.send).toHaveBeenCalledTimes(1);
  });
  it("conserva aprobación aunque la sesión falle al preparar el envío", async () => {
    mock.getSession.mockRejectedValue(new Error("private-auth-error"));
    const result = await reviewManagedActivation({ request_id: requestId, accepted: true });
    expect(result).toMatchObject({ approvalRecorded: true, error: { code: "unavailable", message: expect.stringContaining("El consentimiento quedó registrado.") } });
    expect(JSON.stringify(result)).not.toContain("private-auth-error");
    expect(mock.send).not.toHaveBeenCalled();
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("emisión desde Server Action", () => {
  it("rechaza roles o identidades inyectadas antes de llamar al backend", async () => {
    for (const extra of [{ role: "ADMIN" }, { invited_user_id: "victim" }, { p_auth_user_id: "other" }, { token: "chosen" }]) {
      expect(await sendInvitation({ action: "send", group_id: groupId, email: "test@example.test", role: "ATHLETE", ...extra })).toHaveProperty("error.code", "invalid_invitation");
    }
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("sin sesión no emite", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect(await sendInvitation({ action: "send", group_id: groupId, email: "test@example.test", role: "ATHLETE" })).toHaveProperty("error.code", "authentication_required");
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("usa el JWT verificado, normaliza email y proyecta la respuesta", async () => {
    mock.send.mockResolvedValue({ invitation: { ...invitation, token: "private", account_status: "INVITED", invited_user_id: "private" } });
    expect(await sendInvitation({ action: "send", group_id: groupId, email: " TEST@Example.test ", role: "GUARDIAN" })).toEqual({ invitation });
    expect(mock.send).toHaveBeenCalledWith({body:{action:"send",group_id:groupId,email:"test@example.test",role:"GUARDIAN"}});
  });
  it("reenvía por ID y revalida lista también tras fallo de correo", async () => {
    mock.send.mockRejectedValue(new ApiClientError(503,"email_delivery_failed","provider private"));
    const result = await sendInvitation({ action: "resend", group_id: groupId, invitation_id: invitation.id });
    expect(result).toHaveProperty("error.code", "email_delivery_failed");
    expect(JSON.stringify(result)).not.toContain("provider private");
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${groupId}/invitations/new`);
    expect(mock.send).toHaveBeenCalledWith({body:{action:"resend",group_id:groupId,invitation_id:invitation.id}});
  });
  it("no confirma envío con respuesta inválida ni revela errores internos", async () => {
    mock.send.mockResolvedValue({ internal:"private" });
    expect(await sendInvitation({ action: "send", group_id: groupId, email: "test@example.test", role: "ATHLETE" })).toHaveProperty("error.code", "unavailable");
    mock.send.mockRejectedValue(new Error("private-network-error"));
    const result = await sendInvitation({ action: "resend", group_id: groupId, invitation_id: invitation.id });
    expect(result).toHaveProperty("error.code", "unavailable");
    expect(JSON.stringify(result)).not.toContain("private-network-error");
  });
});
