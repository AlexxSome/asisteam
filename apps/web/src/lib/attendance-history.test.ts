import { beforeEach, expect, it, vi } from "vitest";
import {ApiClientError} from "@asisteam/api-client";
import { attendancePeriodFilterSchema, attendanceHistorySchema } from "@asisteam/core";
import { historyFixture } from "@/lib/attendance-history.test-fixture";
const mock = vi.hoisted(() => ({ group: vi.fn(), operation:vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@/lib/api/server",()=>({createServerApiClient:()=>({getMyAttendanceHistory:(request:unknown)=>mock.operation("getMyAttendanceHistory",request),getWardAttendanceHistory:(request:unknown)=>mock.operation("getWardAttendanceHistory",request)})}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); } }));
import { getMyAttendanceHistory, getWardAttendanceHistory, historyPageHref, parseHistoryFilters } from "@/lib/attendance-history";
const groupId = historyFixture.group_id;
beforeEach(() => {
  vi.resetAllMocks(); mock.group.mockResolvedValue({ id: groupId, roles: ["ATHLETE", "ADMIN"] });
  mock.operation.mockResolvedValue(historyFixture);
});
it("envía filtros y grupo sin aceptar identidad ni membership desde el cliente", async () => {
  const filter = parseHistoryFilters({ period: "custom", from: "2026-03-01", to: "2026-03-31", activity_type_id: historyFixture.records[0]!.activity_type_id, page: "2", membership_id: "otra-persona", include_inactive: "true" });
  expect(filter.success).toBe(true);
  if (!filter.success) throw new Error("fixture inválida");
  expect((await getMyAttendanceHistory(groupId, filter.data)).history).toEqual(historyFixture);
  expect(mock.operation).toHaveBeenCalledWith("getMyAttendanceHistory",{params:{groupId},query:{...filter.data,activity_type_ids:historyFixture.records[0]!.activity_type_id,page_size:50}});
  expect(filter.data).not.toHaveProperty("membership_id"); expect(filter.data).not.toHaveProperty("include_inactive");
});
it("no-ATHLETE no consulta y revocación posterior a layout produce 404", async () => {
  mock.group.mockResolvedValue({ id: groupId, roles: ["ADMIN"] });
  await expect(getMyAttendanceHistory(groupId, attendancePeriodFilterSchema.parse({}))).rejects.toThrow("404");
  expect(mock.operation).not.toHaveBeenCalled();
  mock.group.mockResolvedValue({ id: groupId, roles: ["ATHLETE"] });
  mock.operation.mockRejectedValue(new ApiClientError(404,"domain_rejected"));
  await expect(getMyAttendanceHistory(groupId, attendancePeriodFilterSchema.parse({}))).rejects.toThrow("404");
});
it("maneja errores sin inventar cero y rechaza respuestas con campos privados", async () => {
  const filter = attendancePeriodFilterSchema.parse({});
  mock.operation.mockRejectedValue(new ApiClientError(400,"domain_rejected"));
  expect((await getMyAttendanceHistory(groupId, filter)).error).toContain("Revisa");
  mock.operation.mockRejectedValue(new ApiClientError(500,"internal_error"));
  await expect(getMyAttendanceHistory(groupId, filter)).rejects.toThrow("cargar tu historial");
  const invalid = { ...historyFixture, records: [{ ...historyFixture.records[0], email: "secret@example.test" }] };
  expect(attendanceHistorySchema.safeParse(invalid).success).toBe(false);
  mock.operation.mockResolvedValue(invalid);
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

it("consulta pupilo con grupo e identidad explícitos y revalida revocaciones en RPC", async () => {
  const athleteUserId = "47000000-0000-4000-8000-000000000111";
  const filter = attendancePeriodFilterSchema.parse({ period: "season" });
  mock.group.mockResolvedValue({ id: groupId, roles: ["GUARDIAN", "ADMIN"] });
  expect((await getWardAttendanceHistory(groupId, athleteUserId, filter)).history).toEqual(historyFixture);
  expect(mock.operation).toHaveBeenCalledWith("getWardAttendanceHistory",{params:{groupId,athleteUserId},query:{...filter,activity_type_ids:"",page_size:50}});
  for (const code of ["PT401", "PT403", "PT404"]) {
    mock.operation.mockRejectedValue(new ApiClientError(Number(code.slice(2)),"domain_rejected"));
    await expect(getWardAttendanceHistory(groupId, athleteUserId, filter)).rejects.toThrow("404");
  }
  mock.operation.mockClear();
  await expect(getWardAttendanceHistory(groupId, "invalid", filter)).rejects.toThrow("404");
  mock.group.mockResolvedValue({ id: groupId, roles: ["ADMIN", "ATHLETE"] });
  await expect(getWardAttendanceHistory(groupId, athleteUserId, filter)).rejects.toThrow("404");
  expect(mock.operation).not.toHaveBeenCalled();
});

it("pupilo conserva identidad y filtros en enlaces y rechaza contrato con datos privados", async () => {
  const athleteUserId = "47000000-0000-4000-8000-000000000111";
  const filter = attendancePeriodFilterSchema.parse({ period: "custom", from: "2026-03-01", to: "2026-03-31", activity_type_ids: [historyFixture.records[0]!.activity_type_id] });
  const url = new URL(historyPageHref(groupId, filter, 2, athleteUserId), "https://example.test");
  expect(url.pathname).toBe(`/groups/${groupId}/wards/${athleteUserId}/history`);
  expect(url.searchParams.get("page")).toBe("2");
  expect(url.searchParams.get("from")).toBe(filter.from);
  expect(url.searchParams.getAll("activity_type_id")).toEqual(filter.activity_type_ids);
  mock.group.mockResolvedValue({ id: groupId, roles: ["GUARDIAN"] });
  mock.operation.mockResolvedValue({...historyFixture,phone:"secret"});
  await expect(getWardAttendanceHistory(groupId, athleteUserId, filter)).rejects.toThrow("leer el historial");
  mock.operation.mockRejectedValue(new ApiClientError(400,"domain_rejected"));
  expect((await getWardAttendanceHistory(groupId, athleteUserId, filter)).error).toContain("Revisa");
});

it.each(["week", "month", "season"])("historial %s normaliza fechas sin alterar el período ni el pupilo", (period) => {
  const parsed = parseHistoryFilters({ period, from: "2026-03-01", to: "2026-03-31" });
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error("fixture inválida");
  expect(parsed.data.to).toBeUndefined();
  expect(parsed.data.from).toBe(period === "season" ? undefined : "2026-03-01");
  const query = new URL(historyPageHref(groupId, parsed.data, 2, "pupilo"), "https://example.test");
  expect(query.pathname).toContain("/wards/pupilo/history");
  expect(query.searchParams.has("to")).toBe(false);
  expect(query.searchParams.has("from")).toBe(period !== "season");
  expect(query.searchParams.get("page")).toBe("2");
});
