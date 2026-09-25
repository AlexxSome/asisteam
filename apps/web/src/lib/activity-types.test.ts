import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mock = vi.hoisted(() => ({ group: vi.fn(), groups: vi.fn(), range: vi.fn(), eq: vi.fn(), or: vi.fn(), from: vi.fn(), select: vi.fn(), in: vi.fn(), order: vi.fn(), gte: vi.fn(), lt: vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group, getMyGroups: mock.groups }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("404"); }, redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mock.from }) }));
import { ACTIVITY_PAGE_SIZE, getActivities, getMyActivities, getActivityTypes, parseActivitySearch } from "./activities";
import GroupsPage from "@/app/groups/page";
import ActivitiesPage from "@/app/groups/[groupId]/activities/page";
const groupId = "29000000-0000-4000-8000-000000000201";
const otherGroupId = "29000000-0000-4000-8000-000000000202";
const groups = [{ id: groupId, name: "Equipo A", roles: ["ATHLETE"] }, { id: otherGroupId, name: "Equipo B", roles: ["ADMIN", "ATHLETE"] }];
const activity = { id: "29000000-0000-4000-8000-000000000301", group_id: groupId, title: "Entrenamiento de tenis",
  activity_type_name: "TRAINING", activity_type_color: "#123ABC", is_system_type: true,
  starts_at: "2026-01-15T22:00:00Z", ends_at: "2026-01-15T23:30:00Z", location: "Cancha central" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
  const query = { select: mock.select, eq: mock.eq, or: mock.or, in: mock.in, gte: mock.gte, lt: mock.lt, order: mock.order, range: mock.range };
  for (const method of [mock.select, mock.eq, mock.or, mock.in, mock.gte, mock.lt, mock.order, mock.from]) method.mockReturnValue(query);
  mock.group.mockResolvedValue(groups[0]);
  mock.groups.mockResolvedValue({ groups });
  mock.range.mockResolvedValue({ data: [], error: null });
});
afterEach(() => vi.useRealTimers());
it("selector pide solo activos del grupo y sistema", async () => {
  await getActivityTypes(groupId);
  expect(mock.group).toHaveBeenCalledWith(groupId);
  expect(mock.eq).toHaveBeenCalledWith("is_active", true);
  expect(mock.or).toHaveBeenCalledWith(`group_id.is.null,group_id.eq.${groupId}`);
});
it("gestión incluye inactivos y pagina más allá de cien filas", async () => {
  const page = Array.from({ length: 100 }, (_, n) => ({ id: `type-${n}`, name: `Tipo ${n}`, group_id: groupId, color: "#123ABC", is_active: false }));
  mock.range.mockResolvedValueOnce({ data: page, error: null }).mockResolvedValueOnce({ data: [{ ...page[0], id: "last" }], error: null });
  expect(await getActivityTypes(groupId, true)).toHaveLength(101);
  expect(mock.eq).not.toHaveBeenCalled();
  expect(mock.range.mock.calls).toEqual([[0, 99], [100, 199]]);
});

describe("agenda de actividades", () => {
  it("consulta solo la vista autorizada, ordena próximas cronológicamente y pagina todos los grupos juntos", async () => {
    const rows = Array.from({ length: ACTIVITY_PAGE_SIZE + 1 }, (_, n) => ({ ...activity, id: `activity-${n}`, group_id: n % 2 ? otherGroupId : groupId }));
    mock.range.mockResolvedValue({ data: rows, error: null });
    const result = await getMyActivities(2);
    expect(mock.from).toHaveBeenCalledWith("v_group_activities");
    expect(mock.select.mock.calls[0]?.[0]).not.toContain("*");
    expect(mock.in).toHaveBeenCalledWith("group_id", [groupId, otherGroupId]);
    expect(mock.gte).toHaveBeenCalledWith("starts_at", "2026-01-15T12:00:00.000Z");
    expect(mock.lt).not.toHaveBeenCalled();
    expect(mock.order.mock.calls).toEqual([["starts_at", { ascending: true }], ["id"]]);
    expect(mock.range).toHaveBeenCalledWith(50, 100);
    expect(result.activities).toHaveLength(50);
    expect(result.activities.slice(0, 2).map((item) => item.group_name)).toEqual(["Equipo A", "Equipo B"]);
    expect(result.hasNext).toBe(true);
  });

  it("muestra las pasadas desde la más reciente y conserva el límite de página", async () => {
    mock.range.mockResolvedValue({ data: Array.from({ length: 50 }, () => activity), error: null });
    const result = await getActivities(groupId, 1, "past");
    expect(mock.group).toHaveBeenCalledWith(groupId);
    expect(mock.in).toHaveBeenCalledWith("group_id", [groupId]);
    expect(mock.lt).toHaveBeenCalledWith("starts_at", "2026-01-15T12:00:00.000Z");
    expect(mock.gte).not.toHaveBeenCalled();
    expect(mock.order.mock.calls).toEqual([["starts_at", { ascending: false }], ["id"]]);
    expect(result.hasNext).toBe(false);
  });

  it("no consulta actividades sin grupos activos", async () => {
    mock.groups.mockResolvedValue({ groups: [] });
    expect(await getMyActivities()).toEqual({ activities: [], hasNext: false });
    expect(mock.from).not.toHaveBeenCalled();
    await expect(GroupsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/welcome");
  });

  it("un grupo no visible responde 404 antes de consultar actividades", async () => {
    mock.group.mockRejectedValue(new Error("404"));
    await expect(getActivities(otherGroupId)).rejects.toThrow("404");
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("propaga fallos de sesión y lectura sin mostrarlos como agenda vacía", async () => {
    mock.groups.mockRejectedValueOnce(new Error("redirect:/login"));
    await expect(getMyActivities()).rejects.toThrow("redirect:/login");
    expect(mock.from).not.toHaveBeenCalled();
    mock.range.mockResolvedValue({ data: null, error: { message: "private database detail" } });
    await expect(getMyActivities()).rejects.toThrow("No pudimos cargar las actividades");
  });

  it.each([{ page: "0" }, { page: "1.5" }, { page: "Infinity" }, { page: "1000001" }, { page: ["1", "2"] }, { period: "other" }, { period: ["past"] }])("rechaza parámetros inválidos %j", (params) => {
    expect(() => parseActivitySearch(params)).toThrow("404");
  });

  it("identifica grupos sin duplicar actividades por multi-rol y muestra tipo, color, lugar y hora chilena", async () => {
    mock.range.mockResolvedValue({ data: [activity, { ...activity, id: "second", group_id: otherGroupId, starts_at: "2026-07-15T22:00:00Z", ends_at: "2026-07-15T23:30:00Z" }], error: null });
    const html = renderToStaticMarkup(await GroupsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Mi agenda");
    expect(html).toContain(`/groups/${groupId}/activities/${activity.id}`);
    expect(html.match(new RegExp(`/groups/${otherGroupId}/activities/second`, "g"))).toHaveLength(1);
    expect(html).toContain("Equipo A"); expect(html).toContain("Equipo B");
    expect(html).toContain("Entrenamiento"); expect(html).toContain("#123ABC");
    expect(html).toContain("Cancha central"); expect(html).toContain("America/Santiago");
    expect(html).toContain("19:00"); expect(html).toContain("18:00");
    expect(html).not.toContain("Siguiente");
  });

  it("ambas agendas conservan el período al paginar y reinician la página al cambiarlo", async () => {
    mock.range.mockResolvedValue({ data: Array.from({ length: 51 }, (_, n) => ({ ...activity, id: `activity-${n}` })), error: null });
    const searchParams = Promise.resolve({ period: "past", page: "2" });
    const agendaHtml = renderToStaticMarkup(await GroupsPage({ searchParams }));
    expect(agendaHtml).toContain('/groups?period=past&amp;page=1#agenda');
    expect(agendaHtml).toContain('/groups?period=past&amp;page=3#agenda');
    expect(agendaHtml).toContain('href="/groups?period=upcoming#agenda"');
    const groupHtml = renderToStaticMarkup(await ActivitiesPage({ params: Promise.resolve({ groupId }), searchParams }));
    expect(groupHtml).toContain(`/groups/${groupId}/activities?period=past&amp;page=3`);
    expect(groupHtml).toContain('href="/groups#agenda"');
    expect(groupHtml).not.toContain("Crear actividad");
  });
});
