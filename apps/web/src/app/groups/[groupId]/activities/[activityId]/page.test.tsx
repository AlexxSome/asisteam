import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ActivityPage from "./page";

const mock = vi.hoisted(() => ({ group: vi.fn(), activity: vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@/lib/activities", () => ({ getActivity: mock.activity }));
const groupId = "28000000-0000-4000-8000-000000000201";
const activityId = "28000000-0000-4000-8000-000000000501";
const ward = "28000000-0000-4000-8000-000000000301";
const params = Promise.resolve({ groupId, activityId });
beforeEach(() => {
  vi.clearAllMocks();
  mock.activity.mockResolvedValue({ title: "Entrenamiento", starts_at: "2026-10-06T21:30:00Z", ends_at: "2026-10-06T23:00:00Z",
    activity_type_name: "TRAINING", is_system_type: true, recurrence_rule: { freq: "WEEKLY", by_weekday: ["TU", "TH"], until: "2026-10-29" } });
});
describe("detalle de actividad por rol", () => {
  it("ofrece historial propio en multi-rol y conserva origen al editar", async () => {
    mock.group.mockResolvedValue({ roles: ["ADMIN", "ATHLETE"] });
    const html = renderToStaticMarkup(await ActivityPage({ params, searchParams: Promise.resolve({ from: "group", period: "past", page: "2" }) }));
    expect(html).toContain(`/groups/${groupId}/me/history`);
    expect(html).toContain(`/edit?from=group&amp;period=past&amp;page=2`);
    expect(html).toContain("martes, jueves, hasta el 29 de octubre de 2026");
    expect(html).toContain("Lugar por confirmar");
    expect(mock.activity).toHaveBeenCalledExactlyOnceWith(groupId, activityId);
    expect(mock.group).toHaveBeenCalledExactlyOnceWith(groupId);
  });
  it("enlaza el historial del pupilo de origen sin consultar ni mostrar datos de terceros", async () => {
    mock.group.mockResolvedValue({ roles: ["GUARDIAN"] });
    const html = renderToStaticMarkup(await ActivityPage({ params, searchParams: Promise.resolve({ from: "wards", ward, period: "past", page: "3" }) }));
    expect(html).toContain(`/groups/${groupId}/wards/${ward}/history`);
    expect(html).toContain(`/wards/${ward}?period=past&amp;page=3#agenda`);
    expect(html).not.toContain("Editar actividad");
    expect(html).not.toContain("Tomar asistencia");
    expect(html).not.toContain("/me/history");
    expect(mock.activity).toHaveBeenCalledTimes(1);
    expect(mock.group).toHaveBeenCalledTimes(1);
  });
  it.each([["GUARDIAN"], ["GUARDIAN", "ADMIN"]])("permite elegir pupilo en acceso directo para %j", async (...roles) => {
    mock.group.mockResolvedValue({ roles });
    const html = renderToStaticMarkup(await ActivityPage({ params, searchParams: Promise.resolve({ from: "wards", ward: "../someone" }) }));
    expect(html).toContain('href="/wards"');
    expect(html).not.toContain("../someone");
  });
  it("ADMIN sin rol deportista/apoderado no recibe enlaces a historiales personales", async () => {
    mock.group.mockResolvedValue({ roles: ["ADMIN"] });
    const html = renderToStaticMarkup(await ActivityPage({ params }));
    expect(html).not.toContain("Consultar asistencia");
    expect(html).not.toContain("/me/history");
    expect(html).not.toContain('href="/wards"');
  });
});
