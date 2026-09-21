import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser }, rpc: mock.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import { clearAttendance, saveAttendance } from "./actions";
const group = "30000000-0000-4000-8000-000000000201";
const activity = "30000000-0000-4000-8000-000000000501";
const record = { membership_id: "30000000-0000-4000-8000-000000000303", status: "PRESENT" as const };
beforeEach(() => {
  vi.resetAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "auth-id" } } });
  mock.rpc.mockResolvedValue({ data: { records: [{ ...record, note: "guardada" }] }, error: null });
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
});
