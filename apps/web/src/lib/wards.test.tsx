import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mock = vi.hoisted(() => ({ getUser: vi.fn(), listMyWards: vi.fn(), getWard: vi.fn(), listActivities: vi.fn(), getHomeActivities: vi.fn(), home: vi.fn(), history: vi.fn(), group: vi.fn(), listMembershipOnboarding: vi.fn(), listManagedActivations: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ createServerApiClient: () => mock }));
import { ApiClientError } from "@asisteam/api-client";
vi.mock("@/lib/api/session", () => ({ createSessionClient: async () => ({ auth: { getUser: mock.getUser } }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/wards", redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("404"); } }));
vi.mock("@/lib/groups", () => ({ getGroup: mock.group }));
vi.mock("@/lib/activities", async original => ({ ...await original<typeof import("@/lib/activities")>(), getWardHomeActivities: mock.home }));
vi.mock("@/lib/attendance-history", () => ({ getWardAttendanceHistory: mock.history }));
import { historyFixture } from "@/lib/attendance-history.test-fixture";
import { getGroupWards, getMyWards, getWard, parseWardsPage, getGuardianTasks } from "@/lib/wards";
import { getWardActivities } from "@/lib/activities";
import WardsPage from "@/app/wards/page";
import WardPage from "@/app/wards/[athleteUserId]/page";

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
  mock.listManagedActivations.mockResolvedValue({ data: [] });
  mock.listMembershipOnboarding.mockResolvedValue({ data: [] });
  mock.getUser.mockResolvedValue({ data: { user: { id: "guardian-auth" } } });
  mock.listMyWards.mockResolvedValue({ data: [{ ...ward, groups }], has_next: false });
  mock.getWard.mockResolvedValue({ ...ward, groups });
  mock.listActivities.mockResolvedValue({ activities: [activity], hasNext: false });
  mock.getHomeActivities.mockResolvedValue({ next: activity, previous: null, now: "2026-01-15T12:00:00Z" });
});
afterEach(() => vi.useRealTimers());

describe("Mis pupilos y perfil deportivo", () => {
  it("requiere sesión antes de leer y devuelve 404 para detalle sin sesión", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    await expect(getMyWards()).rejects.toThrow("redirect:/login");
    await expect(getWard(id)).rejects.toThrow("404");
    expect(mock.listMyWards).not.toHaveBeenCalled();
  });
  it("solo lee las dos proyecciones autorizadas y agrupa cada pupilo una vez", async () => {
    expect(await getMyWards()).toEqual({ wards: [{ ...ward, groups }], hasNext: false });
    expect(mock.listMyWards).toHaveBeenCalledWith({ query: { page: 1 } });
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
    mock.listMyWards.mockResolvedValue({ data: [], has_next: false });
    const html = renderToStaticMarkup(await WardsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Aún no tienes deportistas a tu cargo; pide al administrador del grupo que te vincule");
    expect(mock.listActivities).not.toHaveBeenCalled();
  });
  it("oculto, adulto o inexistente retorna 404; ID inválido no consulta", async () => {
    await expect(getWard("invalid")).rejects.toThrow("404");
    expect(mock.listMyWards).not.toHaveBeenCalled();
    mock.getWard.mockRejectedValue(new ApiClientError(404, "not_found"));
    await expect(getWard(id)).rejects.toThrow("404");
    expect(mock.listActivities).not.toHaveBeenCalled();
  });
  it("si el vínculo se revoca entre perfil y grupos, deja de mostrarlo", async () => {
    mock.getWard.mockRejectedValue(new ApiClientError(404, "not_found"));
    mock.listMyWards.mockResolvedValue({ data: [], has_next: false });
    await expect(getWard(id)).rejects.toThrow("404");
    expect((await getMyWards()).wards).toEqual([]);
  });
  it("no confunde errores de BD con lista vacía ni filtra datos internos", async () => {
    mock.listMyWards.mockRejectedValue(new Error("secret"));
    await expect(getMyWards()).rejects.toThrow("No pudimos cargar tus pupilos");
    mock.getWard.mockRejectedValue(new Error("secret"));
    await expect(getWard(id)).rejects.toThrow("No pudimos cargar tus pupilos");
  });
  it("pagina pupilos de 50 en 50 y no trunca grupos al superar 100 filas", async () => {
    const allGroups = Array.from({ length: 101 }, (_, i) => ({ ...groups[0], group_id: `group-${i}` }));
    mock.listMyWards.mockResolvedValue({ data: Array.from({ length: 50 }, (_, i) => ({ ...ward, athlete_user_id: `${id}-${i}`, groups: allGroups })), has_next: true });
    const result = await getMyWards(2);
    expect(result.hasNext).toBe(true);
    expect(result.wards).toHaveLength(50);
    expect(result.wards[0]!.groups).toHaveLength(101);
    expect(mock.listMyWards).toHaveBeenCalledWith({ query: { page: 2 } });
  });
  it.each([undefined, ["2"], "0", "-1", "bad", "1.5", "99999999999999999999"])("normaliza página inválida %s", (value) => {
    expect(parseWardsPage(value)).toBe(1);
  });
});

describe("pupilos en reportes del grupo", () => {
  it("filtra grupo y membresía activa antes de paginar y solo proyecta identificador y nombre", async () => {
    mock.listMyWards.mockResolvedValue({ data: [{ ...ward, groups: [groups[0]], email: "private@example.test", birthdate: "secret", phone: "private" }], has_next: true });
    expect(await getGroupWards(groups[0]!.group_id, 2)).toEqual({ wards: [{ athlete_user_id: id, full_name: ward.full_name }], hasNext: true });
    expect(mock.listMyWards).toHaveBeenCalledWith({ query: { page: 2, group_id: groups[0]!.group_id } });
  });

  it("sin pupilos activos en el grupo no carga perfiles de otros grupos", async () => {
    mock.getWard.mockRejectedValue(new ApiClientError(404, "not_found"));
    mock.listMyWards.mockResolvedValue({ data: [], has_next: false });
    expect(await getGroupWards(groups[0]!.group_id)).toEqual({ wards: [], hasNext: false });
    expect(mock.listMyWards).toHaveBeenCalledWith({ query: { page: 1, group_id: groups[0]!.group_id } });
  });

  it("requiere sesión y grupo válido, y no convierte errores de lectura en lista vacía", async () => {
    await expect(getGroupWards("invalid")).rejects.toThrow("404");
    mock.getUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(getGroupWards(groups[0]!.group_id)).rejects.toThrow("redirect:/login");
    expect(mock.listMyWards).not.toHaveBeenCalled();
    mock.listMyWards.mockRejectedValue(new Error("private"));
    await expect(getGroupWards(groups[0]!.group_id)).rejects.toThrow("No pudimos cargar tus pupilos");
  });
});

describe("agenda del pupilo", () => {
  it("consulta próximas solo en los grupos activos del pupilo seleccionado con columnas explícitas", async () => {
    const result = await getWardActivities(id);
    expect(mock.getWard).toHaveBeenCalledWith({ params: { athleteUserId: id } });
    expect(mock.listActivities).toHaveBeenCalledWith({ query: { group_ids: groups[0]!.group_id, page: 1, period: "upcoming" } });
    expect(result.activities).toEqual([{ ...activity, group_name: "Club de tenis" }]);
    expect(result.ward.athlete_user_id).toBe(id);
  });

  it("pagina las pasadas de todos los grupos activos del pupilo en conjunto, sin truncarlas a un grupo", async () => {
    mock.getWard.mockResolvedValue({ ...ward, groups: groups.map(group => ({ ...group, membership_status: "ACTIVE" })) });
    mock.listActivities.mockResolvedValue({ activities: Array.from({ length: 50 }, (_, i) => ({ ...activity, id: `activity-${i}` })), hasNext: true });
    const result = await getWardActivities(id, 2, "past");
    expect(mock.listActivities).toHaveBeenCalledWith({ query: { group_ids: groups.map(group => group.group_id).join(","), page: 2, period: "past" } });
    expect(result.activities).toHaveLength(50);
    expect(result.hasNext).toBe(true);
  });

  it("permite alternar entre pupilos sin arrastrar grupos ni actividades del anterior", async () => {
    const otherId = "48000000-0000-4000-8000-000000000112";
    const otherGroup = { ...groups[1]!, athlete_user_id: otherId, membership_status: "ACTIVE" };
    const otherActivity = { ...activity, id: "48000000-0000-4000-8000-000000000302", group_id: otherGroup.group_id, title: "Práctica de fútbol" };
    mock.listMyWards.mockResolvedValue({ data: [{ ...ward, groups: [groups[0]] }, { ...ward, athlete_user_id: otherId, full_name: "Segundo pupilo", groups: [otherGroup] }], has_next: false });
    const selector = renderToStaticMarkup(await WardsPage({ searchParams: Promise.resolve({}) }));
    expect(selector).toContain(`href="/wards/${id}#agenda"`);
    expect(selector).toContain(`href="/wards/${otherId}#agenda"`);
    const first = renderToStaticMarkup(await WardPage({ params: Promise.resolve({ athleteUserId: id }), searchParams: Promise.resolve({}) }));
    expect(first).toContain("Cambiar de pupilo");
    expect(first).toContain("Práctica de tenis");
    expect(first).not.toContain("Práctica de fútbol");
    mock.getWard.mockResolvedValue({ ...ward, athlete_user_id: otherId, full_name: "Segundo pupilo", groups: [otherGroup] });
    mock.listActivities.mockResolvedValue({ activities: [otherActivity], hasNext: false });
    const second = renderToStaticMarkup(await WardPage({ params: Promise.resolve({ athleteUserId: otherId }), searchParams: Promise.resolve({}) }));
    expect(mock.listActivities.mock.calls).toEqual([[{ query: { group_ids: groups[0]!.group_id, page: 1, period: "upcoming" } }], [{ query: { group_ids: otherGroup.group_id, page: 1, period: "upcoming" } }]]);
    expect(second).toContain("Actividades de Segundo pupilo");
    expect(second).toContain("Club de fútbol");
    expect(second).toContain("Práctica de fútbol");
    expect(second).not.toContain("Club de tenis");
    expect(second).not.toContain("Práctica de tenis");
  });

  it("muestra tipo, lugar y hora chilena tanto en verano como en invierno", async () => {
    mock.listActivities.mockResolvedValue({ activities: [activity, { ...activity, id: "winter", location: null,
      starts_at: "2026-07-15T22:00:00Z", ends_at: "2026-07-15T23:30:00Z" }], hasNext: false });
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
    mock.listActivities.mockResolvedValue({ activities: Array.from({ length: 50 }, (_, i) => ({ ...activity, id: `activity-${i}` })), hasNext: true });
    const html = renderToStaticMarkup(await WardPage({ params: Promise.resolve({ athleteUserId: id }), searchParams: Promise.resolve({ page: "2", period: "past" }) }));
    expect(html).toContain(`/wards/${id}?period=past&amp;page=1#agenda`);
    expect(html).toContain(`/wards/${id}?period=past&amp;page=3#agenda`);
    expect(html).toContain(`href="/wards/${id}?period=upcoming#agenda"`);
  });

  it("no consulta actividades de pupilos sin sesión, ocultos, desvinculados o mayores de edad", async () => {
    mock.getUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(getWardActivities(id)).rejects.toThrow("404");
    mock.getWard.mockRejectedValue(new ApiClientError(404, "not_found"));
    await expect(getWardActivities(id)).rejects.toThrow("404");
    expect(mock.listActivities).not.toHaveBeenCalled();
    expect(mock.listActivities).not.toHaveBeenCalled();
  });

  it("no consulta actividades en grupos pendientes o inactivos", async () => {
    mock.getWard.mockResolvedValue({ ...ward, groups: [{ ...groups[0], membership_status: "INACTIVE" }, groups[1]] });
    const html = renderToStaticMarkup(await WardPage({ params: Promise.resolve({ athleteUserId: id }), searchParams: Promise.resolve({}) }));
    expect(html).toContain("Su agenda estará disponible cuando tenga una membresía activa");
    expect(html).not.toContain("Práctica de tenis");
    expect(mock.listActivities).not.toHaveBeenCalled();
  });

  it("distingue una agenda vacía de un fallo de carga sin filtrar detalles internos", async () => {
    mock.listActivities.mockResolvedValueOnce({ activities: [], hasNext: false });
    const html = renderToStaticMarkup(await WardPage({ params: Promise.resolve({ athleteUserId: id }), searchParams: Promise.resolve({ period: "past" }) }));
    expect(html).toContain("No hay actividades pasadas en esta página");
    expect(html).not.toContain("Siguiente");
    mock.listActivities.mockRejectedValue(new Error("private database detail"));
    await expect(getWardActivities(id)).rejects.toThrow("No pudimos cargar las actividades. Vuelve a intentarlo.");
  });

  it.each([{ page: "0" }, { page: ["1", "2"] }, { period: "invalid" }])("rechaza parámetros inválidos %j antes de consultar", async (search) => {
    await expect(WardPage({ params: Promise.resolve({ athleteUserId: id }), searchParams: Promise.resolve(search) })).rejects.toThrow("404");
    expect(mock.listMyWards).not.toHaveBeenCalled();
  });
});


describe("resúmenes del inicio del apoderado", () => {
  it("muestra agenda, mes y consentimientos por grupo sin agregar métricas ni consultar pendientes", async () => {
    mock.listManagedActivations.mockResolvedValue({ data: [{ total_count: 5 }] });
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
    mock.listMyWards.mockResolvedValue({ data: Array.from({ length: 11 }, () => ({ ...ward, groups: Array.from({ length: 5 }, (_, i) => ({ ...groups[0], group_id: `46000000-0000-4000-8000-00000000020${i}` })) })), has_next: false });
    const html = renderToStaticMarkup(await WardsPage({ searchParams: Promise.resolve({ page: "2" }) }));
    expect(mock.listMyWards).toHaveBeenCalledWith({ query: { page: 1 } });
    expect(mock.history).toHaveBeenCalledTimes(3);
    expect(html).toContain("Se muestran 3 de 5 grupos");
    expect(html).toContain("Ver todos sus grupos");
  });
  it("cuenta pendientes por código y gestionados de todas las páginas, con contexto GUARDIAN", async () => {
    const rows = Array.from({ length: 50 }, () => ({ can_consent: true, total_count: 107 }));
    mock.listMembershipOnboarding.mockResolvedValueOnce({ data: rows }).mockResolvedValueOnce({ data: rows })
      .mockResolvedValueOnce({ data: rows.slice(0, 7) });
    mock.listManagedActivations.mockResolvedValueOnce({ data: [{ total_count: 3 }] });
    expect(await getGuardianTasks(groups[0]!.group_id)).toEqual({ consents: 107, activations: 3, memberships: rows });
    expect(mock.listMembershipOnboarding).toHaveBeenCalledWith({ query: { group_id: groups[0]!.group_id, as_guardian: true, page: 3, athlete_user_id: undefined } });
    expect(mock.listManagedActivations).toHaveBeenCalledWith({ params: { groupId: groups[0]!.group_id }, query: { page: 1, athlete_user_id: undefined } });
    mock.group.mockResolvedValue({ id: groups[0]!.group_id, roles: ["ATHLETE"] });
    await expect(getGuardianTasks(groups[0]!.group_id)).rejects.toThrow("404");
    mock.group.mockResolvedValue({ id: groups[0]!.group_id, roles: ["GUARDIAN"] });
    mock.listMembershipOnboarding.mockRejectedValue(new Error("secret"));
    await expect(getGuardianTasks(groups[0]!.group_id)).rejects.toThrow("No pudimos cargar los consentimientos");
  });
});

it("la próxima actividad del pupilo contempla todos sus grupos activos, incluso fuera de los tres resúmenes", async () => {
  const { getWardHomeActivities } = await vi.importActual<typeof import("@/lib/activities")>("@/lib/activities");
  const activeGroups = Array.from({ length: 5 }, (_, i) => ({ ...groups[0], group_id: `46000000-0000-4000-8000-00000000020${i}` }));
  mock.getWard.mockResolvedValue({ ...ward, groups: [...activeGroups, { ...groups[1], group_id: "pending-group" }] });
  const nearest = { ...activity, group_id: activeGroups[4]!.group_id };
  mock.getHomeActivities.mockResolvedValue({ next: nearest, previous: null });
  expect((await getWardHomeActivities(id)).next).toEqual(nearest);
  expect(mock.getHomeActivities).toHaveBeenCalledWith({ query: { group_ids: activeGroups.map(group => group.group_id).join(",") } });
  mock.getWard.mockResolvedValue({ ...ward, groups: [groups[1]] });
  mock.getHomeActivities.mockClear();
  expect((await getWardHomeActivities(id)).next).toBeNull();
  expect(mock.getHomeActivities).not.toHaveBeenCalled();
});

it("lista y detalle enlazan solo al consentimiento del pupilo y grupo seleccionados", async () => {
  const state = { membership_id: "member", athlete_user_id: id, group_id: groups[1]!.group_id, group_name: groups[1]!.name,
    full_name: ward.full_name, membership_status: "PENDING", account_status: "MANAGED", is_minor: true,
    guardian_linked: true, guardian_ready: false, requires_managed_consent: true, can_consent: true, total_count: 1 };
  mock.listMembershipOnboarding.mockResolvedValue({ data: [state] });
  const html = renderToStaticMarkup(await WardPage({ params: Promise.resolve({ athleteUserId: id }), searchParams: Promise.resolve({}) }));
  expect(html).toContain(`/groups/${groups[1]!.group_id}/members/consent?athlete=${id}`);
  expect(html).toContain("Cuenta gestionada");
  expect(html).toContain("Pendiente · apoderado");
  for (const [args] of [...mock.listMembershipOnboarding.mock.calls, ...mock.listManagedActivations.mock.calls]) {
    expect(args.query.athlete_user_id).toBe(id);
  }
});

// The native API has fixed pages of fifty; home summaries render ten per page.
it("limita cada página del inicio a diez pupilos y avanza dentro de la misma página HTTP", async () => {
  const data = Array.from({ length: 50 }, (_, i) => ({ ...ward, athlete_user_id: `synthetic-${i}`, groups }));
  mock.listMyWards.mockResolvedValue({ data, has_next: true });
  const second = await getMyWards(2, 10);
  expect(second.wards.map(item => item.athlete_user_id)).toEqual(data.slice(10, 20).map(item => item.athlete_user_id));
  expect(second.hasNext).toBe(true);
  expect(mock.listMyWards).toHaveBeenLastCalledWith({ query: { page: 1 } });
  const sixth = await getMyWards(6, 10);
  expect(sixth.wards).toHaveLength(10);
  expect(mock.listMyWards).toHaveBeenLastCalledWith({ query: { page: 2 } });
});
