import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc, auth: { getUser: mock.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import { joinAsAthlete } from "./actions";

const groupId = "20000000-0000-4000-8000-000000000201";
beforeEach(() => {
  vi.clearAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "auth-id" } } });
  mock.rpc.mockResolvedValue({ data: "membership-id", error: null });
});
describe("ADMIN que también entrena", () => {
  it("no permite elegir identidad ni rol y actualiza el contexto de grupos", async () => {
    expect(await joinAsAthlete(groupId)).toEqual({ success: true });
    expect(mock.rpc).toHaveBeenCalledWith("join_group_as_athlete", { p_group_id: groupId });
    expect(mock.revalidate).toHaveBeenCalledWith("/groups", "layout");
  });
  it("rechaza ID inválido y sesión ausente antes de llamar la RPC", async () => {
    expect(await joinAsAthlete("incorrecto")).toMatchObject({ error: { code: "group_not_found" } });
    expect(mock.getUser).not.toHaveBeenCalled();
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect(await joinAsAthlete(groupId)).toMatchObject({ error: { code: "authentication_required" } });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(["admin_required", "group_not_found", "athlete_birthdate_required", "minor_requires_guardian_consent", "membership_already_exists", "group_member_limit"])("traduce %s", async (message) => {
    mock.rpc.mockResolvedValue({ data: null, error: { message } });
    expect(await joinAsAthlete(groupId)).toMatchObject({ error: { code: message, message: expect.not.stringMatching(new RegExp(`^${message}$`)) } });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("oculta detalles internos", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "private detail" } });
    expect(await joinAsAthlete(groupId)).toMatchObject({ error: { code: "membership_create_failed", message: "No pudimos agregarte como deportista. Vuelve a intentarlo." } });
  });
});
