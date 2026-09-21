import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc, auth: { getUser: mock.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import { createGroup } from "./actions";

const groupId = "20000000-0000-4000-8000-000000000201";
const input = { name: " Club Ñuñoa ", sport: " Fútbol ", description: " Equipo adulto ", logo_url: "https://example.test/logo.png" };
beforeEach(() => {
  vi.clearAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "auth-id" } } });
  mock.rpc.mockResolvedValue({ data: groupId, error: null });
});
describe("creación web de grupos", () => {
  it("envía solo campos editables, normalizados, a la RPC transaccional", async () => {
    expect(await createGroup({ ...input, created_by: "otro", invite_code: "ELEGIDO1", settings: { athletes_can_view_group_stats: true } })).toEqual({ groupId });
    expect(mock.rpc).toHaveBeenCalledWith("create_group", {
      p_name: "Club Ñuñoa", p_sport: "Fútbol", p_description: "Equipo adulto", p_logo_url: input.logo_url,
    });
    expect(mock.revalidate).toHaveBeenCalledWith("/groups");
  });
  it("admite los campos opcionales vacíos", async () => {
    await createGroup({ name: "Club", sport: "Tenis" });
    expect(mock.rpc).toHaveBeenCalledWith("create_group", { p_name: "Club", p_sport: "Tenis", p_description: undefined, p_logo_url: undefined });
  });
  it("valida antes de escribir", async () => {
    expect(await createGroup({ ...input, name: " " })).toMatchObject({ error: { code: "invalid_group", details: { name: [expect.any(String)] } } });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("requiere sesión", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect(await createGroup(input)).toMatchObject({ error: { code: "authentication_required" } });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(["active_account_required", "user_group_limit", "invite_code_unavailable"])("traduce %s sin invalidar caché", async (message) => {
    mock.rpc.mockResolvedValue({ data: null, error: { message } });
    expect(await createGroup(input)).toMatchObject({ error: { code: message, message: expect.not.stringMatching(new RegExp(`^${message}$`)) } });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("no muestra errores internos ni confirma un ID ausente", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "private database detail" } });
    expect(await createGroup(input)).toMatchObject({ error: { code: "group_create_failed", message: "No pudimos crear el grupo. Vuelve a intentarlo." } });
    mock.rpc.mockResolvedValue({ data: null, error: null });
    expect(await createGroup(input)).toMatchObject({ error: { code: "group_create_failed" } });
  });
});
