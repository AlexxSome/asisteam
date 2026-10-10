import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), getAttendanceRoster: vi.fn(), saveAttendance: vi.fn(), updateAttendance: vi.fn(), clearAttendance: vi.fn(), getGroup: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); } }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("@/lib/api/session", () => ({ createSessionClient: async () => ({ from: mock.from, rpc: mock.rpc }) }));
vi.mock("./server", () => ({ createServerApiClient: () => mock }));
vi.mock("../groups", () => ({ getGroup: mock.getGroup }));
vi.mock("../activities", () => ({ getActivity: async () => ({ id: activityId }) }));
import { getAttendance } from "../attendance";
import { saveAttendance, updateAttendance, clearAttendance } from "@/app/groups/[groupId]/activities/[activityId]/attendance/actions";
const groupId = "30000000-0000-4000-8000-000000000201", activityId = "30000000-0000-4000-8000-000000000501", membershipId = "30000000-0000-4000-8000-000000000303";
const record = { membership_id: membershipId, status: "PRESENT" as const };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ASISTEAM_TRANSPORT_ATTENDANCE", "nest");
  mock.getGroup.mockResolvedValue({ roles: ["COACH"] });
});
afterEach(() => vi.unstubAllEnvs());
it("roster recorre páginas y toma permiso/notas del servidor", async () => {
  mock.getAttendanceRoster.mockResolvedValueOnce({ roster: [{ ...record, note: null }], canEditNotes: false, hasNext: true }).mockResolvedValueOnce({ roster: [], canEditNotes: false, hasNext: false });
  expect(await getAttendance(groupId, activityId)).toMatchObject({ roster: [{ ...record, note: null }], canEditNotes: false });
  expect(mock.getAttendanceRoster).toHaveBeenLastCalledWith({ params: { groupId, activityId }, query: { page: 2 } });
  expect(mock.from).not.toHaveBeenCalled();
});
it("save/correction/clear usan un ejecutor; nota omitida permanece omitida", async () => {
  mock.saveAttendance.mockResolvedValue({ records: [record] });mock.updateAttendance.mockResolvedValue({ records: [record] });mock.clearAttendance.mockResolvedValue({ cleared: true });
  expect(await saveAttendance(groupId, activityId, [record], true)).toEqual({ records: [record] });
  expect(mock.saveAttendance).toHaveBeenCalledWith({ params: { groupId, activityId }, body: { records: [record], only_unmarked: true } });
  await updateAttendance(groupId, activityId, membershipId, { status: "LATE" });
  expect(mock.updateAttendance).toHaveBeenCalledWith({ params: { groupId, activityId, membershipId }, body: { status: "LATE" } });
  expect(await clearAttendance(groupId, activityId, membershipId)).toEqual({ cleared: true });
  expect(mock.rpc).not.toHaveBeenCalled();expect(mock.from).not.toHaveBeenCalled();expect(mock.revalidate).toHaveBeenCalledTimes(3);
});
it.each([503, 504])("resultado incierto%s conserva lotes previos y no reintenta ni revalida", async status => {
  mock.saveAttendance.mockResolvedValueOnce({ records: [record] }).mockRejectedValueOnce(new ApiClientError(status, "request_timeout"));
  await saveAttendance(groupId, activityId, [record], true);
  expect(await saveAttendance(groupId, activityId, [record], true)).toHaveProperty("error.code", "attendance_save_failed");
  expect(mock.saveAttendance).toHaveBeenCalledTimes(2);expect(mock.rpc).not.toHaveBeenCalled();expect(mock.revalidate).toHaveBeenCalledTimes(1);
});
it("errores de rol conservan código y mensaje español; validación precede write", async () => {
  mock.updateAttendance.mockRejectedValue(new ApiClientError(403, "attendance_notes_admin_required"));
  expect(await updateAttendance(groupId, activityId, membershipId, { note: "texto" })).toHaveProperty("error.message", "Solo un administrador puede editar notas de asistencia.");
  expect(await saveAttendance(groupId, activityId, [])).toHaveProperty("error");
  expect(await saveAttendance(groupId, activityId, [{ ...record, actor: membershipId }])).toHaveProperty("error");
  expect(mock.saveAttendance).not.toHaveBeenCalled();
});
it("roster ajeno falla cerrado", async () => {
  mock.getAttendanceRoster.mockRejectedValue(new ApiClientError(404, "activity_not_found"));
  await expect(getAttendance(groupId, activityId)).rejects.toThrow("404");expect(mock.from).not.toHaveBeenCalled();
});
