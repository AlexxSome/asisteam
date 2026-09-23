import { beforeEach, expect, it, vi } from "vitest";
import { reportFilterSchema } from "@asisteam/core";
import { reportFixture } from "./reports.test-fixture";
const mock = vi.hoisted(() => ({ group: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc }) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); } }));
import { getGroupAttendanceReport, parseReportFilters, reportPageHref } from "./reports";
const groupId = reportFixture.group_id;
beforeEach(() => {
  vi.resetAllMocks(); mock.group.mockResolvedValue({ id: groupId, roles: ["ADMIN"] });
  mock.rpc.mockResolvedValue({ data: reportFixture, error: null });
});
it("envía todos los filtros, sin calcular métricas en la página", async () => {
  const filter = reportFilterSchema.parse({ period: "custom", from: "2026-03-01", to: "2026-03-31", include_inactive: true, activity_type_ids: [reportFixture.by_activity_type[0]!.activity_type_id], page: 2, sort: "name" });
  expect((await getGroupAttendanceReport(groupId, filter)).report).toEqual(reportFixture);
  expect(mock.rpc).toHaveBeenCalledWith("get_group_attendance_report", { p_group_id: groupId, p_period: "custom", p_from: "2026-03-01", p_to: "2026-03-31", p_include_inactive: true, p_activity_type_ids: filter.activity_type_ids, p_page: 2, p_page_size: 50, p_sort: "name" });
});
it("no llama la RPC para no-ADMIN y revocación del permiso produce 404", async () => {
  mock.group.mockResolvedValue({ id: groupId, roles: ["ATHLETE"] });
  await expect(getGroupAttendanceReport(groupId, reportFilterSchema.parse({}))).rejects.toThrow("404");
  expect(mock.rpc).not.toHaveBeenCalled();
  mock.group.mockResolvedValue({ id: groupId, roles: ["ADMIN"] });
  mock.rpc.mockResolvedValue({ data: null, error: { code: "PT403" } });
  await expect(getGroupAttendanceReport(groupId, reportFilterSchema.parse({}))).rejects.toThrow("404");
});
it("filtro inválido ofrece corrección y fallo de lectura nunca se presenta como cero", async () => {
  mock.rpc.mockResolvedValue({ data: null, error: { code: "PT400" } });
  expect((await getGroupAttendanceReport(groupId, reportFilterSchema.parse({}))).error).toContain("Revisa");
  mock.rpc.mockResolvedValue({ data: {}, error: null });
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
