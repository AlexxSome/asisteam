// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { reportFixture } from "@/lib/reports.test-fixture";
import { historyFixture } from "@/lib/attendance-history.test-fixture";
const mock = vi.hoisted(() => ({ group: vi.fn(), types: vi.fn(), report: vi.fn(), stats: vi.fn(), history: vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@/lib/activities", () => ({ getActivityTypes: mock.types }));
vi.mock("@/lib/attendance-history", () => ({ getMyAttendanceHistory: mock.history }));
vi.mock("@/lib/reports", async (original) => ({ ...await original<typeof import("@/lib/reports")>(), getGroupAttendanceReport: mock.report, getGroupStats: mock.stats }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); } }));
import GroupReportsPage from "./page";
const params = Promise.resolve({ groupId: reportFixture.group_id });
beforeEach(() => {
  vi.resetAllMocks();
  mock.group.mockResolvedValue({ id: reportFixture.group_id, name: "Equipo sintético", roles: ["ADMIN"] });
  mock.types.mockResolvedValue([{ id: reportFixture.by_activity_type[0]!.activity_type_id, name: "COMPETITION", group_id: null, is_active: true }]);
  mock.report.mockResolvedValue({ report: structuredClone(reportFixture), error: null });
  mock.history.mockResolvedValue({ history: { ...structuredClone(historyFixture), group_id: reportFixture.group_id }, error: null });
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
it("no-ADMIN con toggle apagado conserva el acceso a sus pupilos", async () => {
  mock.group.mockResolvedValue({ id: reportFixture.group_id, roles: ["GUARDIAN"] });
  mock.stats.mockResolvedValue({ report: null, error: null });
  render(await GroupReportsPage({ params, searchParams: Promise.resolve({}) }));
  expect(screen.getByText(/no ha habilitado/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Mis pupilos" })).toBeTruthy();
  expect(mock.history).not.toHaveBeenCalled();
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


it.each([["ATHLETE"], ["ATHLETE", "GUARDIAN"]])("%j ve agregados autorizados junto a sus propias métricas", async (...roles) => {
  mock.group.mockResolvedValue({ id: reportFixture.group_id, name: "Club", roles });
  const { membership_status: _status, ...member } = reportFixture.by_athlete[0]!;
  mock.stats.mockResolvedValue({ report: {
    group_id: reportFixture.group_id, page: 1, page_size: 50, members: [{ ...member, avatar_url: null }],
    totals: { athletes: 1, convened: 8, present: 5, late: 1, absent: 1, excused: 1, attendance_pct: 85.7, late_rate: 16.7 },
  }, error: null });
  render(await GroupReportsPage({ params, searchParams: Promise.resolve({}) }));
  expect(screen.getByRole("region", { name: "Estadísticas agregadas" })).toBeTruthy();
  expect(screen.getAllByText("85.7 %").length).toBe(2);
  expect(within(screen.getByRole("region", { name: "Mi asistencia" })).getByText("77.8 %")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Ver mi historial de asistencia" }).getAttribute("href")).toBe(`/groups/${reportFixture.group_id}/me/history?period=season`);
  if (roles.includes("GUARDIAN")) expect(screen.getByRole("link", { name: "Mis pupilos" })).toBeTruthy();
  expect(screen.queryByRole("checkbox", { name: "Incluir deportistas inactivos" })).toBeNull();
  expect(screen.queryByText(historyFixture.records[0]!.note!)).toBeNull();
  expect(mock.report).not.toHaveBeenCalled();
});

it("ATHLETE con toggle apagado ve sus métricas sin sección ni datos grupales", async () => {
  mock.group.mockResolvedValue({ id: reportFixture.group_id, name: "Club", roles: ["ATHLETE"] });
  mock.stats.mockResolvedValue({ report: null, error: null });
  render(await GroupReportsPage({ params, searchParams: Promise.resolve({}) }));
  const own = within(screen.getByRole("region", { name: "Mi asistencia" }));
  expect(own.getByText("77.8 %")).toBeTruthy();
  expect(own.getByText("14.3 %")).toBeTruthy();
  expect(own.getAllByRole("definition").map((cell) => cell.textContent)).toEqual(["10", "6", "1", "2", "1", "14.3 %"]);
  expect(mock.history).toHaveBeenCalledWith(reportFixture.group_id, { period: "season", activity_type_ids: [], page: 1 });
  expect(screen.queryByRole("heading", { name: "Estadísticas del grupo" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Estadísticas agregadas" })).toBeNull();
  expect(screen.queryByText("Totales del grupo")).toBeNull();
  expect(screen.queryByText(reportFixture.by_athlete[0]!.full_name)).toBeNull();
  expect(mock.report).not.toHaveBeenCalled();
  expect(mock.types).not.toHaveBeenCalled();
});

it("la paginación grupal no cambia los totales propios de temporada", async () => {
  mock.group.mockResolvedValue({ id: reportFixture.group_id, name: "Club", roles: ["ATHLETE"] });
  mock.stats.mockResolvedValue({ report: {
    group_id: reportFixture.group_id, page: 2, page_size: 50, members: [],
    totals: { athletes: 120, convened: 8, present: 5, late: 1, absent: 1, excused: 1, attendance_pct: 85.7, late_rate: 16.7 },
  }, error: null });
  render(await GroupReportsPage({ params, searchParams: Promise.resolve({ page: "2" }) }));
  expect(mock.stats).toHaveBeenCalledWith(reportFixture.group_id, 2);
  expect(mock.history).toHaveBeenCalledWith(reportFixture.group_id, { period: "season", activity_type_ids: [], page: 1 });
  expect(within(screen.getByRole("region", { name: "Mi asistencia" })).getByText("77.8 %")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Anterior" }).getAttribute("href")).toBe(`/groups/${reportFixture.group_id}/reports?page=1`);
  expect(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")).toBe(`/groups/${reportFixture.group_id}/reports?page=3`);
});

it("una página inválida conserva las estadísticas propias sin consultar agregados", async () => {
  mock.group.mockResolvedValue({ id: reportFixture.group_id, roles: ["ATHLETE"] });
  render(await GroupReportsPage({ params, searchParams: Promise.resolve({ page: "-1" }) }));
  expect(screen.getByRole("alert").textContent).toContain("Revisa la página");
  expect(within(screen.getByRole("region", { name: "Mi asistencia" })).getByText("77.8 %")).toBeTruthy();
  expect(mock.stats).not.toHaveBeenCalled();
});

it("sin convocatorias propias muestra Sin datos y acceso al historial", async () => {
  mock.group.mockResolvedValue({ id: reportFixture.group_id, roles: ["ATHLETE"] });
  mock.stats.mockResolvedValue({ report: null, error: null });
  mock.history.mockResolvedValue({ history: { ...historyFixture, totals: { convened: 0, present: 0, late: 0, absent: 0, excused: 0, attendance_pct: null, late_rate: null }, records: [] }, error: null });
  render(await GroupReportsPage({ params, searchParams: Promise.resolve({}) }));
  expect(screen.getAllByText("Sin datos")).toHaveLength(2);
  expect(screen.getByText(/Aún no tienes actividades/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Ver mi historial de asistencia" })).toBeTruthy();
  expect(screen.queryByText("0.0 %")).toBeNull();
});
