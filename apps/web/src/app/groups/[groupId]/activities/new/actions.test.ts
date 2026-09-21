import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc, auth: { getUser: mock.getUser } }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import { createActivity } from "./actions";

const groupId = "27000000-0000-4000-8000-000000000201";
const activityId = "27000000-0000-4000-8000-000000000501";
const input = { title: " Entrenamiento ", activity_type_id: "b2c3d4e5-0001-4b3c-8d4e-111111111111", location: "Cancha 1", description: "", starts_at: "2026-07-07T18:30", ends_at: "2026-07-07T20:00" };
beforeEach(() => {
  vi.clearAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "auth-id" } } });
  mock.rpc.mockResolvedValue({ data: activityId, error: null });
});
describe("creación web de actividades", () => {
  it("envía UTC a la RPC, sin aceptar created_by del cliente y devuelve el ID creado", async () => {
    expect(await createActivity(groupId, { ...input, created_by: "otro-usuario" })).toEqual({ activityId });
    expect(mock.rpc).toHaveBeenCalledWith("create_activity", {
      p_group_id: groupId, p_activity_type_id: input.activity_type_id, p_title: "Entrenamiento",
      p_location: "Cancha 1", p_description: undefined, p_starts_at: "2026-07-07T22:30:00Z", p_ends_at: "2026-07-08T00:00:00Z",
    });
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${groupId}/activities`);
  });
  it("rechaza rango inválido antes de escribir", async () => {
    const result = await createActivity(groupId, { ...input, ends_at: input.starts_at });
    expect(result).toMatchObject({ error: { code: "invalid_activity", details: { ends_at: ["El término debe ser posterior al inicio"] } } });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("requiere sesión", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect(await createActivity(groupId, input)).toMatchObject({ error: { code: "authentication_required" } });
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it.each(["admin_required", "group_not_found", "invalid_activity_type", "invalid_date_range"])("traduce fallo %s del servidor", async (message) => {
    mock.rpc.mockResolvedValue({ data: null, error: { message } });
    const result = await createActivity(groupId, input);
    expect(result).toMatchObject({ error: { code: message, message: expect.not.stringMatching(new RegExp(`^${message}$`)) } });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("no expone mensajes internos de base de datos", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "private detail" } });
    expect(await createActivity(groupId, input)).toMatchObject({ error: { code: "activity_create_failed", message: "No pudimos crear la actividad. Vuelve a intentarlo." } });
  });
  it("valida groupId antes de consultar", async () => {
    expect(await createActivity("otro", input)).toMatchObject({ error: { code: "group_not_found" } });
    expect(mock.getUser).not.toHaveBeenCalled();
  });
});
