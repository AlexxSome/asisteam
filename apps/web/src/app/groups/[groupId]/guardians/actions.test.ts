import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), send: vi.fn() }));
vi.mock("../invitations/new/actions", () => ({ sendInvitation: mock.send }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser }, rpc: mock.rpc }) }));
import { createGuardianship } from "./actions";
const groupId = "25000000-0000-4000-8000-000000000201";
const guardianshipId = "25000000-0000-4000-8000-000000000501";
const input = { athlete_user_id: "25000000-0000-4000-8000-000000000111", full_name: "Apoderado", email: " PERSONA@Example.test ", relationship: "Madre" };
beforeEach(() => {
  vi.resetAllMocks(); mock.getUser.mockResolvedValue({ data: { user: { id: "verified" } } });
  mock.rpc.mockResolvedValue({ data: guardianshipId, error: null });
  mock.send.mockResolvedValue({ invitation: { id: "invitation-id" } });
});
describe("Server Action de apoderados", () => {
  it("valida grupo, payload y sesión antes de escribir", async () => {
    expect(await createGuardianship("bad", input)).toHaveProperty("error.code", "group_not_found");
    expect(await createGuardianship(groupId, { ...input, guardian_user_id: "forged" })).toHaveProperty("error.code", "invalid_guardianship");
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect(await createGuardianship(groupId, input)).toHaveProperty("error.code", "authentication_required");
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("registra por RPC e invita con identidad normalizada", async () => {
    expect(await createGuardianship(groupId, input)).toEqual({ guardianshipId, invitation: "sent" });
    expect(mock.rpc).toHaveBeenCalledWith("create_guardianship", { p_group_id: groupId, p_athlete_user_id: input.athlete_user_id, p_full_name: input.full_name, p_email: "persona@example.test", p_relationship: "Madre" });
    expect(mock.send).toHaveBeenCalledWith({ action: "send", group_id: groupId, email: "persona@example.test", role: "GUARDIAN" });
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${groupId}`, "layout");
  });
  it.each(["guardianship_already_exists", "guardian_only_for_minor", "athlete_not_found", "admin_required", "group_member_limit"])("informa %s sin enviar invitación", async code => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: code } });
    expect(await createGuardianship(groupId, input)).toHaveProperty("error.code", code);
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("conserva éxito del vínculo si falla o interrumpe el correo", async () => {
    mock.send.mockResolvedValue({ error: { code: "email_delivery_failed" } });
    expect(await createGuardianship(groupId, input)).toEqual({ guardianshipId, invitation: "retry_required" });
    mock.send.mockRejectedValue(new Error("network"));
    expect(await createGuardianship(groupId, input)).toEqual({ guardianshipId, invitation: "retry_required" });
  });
  it("no expone errores internos ni acepta respuesta inválida", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "private@example.test" } });
    const result = await createGuardianship(groupId, input);
    expect(result).toHaveProperty("error.code", "unavailable");
    expect(JSON.stringify(result)).not.toContain("private@example.test");
    mock.rpc.mockResolvedValue({ data: {}, error: null });
    expect(await createGuardianship(groupId, input)).toHaveProperty("error.code", "unavailable");
    expect(mock.send).not.toHaveBeenCalled();
  });
});
