// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { reportFixture } from "@/lib/reports.test-fixture";
import { historyFixture } from "@/lib/attendance-history.test-fixture";
const mock = vi.hoisted(() => ({ group: vi.fn(), types: vi.fn(), report: vi.fn(), stats: vi.fn(), history: vi.fn(), wards: vi.fn(), wardHistory: vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@/lib/activities", () => ({ getActivityTypes: mock.types }));
vi.mock("@/lib/attendance-history", () => ({ getMyAttendanceHistory: mock.history, getWardAttendanceHistory: mock.wardHistory }));
vi.mock("@/lib/wards", async (original) => ({ ...await original<typeof import("@/lib/wards")>(), getGroupWards: mock.wards }));
vi.mock("@/lib/reports", async (original) => ({ ...await original<typeof import("@/lib/reports")>(), getGroupAttendanceReport: mock.report, getGroupStats: mock.stats }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); } }));
import GroupReportsPage from "./page";
import userEvent from "@testing-library/user-event";
import { ReportFilters } from "./report-filters";
import { reportFilterSchema } from "@asisteam/core";
const params = Promise.resolve({ groupId: reportFixture.group_id });
const ward = { athlete_user_id: "49000000-0000-4000-8000-000000000001", full_name: "Pupilo sintético" };
beforeEach(() => {
  vi.resetAllMocks();
  mock.group.mockResolvedValue({ id: reportFixture.group_id, name: "Equipo sintético", roles: ["ADMIN"] });
  mock.types.mockResolvedValue([{ id: reportFixture.by_activity_type[0]!.activity_type_id, name: "COMPETITION", group_id: null, is_active: true }]);
  mock.report.mockResolvedValue({ report: structuredClone(reportFixture), error: null });
  mock.history.mockResolvedValue({ history: { ...structuredClone(historyFixture), group_id: reportFixture.group_id }, error: null });
  mock.wards.mockResolvedValue({ wards: [ward], hasNext: false });
  mock.wardHistory.mockResolvedValue({ history: { ...structuredClone(historyFixture), group_id: reportFixture.group_id }, error: null });
});
afterEach(cleanup);
it("muestra tabla accesible, 85.7 %, atraso separado y controles de filtro", async () => {
  render(await GroupReportsPage({ params, searchParams: Promise.resolve({}) }));
  const table = within(screen.getByRole("region", { name: "Resumen por deportista" })).getByRole("table");
  const row = within(table).getByRole("row", { name: /Persona sintética/ });
  expect(within(row).getByText("85.7 %")).toBeTruthy();
  expect(within(row).getByText("16.7 %")).toBeTruthy();
  expect(within(row).getAllByRole("cell").map((cell) => cell.textContent)).toEqual(["85.7 %", "8", "5", "1", "1", "1", "16.7 %"]);
  expect(screen.getByRole("combobox", { name: "Período" })).toBeTruthy();
  await userEvent.setup().click(screen.getByText("Más filtros (0 activos)"));
  expect(screen.getByRole("checkbox", { name: "Competencia" })).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "Incluir deportistas inactivos" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Aplicar filtros" })).toBeTruthy();
  expect(screen.queryByText(/Exportar CSV/)).toBeNull();
});
it("GUARDIAN con toggle apagado ve solo las métricas de sus pupilos", async () => {
  mock.group.mockResolvedValue({ id: reportFixture.group_id, roles: ["GUARDIAN"] });
  mock.stats.mockResolvedValue({ report: null, error: null });
  render(await GroupReportsPage({ params, searchParams: Promise.resolve({}) }));
  expect(screen.getByText(/no ha habilitado/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Mis pupilos" })).toBeTruthy();
  const own = within(screen.getByRole("region", { name: ward.full_name }));
  expect(own.getByText("77.8 %")).toBeTruthy();
  expect(own.getAllByRole("definition").map((cell) => cell.textContent)).toEqual(["10", "6", "1", "2", "1", "14.3 %"]);
  expect(own.getByRole("link", { name: `Ver historial de ${ward.full_name}` }).getAttribute("href")).toBe(`/groups/${reportFixture.group_id}/wards/${ward.athlete_user_id}/history?period=season`);
  expect(mock.wards).toHaveBeenCalledWith(reportFixture.group_id, 1);
  expect(mock.wardHistory).toHaveBeenCalledWith(reportFixture.group_id, ward.athlete_user_id, { period: "season", activity_type_ids: [], page: 1 });
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.queryByText(reportFixture.by_athlete[0]!.full_name)).toBeNull();
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
  if (roles.includes("GUARDIAN")) {
    expect(screen.getByRole("link", { name: "Mis pupilos" })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: ward.full_name })).getByText("77.8 %")).toBeTruthy();
  } else expect(mock.wards).not.toHaveBeenCalled();
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

it("GUARDIAN con toggle activo ve nombres y porcentajes agregados junto a sus pupilos", async () => {
  mock.group.mockResolvedValue({ id: reportFixture.group_id, name: "Club", roles: ["GUARDIAN"] });
  const { membership_status: _status, ...member } = reportFixture.by_athlete[0]!;
  mock.stats.mockResolvedValue({ report: {
    group_id: reportFixture.group_id, page: 2, page_size: 50, members: [{ ...member, avatar_url: null }],
    totals: { athletes: 120, convened: 8, present: 5, late: 1, absent: 1, excused: 1, attendance_pct: 85.7, late_rate: 16.7 },
  }, error: null });
  mock.wards.mockResolvedValue({ wards: [ward], hasNext: true });
  render(await GroupReportsPage({ params, searchParams: Promise.resolve({ page: "2", ward_page: "2" }) }));
  const table = within(screen.getByRole("region", { name: "Estadísticas agregadas" })).getByRole("table");
  expect(within(table).getByRole("row", { name: /Persona sintética/ }).textContent).toContain("85.7 %");
  expect(within(screen.getByRole("region", { name: ward.full_name })).getByText("77.8 %")).toBeTruthy();
  expect(mock.wards).toHaveBeenCalledWith(reportFixture.group_id, 2);
  expect(mock.wardHistory).toHaveBeenCalledWith(reportFixture.group_id, ward.athlete_user_id, { period: "season", activity_type_ids: [], page: 1 });
  expect(screen.getByRole("link", { name: "Anterior" }).getAttribute("href")).toBe(`/groups/${reportFixture.group_id}/reports?page=1&ward_page=2`);
  expect(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")).toBe(`/groups/${reportFixture.group_id}/reports?page=3&ward_page=2`);
  expect(screen.getByRole("link", { name: "Más pupilos" }).getAttribute("href")).toBe(`/groups/${reportFixture.group_id}/reports?page=2&ward_page=3`);
  expect(screen.getByRole("link", { name: "Pupilos anteriores" }).getAttribute("href")).toBe(`/groups/${reportFixture.group_id}/reports?page=2`);
  expect(screen.queryByText(historyFixture.records[0]!.note!)).toBeNull();
  expect(screen.queryByRole("heading", { name: "Mi asistencia" })).toBeNull();
  expect(mock.history).not.toHaveBeenCalled();
  expect(mock.report).not.toHaveBeenCalled();
});

it("cada pupilo conserva su porcentaje y Sin datos no se transforma en cero", async () => {
  mock.group.mockResolvedValue({ id: reportFixture.group_id, roles: ["GUARDIAN"] });
  mock.stats.mockResolvedValue({ report: null, error: null });
  const second = { athlete_user_id: "49000000-0000-4000-8000-000000000002", full_name: "Segundo pupilo" };
  mock.wards.mockResolvedValue({ wards: [ward, second], hasNext: false });
  mock.wardHistory.mockResolvedValueOnce({ history: historyFixture, error: null })
    .mockResolvedValueOnce({ history: { ...historyFixture, totals: { convened: 0, present: 0, late: 0, absent: 0, excused: 0, attendance_pct: null, late_rate: null } }, error: null });
  render(await GroupReportsPage({ params, searchParams: Promise.resolve({}) }));
  expect(within(screen.getByRole("region", { name: ward.full_name })).getByText("77.8 %")).toBeTruthy();
  const other = within(screen.getByRole("region", { name: second.full_name }));
  expect(other.getAllByText("Sin datos")).toHaveLength(2);
  expect(other.getByText(/aún no tiene actividades/)).toBeTruthy();
  expect(other.queryByText("0.0 %")).toBeNull();
  expect(mock.wardHistory.mock.calls.map((call) => call[1])).toEqual([ward.athlete_user_id, second.athlete_user_id]);
});

it("una página grupal inválida no oculta pupilos y no inventa estadísticas sin vínculos", async () => {
  mock.group.mockResolvedValue({ id: reportFixture.group_id, roles: ["GUARDIAN"] });
  mock.wards.mockResolvedValue({ wards: [], hasNext: false });
  render(await GroupReportsPage({ params, searchParams: Promise.resolve({ page: "-1" }) }));
  expect(screen.getByRole("alert").textContent).toContain("Revisa la página");
  expect(screen.getByText("No hay pupilos activos en esta página del grupo.")).toBeTruthy();
  expect(mock.wardHistory).not.toHaveBeenCalled();
  expect(mock.stats).not.toHaveBeenCalled();
});

it("un vínculo revocado por la RPC no renderiza métricas del pupilo", async () => {
  mock.group.mockResolvedValue({ id: reportFixture.group_id, roles: ["GUARDIAN"] });
  mock.stats.mockResolvedValue({ report: null, error: null });
  mock.wardHistory.mockRejectedValue(new Error("404"));
  await expect(GroupReportsPage({ params, searchParams: Promise.resolve({}) })).rejects.toThrow("404");
});

it("COACH ve reportes filtrados aun sin toggles y no recibe CTA de gestión", async () => {
  mock.group.mockResolvedValue({ id: reportFixture.group_id, name: "Equipo", roles: ["COACH"], can_view_group_stats: true });
  const report = structuredClone(reportFixture);
  report.has_activities = false; report.totals.convened = 0;
  mock.report.mockResolvedValue({ report, error: null });
  render(await GroupReportsPage({ params, searchParams: Promise.resolve({ period: "season" }) }));
  expect(mock.report).toHaveBeenCalledWith(reportFixture.group_id, expect.objectContaining({ period: "season" }));
  expect(screen.getByRole("region", { name: "Resumen por deportista" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Crear primera actividad" })).toBeNull();
  expect(mock.stats).not.toHaveBeenCalled();
});

it("prioriza el resumen y distingue promedio individual de total ponderado", async () => {
  const report = structuredClone(reportFixture);
  report.totals.average_attendance_pct = 75;
  mock.report.mockResolvedValue({ report, error: null });
  render(await GroupReportsPage({ params, searchParams: Promise.resolve({}) }));
  const summary = screen.getByRole("region", { name: "Resumen del reporte" });
  expect(summary.compareDocumentPosition(screen.getByRole("form", { name: "Filtros de asistencia" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(summary).getByText("Promedio individual").nextElementSibling?.textContent).toBe("75.0 %");
  expect(within(summary).getByText("Asistencia total ponderada").nextElementSibling?.textContent).toBe("85.7 %");
  const table = within(screen.getByRole("region", { name: "Resumen por deportista" })).getByRole("table");
  expect(table.querySelector("caption")?.textContent).toContain("página 1");
  expect(within(table).getAllByRole("columnheader").every((cell) => cell.getAttribute("scope") === "col")).toBe(true);
  expect(within(table).getAllByRole("rowheader").every((cell) => cell.getAttribute("scope") === "row")).toBe(true);
});

it("muestra filtros aplicados fuera del desplegable y conserva selección al cerrarlo", async () => {
  const type = { id: reportFixture.by_activity_type[0]!.activity_type_id, name: "COMPETITION", group_id: null, is_active: false };
  const filter = reportFilterSchema.parse({ period: "month", from: "2026-03-01", activity_type_ids: [type.id], include_inactive: true, sort: "name", page: 3 });
  render(<ReportFilters groupId={reportFixture.group_id} filter={filter} types={[type]} />);
  const form = screen.getByRole("form") as HTMLFormElement;
  const details = form.querySelector("details")!;
  expect(details.open).toBe(false);
  expect(form.querySelector("p")?.textContent).toContain("Competencia (inactivo)");
  expect(form.querySelector("p")?.textContent).toContain("Activos e inactivos · Nombre (A–Z)");
  const advanced = screen.getByText("Más filtros (4 activos)");
  const user = userEvent.setup();
  await user.click(advanced);
  expect(screen.getByRole("checkbox", { name: "Incluir deportistas inactivos" })).toBeTruthy();
  await user.click(advanced);
  const data = new FormData(form);
  expect(data.getAll("activity_type_id")).toEqual([type.id]);
  expect(data.get("include_inactive")).toBe("true");
  expect(data.get("from")).toBe("2026-03-01");
  expect(data.has("page")).toBe(false);
});

it("cambiar período desmonta fechas incompatibles y exige ambas solo en rango", () => {
  const filter = reportFilterSchema.parse({ period: "custom", from: "2026-03-01", to: "2026-03-31" });
  render(<ReportFilters groupId={reportFixture.group_id} filter={filter} types={[]} />);
  const form = screen.getByRole("form") as HTMLFormElement;
  const period = screen.getByRole("combobox", { name: "Período" });
  for (const value of ["month", "week", "season", "custom"]) {
    fireEvent.change(period, { target: { value } });
    const data = new FormData(form);
    expect(data.get("period")).toBe(value);
    expect(data.has("to")).toBe(value === "custom");
    expect(data.has("from")).toBe(value !== "season");
    for (const input of form.querySelectorAll<HTMLInputElement>('input[type="date"]')) expect(input.required).toBe(value === "custom");
  }
  expect(screen.getByRole("link", { name: "Restablecer filtros" }).getAttribute("href")).toBe(`/groups/${reportFixture.group_id}/reports`);
});
