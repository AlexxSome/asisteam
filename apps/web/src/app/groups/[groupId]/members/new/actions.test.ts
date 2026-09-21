import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), send: vi.fn() }));
vi.mock("../../invitations/new/actions", () => ({ sendInvitation: mock.send }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser }, rpc: mock.rpc }) }));
import { createManagedMember } from "./actions";
const groupId = "24000000-0000-4000-8000-000000000201";
const input = { full_name: "Deportista gestionado", birthdate: "1990-01-01", email: "" };
const member = { membership_id: "24000000-0000-4000-8000-000000000301", membership_status: "ACTIVE" };
beforeEach(() => {
  vi.resetAllMocks(); mock.getUser.mockResolvedValue({ data: { user: { id: "verified" } } });
  mock.rpc.mockResolvedValue({ data: member, error: null });
});
describe("alta MANAGED desde Server Action", () => {
  it("valida grupo y payload antes de escribir", async () => {
    expect(await createManagedMember("bad-id", input)).toHaveProperty("error.code", "group_not_found");
    expect(await createManagedMember(groupId, { ...input, account_status: "ACTIVE" })).toHaveProperty("error.code", "invalid_managed_member");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("requiere sesión verificada", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect(await createManagedMember(groupId, input)).toHaveProperty("error.code", "authentication_required");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("omite email vacío y deja identidad/autorización en la RPC", async () => {
    expect(await createManagedMember(groupId, input)).toEqual({ member });
    expect(mock.rpc).toHaveBeenCalledWith("create_managed_member", {
      p_group_id: groupId, p_full_name: input.full_name, p_birthdate: input.birthdate, p_email: undefined, p_guardian: undefined,
    });
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${groupId}`, "layout");
  });
  it("invita al apoderado solo tras el alta y distingue fallo de entrega", async () => {
    const guardian = { full_name: "Apoderado", email: "tutor@example.test", relationship: "Tutor", authorized: true };
    mock.rpc.mockResolvedValue({ data: { ...member, membership_status: "PENDING" }, error: null });
    mock.send.mockResolvedValue({ error: { code: "email_delivery_failed" } });
    expect(await createManagedMember(groupId, { ...input, birthdate: "2020-01-01", guardian }))
      .toEqual({ member: { ...member, membership_status: "PENDING" }, guardianInvitation: "retry_required" });
    expect(mock.send).toHaveBeenCalledWith({ action: "send", group_id: groupId, email: guardian.email, role: "GUARDIAN" });
    mock.send.mockClear(); mock.rpc.mockResolvedValue({ data: null, error: { message: "invalid_guardian" } });
    expect(await createManagedMember(groupId, { ...input, birthdate: "2020-01-01", guardian })).toHaveProperty("error.code", "invalid_guardian");
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("no filtra detalles internos ni confirma respuestas inválidas", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "private@example.test" } });
    const result = await createManagedMember(groupId, input);
    expect(result).toHaveProperty("error.code", "unavailable");
    expect(JSON.stringify(result)).not.toContain("private@example.test");
    mock.rpc.mockResolvedValue({ data: { membership_status: "ACTIVE" }, error: null });
    expect(await createManagedMember(groupId, input)).toHaveProperty("error.code", "unavailable");
  });
});
