import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mock = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), order: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), cookie: vi.fn() }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mock.cookie }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("404"); } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser }, from: mock.from }) }));
import { getGroup, getMyGroups, groupHomePath } from "./groups";
import GroupPage from "@/app/groups/[groupId]/page";
import GroupSettingsPage from "@/app/groups/[groupId]/settings/page";

const a = "17000000-0000-4000-8000-000000000201";
const b = "17000000-0000-4000-8000-000000000202";
const groups = [
  { id: a, name: "Equipo A", sport: null, logo_url: null, roles: ["ADMIN", "ATHLETE"] },
  { id: b, name: "Equipo B", sport: null, logo_url: null, roles: ["ATHLETE"] },
];
beforeEach(() => {
  vi.resetAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "auth-user" } } });
  mock.order.mockReturnValue({ order: () => Promise.resolve({ data: groups, error: null }) });
  mock.eq.mockReturnValue({ maybeSingle: mock.maybeSingle });
  mock.from.mockReturnValue({ select: () => ({ order: mock.order, eq: mock.eq }) });
  mock.maybeSingle.mockResolvedValue({ data: { ...groups[0], description: null, settings: null, invite_code: "CODE0001" }, error: null });
});

describe("contexto de grupos", () => {
  it("exige sesión antes de consultar grupos", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    await expect(getMyGroups()).rejects.toThrow("redirect:/login");
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("usa solo la vista proyectada y conserva multi-rol", async () => {
    expect((await getMyGroups()).groups).toEqual(groups);
    expect(mock.from).toHaveBeenCalledWith("v_my_groups");
  });
  it("restaura solo preferencias que siguen visibles", async () => {
    mock.cookie.mockReturnValue({ value: b });
    expect(await groupHomePath()).toBe(`/groups/${b}`);
    expect(mock.cookie).toHaveBeenCalledWith("asisteam-group-auth-user");
    mock.cookie.mockReturnValue({ value: "grupo-ajeno-o-revocado" });
    expect(await groupHomePath()).toBe("/groups");
  });
  it("sin grupos lleva a bienvenida; con uno entra directamente", async () => {
    mock.order.mockReturnValue({ order: () => Promise.resolve({ data: [], error: null }) });
    expect(await groupHomePath()).toBe("/welcome");
    mock.order.mockReturnValue({ order: () => Promise.resolve({ data: [groups[1]], error: null }) });
    expect(await groupHomePath()).toBe(`/groups/${b}`);
  });
  it("un fallo de lectura no se confunde con no tener grupos", async () => {
    mock.order.mockReturnValue({ order: () => Promise.resolve({ data: null, error: { message: "secret" } }) });
    await expect(groupHomePath()).rejects.toThrow("No pudimos cargar tus grupos");
  });
  it("rechaza ID inválido o ajeno antes de cargar detalle", async () => {
    await expect(getGroup("bad-id")).rejects.toThrow("404");
    await expect(getGroup("17000000-0000-4000-8000-000000000999")).rejects.toThrow("404");
    expect(mock.maybeSingle).not.toHaveBeenCalled();
  });
  it("deniega si la membresía se revoca entre lista y detalle", async () => {
    mock.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getGroup(a)).rejects.toThrow("404");
  });
  it("usa los roles actuales del detalle si ADMIN se revoca durante la petición", async () => {
    mock.maybeSingle.mockResolvedValue({ data: { ...groups[0], roles: ["ATHLETE"], invite_code: null, settings: null }, error: null });
    expect((await getGroup(a)).roles).toEqual(["ATHLETE"]);
  });
  it("ADMIN+ATHLETE muestra administración y Mi asistencia", async () => {
    const html = renderToStaticMarkup(await GroupPage({ params: Promise.resolve({ groupId: a }) }));
    expect(html).toContain("Administración del grupo");
    expect(html).toContain("Mi asistencia");
  });
  it("al cambiar a ATHLETE desaparece administración y no accede a settings", async () => {
    mock.maybeSingle.mockResolvedValue({ data: { ...groups[1], description: null, settings: null, invite_code: null }, error: null });
    const html = renderToStaticMarkup(await GroupPage({ params: Promise.resolve({ groupId: b }) }));
    expect(html).toContain("Mi asistencia");
    expect(html).not.toContain("Administración del grupo");
    expect(html).not.toContain("CODE0001");
    await expect(GroupSettingsPage({ params: Promise.resolve({ groupId: b }) })).rejects.toThrow("404");
  });
});
