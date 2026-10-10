import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mock = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), order: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), cookie: vi.fn(), rpc: vi.fn(), home: vi.fn(), history: vi.fn(), tasks: vi.fn(), listMyGroups: vi.fn(), getGroup: vi.fn(), getGroupBilling: vi.fn(), getPendingSummary: vi.fn() }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mock.cookie }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("404"); }, forbidden: () => { throw new Error("403"); }, useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/groups" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser }, from: mock.from, rpc: mock.rpc }) }));
vi.mock("@/lib/api/server", () => ({ createServerApiClient: () => ({ listMyGroups: mock.listMyGroups, getGroup: mock.getGroup, getGroupBilling: mock.getGroupBilling, getPendingSummary: mock.getPendingSummary }) }));
import { ApiClientError } from "@asisteam/api-client";
import { getGroup, getGroupCapacity, getMyGroups, groupHomePath } from "@/lib/groups";
vi.mock("@/lib/activities", async original => ({ ...await original<typeof import("@/lib/activities")>(), getHomeActivities: mock.home }));
vi.mock("@/lib/attendance-history", () => ({ getMyAttendanceHistory: mock.history }));
vi.mock("@/lib/wards", () => ({ getGuardianTasks: mock.tasks }));
import { historyFixture } from "@/lib/attendance-history.test-fixture";
import GroupPage from "@/app/groups/[groupId]/page";
import GroupSettingsPage from "@/app/groups/[groupId]/settings/page";
import GroupLayout from "@/app/groups/[groupId]/layout";

const a = "17000000-0000-4000-8000-000000000201";
const b = "17000000-0000-4000-8000-000000000202";
const groups = [
  { id: a, name: "Equipo A", sport: null, logo_url: null, roles: ["ADMIN", "ATHLETE"] },
  { id: b, name: "Equipo B", sport: null, logo_url: null, roles: ["ATHLETE"] },
];
beforeEach(() => {
  vi.resetAllMocks();
  mock.home.mockResolvedValue({ next: null, previous: null, now: "2026-01-15T12:00:00Z" });
  mock.history.mockResolvedValue({ history: historyFixture, error: null });
  mock.tasks.mockResolvedValue({ consents: 0, activations: 0 });
  mock.getUser.mockResolvedValue({ data: { user: { id: "auth-user" } } });
  mock.listMyGroups.mockResolvedValue({ data: groups });
  mock.getGroup.mockResolvedValue({ ...groups[0], description: null, settings: null, invite_code: "CODE0001" });
  mock.getGroupBilling.mockResolvedValue({ active_athletes: 0, athlete_limit: 0 });
  mock.getPendingSummary.mockResolvedValue({ total: 0 });
});

describe("contexto de grupos", () => {
  it("exige sesión antes de consultar grupos", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    await expect(getMyGroups()).rejects.toThrow("redirect:/login");
    expect(mock.listMyGroups).not.toHaveBeenCalled();
  });
  it("usa solo la vista proyectada y conserva multi-rol", async () => {
    expect((await getMyGroups()).groups).toEqual(groups);
    expect(mock.listMyGroups).toHaveBeenCalledWith({ query: { page: 1, page_size: 100 } });
  });
  it("restaura solo preferencias que siguen visibles", async () => {
    mock.cookie.mockReturnValue({ value: b });
    expect(await groupHomePath()).toBe(`/groups/${b}`);
    expect(mock.cookie).toHaveBeenCalledWith("asisteam-group-auth-user");
    mock.cookie.mockReturnValue({ value: "grupo-ajeno-o-revocado" });
    expect(await groupHomePath()).toBe("/groups");
  });
  it("sin grupos lleva a bienvenida; con uno entra directamente", async () => {
    mock.listMyGroups.mockResolvedValue({ data: [] });
    expect(await groupHomePath()).toBe("/welcome");
    mock.listMyGroups.mockResolvedValue({ data: [groups[1]] });
    expect(await groupHomePath()).toBe(`/groups/${b}`);
  });
  it("un fallo de lectura no se confunde con no tener grupos", async () => {
    mock.listMyGroups.mockRejectedValue(new Error("secret"));
    await expect(groupHomePath()).rejects.toThrow("No pudimos cargar tus grupos");
  });
  it("rechaza ID inválido o ajeno antes de cargar detalle", async () => {
    await expect(getGroup("bad-id")).rejects.toThrow("404");
    await expect(getGroup("17000000-0000-4000-8000-000000000999")).rejects.toThrow("404");
    expect(mock.getGroup).not.toHaveBeenCalled();
  });
  it("deniega si la membresía se revoca entre lista y detalle", async () => {
    mock.getGroup.mockRejectedValue(new ApiClientError(404, "not_found"));
    await expect(getGroup(a)).rejects.toThrow("404");
  });
  it("usa los roles actuales del detalle si ADMIN se revoca durante la petición", async () => {
    mock.getGroup.mockResolvedValue({ ...groups[0], roles: ["ATHLETE"], invite_code: null, settings: null });
    expect((await getGroup(a)).roles).toEqual(["ATHLETE"]);
  });
  it("ADMIN+ATHLETE muestra administración y Mi asistencia", async () => {
    const html = renderToStaticMarkup(await GroupPage({ params: Promise.resolve({ groupId: a }) }));
    expect(html).toContain("Administración del grupo");
    expect(html).toContain("Mi asistencia");
    expect(html).not.toContain("Agregarme como deportista");
  });
  it("ADMIN sin ATHLETE puede agregarse desde el panel y ve su código", async () => {
    mock.getGroup.mockResolvedValue({ ...groups[0], roles: ["ADMIN"], invite_code: "CODE0001" });
    const html = renderToStaticMarkup(await GroupPage({ params: Promise.resolve({ groupId: a }) }));
    expect(html).toContain("Agregarme como deportista");
    expect(html).toContain("CODE0001");
    expect(html).toContain(`/groups/${a}/settings#invite`);
    expect(html).toContain("Aprobaciones pendientes");
    expect(html).toContain(`/groups/${a}/activities/new`);
  });
  it("al cambiar a ATHLETE desaparece administración y settings responde 403", async () => {
    mock.getGroup.mockResolvedValue({ ...groups[1], description: null, settings: null, invite_code: null });
    const html = renderToStaticMarkup(await GroupPage({ params: Promise.resolve({ groupId: b }) }));
    expect(html).toContain("Mi asistencia");
    expect(html).not.toContain("Administración del grupo");
    expect(html).not.toContain("CODE0001");
    expect(html).not.toContain("Agregarme como deportista");
    expect(html).not.toContain("Aprobaciones pendientes");
    expect(mock.getGroupBilling).not.toHaveBeenCalled();
    expect(mock.getPendingSummary).not.toHaveBeenCalled();
    await expect(GroupSettingsPage({ params: Promise.resolve({ groupId: b }) })).rejects.toThrow("403");
  });
  it("la navegación A → B → A muestra exclusivamente los permisos del grupo solicitado", async () => {
    for (const group of [groups[0]!, groups[1]!, groups[0]!]) {
      mock.getGroup.mockResolvedValue({ ...group, invite_code: group.id === a ? "CODE0001" : null });
      const html = renderToStaticMarkup(await GroupLayout({ children: null, params: Promise.resolve({ groupId: group.id }) }));
      expect(mock.getGroup).toHaveBeenLastCalledWith({ params: { groupId: group.id } });
      expect(html).toContain(`href="/groups/${group.id}/me/history"`);
      expect(html).toContain(`href="/groups/${group.id}/activities"`);
      for (const section of ["members", "invitations/new", "guardians", "members/pending", "settings"]) {
        if (group.roles.includes("ADMIN")) expect(html).toContain(`href="/groups/${group.id}/${section}"`);
        else expect(html).not.toContain(`href="/groups/${group.id}/${section}"`);
      }
      expect(html).not.toContain(`href="/groups/${group.id === a ? b : a}/settings"`);
    }
  });
  it("ADMIN ve el total de pendientes sin descargar perfiles ni volcar solicitudes", async () => {
    mock.getPendingSummary.mockResolvedValue({ total: 357 });
    const html = renderToStaticMarkup(await GroupPage({ params: Promise.resolve({ groupId: a }) }));
    expect(mock.getPendingSummary).toHaveBeenCalledWith({ params: { groupId: a } });
    expect(html).toContain("(357)");
    expect(html).toContain("Revisar aprobaciones");
    expect(html).not.toContain("primeras 100");
  });
  it("grupo ajeno conserva 404 antes de entrar a settings", async () => {
    await expect(GroupSettingsPage({ params: Promise.resolve({ groupId: "17000000-0000-4000-8000-000000000999" }) })).rejects.toThrow("404");
  });
  it("ADMIN recibe formulario y código en configuración", async () => {
    const html = renderToStaticMarkup(await GroupSettingsPage({ params: Promise.resolve({ groupId: a }) }));
    expect(html).toContain("Guardar cambios");
    expect(html).toContain("Regenerar código");
    expect(html).toContain("CODE0001");
  });
});


describe("capacidad y primeros pasos", () => {
  it("proyecta solo capacidad para ADMIN, sin datos de facturación en el aviso", async () => {
    mock.getGroupBilling.mockResolvedValue({ active_athletes: 2, athlete_limit: 50, invoices: [{ amount_clp: 4990 }], subscription: { status: "CANCELLED" } });
    expect(await getGroupCapacity(a)).toEqual({ active_athletes: 2, athlete_limit: 50 });
    expect(mock.getGroupBilling).toHaveBeenCalledWith({ params: { groupId: a }, query: { page: 1 } });
  });
  it.each(["ATHLETE", "GUARDIAN", "COACH"])("%s no consulta facturación ni recibe aviso/guía comercial", async role => {
    mock.getGroup.mockResolvedValue({ ...groups[0], roles: [role] });
    expect(await getGroupCapacity(a)).toBeNull();
    const layout = renderToStaticMarkup(await GroupLayout({ children: null, params: Promise.resolve({ groupId: a }) }));
    const home = renderToStaticMarkup(await GroupPage({ params: Promise.resolve({ groupId: a }) }));
    expect(layout).not.toContain("Cupos de deportistas");
    expect(layout).not.toContain(`/groups/${a}/billing`);
    expect(home).not.toContain("Primeros pasos");
    expect(mock.getGroupBilling).not.toHaveBeenCalled();
    expect(mock.getPendingSummary).not.toHaveBeenCalled();
  });
  it.each([{ data: null, error: { message: "internal" } }, { data: {}, error: null }])("un fallo o DTO inválido no se convierte en cero cupos", async result => {
    if (result.error) mock.getGroupBilling.mockRejectedValue(new Error(result.error.message));
    else mock.getGroupBilling.mockResolvedValue(result.data);
    expect(await getGroupCapacity(a)).toBeNull();
    const html = renderToStaticMarkup(await GroupLayout({ children: null, params: Promise.resolve({ groupId: a }) }));
    expect(html).toContain("No pudimos comprobar los cupos");
    expect(html).not.toContain("0 cupos habilitados");
    expect(html).not.toContain("internal");
  });
  it("grupo nuevo muestra el requisito antes de controles de alta y permite continuar configuración", async () => {
    const home = await GroupPage({ params: Promise.resolve({ groupId: a }) });
    const html = renderToStaticMarkup(await GroupLayout({ children: home, params: Promise.resolve({ groupId: a }) }));
    expect(html.indexOf("0 cupos habilitados")).toBeLessThan(html.indexOf("Crear cuenta gestionada"));
    expect(html).toContain("1 de 4 pasos listos");
    expect(mock.home).toHaveBeenCalledWith(a);
    expect(mock.getPendingSummary).toHaveBeenCalled();
    for (const target of ["settings", "billing", "members", "activities/new"]) expect(html).toContain(`/groups/${a}/${target}`);
  });
});


describe("home por rol", () => {
  const activity = { id: "next-id", group_id: a, title: "Entrenamiento sintético", starts_at: "2026-01-15T15:00:00Z", ends_at: "2026-01-15T16:00:00Z", location: "Cancha principal" };
  it.each(["ADMIN", "COACH", "ATHLETE", "GUARDIAN"])("prioriza próxima actividad y respeta CTA de %s", async role => {
    mock.getGroup.mockResolvedValue({ ...groups[0], roles: [role] });
    mock.home.mockResolvedValue({ next: activity, previous: null, now: "2026-01-15T12:00:00Z" });
    const html = renderToStaticMarkup(await GroupPage({ params: Promise.resolve({ groupId: a }) }));
    expect(html).toContain("Hoy");
    expect(html).toContain("Cancha principal");
    expect(html).toContain("12:00");
    expect(html).toContain('href="/groups/' + a + '/activities/next-id"');
    expect(html.includes("Tomar asistencia")).toBe(["ADMIN", "COACH"].includes(role));
    expect(html.includes("Crear actividad")).toBe(role === "ADMIN");
    expect(html.includes("Mi asistencia")).toBe(role === "ATHLETE");
    expect(mock.history).toHaveBeenCalledTimes(role === "ATHLETE" ? 1 : 0);
    expect(mock.tasks).toHaveBeenCalledTimes(role === "GUARDIAN" ? 1 : 0);
    if (role === "ADMIN") expect(html.indexOf("Entrenamiento sintético")).toBeLessThan(html.indexOf("Administración del grupo"));
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).not.toContain('<h1 class="text-2xl font-semibold">Equipo A');
  });
  it("separa anterior, futuro, en curso y vacío sin crear convocatorias", async () => {
    mock.home.mockResolvedValue({ next: { ...activity, starts_at: "2026-01-16T15:00:00Z", ends_at: "2026-01-16T16:00:00Z" }, previous: { ...activity, id: "past-id", title: "Encuentro anterior", starts_at: "2026-01-14T15:00:00Z", ends_at: "2026-01-14T16:00:00Z" }, now: "2026-01-15T12:00:00Z" });
    let html = renderToStaticMarkup(await GroupPage({ params: Promise.resolve({ groupId: a }) }));
    expect(html).toContain("Próxima"); expect(html).toContain("Anterior:"); expect(html).toContain("Revisar asistencia anterior");
    mock.home.mockResolvedValue({ next: activity, previous: null, now: "2026-01-15T15:30:00Z" });
    html = renderToStaticMarkup(await GroupPage({ params: Promise.resolve({ groupId: a }) }));
    expect(html).toContain("Actividad en curso");
    mock.home.mockResolvedValue({ next: null, previous: activity, now: "2026-01-16T15:30:00Z" });
    html = renderToStaticMarkup(await GroupPage({ params: Promise.resolve({ groupId: a }) }));
    expect(html).toContain("No hay próximas actividades");
    expect(html).not.toContain("Tomar asistencia");
    expect(mock.getPendingSummary).toHaveBeenCalledWith({ params: { groupId: a } });
  });
  it("conserva null/Sin datos, período mensual y grupo para multirol sin mostrar notas", async () => {
    mock.history.mockResolvedValue({ history: { ...historyFixture, totals: { ...historyFixture.totals, attendance_pct: null } }, error: null });
    const html = renderToStaticMarkup(await GroupPage({ params: Promise.resolve({ groupId: a }) }));
    expect(mock.history).toHaveBeenCalledWith(a, expect.objectContaining({ period: "month" }), 1);
    expect(html).toContain("Mi asistencia"); expect(html).toContain("Sin datos"); expect(html).toContain("2026-03-01"); expect(html).toContain("2026-03-31");
    expect(html).not.toContain(historyFixture.records[0]!.note);
    expect(html).not.toContain("0.0 %");
  });
  it("un fallo de lectura no se convierte en agenda vacía", async () => {
    mock.home.mockRejectedValue(new Error("No pudimos cargar las actividades. Vuelve a intentarlo."));
    await expect(GroupPage({ params: Promise.resolve({ groupId: a }) })).rejects.toThrow("No pudimos cargar las actividades");
  });
});
