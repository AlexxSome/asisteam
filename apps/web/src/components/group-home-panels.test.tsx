// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { attendanceMetrics, httpSchemas } from "@asisteam/core/browser";
import { GroupHomePanels } from "./group-home-panels";

const id = (n: number) => `17500000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const group = { id: id(1), name: "Club sintético" };
const metric = attendanceMetrics({ present: 6, late: 1, absent: 2, excused: 1 });
const emptyMetric = attendanceMetrics({ present: 0, late: 0, absent: 0, excused: 0 });
const period = { from: "2026-10-01", to: "2026-10-31", from_utc: "2026-10-01T03:00:00Z", until_utc: "2026-11-01T03:00:00Z" };
const activity = { id: id(2), group_id: group.id, activity_type_id: id(3), title: "Entrenamiento sintético", description: null, location: "Cancha sintética", starts_at: "2026-10-12T12:00:00Z", ends_at: "2026-10-12T14:00:00Z", activity_type_name: "TRAINING", activity_type_color: "#2563eb", is_system_type: true, recurrence_rule: null, recurrence_source_id: null };
const ward = (n: number) => ({ athlete_user_id: id(n), full_name: `Pupilo sintético ${n}`, monthly: n === 4 ? metric : emptyMetric, selected_record: n === 4 ? { id: id(20), status: "LATE" as const, note: "Nota de mi pupilo" } : null });
function dashboard(roles: string[], aggregate = false) {
  const admin = roles.includes("ADMIN"), operator = admin || roles.includes("COACH");
  return httpSchemas.GroupDashboard.parse({
    group_id: group.id, now: "2026-10-12T13:00:00Z", access: admin ? "admin" : operator ? "coach" : "member",
    periods: { month: period, week: { ...period, from: "2026-10-12", to: "2026-10-18" }, timezone: "America/Santiago" },
    indicators: operator || aggregate ? { active_athletes: 51, week_activities: 3, monthly: metric } : null,
    pending: admin ? 2 : null, guardian_tasks: roles.includes("GUARDIAN") ? { consents: 1, activations: 2 } : null,
    latest_announcement: null, upcoming: [activity], previous: null, today: { data: [activity], page: 1, total: 1 }, selected_activity: activity, selected_activity_id: activity.id,
    context: operator ? { activity_id: activity.id, phase: "started", active_athletes: 51, recorded: 10, unmarked: 41, counts: metric, records: admin ? { data: [], total: 0, page: 1 } : null } : null,
    personal: roles.includes("ATHLETE") ? { monthly: metric, selected_record: { id: id(21), status: "PRESENT", note: "Nota propia" } } : null,
    wards: roles.includes("GUARDIAN") ? { data: [ward(4), ward(5)], total: 2, page: 1 } : null,
  });
}
function mount(data: ReturnType<typeof dashboard>, currentGroup = group) {
  return render(<MemoryRouter initialEntries={[`/groups/${currentGroup.id}`]}><GroupHomePanels group={currentGroup} dashboard={data} /></MemoryRouter>);
}
afterEach(cleanup);

describe("UI-05 permisos y composición", () => {
  for (const roles of [["ADMIN"], ["COACH"], ["ATHLETE"], ["GUARDIAN"], ["ADMIN", "ATHLETE"], ["ATHLETE", "GUARDIAN"]]) {
    it(`conserva la unión de secciones autorizadas para ${roles.join("+")}`, () => {
      mount(dashboard(roles));
      expect(!!screen.queryByRole("region", { name: "Mi asistencia" })).toBe(roles.includes("ATHLETE"));
      expect(!!screen.queryByRole("region", { name: "Mis pupilos" })).toBe(roles.includes("GUARDIAN"));
      expect(!!screen.queryByRole("region", { name: "Resumen de la actividad" })).toBe(roles.includes("ADMIN") || roles.includes("COACH"));
      expect(!!screen.queryByRole("link", { name: "Tomar asistencia" })).toBe(roles.includes("ADMIN") || roles.includes("COACH"));
      expect(screen.queryByRole("table")).toBeNull();
      expect(screen.queryByRole("button", { name: /nota|desmarcar|aprobar/i })).toBeNull();
      if (roles.includes("ATHLETE")) expect(screen.getByRole("link", { name: "Ver mi historial de asistencia" }).getAttribute("href")).toBe(`/groups/${group.id}/me/history?period=month`);
    });
  }
  for (const roles of [["ATHLETE"], ["GUARDIAN"], ["ATHLETE", "GUARDIAN"]]) it(`toggle no condiciona datos propios/pupilos de ${roles.join("+")}`, () => {
    mount(dashboard(roles));
    expect(screen.queryByRole("region", { name: "Resumen del grupo" })).toBeNull();
    cleanup(); mount(dashboard(roles, true));
    expect(screen.getByRole("region", { name: "Resumen del grupo" }).textContent).toContain("77.8 %");
    expect(screen.queryByRole("region", { name: "Resumen de la actividad" })).toBeNull();
  });
  it("selector de pupilo conserva identidad, métrica null y enlace del mismo grupo", async () => {
    mount(dashboard(["GUARDIAN"]));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Seleccionar pupilo" }), id(5));
    const panel = screen.getByRole("region", { name: "Mis pupilos" });
    expect(within(panel).getByRole("heading", { name: "Pupilo sintético 5" })).toBeTruthy();
    expect(panel.textContent).toContain("Sin datos");
    expect(panel.textContent).not.toContain("Nota de mi pupilo");
    expect(within(panel).getByRole("link", { name: "Ver historial de Pupilo sintético 5 en Club sintético" }).getAttribute("href")).toBe(`/groups/${group.id}/wards/${id(5)}/history?period=month`);
    expect(panel.textContent).toContain("Una solicitud PENDING aún no habilita asistencia");
  });
  it("revocación y cambio de grupo eliminan la selección previa", async () => {
    let data = dashboard(["GUARDIAN"]), currentGroup = group;
    const { rerender } = mount(data);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Seleccionar pupilo" }), id(5));
    data = { ...data, wards: { data: [ward(4)], page: 1, total: 1 } };
    rerender(<MemoryRouter><GroupHomePanels group={currentGroup} dashboard={data} /></MemoryRouter>);
    expect(screen.queryByRole("heading", { name: "Pupilo sintético 5" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Pupilo sintético 4" })).toBeTruthy();
    currentGroup = { id: id(9), name: "Otro grupo" }; data = { ...data, group_id: currentGroup.id, wards: { data: [], page: 1, total: 0 } };
    rerender(<MemoryRouter><GroupHomePanels group={currentGroup} dashboard={data} /></MemoryRouter>);
    expect(screen.queryByRole("heading", { name: "Pupilo sintético 4" })).toBeNull();
    expect(screen.getByRole("region", { name: "Mis pupilos" }).textContent).toContain("Grupo: Otro grupo");
  });
  it("paginación acotada preserva actividad y página del día", () => {
    const data = dashboard(["GUARDIAN"]);
    data.wards = { data: [ward(4)], total: 5, page: 2 }; data.today.page = 3;
    mount(data);
    expect(screen.getByRole("link", { name: "Pupilos anteriores" }).getAttribute("href")).toBe(`/groups/${group.id}?wards_page=1&activity_id=${activity.id}&day_page=3`);
    expect(screen.getByRole("region", { name: "Mis pupilos" }).textContent).toContain("Mostrando 1 de 5");
  });
  it("futuro no afirma porcentaje realizado y COACH carece de notas y desmarcado", () => {
    const data = dashboard(["COACH"]); data.context!.phase = "preparation"; data.context!.counts.attendance_pct = null; data.context!.counts.late_rate = null;
    mount(data);
    const panel = screen.getByRole("region", { name: "Resumen de la actividad" });
    expect(panel.textContent).toContain("No hay porcentaje realizado");
    expect(panel.textContent).not.toContain("77.8 %");
    expect(panel.textContent).toContain("Sin marcar: 41");
    expect(screen.getByRole("link", { name: "Abrir asistencia de Entrenamiento sintético" }).getAttribute("href")).toBe(`/groups/${group.id}/activities/${activity.id}/attendance`);
  });
  it("grupo vacío ofrece una sola acción de agenda sin inventar actividad", () => {
    const data = dashboard(["ATHLETE"]);
    data.upcoming = []; data.selected_activity = null; data.selected_activity_id = null;
    data.today = { data: [], total: 0, page: 1 };
    mount(data);
    expect(screen.getAllByRole("link", { name: "Ver agenda del grupo" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Tomar asistencia" })).toBeNull();
    expect(screen.getByText("Aún no hay actividades")).toBeTruthy();
  });
});
