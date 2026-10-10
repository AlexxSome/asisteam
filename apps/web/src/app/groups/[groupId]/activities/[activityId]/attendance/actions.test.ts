import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mock = vi.hoisted(() => ({ save:vi.fn(),update:vi.fn(),clear:vi.fn(),revalidate:vi.fn() }));
vi.mock("@/lib/api/server",()=>({createServerApiClient:()=>({saveAttendance:mock.save,updateAttendance:mock.update,clearAttendance:mock.clear})}));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import { clearAttendance, saveAttendance, updateAttendance } from "@/app/groups/[groupId]/activities/[activityId]/attendance/actions";
const group = "30000000-0000-4000-8000-000000000201";
const activity = "30000000-0000-4000-8000-000000000501";
const record = { membership_id: "30000000-0000-4000-8000-000000000303", status: "PRESENT" as const };
beforeEach(()=>{
 vi.resetAllMocks();
 mock.save.mockResolvedValue({records:[{...record,note:"guardada"}]});
 mock.update.mockResolvedValue({records:[{...record,note:"guardada"}]});
 mock.clear.mockResolvedValue({cleared:true});
});
describe("acciones de asistencia", () => {
  it("envía estado a RPC sin inventar actor ni borrar nota omitida", async () => {
    expect(await saveAttendance(group, activity, [record], true)).toEqual({ records: [{ ...record, note: "guardada" }] });
    expect(mock.save).toHaveBeenCalledWith({params:{groupId:group,activityId:activity},body:{records:[record],only_unmarked:true}});
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${group}/activities/${activity}/attendance`);
  });
  it("rechaza campos falsificados y lotes inválidos sin RPC", async () => {
    expect(await saveAttendance(group, activity, [{ ...record, recorded_by: "intruso" }])).toHaveProperty("error.code", "invalid_attendance_batch");
    expect(await saveAttendance("bad", activity, [record])).toHaveProperty("error.code", "activity_not_found");
    expect(mock.save).not.toHaveBeenCalled();
  });
  it("sin sesión no escribe", async () => {
    for(const method of [mock.save,mock.update,mock.clear])method.mockRejectedValue(new ApiClientError(401,"authentication_required"));
    expect(await saveAttendance(group, activity, [record])).toHaveProperty("error.code", "authentication_required");
    expect(await clearAttendance(group, activity, record.membership_id)).toHaveProperty("error.code", "authentication_required");
    expect(mock.save).toHaveBeenCalledTimes(1);expect(mock.clear).toHaveBeenCalledTimes(1);
  });
  it("propaga permiso denegado y oculta errores internos", async () => {
    mock.save.mockRejectedValue(new ApiClientError(403,"admin_required"));
    expect(await saveAttendance(group, activity, [record])).toHaveProperty("error.code", "admin_required");
    mock.save.mockRejectedValue(new ApiClientError(500,"private email database internals"));
    const result = await saveAttendance(group, activity, [record]);
    expect(result).toHaveProperty("error.code", "attendance_save_failed");
    expect(JSON.stringify(result)).not.toContain("private email");
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("no confirma guardado si la respuesta es inválida", async () => {
    mock.save.mockResolvedValue({});
    expect(await saveAttendance(group, activity, [record])).toHaveProperty("error.code", "attendance_save_failed");
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("desmarca solo con RPC acotada a una actividad y membership", async () => {
    expect(await clearAttendance(group, activity, record.membership_id)).toEqual({ cleared: true });
    expect(mock.clear).toHaveBeenCalledWith({params:{groupId:group,activityId:activity,membershipId:record.membership_id}});
  });
  it("corrige solo la nota mediante RPC con identidad resuelta en el grupo y actividad", async () => {
    expect(await updateAttendance(group, activity, record.membership_id, { note: "Corregida" })).toEqual({ records: [{ ...record, note: "guardada" }] });
    expect(mock.update).toHaveBeenCalledWith({params:{groupId:group,activityId:activity,membershipId:record.membership_id},body:{note:"Corregida"}});
    expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${group}/activities/${activity}/attendance`);
  });
  it("valida correcciones y sesión antes de consultar o editar", async () => {
    expect(await updateAttendance(group, activity, record.membership_id, { note: "x", recorded_at: "ayer" })).toHaveProperty("error.code", "invalid_attendance_changes");
    expect(await updateAttendance(group, activity, "bad", { status: "EXCUSED" })).toHaveProperty("error.code", "attendance_record_not_found");
    for(const method of [mock.save,mock.update,mock.clear])method.mockRejectedValue(new ApiClientError(401,"authentication_required"));
    expect(await updateAttendance(group, activity, record.membership_id, { note: null })).toHaveProperty("error.code", "authentication_required");
    expect(mock.update).toHaveBeenCalledTimes(1);expect(mock.save).not.toHaveBeenCalled();
  });
  it("no crea registros al corregir uno eliminado, ajeno o no visible", async () => {
    mock.update.mockRejectedValue(new ApiClientError(404,"attendance_record_not_found"));
    expect(await updateAttendance(group, activity, record.membership_id, { status: "EXCUSED" })).toHaveProperty("error.code", "attendance_record_not_found");
    expect(mock.save).not.toHaveBeenCalled();expect(mock.update).toHaveBeenCalledTimes(1);
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
  it("una lectura fallida o respuesta RPC inválida no confirma la corrección", async () => {
    mock.update.mockRejectedValueOnce(new Error("private"));
    expect(await updateAttendance(group, activity, record.membership_id, { note: "x" })).toHaveProperty("error.code", "attendance_save_failed");
    expect(mock.save).not.toHaveBeenCalled();
    mock.update.mockRejectedValueOnce(new ApiClientError(403,"admin_required"));
    expect(await updateAttendance(group, activity, record.membership_id, { note: "x" })).toHaveProperty("error.code", "admin_required");
    mock.update.mockResolvedValueOnce({});
    expect(await updateAttendance(group, activity, record.membership_id, { note: "x" })).toHaveProperty("error.code", "attendance_save_failed");
    expect(mock.revalidate).not.toHaveBeenCalled();
  });
});
