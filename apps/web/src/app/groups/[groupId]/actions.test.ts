import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";

const mock = vi.hoisted(() => ({ operation: vi.fn(), factory: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ createServerApiClient: () => {
  mock.factory();
  return {
    updateGroup: (request: unknown) => mock.operation("updateGroup",request),
    rotateInviteCode: (request: unknown) => mock.operation("rotateInviteCode",request),
    joinAsAthlete: (request: unknown) => mock.operation("joinAsAthlete",request),
    joinByCode: (request: unknown) => mock.operation("joinByCode",request),
    updateGroupSettings: (request: unknown) => mock.operation("updateGroupSettings",request),
  };
} }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("next/navigation", () => ({ forbidden: () => { throw new Error("403"); }, redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { joinAsAthlete, joinByCode, rotateInviteCode, updateGroup, updateGroupSettings } from "@/app/groups/[groupId]/actions";

const groupId = "20000000-0000-4000-8000-000000000201";
beforeEach(() => {
  vi.resetAllMocks();
  mock.operation.mockResolvedValue({ success: true });
});

describe("configuración de grupo", () => {
  const input = { name: " Club Ñuñoa ", sport: " Natación ", description: " ", logo_url: "" };
  it("PATCH envía solo campos editables y refresca la información del grupo", async () => {
    expect(await updateGroup(groupId, { ...input, invite_code: "ATAQUE01", settings: {} })).toEqual({ success: true });
    expect(mock.operation).toHaveBeenCalledWith("updateGroup",{ params:{groupId},body:{name:"Club Ñuñoa",sport:"Natación",description:"",logo_url:""} });
    expect(mock.revalidate).toHaveBeenCalledWith("/groups", "layout");
  });
  it("rechaza datos inválidos, grupo ajeno y miembro sin ADMIN", async () => {
    expect(await updateGroup(groupId, { ...input, name: "a" })).toMatchObject({ error: { code: "invalid_group" } });
    expect(mock.operation).not.toHaveBeenCalled();
    mock.operation.mockRejectedValueOnce(new ApiClientError(404,"group_not_found"));
    expect(await updateGroup(groupId, input)).toMatchObject({ error: { code: "group_not_found" } });
    mock.operation.mockRejectedValueOnce(new ApiClientError(403,"admin_required"));
    await expect(updateGroup(groupId, input)).rejects.toThrow("403");
    expect(mock.operation).toHaveBeenCalledTimes(2);
  });
  it("cambio fallido no afirma éxito ni invalida caché", async () => {
    mock.operation.mockRejectedValue(new Error("invalid_response"));
    expect(await updateGroup(groupId, input)).toMatchObject({ error: { code: "group_update_failed" } });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("rotación devuelve código servidor y lo refresca; RPC decide autorización", async () => {
    mock.operation.mockResolvedValue({ code:"CODE0002" });
    expect(await rotateInviteCode(groupId)).toEqual({ code: "CODE0002" });
    expect(mock.operation).toHaveBeenCalledWith("rotateInviteCode", { params:{groupId} });
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${groupId}`, "layout");
  });
  it.each(["admin_required", "group_not_found", "invite_code_unavailable"])("rotación traduce %s", async (code) => {
    mock.operation.mockRejectedValue(new ApiClientError(422,code));
    expect(await rotateInviteCode(groupId)).toMatchObject({ error: { code, message: expect.not.stringMatching(new RegExp(`^${code}$`)) } });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("rotación valida ID y sesión antes de llamar SQL", async () => {
    expect(await rotateInviteCode("mal-id")).toMatchObject({ error: { code: "group_not_found" } });
    mock.operation.mockRejectedValueOnce(new ApiClientError(401,"authentication_required"));
    expect(await rotateInviteCode(groupId)).toMatchObject({ error: { code: "authentication_required" } });
    expect(mock.operation).toHaveBeenCalledTimes(1);
  });
});
describe("ADMIN que también entrena", () => {
  it("no permite elegir identidad ni rol y actualiza el contexto de grupos", async () => {
    expect(await joinAsAthlete(groupId)).toEqual({ success: true });
    expect(mock.operation).toHaveBeenCalledWith("joinAsAthlete", { params:{groupId} });
    expect(mock.revalidate).toHaveBeenCalledWith("/groups", "layout");
  });
  it("rechaza ID inválido y sesión ausente antes de llamar la RPC", async () => {
    expect(await joinAsAthlete("incorrecto")).toMatchObject({ error: { code: "group_not_found" } });
    expect(mock.factory).not.toHaveBeenCalled();
    mock.operation.mockRejectedValueOnce(new ApiClientError(401,"authentication_required"));
    expect(await joinAsAthlete(groupId)).toMatchObject({ error: { code: "authentication_required" } });
    expect(mock.operation).toHaveBeenCalledTimes(1);
  });
  it.each(["admin_required", "group_not_found", "athlete_birthdate_required", "minor_requires_guardian_consent", "membership_already_exists", "group_member_limit"])("traduce %s", async (message) => {
    mock.operation.mockRejectedValue(new ApiClientError(422,message));
    expect(await joinAsAthlete(groupId)).toMatchObject({ error: { code: message, message: expect.not.stringMatching(new RegExp(`^${message}$`)) } });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("oculta detalles internos", async () => {
    mock.operation.mockRejectedValue(new ApiClientError(500,"private detail"));
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
    mock.operation.mockResolvedValue({ membership: { group_id: groupId, status: "ACTIVE" } });
    await expect(joinByCode(form("CODE0001"))).rejects.toThrow(`redirect:/groups/${groupId}`);
    expect(mock.operation).toHaveBeenCalledWith("joinByCode", { body:{code:"CODE0001"} });
    expect(mock.revalidate).toHaveBeenCalledWith("/groups", "layout");
  });
  it("menor queda pendiente, sin navegar a un grupo aún invisible", async () => {
    mock.operation.mockResolvedValue({ membership: { group_id: groupId, status: "PENDING" } });
    await expect(joinByCode(form("CODE0001"))).rejects.toThrow("redirect:/join?pending=1");
    expect(mock.operation).toHaveBeenCalledWith("joinByCode", { body:{code:"CODE0001"} });
  });
  it("código inválido se detiene antes de la RPC y código rotado no revela grupo", async () => {
    await expect(joinByCode(form("mal"))).rejects.toThrow("redirect:/join?error=invalid_invite_code");
    expect(mock.operation).not.toHaveBeenCalled();
    mock.operation.mockRejectedValue(new ApiClientError(404,"invalid_invite_code"));
    await expect(joinByCode(form("CODE0001"))).rejects.toThrow("redirect:/join?error=invalid_invite_code");
  });
  it("no incorpora sin sesión ni confía en errores internos", async () => {
    mock.operation.mockRejectedValueOnce(new ApiClientError(401,"authentication_required"));
    await expect(joinByCode(form("CODE0001"))).rejects.toThrow("redirect:/login?invite_code=CODE0001");
    mock.operation.mockRejectedValue(new ApiClientError(500,"private SQL detail"));
    await expect(joinByCode(form("CODE0001"))).rejects.toThrow("redirect:/join?error=join_failed");
  });
});


describe("visibilidad de estadísticas", () => {
  const settings = { athletes_can_view_group_stats: true, guardians_can_view_group_stats: false };
  it("manda solo el toggle modificado y refresca todo el grupo al guardar", async () => {
    mock.operation.mockResolvedValue({ settings });
    expect(await updateGroupSettings(groupId, { athletes_can_view_group_stats: true })).toEqual({ settings });
    expect(mock.operation).toHaveBeenCalledWith("updateGroupSettings", { params:{groupId},body:{athletes_can_view_group_stats:true} });
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${groupId}`, "layout");
  });
  it.each([{}, { athletes_can_view_group_stats: "true" }, { guardians_can_view_group_stats: null }, { invite_code: "ATTACK01" }])("rechaza payload inválido %j", async (input) => {
    expect(await updateGroupSettings(groupId, input)).toMatchObject({ error: { code: "invalid_group_settings" } });
    expect(mock.operation).not.toHaveBeenCalled();
  });
  it("exige grupo válido y sesión", async () => {
    expect(await updateGroupSettings("invalid", settings)).toMatchObject({ error: { code: "group_not_found" } });
    mock.operation.mockRejectedValueOnce(new ApiClientError(401,"authentication_required"));
    expect(await updateGroupSettings(groupId, settings)).toMatchObject({ error: { code: "authentication_required" } });
    expect(mock.operation).toHaveBeenCalledTimes(1);
  });
  it.each(["admin_required", "group_not_found", "invalid_group_settings", "private SQL error"])("traduce %s sin confirmar ni revalidar", async (message) => {
    mock.operation.mockRejectedValue(new ApiClientError(422,message));
    const result = await updateGroupSettings(groupId, settings);
    expect(result).toHaveProperty("error");
    expect(JSON.stringify(result)).not.toContain("private SQL error");
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
});
