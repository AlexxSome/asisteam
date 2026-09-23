import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), revalidate: vi.fn(), from: vi.fn(), update: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc, from: mock.from, auth: { getUser: mock.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("403"); }, redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { joinAsAthlete, joinByCode, rotateInviteCode, updateGroup, updateGroupSettings } from "./actions";

const groupId = "20000000-0000-4000-8000-000000000201";
beforeEach(() => {
  vi.clearAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "auth-id" } } });
  mock.rpc.mockResolvedValue({ data: "membership-id", error: null });
  mock.read.mockResolvedValue({ data: { roles: ["ADMIN"] }, error: null });
  mock.write.mockResolvedValue({ data: { id: groupId }, error: null });
  mock.from.mockImplementation((table: string) => table === "v_group_detail"
    ? { select: () => ({ eq: () => ({ maybeSingle: mock.read }) }) }
    : { update: mock.update });
  mock.update.mockReturnValue({ eq: () => ({ select: () => ({ maybeSingle: mock.write }) }) });
});

describe("configuración de grupo", () => {
  const input = { name: " Club Ñuñoa ", sport: " Natación ", description: " ", logo_url: "" };
  it("PATCH envía solo campos editables y refresca la información del grupo", async () => {
    expect(await updateGroup(groupId, { ...input, invite_code: "ATAQUE01", settings: {} })).toEqual({ success: true });
    expect(mock.update).toHaveBeenCalledWith({ name: "Club Ñuñoa", sport: "Natación", description: null, logo_url: null });
    expect(mock.revalidate).toHaveBeenCalledWith("/groups", "layout");
  });
  it("rechaza datos inválidos, grupo ajeno y miembro sin ADMIN", async () => {
    expect(await updateGroup(groupId, { ...input, name: "a" })).toMatchObject({ error: { code: "invalid_group" } });
    expect(mock.update).not.toHaveBeenCalled();
    mock.read.mockResolvedValueOnce({ data: null, error: null });
    expect(await updateGroup(groupId, input)).toMatchObject({ error: { code: "group_not_found" } });
    mock.read.mockResolvedValueOnce({ data: { roles: ["ATHLETE"] }, error: null });
    await expect(updateGroup(groupId, { ...input, name: "a" })).rejects.toThrow("403");
    expect(mock.update).not.toHaveBeenCalled();
  });
  it("cambio fallido no afirma éxito ni invalida caché", async () => {
    mock.write.mockResolvedValue({ data: null, error: null });
    expect(await updateGroup(groupId, input)).toMatchObject({ error: { code: "group_update_failed" } });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("rotación devuelve código servidor y lo refresca; RPC decide autorización", async () => {
    mock.rpc.mockResolvedValue({ data: "CODE0002", error: null });
    expect(await rotateInviteCode(groupId)).toEqual({ code: "CODE0002" });
    expect(mock.rpc).toHaveBeenCalledWith("rotate_invite_code", { p_group_id: groupId });
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${groupId}`, "layout");
  });
  it.each(["admin_required", "group_not_found", "invite_code_unavailable"])("rotación traduce %s", async (code) => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: code } });
    expect(await rotateInviteCode(groupId)).toMatchObject({ error: { code, message: expect.not.stringMatching(new RegExp(`^${code}$`)) } });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("rotación valida ID y sesión antes de llamar SQL", async () => {
    expect(await rotateInviteCode("mal-id")).toMatchObject({ error: { code: "group_not_found" } });
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect(await rotateInviteCode(groupId)).toMatchObject({ error: { code: "authentication_required" } });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
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

describe("incorporación por código", () => {
  const form = (code: string) => {
    const data = new FormData();
    data.set("code", code);
    return data;
  };
  it("adulto entra como ATHLETE y navega al grupo", async () => {
    mock.rpc.mockResolvedValue({ data: { membership: { group_id: groupId, status: "ACTIVE" } }, error: null });
    await expect(joinByCode(form("CODE0001"))).rejects.toThrow(`redirect:/groups/${groupId}`);
    expect(mock.rpc).toHaveBeenCalledWith("join_group_by_code", { p_invite_code: "CODE0001" });
    expect(mock.revalidate).toHaveBeenCalledWith("/groups", "layout");
  });
  it("menor queda pendiente, sin navegar a un grupo aún invisible", async () => {
    mock.rpc.mockResolvedValue({ data: { membership: { group_id: groupId, status: "PENDING" } }, error: null });
    await expect(joinByCode(form("CODE0001"))).rejects.toThrow("redirect:/join?pending=1");
    expect(mock.rpc).toHaveBeenCalledWith("join_group_by_code", { p_invite_code: "CODE0001" });
  });
  it("código inválido se detiene antes de la RPC y código rotado no revela grupo", async () => {
    await expect(joinByCode(form("mal"))).rejects.toThrow("redirect:/join?error=invalid_invite_code");
    expect(mock.rpc).not.toHaveBeenCalled();
    mock.rpc.mockResolvedValue({ data: { error: { code: "invalid_invite_code" } }, error: null });
    await expect(joinByCode(form("CODE0001"))).rejects.toThrow("redirect:/join?error=invalid_invite_code");
  });
  it("no incorpora sin sesión ni confía en errores internos", async () => {
    mock.getUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(joinByCode(form("CODE0001"))).rejects.toThrow("redirect:/login?invite_code=CODE0001");
    mock.rpc.mockResolvedValue({ data: null, error: { message: "private SQL detail" } });
    await expect(joinByCode(form("CODE0001"))).rejects.toThrow("redirect:/join?error=join_failed");
  });
});


describe("visibilidad de estadísticas", () => {
  const settings = { athletes_can_view_group_stats: true, guardians_can_view_group_stats: false };
  it("manda solo el toggle modificado y refresca todo el grupo al guardar", async () => {
    mock.rpc.mockResolvedValue({ data: settings, error: null });
    expect(await updateGroupSettings(groupId, { athletes_can_view_group_stats: true })).toEqual({ settings });
    expect(mock.rpc).toHaveBeenCalledWith("update_group_settings", { p_group_id: groupId, p_changes: { athletes_can_view_group_stats: true } });
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${groupId}`, "layout");
  });
  it.each([{}, { athletes_can_view_group_stats: "true" }, { guardians_can_view_group_stats: null }, { invite_code: "ATTACK01" }])("rechaza payload inválido %j", async (input) => {
    expect(await updateGroupSettings(groupId, input)).toMatchObject({ error: { code: "invalid_group_settings" } });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("exige grupo válido y sesión", async () => {
    expect(await updateGroupSettings("invalid", settings)).toMatchObject({ error: { code: "group_not_found" } });
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect(await updateGroupSettings(groupId, settings)).toMatchObject({ error: { code: "authentication_required" } });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(["admin_required", "group_not_found", "invalid_group_settings", "private SQL error"])("traduce %s sin confirmar ni revalidar", async (message) => {
    mock.rpc.mockResolvedValue({ data: null, error: { message } });
    const result = await updateGroupSettings(groupId, settings);
    expect(result).toHaveProperty("error");
    expect(JSON.stringify(result)).not.toContain("private SQL error");
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
});
