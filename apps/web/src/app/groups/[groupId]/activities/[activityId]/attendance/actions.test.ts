import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser }, rpc: mock.rpc, from: mock.from }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import { clearAttendance, saveAttendance, updateAttendance } from "./actions";
const group = "30000000-0000-4000-8000-000000000201";
const activity = "30000000-0000-4000-8000-000000000501";
const record = { membership_id: "30000000-0000-4000-8000-000000000303", status: "PRESENT" as const };
const recordId = "30000000-0000-4000-8000-000000000601";
beforeEach(() => {
  vi.resetAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "auth-id" } } });
  mock.rpc.mockResolvedValue({ data: { records: [{ ...record, note: "guardada" }] }, error: null });
  mock.from.mockReturnValue(mock);
  mock.select.mockReturnValue(mock);
  mock.eq.mockReturnValue(mock);
  mock.maybeSingle.mockResolvedValue({ data: { id: recordId }, error: null });
});
describe("acciones de asistencia", () => {
  it("envía estado a RPC sin inventar actor ni borrar nota omitida", async () => {
    expect(await saveAttendance(group, activity, [record], true)).toEqual({ records: [{ ...record, note: "guardada" }] });
    expect(mock.rpc).toHaveBeenCalledWith("record_attendance_bulk", { p_activity_id: activity, p_records: [record], p_only_unmarked: true });
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${group}/activities/${activity}/attendance`);
  });
  it("rechaza campos falsificados y lotes inválidos sin RPC", async () => {
    expect(await saveAttendance(group, activity, [{ ...record, recorded_by: "intruso" }])).toHaveProperty("error.code", "invalid_attendance_batch");
    expect(await saveAttendance("bad", activity, [record])).toHaveProperty("error.code", "activity_not_found");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("sin sesión no escribe", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect(await saveAttendance(group, activity, [record])).toHaveProperty("error.code", "authentication_required");
    expect(await clearAttendance(group, activity, record.membership_id)).toHaveProperty("error.code", "authentication_required");
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("propaga permiso denegado y oculta errores internos", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "admin_required" } });
    expect(await saveAttendance(group, activity, [record])).toHaveProperty("error.code", "admin_required");
    mock.rpc.mockResolvedValue({ data: null, error: { message: "private email database internals" } });
    const result = await saveAttendance(group, activity, [record]);
    expect(result).toHaveProperty("error.code", "attendance_save_failed");
    expect(JSON.stringify(result)).not.toContain("private email");
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("no confirma guardado si la respuesta es inválida", async () => {
    mock.rpc.mockResolvedValue({ data: {}, error: null });
    expect(await saveAttendance(group, activity, [record])).toHaveProperty("error.code", "attendance_save_failed");
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("desmarca solo con RPC acotada a una actividad y membership", async () => {
    expect(await clearAttendance(group, activity, record.membership_id)).toEqual({ cleared: true });
    expect(mock.rpc).toHaveBeenCalledWith("clear_attendance_record", { p_activity_id: activity, p_membership_id: record.membership_id });
  });
  it("corrige solo la nota mediante RPC con identidad resuelta en el grupo y actividad", async () => {
    expect(await updateAttendance(group, activity, record.membership_id, { note: "Corregida" })).toEqual({ records: [{ ...record, note: "guardada" }] });
    expect(mock.from).toHaveBeenCalledWith("v_attendance_admin");
    expect(mock.select).toHaveBeenCalledWith("id");
    expect(mock.eq.mock.calls).toEqual([["group_id", group], ["activity_id", activity], ["membership_id", record.membership_id]]);
    expect(mock.rpc).toHaveBeenCalledWith("update_attendance_record", { p_record_id: recordId, p_changes: { note: "Corregida" } });
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${group}/activities/${activity}/attendance`);
  });
  it("valida correcciones y sesión antes de consultar o editar", async () => {
    expect(await updateAttendance(group, activity, record.membership_id, { note: "x", recorded_at: "ayer" })).toHaveProperty("error.code", "invalid_attendance_changes");
    expect(await updateAttendance(group, activity, "bad", { status: "EXCUSED" })).toHaveProperty("error.code", "attendance_record_not_found");
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect(await updateAttendance(group, activity, record.membership_id, { note: null })).toHaveProperty("error.code", "authentication_required");
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("no crea registros al corregir uno eliminado, ajeno o no visible", async () => {
    mock.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await updateAttendance(group, activity, record.membership_id, { status: "EXCUSED" })).toHaveProperty("error.code", "attendance_record_not_found");
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("una lectura fallida o respuesta RPC inválida no confirma la corrección", async () => {
    mock.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "private" } });
    expect(await updateAttendance(group, activity, record.membership_id, { note: "x" })).toHaveProperty("error.code", "attendance_save_failed");
    expect(mock.rpc).not.toHaveBeenCalled();
    mock.rpc.mockResolvedValueOnce({ data: null, error: { message: "admin_required" } });
    expect(await updateAttendance(group, activity, record.membership_id, { note: "x" })).toHaveProperty("error.code", "admin_required");
    mock.rpc.mockResolvedValueOnce({ data: {}, error: null });
    expect(await updateAttendance(group, activity, record.membership_id, { note: "x" })).toHaveProperty("error.code", "attendance_save_failed");
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
});
