import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser }, rpc: mock.rpc }) }));
import { reviewMembership } from "./actions";
const input = { group_id: "26000000-0000-4000-8000-000000000201", membership_id: "26000000-0000-4000-8000-000000000311", decision: "approve" };

beforeEach(() => {
  vi.resetAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "verified" } } });
  mock.rpc.mockResolvedValue({ data: null, error: null });
});
describe("decisiones ADMIN", () => {
  it("valida entrada y sesión antes de invocar la RPC", async () => {
    expect(await reviewMembership({ ...input, guardian_ready: true })).toHaveProperty("error.code", "invalid_membership_review");
    expect(await reviewMembership({ ...input, group_id: "bad" })).toHaveProperty("error.code", "invalid_membership_review");
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect(await reviewMembership(input)).toHaveProperty("error.code", "authentication_required");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each([["approve", "approve_membership"], ["reject", "reject_pending_membership"]])("%s usa RPC con grupo y membresía explícitos", async (decision, rpc) => {
    expect(await reviewMembership({ ...input, decision })).toEqual({ success: true });
    expect(mock.rpc).toHaveBeenCalledWith(rpc, { p_group_id: input.group_id, p_membership_id: input.membership_id });
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${input.group_id}`, "layout");
    expect(mock.revalidate).toHaveBeenCalledWith("/groups");
  });
  it.each(["admin_required", "membership_not_found", "membership_not_pending", "minor_requires_guardian_consent", "group_member_limit", "managed_consent_required"])("propaga %s sin declarar éxito", async code => {
    mock.rpc.mockResolvedValue({ error: { message: code } });
    expect(await reviewMembership(input)).toHaveProperty("error.code", code);
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("oculta errores internos e interrupciones de red", async () => {
    mock.rpc.mockResolvedValue({ error: { message: "secret@example.test" } });
    const result = await reviewMembership(input);
    expect(result).toHaveProperty("error.code", "unavailable");
    expect(JSON.stringify(result)).not.toContain("secret@example.test");
    mock.rpc.mockRejectedValue(new Error("network"));
    expect(await reviewMembership(input)).toHaveProperty("error.code", "unavailable");
  });
});
