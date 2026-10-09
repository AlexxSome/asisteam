// Historical Supabase origin regression; not evidence of current native runtime.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mock = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), wardsRange: vi.fn(), groupsRange: vi.fn(), maybeSingle: vi.fn(),
  activitiesRange: vi.fn(), activityLimit: vi.fn(), activitySelect: vi.fn(), activityGroups: vi.fn(), order: vi.fn(), gte: vi.fn(), lt: vi.fn(), home: vi.fn(), history: vi.fn(), group: vi.fn(), rpc: vi.fn(), taskSelect: vi.fn(), taskLimit: vi.fn(), onboarding: vi.fn() }));
vi.mock("@legacy/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser }, from: mock.from, rpc: mock.rpc }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/wards", redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("404"); } }));
vi.mock("@legacy/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@legacy/lib/activities", async original => ({ ...await original<typeof import("@legacy/lib/activities")>(), getWardHomeActivities: mock.home }));
vi.mock("@legacy/lib/attendance-history", () => ({ getWardAttendanceHistory: mock.history }));
import { historyFixture } from "@/lib/attendance-history.test-fixture";
import { getGroupWards, getMyWards, getWard, parseWardsPage, getGuardianTasks } from "@legacy/lib/wards";
import { getWardActivities } from "@legacy/lib/activities";
import WardsPage from "@legacy/app/wards/page";
import WardPage from "@legacy/app/wards/[athleteUserId]/page";

const id = "46000000-0000-4000-8000-000000000111";
const ward = { athlete_user_id: id, full_name: "Pupilo sintético", age: 17, days_until_majority: 1, avatar_url: null };
const groups = [
  { athlete_user_id: id, group_id: "46000000-0000-4000-8000-000000000201", name: "Club de tenis", sport: "Tenis", membership_status: "ACTIVE" },
  { athlete_user_id: id, group_id: "46000000-0000-4000-8000-000000000202", name: "Club de fútbol", sport: "Fútbol", membership_status: "PENDING" },
];
const activity = { id: "48000000-0000-4000-8000-000000000301", group_id: groups[0]!.group_id, title: "Práctica de tenis",
  activity_type_name: "TRAINING", activity_type_color: "#123ABC", is_system_type: true,
  starts_at: "2026-01-15T22:00:00Z", ends_at: "2026-01-15T23:30:00Z", location: "Cancha central" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-15T12:00:00Z"));
  mock.home.mockResolvedValue({ next: activity, previous: null, now: "2026-01-15T12:00:00Z" });
  mock.history.mockResolvedValue({ history: historyFixture, error: null });
  mock.group.mockImplementation(async id => ({ id, roles: ["GUARDIAN"] }));
  mock.taskLimit.mockResolvedValue({ data: [], error: null });
  mock.taskSelect.mockReturnValue({ limit: mock.taskLimit });
  mock.onboarding.mockResolvedValue({ data: [], error: null });
  mock.rpc.mockImplementation(name => name === "list_membership_onboarding" ? mock.onboarding() : { select: mock.taskSelect });
  mock.getUser.mockResolvedValue({ data: { user: { id: "guardian-auth" } } });
  mock.wardsRange.mockResolvedValue({ data: [ward], error: null });
  mock.groupsRange.mockResolvedValue({ data: groups, error: null });
  mock.maybeSingle.mockResolvedValue({ data: ward, error: null });
  mock.activitiesRange.mockResolvedValue({ data: [activity], error: null });
  mock.activityLimit.mockResolvedValue({ data: [activity], error: null });
  const activityQuery = { select: mock.activitySelect, in: mock.activityGroups, order: mock.order,
    gte: mock.gte, lt: mock.lt, range: mock.activitiesRange, limit: mock.activityLimit };
  for (const method of [mock.activitySelect, mock.activityGroups, mock.order, mock.gte, mock.lt]) method.mockReturnValue(activityQuery);
  mock.from.mockImplementation((table: string) => {
    if (table === "v_group_activities") return activityQuery;
    const query = { select: () => query, order: () => query, eq: () => query, in: () => query,
      maybeSingle: mock.maybeSingle, range: table === "v_my_wards" ? mock.wardsRange : mock.groupsRange };
    return query;
  });
});
afterEach(() => vi.useRealTimers());

describe("Mis pupilos y perfil deportivo", () => {
  it("requiere sesión antes de leer y devuelve 404 para detalle sin sesión", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    await expect(getMyWards()).rejects.toThrow("redirect:/login");
    await expect(getWard(id)).rejects.toThrow("404");
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("solo lee las dos proyecciones autorizadas y agrupa cada pupilo una vez", async () => {
    expect(await getMyWards()).toEqual({ wards: [{ ...ward, groups }], hasNext: false });
    expect(mock.from.mock.calls).toEqual([["v_my_wards"], ["v_my_ward_groups"]]);
    expect(mock.wardsRange).toHaveBeenCalledWith(0, 50);
  });
  it("renderiza nombre, grupos, vínculo de perfil y aviso previo a cumplir 18", async () => {
    const html = renderToStaticMarkup(await WardsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Mis pupilos");
    expect(html).toContain(`href="/wards/${id}"`);
    expect(html).toContain(`href="/wards/${id}#agenda"`);
    expect(html).toContain("Club de tenis");
    expect(html).toContain("Club de fútbol");
    expect(html).toContain("Pendiente de activación");
    expect(html).toContain("En 1 día tu pupilo administrará su propia cuenta");
    expect(html).not.toContain("@example.test");
  });
  it("perfil ofrece los grupos del pupilo y regreso a la lista", async () => {
    const html = renderToStaticMarkup(await WardPage({ params: Promise.resolve({ athleteUserId: id }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("Perfil deportivo");
    expect(html).toContain("Pupilo sintético");
    expect(html).toContain("17 años");
    expect(html).toContain(`href="/groups/${groups[0]!.group_id}"`);
    expect(html).toContain(`href="/groups/${groups[0]!.group_id}/wards/${id}/history"`);
    expect(html).not.toContain(`/groups/${groups[1]!.group_id}/wards/${id}/history`);
    expect(html).toContain('href="/wards"');
  });
  it("sin vínculos presenta el estado vacío canónico", async () => {
    mock.wardsRange.mockResolvedValue({ data: [], error: null });
    const html = renderToStaticMarkup(await WardsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Aún no tienes deportistas a tu cargo; pide al administrador del grupo que te vincule");
    expect(mock.groupsRange).not.toHaveBeenCalled();
  });
  it("oculto, adulto o inexistente retorna 404; ID inválido no consulta", async () => {
    await expect(getWard("invalid")).rejects.toThrow("404");
    expect(mock.from).not.toHaveBeenCalled();
    mock.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getWard(id)).rejects.toThrow("404");
    expect(mock.groupsRange).not.toHaveBeenCalled();
  });
  it("si el vínculo se revoca entre perfil y grupos, deja de mostrarlo", async () => {
    mock.groupsRange.mockResolvedValue({ data: [], error: null });
    await expect(getWard(id)).rejects.toThrow("404");
    expect((await getMyWards()).wards).toEqual([]);
  });
  it("no confunde errores de BD con lista vacía ni filtra datos internos", async () => {
    mock.wardsRange.mockResolvedValue({ data: null, error: { message: "secret" } });
    await expect(getMyWards()).rejects.toThrow("No pudimos cargar tus pupilos");
    mock.groupsRange.mockResolvedValue({ data: null, error: { message: "secret" } });
    await expect(getWard(id)).rejects.toThrow("No pudimos cargar tus pupilos");
  });
  it("pagina pupilos de 50 en 50 y no trunca grupos al superar 100 filas", async () => {
    mock.wardsRange.mockResolvedValue({ data: Array.from({ length: 51 }, (_, i) => ({ ...ward, athlete_user_id: `${id}-${i}` })), error: null });
    mock.groupsRange.mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, i) => ({ ...groups[0], athlete_user_id: `${id}-${i % 50}`, group_id: `group-${i}` })), error: null })
      .mockResolvedValueOnce({ data: [{ ...groups[1], athlete_user_id: `${id}-0` }], error: null });
    const result = await getMyWards(2);
    expect(result.hasNext).toBe(true);
    expect(result.wards).toHaveLength(50);
    expect(result.wards[0]!.groups).toHaveLength(3);
    expect(mock.wardsRange).toHaveBeenCalledWith(50, 100);
    expect(mock.groupsRange.mock.calls).toEqual([[0, 99], [100, 199]]);
  });
  it.each([undefined, ["2"], "0", "-1", "bad", "1.5", "99999999999999999999"])("normaliza página inválida %s", (value) => {
    expect(parseWardsPage(value)).toBe(1);
  });
});

describe("pupilos en reportes del grupo", () => {
  it("filtra grupo y membresía activa antes de paginar y solo proyecta identificador y nombre", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => ({ athlete_user_id: `${id}-${i}` }));
    const groupQuery = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn().mockResolvedValue({ data: ids, error: null }) };
    for (const method of [groupQuery.select, groupQuery.eq, groupQuery.order]) method.mockReturnValue(groupQuery);
    const wardQuery = { select: vi.fn(), in: vi.fn(), order: vi.fn() };
    wardQuery.select.mockReturnValue(wardQuery); wardQuery.in.mockReturnValue(wardQuery);
    wardQuery.order.mockReturnValueOnce(wardQuery).mockResolvedValueOnce({ data: [{ athlete_user_id: ids[0]!.athlete_user_id, full_name: ward.full_name }], error: null });
    mock.from.mockImplementation((table: string) => table === "v_my_ward_groups" ? groupQuery : wardQuery);
    expect(await getGroupWards(groups[0]!.group_id, 2)).toEqual({ wards: [{ athlete_user_id: ids[0]!.athlete_user_id, full_name: ward.full_name }], hasNext: true });
    expect(groupQuery.select).toHaveBeenCalledWith("athlete_user_id");
    expect(groupQuery.eq.mock.calls).toEqual([["group_id", groups[0]!.group_id], ["membership_status", "ACTIVE"]]);
    expect(groupQuery.range).toHaveBeenCalledWith(50, 100);
    expect(wardQuery.in).toHaveBeenCalledWith("athlete_user_id", ids.slice(0, 50).map((row) => row.athlete_user_id));
    expect(wardQuery.select).toHaveBeenCalledWith("athlete_user_id, full_name");
  });

  it("sin pupilos activos en el grupo no carga perfiles de otros grupos", async () => {
    mock.groupsRange.mockResolvedValue({ data: [], error: null });
    expect(await getGroupWards(groups[0]!.group_id)).toEqual({ wards: [], hasNext: false });
    expect(mock.from.mock.calls).toEqual([["v_my_ward_groups"]]);
  });

  it("requiere sesión y grupo válido, y no convierte errores de lectura en lista vacía", async () => {
    await expect(getGroupWards("invalid")).rejects.toThrow("404");
    mock.getUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(getGroupWards(groups[0]!.group_id)).rejects.toThrow("redirect:/login");
    expect(mock.from).not.toHaveBeenCalled();
    mock.groupsRange.mockResolvedValue({ data: null, error: { message: "private" } });
    await expect(getGroupWards(groups[0]!.group_id)).rejects.toThrow("No pudimos cargar tus pupilos");
  });
});

describe("agenda del pupilo", () => {
  it("consulta próximas solo en los grupos activos del pupilo seleccionado con columnas explícitas", async () => {
    const result = await getWardActivities(id);
    expect(mock.from.mock.calls).toEqual([["v_my_wards"], ["v_my_ward_groups"], ["v_group_activities"]]);
    expect(mock.activityGroups).toHaveBeenCalledWith("group_id", [groups[0]!.group_id]);
    expect(mock.activitySelect.mock.calls[0]?.[0]).not.toContain("*");
    expect(mock.gte).toHaveBeenCalledWith("starts_at", "2026-01-15T12:00:00.000Z");
    expect(mock.lt).not.toHaveBeenCalled();
    expect(mock.order.mock.calls).toEqual([["starts_at", { ascending: true }], ["id"]]);
    expect(result.activities).toEqual([{ ...activity, group_name: "Club de tenis" }]);
    expect(result.ward.athlete_user_id).toBe(id);
  });

  it("pagina las pasadas de todos los grupos activos del pupilo en conjunto, sin truncarlas a un grupo", async () => {
    mock.groupsRange.mockResolvedValue({ data: groups.map((group) => ({ ...group, membership_status: "ACTIVE" })), error: null });
    mock.activitiesRange.mockResolvedValue({ data: Array.from({ length: 51 }, (_, i) => ({ ...activity, id: `activity-${i}` })), error: null });
    const result = await getWardActivities(id, 2, "past");
    expect(mock.activityGroups).toHaveBeenCalledWith("group_id", groups.map((group) => group.group_id));
    expect(mock.lt).toHaveBeenCalledWith("starts_at", "2026-01-15T12:00:00.000Z");
    expect(mock.gte).not.toHaveBeenCalled();
    expect(mock.order.mock.calls).toEqual([["starts_at", { ascending: false }], ["id"]]);
    expect(mock.activitiesRange).toHaveBeenCalledWith(50, 100);
    expect(result.activities).toHaveLength(50);
    expect(result.hasNext).toBe(true);
  });

  it("permite alternar entre pupilos sin arrastrar grupos ni actividades del anterior", async () => {
    const otherId = "48000000-0000-4000-8000-000000000112";
    const otherGroup = { ...groups[1]!, athlete_user_id: otherId, membership_status: "ACTIVE" };
    const otherActivity = { ...activity, id: "48000000-0000-4000-8000-000000000302", group_id: otherGroup.group_id, title: "Práctica de fútbol" };
    mock.wardsRange.mockResolvedValue({ data: [ward, { ...ward, athlete_user_id: otherId, full_name: "Segundo pupilo" }], error: null });
    mock.groupsRange.mockResolvedValueOnce({ data: [groups[0], otherGroup], error: null });
    const selector = renderToStaticMarkup(await WardsPage({ searchParams: Promise.resolve({}) }));
    expect(selector).toContain(`href="/wards/${id}#agenda"`);
    expect(selector).toContain(`href="/wards/${otherId}#agenda"`);
    const first = renderToStaticMarkup(await WardPage({ params: Promise.resolve({ athleteUserId: id }), searchParams: Promise.resolve({}) }));
    expect(first).toContain("Cambiar de pupilo");
    expect(first).toContain("Práctica de tenis");
    expect(first).not.toContain("Práctica de fútbol");
    mock.maybeSingle.mockResolvedValue({ data: { ...ward, athlete_user_id: otherId, full_name: "Segundo pupilo" }, error: null });
    mock.groupsRange.mockResolvedValue({ data: [otherGroup], error: null });
    mock.activitiesRange.mockResolvedValue({ data: [otherActivity], error: null });
    const second = renderToStaticMarkup(await WardPage({ params: Promise.resolve({ athleteUserId: otherId }), searchParams: Promise.resolve({}) }));
    expect(mock.activityGroups.mock.calls).toEqual([["group_id", [groups[0]!.group_id]], ["group_id", [otherGroup.group_id]]]);
    expect(second).toContain("Actividades de Segundo pupilo");
    expect(second).toContain("Club de fútbol");
    expect(second).toContain("Práctica de fútbol");
    expect(second).not.toContain("Club de tenis");
    expect(second).not.toContain("Práctica de tenis");
  });

  it("muestra tipo, lugar y hora chilena tanto en verano como en invierno", async () => {
    mock.activitiesRange.mockResolvedValue({ data: [activity, { ...activity, id: "winter", location: null,
      starts_at: "2026-07-15T22:00:00Z", ends_at: "2026-07-15T23:30:00Z" }], error: null });
    const html = renderToStaticMarkup(await WardPage({ params: Promise.resolve({ athleteUserId: id }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("Entrenamiento");
    expect(html).toContain("Cancha central");
    expect(html).toContain("Lugar por confirmar");
    expect(html).toContain("America/Santiago");
    expect(html).toContain("19:00");
    expect(html).toContain("18:00");
    expect(html).toContain(`href="/groups/${activity.group_id}/activities/${activity.id}?from=wards&amp;ward=${id}&amp;period=upcoming&amp;page=1"`);
    expect(html).not.toContain("Crear actividad");
  });

  it("conserva pupilo y período al paginar y reinicia la página al cambiar período", async () => {
    mock.activitiesRange.mockResolvedValue({ data: Array.from({ length: 51 }, (_, i) => ({ ...activity, id: `activity-${i}` })), error: null });
    const html = renderToStaticMarkup(await WardPage({ params: Promise.resolve({ athleteUserId: id }), searchParams: Promise.resolve({ page: "2", period: "past" }) }));
    expect(html).toContain(`/wards/${id}?period=past&amp;page=1#agenda`);
    expect(html).toContain(`/wards/${id}?period=past&amp;page=3#agenda`);
    expect(html).toContain(`href="/wards/${id}?period=upcoming#agenda"`);
  });

  it("no consulta actividades de pupilos sin sesión, ocultos, desvinculados o mayores de edad", async () => {
    mock.getUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(getWardActivities(id)).rejects.toThrow("404");
    mock.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getWardActivities(id)).rejects.toThrow("404");
    expect(mock.activitiesRange).not.toHaveBeenCalled();
    expect(mock.from).not.toHaveBeenCalledWith("v_group_activities");
  });

  it("no consulta actividades en grupos pendientes o inactivos", async () => {
    mock.groupsRange.mockResolvedValue({ data: [{ ...groups[0], membership_status: "INACTIVE" }, groups[1]], error: null });
    const html = renderToStaticMarkup(await WardPage({ params: Promise.resolve({ athleteUserId: id }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("Su agenda estará disponible cuando tenga una membresía activa");
    expect(html).not.toContain("Práctica de tenis");
    expect(mock.activitiesRange).not.toHaveBeenCalled();
  });

  it("distingue una agenda vacía de un fallo de carga sin filtrar detalles internos", async () => {
    mock.activitiesRange.mockResolvedValueOnce({ data: [], error: null });
    const html = renderToStaticMarkup(await WardPage({ params: Promise.resolve({ athleteUserId: id }), searchParams: Promise.resolve({ period: "past" }) }));
    expect(html).toContain("No hay actividades pasadas en esta página");
    expect(html).not.toContain("Siguiente");
    mock.activitiesRange.mockResolvedValue({ data: null, error: { message: "private database detail" } });
    await expect(getWardActivities(id)).rejects.toThrow("No pudimos cargar las actividades. Vuelve a intentarlo.");
  });

  it.each([{ page: "0" }, { page: ["1", "2"] }, { period: "invalid" }])("rechaza parámetros inválidos %j antes de consultar", async (search) => {
    await expect(WardPage({ params: Promise.resolve({ athleteUserId: id }), searchParams: Promise.resolve(search) })).rejects.toThrow("404");
    expect(mock.from).not.toHaveBeenCalled();
  });
});


describe("resúmenes del inicio del apoderado", () => {
  it("muestra agenda, mes y consentimientos por grupo sin agregar métricas ni consultar pendientes", async () => {
    mock.taskLimit.mockResolvedValue({ data: [{ total_count: 5 }], error: null });
    const html = renderToStaticMarkup(await WardsPage({ searchParams: Promise.resolve({}) }));
    expect(mock.home).toHaveBeenCalledTimes(1);
    expect(mock.home).toHaveBeenCalledWith(id);
    expect(mock.history).toHaveBeenCalledWith(groups[0]!.group_id, id, expect.objectContaining({ period: "month" }), 1);
    expect(html).toContain("77.8 %");
    expect(html).toContain("2026-03-01");
    expect(html).toContain("2026-03-31");
    expect(html).toContain("Práctica de tenis");
    expect(html).toContain("Cancha central");
    expect(html).toContain("Solicitudes de activación de cuenta: 5");
    expect(html).toContain(`members/consent?athlete=${id}`);
    expect(html).toContain(`/groups/${groups[1]!.group_id}/members/consent`);
    expect(html).not.toContain("Tomar asistencia");
    expect(html).not.toContain("Crear actividad");
    expect(html).not.toContain(historyFixture.records[0]!.note);
  });
  it("conserva Sin datos y diferencia el vacío de actividades del error", async () => {
    mock.home.mockResolvedValue({ next: null, previous: null, now: "2026-01-15T12:00:00Z" });
    mock.history.mockResolvedValue({ history: { ...historyFixture, totals: { ...historyFixture.totals, attendance_pct: null } }, error: null });
    const html = renderToStaticMarkup(await WardsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Sin datos"); expect(html).toContain("Aún no hay actividades en sus grupos");
    mock.home.mockRejectedValue(new Error("No pudimos cargar las actividades"));
    await expect(WardsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("No pudimos cargar las actividades");
  });
  it("acota resúmenes a diez pupilos por página y tres grupos con continuación explícita", async () => {
    mock.groupsRange.mockResolvedValue({ data: Array.from({ length: 5 }, (_, i) => ({ ...groups[0], group_id: `46000000-0000-4000-8000-00000000020${i}` })), error: null });
    const html = renderToStaticMarkup(await WardsPage({ searchParams: Promise.resolve({ page: "2" }) }));
    expect(mock.wardsRange).toHaveBeenCalledWith(10, 20);
    expect(mock.history).toHaveBeenCalledTimes(3);
    expect(html).toContain("Se muestran 3 de 5 grupos");
    expect(html).toContain("Ver todos sus grupos");
  });
  it("cuenta pendientes por código y gestionados de todas las páginas, con contexto GUARDIAN", async () => {
    const rows = Array.from({ length: 50 }, () => ({ can_consent: true, total_count: 107 }));
    mock.onboarding.mockResolvedValueOnce({ data: rows, error: null }).mockResolvedValueOnce({ data: rows, error: null })
      .mockResolvedValueOnce({ data: rows.slice(0, 7), error: null });
    mock.taskLimit.mockResolvedValueOnce({ data: [{ total_count: 3 }], error: null });
    expect(await getGuardianTasks(groups[0]!.group_id)).toEqual({ consents: 107, activations: 3, memberships: rows });
    expect(mock.rpc).toHaveBeenCalledWith("list_membership_onboarding", { p_group_id: groups[0]!.group_id, p_as_guardian: true, p_offset: 100, p_athlete_user_id: undefined });
    expect(mock.taskSelect.mock.calls).toEqual([["total_count"]]);
    expect(mock.taskLimit.mock.calls).toEqual([[1]]);
    mock.group.mockResolvedValue({ id: groups[0]!.group_id, roles: ["ATHLETE"] });
    await expect(getGuardianTasks(groups[0]!.group_id)).rejects.toThrow("404");
    mock.group.mockResolvedValue({ id: groups[0]!.group_id, roles: ["GUARDIAN"] });
    mock.onboarding.mockResolvedValue({ data: null, error: { message: "secret" } });
    await expect(getGuardianTasks(groups[0]!.group_id)).rejects.toThrow("No pudimos cargar los consentimientos");
  });
});

it("la próxima actividad del pupilo contempla todos sus grupos activos, incluso fuera de los tres resúmenes", async () => {
  const { getWardHomeActivities } = await vi.importActual<typeof import("@legacy/lib/activities")>("@legacy/lib/activities");
  const activeGroups = Array.from({ length: 5 }, (_, i) => ({ ...groups[0], group_id: `46000000-0000-4000-8000-00000000020${i}` }));
  mock.groupsRange.mockResolvedValue({ data: [...activeGroups, { ...groups[1], group_id: "pending-group" }], error: null });
  const nearest = { ...activity, group_id: activeGroups[4]!.group_id };
  mock.activityLimit.mockResolvedValueOnce({ data: [nearest], error: null }).mockResolvedValueOnce({ data: [], error: null });
  expect((await getWardHomeActivities(id)).next).toEqual(nearest);
  expect(mock.activityGroups.mock.calls).toEqual([["group_id", activeGroups.map(group => group.group_id)], ["group_id", activeGroups.map(group => group.group_id)]]);
  expect(mock.activityLimit.mock.calls).toEqual([[1], [1]]);
  mock.groupsRange.mockResolvedValue({ data: [groups[1]], error: null });
  mock.activityLimit.mockClear();
  expect((await getWardHomeActivities(id)).next).toBeNull();
  expect(mock.activityLimit).not.toHaveBeenCalled();
});

it("lista y detalle enlazan solo al consentimiento del pupilo y grupo seleccionados", async () => {
  const state = { membership_id: "member", athlete_user_id: id, group_id: groups[1]!.group_id, group_name: groups[1]!.name,
    full_name: ward.full_name, membership_status: "PENDING", account_status: "MANAGED", is_minor: true,
    guardian_linked: true, guardian_ready: false, requires_managed_consent: true, can_consent: true, total_count: 1 };
  mock.onboarding.mockResolvedValue({ data: [state], error: null });
  const html = renderToStaticMarkup(await WardPage({ params: Promise.resolve({ athleteUserId: id }), searchParams: Promise.resolve({}) }));
  expect(html).toContain(`/groups/${groups[1]!.group_id}/members/consent?athlete=${id}`);
  expect(html).toContain("Cuenta gestionada");
  expect(html).toContain("Pendiente · apoderado");
  for (const [name, args] of mock.rpc.mock.calls) if (name === "list_membership_onboarding" || name === "list_managed_activation_requests") {
    expect(args.p_athlete_user_id).toBe(id);
  }
});
