import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PassThrough } from "node:stream";
import { createElement, type ReactNode } from "react";
import { renderToPipeableStream, renderToStaticMarkup } from "react-dom/server";
const mock = vi.hoisted(() => ({ group: vi.fn(), groups: vi.fn(), listActivityTypes: vi.fn(), listActivities: vi.fn(), listGroupActivities: vi.fn(), getHomeActivities: vi.fn() }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group, getMyGroups: mock.groups }));
vi.mock("@/lib/api/server", () => ({ createServerApiClient: () => mock }));
vi.mock("next/navigation", () => ({ usePathname: () => "/groups", notFound: () => { throw new Error("404"); }, redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { ACTIVITY_PAGE_SIZE, getActivities, getMyActivities, getActivityTypes, parseActivitySearch, getHomeActivities, homeActivityLabel } from "@/lib/activities";
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
  mock.group.mockResolvedValue(groups[0]);
  mock.groups.mockResolvedValue({ groups });
  mock.listActivityTypes.mockResolvedValue({ data: [], hasNext: false });
  mock.listActivities.mockResolvedValue({ activities: [], hasNext: false });
  mock.listGroupActivities.mockResolvedValue({ activities: [], hasNext: false });
  mock.getHomeActivities.mockResolvedValue({ next: null, previous: null, now: "2026-01-15T12:00:00.000Z" });

});
afterEach(() => vi.useRealTimers());
it("selector pide solo activos del grupo y sistema", async () => {
  await getActivityTypes(groupId);
  expect(mock.group).toHaveBeenCalledWith(groupId);
  expect(mock.listActivityTypes).toHaveBeenCalledWith({ params: { groupId }, query: { page: 1, include_inactive: false } });
});
it("gestión incluye inactivos y pagina más allá de cien filas", async () => {
  const page = Array.from({ length: 100 }, (_, n) => ({ id: `type-${n}`, name: `Tipo ${n}`, group_id: groupId, color: "#123ABC", is_active: false }));
  mock.listActivityTypes.mockResolvedValueOnce({ data: page, hasNext: true }).mockResolvedValueOnce({ data: [{ ...page[0], id: "last" }], hasNext: false });
  expect(await getActivityTypes(groupId, true)).toHaveLength(101);
  expect(mock.listActivityTypes.mock.calls).toEqual([[{ params: { groupId }, query: { page: 1, include_inactive: true } }], [{ params: { groupId }, query: { page: 2, include_inactive: true } }]]);
});

describe("agenda de actividades", () => {
  it("consulta solo la vista autorizada, ordena próximas cronológicamente y pagina todos los grupos juntos", async () => {
    const rows = Array.from({ length: ACTIVITY_PAGE_SIZE + 1 }, (_, n) => ({ ...activity, id: `activity-${n}`, group_id: n % 2 ? otherGroupId : groupId }));
    mock.listActivities.mockResolvedValue({ activities: rows.slice(0, 50), hasNext: rows.length > 50 });
    const result = await getMyActivities(2);
    expect(mock.listActivities).toHaveBeenCalledWith({ query: { group_ids: `${groupId},${otherGroupId}`, page: 2, period: "upcoming" } });
    expect(result.activities).toHaveLength(50);
    expect(result.activities.slice(0, 2).map((item) => item.group_name)).toEqual(["Equipo A", "Equipo B"]);
    expect(result.hasNext).toBe(true);
  });

  it("muestra las pasadas desde la más reciente y conserva el límite de página", async () => {
    mock.listGroupActivities.mockResolvedValue({ activities: Array.from({ length: 50 }, () => activity), hasNext: false });
    const result = await getActivities(groupId, 1, "past");
    expect(mock.group).toHaveBeenCalledWith(groupId);
    expect(mock.listGroupActivities).toHaveBeenCalledWith({ params: { groupId }, query: { page: 1, period: "past" } });
    expect(result.hasNext).toBe(false);
  });

  it("no consulta actividades sin grupos activos", async () => {
    mock.groups.mockResolvedValue({ groups: [] });
    expect(await getMyActivities()).toEqual({ activities: [], hasNext: false });
    expect(mock.listActivities).not.toHaveBeenCalled();
    expect(mock.listGroupActivities).not.toHaveBeenCalled();
    await expect(GroupsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/welcome");
  });

  it("un grupo no visible responde 404 antes de consultar actividades", async () => {
    mock.group.mockRejectedValue(new Error("404"));
    await expect(getActivities(otherGroupId)).rejects.toThrow("404");
    expect(mock.listActivities).not.toHaveBeenCalled();
    expect(mock.listGroupActivities).not.toHaveBeenCalled();
  });

  it("propaga fallos de sesión y lectura sin mostrarlos como agenda vacía", async () => {
    mock.groups.mockRejectedValueOnce(new Error("redirect:/login"));
    await expect(getMyActivities()).rejects.toThrow("redirect:/login");
    expect(mock.listActivities).not.toHaveBeenCalled();
    expect(mock.listGroupActivities).not.toHaveBeenCalled();
    mock.listActivities.mockRejectedValue(new Error("private database detail"));
    await expect(getMyActivities()).rejects.toThrow("No pudimos cargar las actividades");
  });

  it.each([{ page: "0" }, { page: "1.5" }, { page: "Infinity" }, { page: "1000001" }, { page: ["1", "2"] }, { period: "other" }, { period: ["past"] }])("rechaza parámetros inválidos %j", (params) => {
    expect(() => parseActivitySearch(params)).toThrow("404");
  });

  it("identifica grupos sin duplicar actividades por multi-rol y muestra tipo, color, lugar y hora chilena", async () => {
    mock.listActivities.mockResolvedValue({ activities: [activity, { ...activity, id: "second", group_id: otherGroupId, starts_at: "2026-07-15T22:00:00Z", ends_at: "2026-07-15T23:30:00Z" }], hasNext: false });
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
    mock.listActivities.mockResolvedValue({ activities: Array.from({ length: 50 }, (_, n) => ({ ...activity, id: `activity-${n}` })), hasNext: true });
    mock.listGroupActivities.mockResolvedValue({ activities: Array.from({ length: 50 }, (_, n) => ({ ...activity, id: `activity-${n}` })), hasNext: true });
    const searchParams = Promise.resolve({ period: "past", page: "2" });
    const agendaHtml = renderToStaticMarkup(await GroupsPage({ searchParams }));
    expect(agendaHtml).toContain('/groups?period=past&amp;page=1#agenda');
    expect(agendaHtml).toContain('/groups?period=past&amp;page=3#agenda');
    expect(agendaHtml).toContain('href="/groups?period=upcoming#agenda"');
    const groupHtml = await streamedHtml(await ActivitiesPage({ params: Promise.resolve({ groupId }), searchParams }));
    expect(groupHtml).toContain(`/groups/${groupId}/activities?period=past&amp;page=3`);
    expect(groupHtml).toContain('href="/groups#agenda"');
    expect(groupHtml).not.toContain("Crear actividad");
  });

  it("agrupa una sola vez por día chileno incluso cuando UTC cruza medianoche", async () => {
    mock.listActivities.mockResolvedValue({ activities: [activity, { ...activity, id: "night", starts_at: "2026-01-16T02:00:00Z", ends_at: "2026-01-16T04:00:00Z", location: null }], hasNext: false });
    const html = renderToStaticMarkup(await GroupsPage({ searchParams: Promise.resolve({}) }));
    expect(html.match(/<h3 /g)).toHaveLength(1);
    expect(html).toContain("jueves, 15 de enero de 2026");
    expect(html).toContain("viernes, 16 de enero de 2026");
    expect(html).toContain("23:00");
    expect(html).toContain("Lugar por confirmar");
    expect(html).toContain('aria-current="page" class="inline-flex min-h-11');
  });
});

async function streamedHtml(node: ReactNode) {
  return new Promise<string>((resolve, reject) => {
    let html = "";
    const output = new PassThrough();
    output.on("data", chunk => { html += chunk.toString(); });
    output.on("end", () => resolve(html));
    const stream = renderToPipeableStream(node, { onAllReady() { stream.pipe(output); }, onError: reject });
  });
}
it.each(["ATHLETE", "GUARDIAN", "COACH"])("vacío de actividades para %s no ofrece crear", async role => {
  mock.group.mockResolvedValue({ ...groups[0], roles: [role] });
  const html = await streamedHtml(await ActivitiesPage({ params: Promise.resolve({ groupId }), searchParams: Promise.resolve({ period: "past" }) }));
  expect(html).toContain("No hay actividades pasadas");
  expect(html).toContain("Ver próximas actividades");
  expect(html).not.toContain("Crear actividad");
});
it("una página vacía conserva período y ofrece volver a la primera", async () => {
  const html = await streamedHtml(await ActivitiesPage({ params: Promise.resolve({ groupId }), searchParams: Promise.resolve({ period: "past", page: "9" }) }));
  expect(html).toContain("No hay actividades en esta página");
  expect(html).toContain("Volver a la primera página");
  expect(html).toContain(`/groups/${groupId}/activities?period=past`);
});
it("valida acceso y parámetros antes de crear el límite de carga", async () => {
  await expect(ActivitiesPage({ params: Promise.resolve({ groupId }), searchParams: Promise.resolve({ period: "invalid" }) })).rejects.toThrow("404");
  expect(mock.listActivities).not.toHaveBeenCalled();
    expect(mock.listGroupActivities).not.toHaveBeenCalled();
  mock.group.mockRejectedValue(new Error("404"));
  await expect(ActivitiesPage({ params: Promise.resolve({ groupId }), searchParams: Promise.resolve({}) })).rejects.toThrow("404");
  expect(mock.listActivities).not.toHaveBeenCalled();
    expect(mock.listGroupActivities).not.toHaveBeenCalled();
});
it("streaming anuncia carga real y luego entrega la lista sin datos ficticios", async () => {
  vi.useRealTimers();
  let finish!: (value: unknown) => void;
  mock.listGroupActivities.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const node = await ActivitiesPage({ params: Promise.resolve({ groupId }), searchParams: Promise.resolve({}) });
  const output = new PassThrough();
  let html = "";
  let shellReady!: () => void;
  const ready = new Promise<void>(resolve => { shellReady = resolve; });
  const complete = new Promise<void>((resolve, reject) => { output.on("end", resolve); output.on("error", reject); });
  output.on("data", chunk => { html += chunk.toString(); shellReady(); });
  const stream = renderToPipeableStream(createElement("main", null, node), { onShellReady() { stream.pipe(output); } });
  await ready;
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain("Cargando actividades…");
  expect(html).not.toContain(activity.title);
  finish({ activities: [activity], hasNext: false });
  await complete;
  expect(html).toContain(activity.title);
});


describe("lecturas acotadas del inicio", () => {
  it("incluye una actividad en curso, separa la última terminada y proyecta columnas mínimas", async () => {
    mock.getHomeActivities.mockResolvedValue({ next: activity, previous: { ...activity, id: "previous" }, now: "2026-01-15T12:00:00.000Z" });
    const result = await getHomeActivities(groupId);
    expect(result.next?.id).toBe(activity.id);
    expect(result.previous?.id).toBe("previous");
    expect(mock.group).toHaveBeenCalledWith(groupId);
    expect(mock.getHomeActivities).toHaveBeenCalledWith({ query: { group_ids: groupId } });
  });
  it("rechaza el grupo ajeno antes de consultar y no disfraza errores como vacío", async () => {
    mock.group.mockRejectedValueOnce(new Error("404"));
    await expect(getHomeActivities(otherGroupId)).rejects.toThrow("404");
    expect(mock.listActivities).not.toHaveBeenCalled();
    expect(mock.listGroupActivities).not.toHaveBeenCalled();
    mock.getHomeActivities.mockRejectedValue(new Error("private"));
    await expect(getHomeActivities(groupId)).rejects.toThrow("No pudimos cargar las actividades");
  });
  it.each([
    ["2026-01-15T01:00:00Z", "2026-01-15T02:00:00Z", "2026-01-15T00:00:00Z", "Hoy"],
    ["2026-01-15T04:00:00Z", "2026-01-15T05:00:00Z", "2026-01-15T00:00:00Z", "Próxima"],
    ["2026-07-15T03:00:00Z", "2026-07-15T03:30:00Z", "2026-07-15T02:00:00Z", "Hoy"],
    ["2026-01-15T01:00:00Z", "2026-01-15T02:00:00Z", "2026-01-15T01:30:00Z", "En curso"],
    ["2026-01-15T01:00:00Z", "2026-01-15T02:00:00Z", "2026-01-15T02:30:00Z", "Anterior de hoy"],
    ["2026-01-15T01:00:00Z", "2026-01-15T02:00:00Z", "2026-01-15T04:00:00Z", "Anterior"],
  ])("clasifica en hora chilena %s", (starts_at, ends_at, now, label) => {
    expect(homeActivityLabel({ starts_at, ends_at }, now)).toBe(label);
  });
});
