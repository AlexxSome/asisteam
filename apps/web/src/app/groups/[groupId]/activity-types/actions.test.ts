import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ user: vi.fn(), from: vi.fn(), insert: vi.fn(), update: vi.fn(), group: vi.fn(), saved: vi.fn(), eq: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.user }, from: mock.from }) }));
import { createActivityType, updateActivityType } from "./actions";
const groupId = "29000000-0000-4000-8000-000000000201";
const typeId = "29000000-0000-4000-8000-000000000301";
const input = { name: "Amistoso", color: "#123ABC" };
beforeEach(() => {
  vi.resetAllMocks();
  mock.user.mockResolvedValue({ data: { user: { id: "auth" } } });
  mock.group.mockResolvedValue({ data: { id: groupId, roles: ["ADMIN"] }, error: null });
  mock.saved.mockResolvedValue({ data: { id: typeId }, error: null });
  const mutation = { eq: mock.eq, select: () => ({ single: mock.saved, maybeSingle: mock.saved }) };
  mock.eq.mockReturnValue(mutation);
  mock.insert.mockReturnValue(mutation); mock.update.mockReturnValue(mutation);
  mock.from.mockImplementation((table: string) => table === "v_group_detail"
    ? { select: () => ({ eq: () => ({ maybeSingle: mock.group }) }) }
    : { insert: mock.insert, update: mock.update });
});
describe("acciones de tipos", () => {
  it("crea mediante PostgREST con grupo explícito y refresca el grupo", async () => {
    expect(await createActivityType(groupId, { ...input, name: " Amistoso " })).toEqual({ id: typeId });
    expect(mock.insert).toHaveBeenCalledWith({ ...input, group_id: groupId });
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${groupId}`, "layout");
  });
  it("edita y desactiva con ambos filtros, sin escribir identidad", async () => {
    expect(await updateActivityType(groupId, typeId, { ...input, is_active: false })).toEqual({ id: typeId });
    expect(mock.update).toHaveBeenCalledWith({ ...input, is_active: false });
    expect(mock.eq.mock.calls).toEqual([["id", typeId], ["group_id", groupId]]);
  });
  it("valida antes de acceder a datos", async () => {
    expect(await createActivityType(groupId, { ...input, color: "red" })).toMatchObject({ error: { code: "invalid_activity_type", details: { color: expect.any(Array) } } });
    expect(await createActivityType(groupId, { ...input, group_id: "otro" })).toHaveProperty("error");
    expect(await updateActivityType(groupId, "", { ...input, is_active: false })).toHaveProperty("error");
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("exige sesión y permiso actual por grupo", async () => {
    mock.user.mockResolvedValueOnce({ data: { user: null } });
    expect(await createActivityType(groupId, input)).toMatchObject({ error: { code: "authentication_required" } });
    mock.group.mockResolvedValueOnce({ data: null, error: null });
    expect(await createActivityType(groupId, input)).toMatchObject({ error: { code: "group_not_found" } });
    mock.group.mockResolvedValueOnce({ data: { roles: ["ATHLETE"] }, error: null });
    expect(await createActivityType(groupId, input)).toMatchObject({ error: { code: "admin_required" } });
    expect(mock.insert).not.toHaveBeenCalled();
  });
  it.each([["23505", "activity_type_name_exists"], ["42501", "admin_required"], ["23514", "invalid_activity_type"], ["XX000", "activity_type_save_failed"]])("traduce error %s sin revelar detalles SQL", async (code, expected) => {
    mock.saved.mockResolvedValueOnce({ data: null, error: { code, message: "private sql" } });
    const result = await createActivityType(groupId, input);
    expect(result).toMatchObject({ error: { code: expected, details: {} } });
    expect(JSON.stringify(result)).not.toContain("private sql");
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("no informa éxito para tipo ajeno, sistema o permiso revocado", async () => {
    mock.saved.mockResolvedValue({ data: null, error: null });
    expect(await updateActivityType(groupId, typeId, { ...input, is_active: false })).toMatchObject({ error: { code: "activity_type_not_found" } });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
});
