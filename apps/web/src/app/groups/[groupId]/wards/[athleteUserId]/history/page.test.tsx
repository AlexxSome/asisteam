// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { historyFixture } from "@/lib/attendance-history.test-fixture";
const mock = vi.hoisted(() => ({ group: vi.fn(), ward: vi.fn(), types: vi.fn(), history: vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@/lib/wards", () => ({ getWard: mock.ward }));
vi.mock("@/lib/activities", () => ({ getActivityTypes: mock.types }));
vi.mock("@/lib/attendance-history", async (original) => ({ ...await original<typeof import("@/lib/attendance-history")>(), getWardAttendanceHistory: mock.history }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); } }));
import WardHistoryPage from "./page";
const athleteUserId = "47000000-0000-4000-8000-000000000111";
const params = Promise.resolve({ groupId: historyFixture.group_id, athleteUserId });
beforeEach(() => {
  vi.resetAllMocks();
  mock.group.mockResolvedValue({ id: historyFixture.group_id, name: "Club del pupilo", roles: ["GUARDIAN"], can_view_group_stats: false });
  mock.ward.mockResolvedValue({ athlete_user_id: athleteUserId, full_name: "Pupilo sintético", groups: [{ group_id: historyFixture.group_id, membership_status: "ACTIVE" }] });
  mock.types.mockResolvedValue([{ id: historyFixture.records[0]!.activity_type_id, name: "TRAINING", group_id: null, is_active: true }]);
  mock.history.mockResolvedValue({ history: structuredClone(historyFixture), error: null });
});
afterEach(cleanup);
it("con toggles apagados muestra fecha, tipo, estado, nota y porcentaje del pupilo", async () => {
  render(await WardHistoryPage({ params, searchParams: Promise.resolve({}) }));
  const list = within(screen.getByRole("region", { name: "Actividades del historial del pupilo" }));
  expect(list.getByText("Presente")).toBeTruthy();
  expect(list.getByText("Entrenamiento")).toBeTruthy();
  expect(list.getByText(/Mi nota propia/)).toBeTruthy();
  expect(list.getByText(/(?:01-03-2026|1 mar 2026).*22:30/)).toBeTruthy();
  expect(screen.getByText("77.8 %")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Volver al perfil del pupilo" }).getAttribute("href")).toBe(`/wards/${athleteUserId}`);
  expect(screen.queryByRole("combobox", { name: "Ordenar por" })).toBeNull();
  expect(screen.queryByRole("checkbox", { name: "Incluir deportistas inactivos" })).toBeNull();
});
it.each(["week", "month", "custom", "season"])("período %s conserva pupilo, grupo y filtros al consultar, paginar y restablecer", async (period) => {
  mock.history.mockResolvedValue({ history: { ...historyFixture, page: 2, page_size: 2 }, error: null });
  render(await WardHistoryPage({ params, searchParams: Promise.resolve({ period, from: "2026-03-01", to: "2026-03-31", page: "2", activity_type_id: historyFixture.records[0]!.activity_type_id }) }));
  expect(mock.history).toHaveBeenCalledWith(historyFixture.group_id, athleteUserId, expect.objectContaining({ period, from: period === "season" ? undefined : "2026-03-01", to: period === "custom" ? "2026-03-31" : undefined, page: 2 }));
  const path = `/groups/${historyFixture.group_id}/wards/${athleteUserId}/history`;
  expect(screen.getByRole("button", { name: "Aplicar filtros" }).closest("form")?.getAttribute("action")).toBe(path);
  expect(screen.getByRole("link", { name: "Restablecer filtros" }).getAttribute("href")).toBe(path);
  const url = new URL(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")!, "https://example.test");
  expect(url.pathname).toBe(path); expect(url.searchParams.get("page")).toBe("3");
  expect(url.searchParams.get("period")).toBe(period);
  expect(url.searchParams.get("activity_type_id")).toBe(historyFixture.records[0]!.activity_type_id);
});
it("rechaza PENDING o grupo distinto y ADMIN sin GUARDIAN antes de cargar registros", async () => {
  for (const groups of [[{ group_id: historyFixture.group_id, membership_status: "PENDING" }], [{ group_id: "other", membership_status: "ACTIVE" }]]) {
    mock.ward.mockResolvedValue({ athlete_user_id: athleteUserId, groups });
    await expect(WardHistoryPage({ params, searchParams: Promise.resolve({}) })).rejects.toThrow("404");
  }
  mock.group.mockResolvedValue({ roles: ["ADMIN"] });
  await expect(WardHistoryPage({ params, searchParams: Promise.resolve({}) })).rejects.toThrow("404");
  expect(mock.history).not.toHaveBeenCalled();
});
it("filtro inválido no consulta un período distinto y vacío conserva identidad", async () => {
  const view = render(await WardHistoryPage({ params, searchParams: Promise.resolve({ period: "custom" }) }));
  expect(screen.getByRole("alert")).toBeTruthy(); expect(mock.history).not.toHaveBeenCalled();
  const history = structuredClone(historyFixture); history.records = [];
  history.totals = { convened: 0, present: 0, late: 0, absent: 0, excused: 0, attendance_pct: null, late_rate: null };
  mock.history.mockResolvedValue({ history, error: null });
  view.rerender(await WardHistoryPage({ params, searchParams: Promise.resolve({ period: "season" }) }));
  expect(screen.getByText("Tu pupilo aún no tiene actividades con asistencia registrada.")).toBeTruthy();
  expect(screen.getByText("Sin actividades en el período")).toBeTruthy();
  expect(screen.queryByText(/^\d+\.\d %$/)).toBeNull();
  expect(screen.getByRole("link", { name: "Ver toda la temporada" }).getAttribute("href")).toContain(`/wards/${athleteUserId}/history?period=season`);
});

it("muestra resumen e identidad antes de los filtros", async () => {
  render(await WardHistoryPage({ params, searchParams: Promise.resolve({}) }));
  const summary = screen.getByRole("region", { name: "Resumen de asistencia del pupilo" });
  const form = screen.getByRole("form", { name: "Filtros de asistencia" });
  expect(summary.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByRole("heading", { level: 1 }).nextElementSibling?.textContent).toContain("Pupilo sintético · Club del pupilo");
});
