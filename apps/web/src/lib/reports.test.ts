import { beforeEach, expect, it, vi } from "vitest";
import {ApiClientError} from "@asisteam/api-client";
import { reportFilterSchema } from "@asisteam/core";
import { reportFixture } from "@/lib/reports.test-fixture";
const mock = vi.hoisted(() => ({ group: vi.fn(), operation:vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@/lib/api/server",()=>({createServerApiClient:()=>({getGroupAttendanceReport:(request:unknown)=>mock.operation("getGroupAttendanceReport",request),getGroupStats:(request:unknown)=>mock.operation("getGroupStats",request)})}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); } }));
import { getGroupAttendanceReport, getGroupStats, parseReportFilters, reportPageHref } from "@/lib/reports";
const groupId = reportFixture.group_id;
beforeEach(() => {
  vi.resetAllMocks(); mock.group.mockResolvedValue({ id: groupId, roles: ["ADMIN"] });
  mock.operation.mockResolvedValue(reportFixture);
});
it("envía todos los filtros, sin calcular métricas en la página", async () => {
  const filter = reportFilterSchema.parse({ period: "custom", from: "2026-03-01", to: "2026-03-31", include_inactive: true, activity_type_ids: [reportFixture.by_activity_type[0]!.activity_type_id], page: 2, sort: "name" });
  expect((await getGroupAttendanceReport(groupId, filter)).report).toEqual(reportFixture);
  expect(mock.operation).toHaveBeenCalledWith("getGroupAttendanceReport",{params:{groupId},query:{...filter,activity_type_ids:filter.activity_type_ids.join(","),page_size:50}});
});
it("no llama la RPC para roles sin permiso y revocación del permiso produce 404", async () => {
  mock.group.mockResolvedValue({ id: groupId, roles: ["ATHLETE"] });
  await expect(getGroupAttendanceReport(groupId, reportFilterSchema.parse({}))).rejects.toThrow("404");
  expect(mock.operation).not.toHaveBeenCalled();
  mock.group.mockResolvedValue({ id: groupId, roles: ["ADMIN"] });
  mock.operation.mockRejectedValue(new ApiClientError(403,"domain_rejected"));
  await expect(getGroupAttendanceReport(groupId, reportFilterSchema.parse({}))).rejects.toThrow("404");
});
it("filtro inválido ofrece corrección y fallo de lectura nunca se presenta como cero", async () => {
  mock.operation.mockRejectedValue(new ApiClientError(400,"domain_rejected"));
  expect((await getGroupAttendanceReport(groupId, reportFilterSchema.parse({}))).error).toContain("Revisa");
  mock.operation.mockResolvedValue({});
  await expect(getGroupAttendanceReport(groupId, reportFilterSchema.parse({}))).rejects.toThrow("leer el reporte");
});
it("URL de paginación mantiene fechas, tipos, inactivos y orden", () => {
  const input = { period: "custom", from: "2026-03-01", to: "2026-03-31", activity_type_id: ["b2c3d4e5-0001-4b3c-8d4e-111111111111", "b2c3d4e5-0003-4b3c-8d4e-333333333333"], include_inactive: "true", sort: "name" };
  const filter = parseReportFilters(input);
  expect(filter.success).toBe(true);
  if (!filter.success) throw new Error("fixture inválida");
  const query = new URL(reportPageHref(groupId, filter.data, 3), "https://example.test").searchParams;
  expect(query.getAll("activity_type_id")).toEqual(input.activity_type_id);
  expect(query.get("include_inactive")).toBe("true"); expect(query.get("sort")).toBe("name");
  expect(query.get("from")).toBe(input.from); expect(query.get("to")).toBe(input.to); expect(query.get("page")).toBe("3");
  expect(parseReportFilters({ from: "", to: "" }).success).toBe(true);
  expect(parseReportFilters({ period: ["month", "week"] }).success).toBe(false);
});


it("estadísticas consulta autorización actual y muestra revocación sin usar datos previos", async () => {
  const member = reportFixture.by_athlete[0]!;
  const { membership_status: _status, ...metrics } = member;
  const stats = { group_id: groupId, members: [{ ...metrics, avatar_url: null }], page: 1, page_size: 50,
    totals: { athletes: 1, convened: 8, present: 5, late: 1, absent: 1, excused: 1, attendance_pct: 85.7, late_rate: 16.7 } };
  mock.group.mockResolvedValue({ id: groupId, roles: ["ATHLETE"] });
  mock.operation.mockResolvedValueOnce(stats).mockRejectedValueOnce(new ApiClientError(403,"group_stats_disabled"));
  expect((await getGroupStats(groupId)).report).toEqual(stats);
  expect(await getGroupStats(groupId)).toEqual({ report: null, error: null });
  expect(mock.operation).toHaveBeenCalledTimes(2);
  mock.operation.mockResolvedValueOnce({...stats,members:[{...stats.members[0],email:"private@example.test"}]});
  await expect(getGroupStats(groupId)).rejects.toThrow("leer las estadísticas");
  mock.operation.mockRejectedValueOnce(new ApiClientError(404,"domain_rejected"));
  await expect(getGroupStats(groupId)).rejects.toThrow("404");
});

it("COACH consulta el reporte agregado y una revocación se vuelve a verificar", async () => {
  mock.group.mockResolvedValue({ id: groupId, roles: ["COACH"] });
  expect((await getGroupAttendanceReport(groupId, reportFilterSchema.parse({}))).report).toEqual(reportFixture);
  mock.operation.mockRejectedValue(new ApiClientError(403,"domain_rejected"));
  await expect(getGroupAttendanceReport(groupId, reportFilterSchema.parse({}))).rejects.toThrow("404");
});

it.each(["week", "month", "season"])("%s descarta fechas incompatibles de URLs antiguas y de paginación", (period) => {
  const parsed = parseReportFilters({ period, from: "2026-03-01", to: "2026-03-31", sort: "name", include_inactive: "true" });
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error("fixture inválida");
  expect(parsed.data.to).toBeUndefined();
  expect(parsed.data.from).toBe(period === "season" ? undefined : "2026-03-01");
  const query = new URL(reportPageHref(groupId, { ...parsed.data, to: "2026-03-31" }, 2), "https://example.test").searchParams;
  expect(query.has("to")).toBe(false);
  expect(query.has("from")).toBe(period !== "season");
  expect(query.get("sort")).toBe("name");
  expect(query.get("include_inactive")).toBe("true");
});
