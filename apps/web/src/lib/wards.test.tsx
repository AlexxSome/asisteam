import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mock = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), wardsRange: vi.fn(), groupsRange: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser }, from: mock.from }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("404"); } }));
import { getMyWards, getWard, parseWardsPage } from "./wards";
import WardsPage from "@/app/wards/page";
import WardPage from "@/app/wards/[athleteUserId]/page";

const id = "46000000-0000-4000-8000-000000000111";
const ward = { athlete_user_id: id, full_name: "Pupilo sintético", age: 17, days_until_majority: 1, avatar_url: null };
const groups = [
  { athlete_user_id: id, group_id: "46000000-0000-4000-8000-000000000201", name: "Club de tenis", sport: "Tenis", membership_status: "ACTIVE" },
  { athlete_user_id: id, group_id: "46000000-0000-4000-8000-000000000202", name: "Club de fútbol", sport: "Fútbol", membership_status: "PENDING" },
];
beforeEach(() => {
  vi.resetAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "guardian-auth" } } });
  mock.wardsRange.mockResolvedValue({ data: [ward], error: null });
  mock.groupsRange.mockResolvedValue({ data: groups, error: null });
  mock.maybeSingle.mockResolvedValue({ data: ward, error: null });
  mock.from.mockImplementation((table: string) => {
    const query = { select: () => query, order: () => query, eq: () => query, in: () => query,
      maybeSingle: mock.maybeSingle, range: table === "v_my_wards" ? mock.wardsRange : mock.groupsRange };
    return query;
  });
});

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
    expect(html).toContain("Club de tenis");
    expect(html).toContain("Club de fútbol");
    expect(html).toContain("Pendiente de activación");
    expect(html).toContain("En 1 día tu pupilo administrará su propia cuenta");
    expect(html).not.toContain("@example.test");
  });
  it("perfil ofrece los grupos del pupilo y regreso a la lista", async () => {
    const html = renderToStaticMarkup(await WardPage({ params: Promise.resolve({ athleteUserId: id }) }));
    expect(html).toContain("Perfil deportivo");
    expect(html).toContain("Pupilo sintético");
    expect(html).toContain("17 años");
    expect(html).toContain(`href="/groups/${groups[0]!.group_id}"`);
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
