// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { reportFixture } from "@/lib/reports.test-fixture";
const mock = vi.hoisted(() => ({ group: vi.fn(), types: vi.fn(), report: vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@/lib/activities", () => ({ getActivityTypes: mock.types }));
vi.mock("@/lib/reports", async (original) => ({ ...await original<typeof import("@/lib/reports")>(), getGroupAttendanceReport: mock.report }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); } }));
import GroupReportsPage from "./page";
const params = Promise.resolve({ groupId: reportFixture.group_id });
beforeEach(() => {
  vi.resetAllMocks();
  mock.group.mockResolvedValue({ id: reportFixture.group_id, name: "Equipo sintético", roles: ["ADMIN"] });
  mock.types.mockResolvedValue([{ id: reportFixture.by_activity_type[0]!.activity_type_id, name: "COMPETITION", group_id: null, is_active: true }]);
  mock.report.mockResolvedValue({ report: structuredClone(reportFixture), error: null });
});
afterEach(cleanup);
it("muestra tabla accesible, 85.7 %, atraso separado y controles de filtro", async () => {
  render(await GroupReportsPage({ params, searchParams: Promise.resolve({}) }));
  const table = within(screen.getByRole("region", { name: "Resumen por deportista" })).getByRole("table");
  const row = within(table).getByRole("row", { name: /Persona sintética/ });
  expect(within(row).getByText("85.7 %")).toBeTruthy();
  expect(within(row).getByText("16.7 %")).toBeTruthy();
  expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["8", "5", "1", "1", "1", "85.7 %", "16.7 %"]);
  expect(screen.getByRole("combobox", { name: "Período" })).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "Competencia" })).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "Incluir deportistas inactivos" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Aplicar filtros" })).toBeTruthy();
  expect(screen.queryByText(/Exportar CSV/)).toBeNull();
});
it("rechaza no-ADMIN antes de consultar datos o tipos", async () => {
  mock.group.mockResolvedValue({ id: reportFixture.group_id, roles: ["GUARDIAN"] });
  await expect(GroupReportsPage({ params, searchParams: Promise.resolve({}) })).rejects.toThrow("404");
  expect(mock.report).not.toHaveBeenCalled(); expect(mock.types).not.toHaveBeenCalled();
});
it("filtro inválido muestra error, sin presentar un reporte del mes por defecto", async () => {
  render(await GroupReportsPage({ params, searchParams: Promise.resolve({ period: "custom", from: "2026-03-20", to: "2026-03-01" }) }));
  expect(screen.getByRole("alert").textContent).toContain("Revisa");
  expect(mock.report).not.toHaveBeenCalled(); expect(screen.queryByRole("table")).toBeNull();
});
it("sin actividades muestra CTA y Sin datos; inactivos quedan identificados", async () => {
  const report = structuredClone(reportFixture);
  report.has_activities = false;
  report.totals = { ...report.totals, convened: 0, activities: 0, present: 0, late: 0, absent: 0, excused: 0, attendance_pct: null, late_rate: null, average_attendance_pct: null, best_full_name: null };
  report.by_athlete = [{ ...report.by_athlete[0]!, membership_status: "INACTIVE", convened: 0, present: 0, late: 0, absent: 0, excused: 0, attendance_pct: null, late_rate: null }];
  report.by_activity_type = []; report.trend = [];
  mock.report.mockResolvedValue({ report, error: null });
  render(await GroupReportsPage({ params, searchParams: Promise.resolve({ include_inactive: "true" }) }));
  expect(screen.getByRole("link", { name: "Crear primera actividad" })).toBeTruthy();
  expect(screen.getByText("Inactivo")).toBeTruthy();
  expect(screen.getAllByText("Sin datos").length).toBeGreaterThan(0);
  expect(screen.queryByText("0.0 %")).toBeNull();
});
