// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { historyFixture } from "@/lib/attendance-history.test-fixture";
const mock = vi.hoisted(() => ({ group: vi.fn(), types: vi.fn(), history: vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@/lib/activities", () => ({ getActivityTypes: mock.types }));
vi.mock("@/lib/attendance-history", async (original) => ({ ...await original<typeof import("@/lib/attendance-history")>(), getMyAttendanceHistory: mock.history }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); } }));
import MyHistoryPage from "./page";
const params = Promise.resolve({ groupId: historyFixture.group_id });
beforeEach(() => {
  vi.resetAllMocks(); mock.group.mockResolvedValue({ id: historyFixture.group_id, name: "Mi equipo", roles: ["ATHLETE", "ADMIN"] });
  mock.types.mockResolvedValue([{ id: historyFixture.records[0]!.activity_type_id, name: "TRAINING", group_id: null, is_active: true }]);
  mock.history.mockResolvedValue({ history: structuredClone(historyFixture), error: null });
});
afterEach(cleanup);
it("presenta registro propio, fecha chilena, nota, estado y métricas completas", async () => {
  render(await MyHistoryPage({ params, searchParams: Promise.resolve({}) }));
  const list = within(screen.getByRole("region", { name: "Actividades de mi historial" }));
  expect(list.getByText(/Mi nota propia/)).toBeTruthy(); expect(list.getByText("Presente")).toBeTruthy();
  expect(list.getByText("Entrenamiento")).toBeTruthy(); expect(list.getByText(/(?:01-03-2026|1 mar 2026).*22:30/)).toBeTruthy();
  expect(list.getByRole("link", { name: "Entrenamiento de prueba" }).getAttribute("href")).toBe(`/groups/${historyFixture.group_id}/activities/${historyFixture.records[0]!.activity_id}`);
  expect(screen.getByText("77.8 %")).toBeTruthy(); expect(screen.getByText("14.3 %")).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Período" })).toBeTruthy();
  expect(screen.queryByRole("combobox", { name: "Ordenar por" })).toBeNull();
  expect(screen.queryByRole("checkbox", { name: "Incluir deportistas inactivos" })).toBeNull();
  expect(screen.getByRole("button", { name: "Aplicar filtros" }).closest("form")?.getAttribute("action")).toBe(`/groups/${historyFixture.group_id}/me/history`);
});
it.each([{ roles: ["ATHLETE"] }, { roles: ["ATHLETE", "ADMIN"] }])("muestra 100.0 % con justificados y la puntualidad aparte para $roles", async ({ roles }) => {
  const history = structuredClone(historyFixture);
  history.totals = { convened: 10, present: 7, late: 1, absent: 0, excused: 2, attendance_pct: 100, late_rate: 12.5 };
  mock.group.mockResolvedValue({ id: history.group_id, name: "Mi equipo", roles });
  mock.history.mockResolvedValue({ history, error: null });
  render(await MyHistoryPage({ params, searchParams: Promise.resolve({}) }));
  const summary = within(screen.getByRole("region", { name: "Resumen de mi asistencia" }));
  expect(summary.getByText("100.0 %")).toBeTruthy();
  for (const [label, value] of [["Convocadas", "10"], ["Presente", "7"], ["Atrasado", "1"], ["Ausente", "0"], ["Justificado", "2"], ["Tasa de atrasos", "12.5 %"]] as const) {
    expect(summary.getByText(label).nextElementSibling?.textContent).toBe(value);
  }
});
it("filtros aplicados llegan a la consulta y paginación conserva selección", async () => {
  const history = { ...historyFixture, page: 2, page_size: 2 };
  mock.history.mockResolvedValue({ history, error: null });
  render(await MyHistoryPage({ params, searchParams: Promise.resolve({ period: "custom", from: "2026-03-01", to: "2026-03-31", activity_type_id: historyFixture.records[0]!.activity_type_id, page: "2" }) }));
  expect(mock.history).toHaveBeenCalledWith(historyFixture.group_id, expect.objectContaining({ period: "custom", from: "2026-03-01", to: "2026-03-31", page: 2 }));
  expect(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")).toContain("page=3");
  expect(screen.getByRole("link", { name: "Anterior" }).getAttribute("href")).toContain("activity_type_id=");
  expect(within(screen.getByRole("region", { name: "Resumen de mi asistencia" })).getByText("77.8 %")).toBeTruthy();
});
it("filtros inválidos no consultan otro período silenciosamente", async () => {
  render(await MyHistoryPage({ params, searchParams: Promise.resolve({ period: "custom" }) }));
  expect(screen.getByRole("alert").textContent).toContain("Revisa"); expect(mock.history).not.toHaveBeenCalled();
  expect(screen.queryByRole("region", { name: "Resumen de mi asistencia" })).toBeNull();
});
it.each(["week", "month", "custom", "season"])("sin convocatorias muestra el mensaje del período %s en lugar de un porcentaje", async (period) => {
  const history = structuredClone(historyFixture);
  history.records = []; history.totals = { convened: 0, present: 0, late: 0, absent: 0, excused: 0, attendance_pct: null, late_rate: null };
  mock.history.mockResolvedValue({ history, error: null });
  render(await MyHistoryPage({ params, searchParams: Promise.resolve({ period, from: "2026-03-01", to: "2026-03-31" }) }));
  expect(within(screen.getByRole("region", { name: "Resumen de mi asistencia" })).getByText("Sin actividades en el período")).toBeTruthy();
  expect(screen.getAllByText("Sin datos")).toHaveLength(1);
  expect(screen.queryByText(/^\d+\.\d %$/)).toBeNull();
  expect(screen.getByRole("link", { name: "Ver toda la temporada" })).toBeTruthy();
});
it("todas las convocatorias justificadas conservan el historial y muestran Sin datos", async () => {
  const history = structuredClone(historyFixture);
  history.records[0]!.status = "EXCUSED";
  history.totals = { convened: 1, present: 0, late: 0, absent: 0, excused: 1, attendance_pct: null, late_rate: null };
  mock.history.mockResolvedValue({ history, error: null });
  render(await MyHistoryPage({ params, searchParams: Promise.resolve({}) }));
  const summary = within(screen.getByRole("region", { name: "Resumen de mi asistencia" }));
  expect(summary.getAllByText("Sin datos")).toHaveLength(2);
  expect(summary.getByText("Justificado").nextElementSibling?.textContent).toBe("1");
  expect(screen.queryByText("Sin actividades en el período")).toBeNull();
  expect(screen.queryByText(/^\d+\.\d %$/)).toBeNull();
  expect(within(screen.getByRole("region", { name: "Actividades de mi historial" })).getByText("Justificado")).toBeTruthy();
});
it("solo ATHLETE accede, incluido multirol; ADMIN puro no lista terceros", async () => {
  mock.group.mockResolvedValue({ id: historyFixture.group_id, roles: ["ADMIN"] });
  await expect(MyHistoryPage({ params, searchParams: Promise.resolve({}) })).rejects.toThrow("404");
  expect(mock.history).not.toHaveBeenCalled();
});
