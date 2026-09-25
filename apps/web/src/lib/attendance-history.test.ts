import { beforeEach, expect, it, vi } from "vitest";
import { attendancePeriodFilterSchema, attendanceHistorySchema } from "@asisteam/core";
import { historyFixture } from "./attendance-history.test-fixture";
const mock = vi.hoisted(() => ({ group: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); } }));
import { getMyAttendanceHistory, historyPageHref, parseHistoryFilters } from "./attendance-history";
const groupId = historyFixture.group_id;
beforeEach(() => {
  vi.resetAllMocks(); mock.group.mockResolvedValue({ id: groupId, roles: ["ATHLETE", "ADMIN"] });
  mock.rpc.mockResolvedValue({ data: historyFixture, error: null });
});
it("envía filtros y grupo sin aceptar identidad ni membership desde el cliente", async () => {
  const filter = parseHistoryFilters({ period: "custom", from: "2026-03-01", to: "2026-03-31", activity_type_id: historyFixture.records[0]!.activity_type_id, page: "2", membership_id: "otra-persona", include_inactive: "true" });
  expect(filter.success).toBe(true);
  if (!filter.success) throw new Error("fixture inválida");
  expect((await getMyAttendanceHistory(groupId, filter.data)).history).toEqual(historyFixture);
  expect(mock.rpc).toHaveBeenCalledWith("get_my_attendance_history", { p_group_id: groupId, p_period: "custom", p_from: "2026-03-01", p_to: "2026-03-31", p_activity_type_ids: [historyFixture.records[0]!.activity_type_id], p_page: 2, p_page_size: 50 });
  expect(filter.data).not.toHaveProperty("membership_id"); expect(filter.data).not.toHaveProperty("include_inactive");
});
it("no-ATHLETE no consulta y revocación posterior a layout produce 404", async () => {
  mock.group.mockResolvedValue({ id: groupId, roles: ["ADMIN"] });
  await expect(getMyAttendanceHistory(groupId, attendancePeriodFilterSchema.parse({}))).rejects.toThrow("404");
  expect(mock.rpc).not.toHaveBeenCalled();
  mock.group.mockResolvedValue({ id: groupId, roles: ["ATHLETE"] });
  mock.rpc.mockResolvedValue({ data: null, error: { code: "PT404" } });
  await expect(getMyAttendanceHistory(groupId, attendancePeriodFilterSchema.parse({}))).rejects.toThrow("404");
});
it("maneja errores sin inventar cero y rechaza respuestas con campos privados", async () => {
  const filter = attendancePeriodFilterSchema.parse({});
  mock.rpc.mockResolvedValue({ data: null, error: { code: "PT400" } });
  expect((await getMyAttendanceHistory(groupId, filter)).error).toContain("Revisa");
  mock.rpc.mockResolvedValue({ data: null, error: { code: "XX000" } });
  await expect(getMyAttendanceHistory(groupId, filter)).rejects.toThrow("cargar tu historial");
  const invalid = { ...historyFixture, records: [{ ...historyFixture.records[0], email: "secret@example.test" }] };
  expect(attendanceHistorySchema.safeParse(invalid).success).toBe(false);
  mock.rpc.mockResolvedValue({ data: invalid, error: null });
  await expect(getMyAttendanceHistory(groupId, filter)).rejects.toThrow("leer tu historial");
});
it("paginación conserva rango y multiselección; validación comparte contrato de reportes", () => {
  const ids = [historyFixture.records[0]!.activity_type_id, "b2c3d4e5-0003-4b3c-8d4e-333333333333"];
  const filter = attendancePeriodFilterSchema.parse({ period: "custom", from: "2026-03-01", to: "2026-03-31", activity_type_ids: ids });
  const url = new URL(historyPageHref(groupId, filter, 3), "https://example.test");
  expect(url.pathname).toBe(`/groups/${groupId}/me/history`);
  expect(url.searchParams.getAll("activity_type_id")).toEqual(ids);
  expect(url.searchParams.get("page")).toBe("3"); expect(url.searchParams.get("from")).toBe(filter.from); expect(url.searchParams.get("to")).toBe(filter.to);
  expect(parseHistoryFilters({ from: "", to: "" }).success).toBe(true);
  for (const query of [{ period: ["month", "week"] }, { period: "custom" }, { from: "2026-02-30" }, { page: "0" }, { activity_type_id: "invalid" }, { period: "custom", from: "2026-03-31", to: "2026-03-01" }]) expect(parseHistoryFilters(query).success).toBe(false);
});
