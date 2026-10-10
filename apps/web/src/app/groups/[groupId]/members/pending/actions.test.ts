import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), operation: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/lib/api/session", () => ({ createSessionClient: async () => ({ auth: { getUser: mock.getUser } }) }));
vi.mock("@/lib/api/server", () => ({ createServerApiClient:()=>({approveMembership:(request:unknown)=>mock.operation("approveMembership",request),rejectMembership:(request:unknown)=>mock.operation("rejectMembership",request)}) }));
import { reviewMembership } from "@/app/groups/[groupId]/members/pending/actions";
const input = { group_id: "26000000-0000-4000-8000-000000000201", membership_id: "26000000-0000-4000-8000-000000000311", decision: "approve" };

beforeEach(() => {
  vi.resetAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "verified" } } });
  mock.operation.mockResolvedValue({success:true});
});
describe("decisiones ADMIN", () => {
  it("valida entrada y sesión antes de invocar la RPC", async () => {
    expect(await reviewMembership({ ...input, guardian_ready: true })).toHaveProperty("error.code", "invalid_membership_review");
    expect(await reviewMembership({ ...input, group_id: "bad" })).toHaveProperty("error.code", "invalid_membership_review");
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect(await reviewMembership(input)).toHaveProperty("error.code", "authentication_required");
    expect(mock.operation).not.toHaveBeenCalled();
  });
  it.each([["approve", "approveMembership"], ["reject", "rejectMembership"]])("%s usa RPC con grupo y membresía explícitos", async (decision, rpc) => {
    expect(await reviewMembership({ ...input, decision })).toEqual({ success: true });
    expect(mock.operation).toHaveBeenCalledWith(rpc,{params:{groupId:input.group_id,membershipId:input.membership_id}});
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${input.group_id}`, "layout");
    expect(mock.revalidate).toHaveBeenCalledWith("/groups");
  });
  it.each(["admin_required", "membership_not_found", "membership_not_pending", "minor_requires_guardian_consent", "group_member_limit", "managed_consent_required"])("propaga %s sin declarar éxito", async code => {
    mock.operation.mockRejectedValue(new ApiClientError(422,code));
    expect(await reviewMembership(input)).toHaveProperty("error.code", code);
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("oculta errores internos e interrupciones de red", async () => {
    mock.operation.mockRejectedValue(new ApiClientError(500,"secret@example.test"));
    const result = await reviewMembership(input);
    expect(result).toHaveProperty("error.code", "unavailable");
    expect(JSON.stringify(result)).not.toContain("secret@example.test");
    mock.operation.mockRejectedValue(new Error("network"));
    expect(await reviewMembership(input)).toHaveProperty("error.code", "unavailable");
  });
});
