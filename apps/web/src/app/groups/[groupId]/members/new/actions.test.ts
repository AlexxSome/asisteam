import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), operation: vi.fn(), revalidate: vi.fn(), send: vi.fn() }));
vi.mock("@/app/groups/[groupId]/invitations/new/actions", () => ({ sendInvitation: mock.send }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser } }) }));
vi.mock("@/lib/api/server",()=>({createServerApiClient:()=>({createManagedMember:mock.operation})}));
import { createManagedMember } from "@/app/groups/[groupId]/members/new/actions";
const groupId = "24000000-0000-4000-8000-000000000201";
const input = { full_name: "Deportista gestionado", birthdate: "1990-01-01", email: "" };
const member = { membership_id: "24000000-0000-4000-8000-000000000301", membership_status: "ACTIVE" };
beforeEach(() => {
  vi.resetAllMocks(); mock.getUser.mockResolvedValue({ data: { user: { id: "verified" } } });
  mock.operation.mockResolvedValue(member);
});
describe("alta MANAGED desde Server Action", () => {
  it("valida grupo y payload antes de escribir", async () => {
    expect(await createManagedMember("bad-id", input)).toHaveProperty("error.code", "group_not_found");
    expect(await createManagedMember(groupId, { ...input, account_status: "ACTIVE" })).toHaveProperty("error.code", "invalid_managed_member");
    expect(mock.operation).not.toHaveBeenCalled();
  });
  it("requiere sesión verificada", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect(await createManagedMember(groupId, input)).toHaveProperty("error.code", "authentication_required");
    expect(mock.operation).not.toHaveBeenCalled();
  });
  it("conserva email vacío del DTO y deja identidad/autorización en la API", async () => {
    expect(await createManagedMember(groupId, input)).toEqual({ member });
    expect(mock.operation).toHaveBeenCalledWith({params:{groupId},body:expect.objectContaining({full_name:input.full_name,birthdate:input.birthdate,email:""})});
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${groupId}`, "layout");
  });
  it("invita al apoderado solo tras el alta y distingue fallo de entrega", async () => {
    const guardian = { full_name: "Apoderado", email: "tutor@example.test", relationship: "Tutor", authorized: true };
    mock.operation.mockResolvedValue({...member,membership_status:"PENDING"});
    mock.send.mockResolvedValue({ error: { code: "email_delivery_failed" } });
    expect(await createManagedMember(groupId, { ...input, birthdate: "2020-01-01", guardian }))
      .toEqual({ member: { ...member, membership_status: "PENDING" }, guardianInvitation: "retry_required" });
    expect(mock.send).toHaveBeenCalledWith({ action: "send", group_id: groupId, email: guardian.email, role: "GUARDIAN" });
    mock.send.mockClear(); mock.operation.mockRejectedValue(new ApiClientError(422,"invalid_guardian"));
    expect(await createManagedMember(groupId, { ...input, birthdate: "2020-01-01", guardian })).toHaveProperty("error.code", "invalid_guardian");
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("no filtra detalles internos ni confirma respuestas inválidas", async () => {
    mock.operation.mockRejectedValue(new ApiClientError(500,"private@example.test"));
    const result = await createManagedMember(groupId, input);
    expect(result).toHaveProperty("error.code", "unavailable");
    expect(JSON.stringify(result)).not.toContain("private@example.test");
    mock.operation.mockResolvedValue({membership_status:"ACTIVE"});
    expect(await createManagedMember(groupId, input)).toHaveProperty("error.code", "unavailable");
  });
});
