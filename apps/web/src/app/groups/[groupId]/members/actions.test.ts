import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser }, rpc: mock.rpc }) }));
import { changeMemberStatus, updateManagedMember } from "./actions";
const identity = { group_id: "34000000-0000-4000-8000-000000000201", membership_id: "34000000-0000-4000-8000-000000000301" };
const profile = { full_name: "Persona gestionada", birthdate: "1990-01-01", email: "", phone: null };
beforeEach(() => {
  vi.resetAllMocks(); mock.getUser.mockResolvedValue({ data: { user: { id: "verified" } } });
  mock.rpc.mockResolvedValue({ data: "UPDATED", error: null });
});
it("rechaza privilegios inyectados y ausencia de sesión antes de la RPC", async () => {
  expect(await updateManagedMember({ ...identity, profile: { ...profile, account_status: "ACTIVE" } })).toHaveProperty("error.code", "invalid_managed_member");
  expect(await changeMemberStatus({ ...identity, action: "approve" })).toHaveProperty("error.code", "invalid_member_request");
  mock.getUser.mockResolvedValue({ data: { user: null } });
  expect(await updateManagedMember({ ...identity, profile })).toHaveProperty("error.code", "authentication_required");
  expect(await changeMemberStatus({ ...identity, action: "deactivate" })).toHaveProperty("error.code", "authentication_required");
  expect(mock.rpc).not.toHaveBeenCalled();
});
it.each([["deactivate", "deactivate_membership"], ["reactivate", "reactivate_membership"]])("%s incluye ambos IDs y actualiza nómina/reportes", async (action, rpc) => {
  expect(await changeMemberStatus({ ...identity, action })).toEqual({ success: true });
  expect(mock.rpc).toHaveBeenCalledWith(rpc, { p_group_id: identity.group_id, p_membership_id: identity.membership_id });
  expect(mock.revalidate).toHaveBeenCalledWith("/groups", "layout");
});
it("edita solo datos básicos y comunica aprobación de fecha pendiente", async () => {
  mock.rpc.mockResolvedValue({ data: "BIRTHDATE_PENDING", error: null });
  expect(await updateManagedMember({ ...identity, profile })).toEqual({ success: true, birthdatePending: true });
  expect(mock.rpc).toHaveBeenCalledWith("update_managed_member", { p_group_id: identity.group_id, p_membership_id: identity.membership_id, p_full_name: profile.full_name, p_birthdate: profile.birthdate, p_email: undefined, p_phone: undefined });
});
it.each(["LAST_ADMIN", "membership_status_changed", "minor_requires_guardian_consent", "group_member_limit", "managed_profile_required"])("propaga %s sin éxito ni invalidación", async code => {
  mock.rpc.mockResolvedValue({ error: { message: code } });
  expect(await changeMemberStatus({ ...identity, action: "deactivate" })).toHaveProperty("error.code", code);
  expect(mock.revalidate).not.toHaveBeenCalled();
});
it("oculta errores internos y de red", async () => {
  mock.rpc.mockResolvedValue({ error: { message: "private@example.test" } });
  expect(await updateManagedMember({ ...identity, profile })).toHaveProperty("error.code", "unavailable");
  mock.rpc.mockRejectedValue(new Error("network"));
  expect(await changeMemberStatus({ ...identity, action: "reactivate" })).toHaveProperty("error.code", "unavailable");
});
