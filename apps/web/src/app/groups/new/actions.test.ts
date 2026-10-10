import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";

const mock = vi.hoisted(() => ({ create: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ createServerApiClient: () => ({ createGroup: mock.create }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import { createGroup } from "@/app/groups/new/actions";

const groupId = "20000000-0000-4000-8000-000000000201";
const input = { name: " Club Ñuñoa ", sport: " Fútbol ", description: " Equipo adulto ", logo_url: "https://example.test/logo.png" };
beforeEach(() => {
  vi.clearAllMocks();
  mock.create.mockResolvedValue({ group_id: groupId });
});
describe("creación web de grupos", () => {
  it("envía solo campos editables, normalizados, a la RPC transaccional", async () => {
    expect(await createGroup({ ...input, created_by: "otro", invite_code: "ELEGIDO1", settings: { athletes_can_view_group_stats: true } })).toEqual({ groupId });
    expect(mock.create).toHaveBeenCalledWith({ body: { name: "Club Ñuñoa", sport: "Fútbol", description: "Equipo adulto", logo_url: input.logo_url } });
    expect(mock.revalidate).toHaveBeenCalledWith("/groups");
  });
  it("admite los campos opcionales vacíos", async () => {
    await createGroup({ name: "Club", sport: "Tenis" });
    expect(mock.create).toHaveBeenCalledWith({ body: { name: "Club", sport: "Tenis", description: undefined, logo_url: undefined } });
  });
  it("valida antes de escribir", async () => {
    expect(await createGroup({ ...input, name: " " })).toMatchObject({ error: { code: "invalid_group", details: { name: [expect.any(String)] } } });
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("requiere sesión", async () => {
    mock.create.mockRejectedValueOnce(new ApiClientError(401,"authentication_required"));
    expect(await createGroup(input)).toMatchObject({ error: { code: "authentication_required" } });
    expect(mock.create).toHaveBeenCalledTimes(1);
  });
  it.each(["active_account_required", "user_group_limit", "invite_code_unavailable"])("traduce %s sin invalidar caché", async (message) => {
    mock.create.mockRejectedValue(new ApiClientError(422,message));
    expect(await createGroup(input)).toMatchObject({ error: { code: message, message: expect.not.stringMatching(new RegExp(`^${message}$`)) } });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("no muestra errores internos ni confirma un ID ausente", async () => {
    mock.create.mockRejectedValue(new Error("private database detail"));
    expect(await createGroup(input)).toMatchObject({ error: { code: "group_create_failed", message: "No pudimos crear el grupo. Vuelve a intentarlo." } });
    mock.create.mockResolvedValue({});
    expect(await createGroup(input)).toMatchObject({ error: { code: "group_create_failed" } });
  });
});
