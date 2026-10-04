import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mock = vi.hoisted(() => ({ getUser: vi.fn(), maybeSingle: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (cookies: unknown[]) => void } }) => {
  options.cookies.setAll([{ name: "refreshed-session", value: "synthetic", options: { httpOnly: true } }]);
  return { auth: { getUser: mock.getUser }, from: mock.from, rpc: mock.rpc };
} }));
import { middleware } from "./middleware";
const groupId = "17000000-0000-4000-8000-000000000201";
beforeEach(() => {
  vi.resetAllMocks();
  mock.rpc.mockResolvedValue({ data: true, error: null });
  mock.getUser.mockResolvedValue({ data: { user: { id: "user" } } });
  mock.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: mock.maybeSingle }) }) });
  mock.maybeSingle.mockResolvedValue({ data: { id: groupId, roles: ["ADMIN"] }, error: null });
});
const request = (path: string) => new NextRequest(`http://localhost:3000${path}`);

describe("aceptación pendiente", () => {
  it.each(["/", "/welcome", "/profile", "/groups", "/groups/new", `/groups/${groupId}/settings`, "/wards", "/check-in"])("no se elude entrando directamente a %s", async path => {
    mock.rpc.mockResolvedValue({ data: false, error: null });
    const response = await middleware(request(path));
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("Location")!).pathname).toBe("/accept-terms");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.cookies.get("refreshed-session")?.httpOnly).toBe(true);
    expect(mock.from).not.toHaveBeenCalled();
  });
  it.each(["/accept-terms", "/legal/2026-09-21", "/login", "/register", "/auth/callback", "/reset-password", "/invitations/" + "a".repeat(32)])("%s sigue accesible sin aceptar", async path => {
    mock.rpc.mockResolvedValue({ data: false });
    expect((await middleware(request(path))).status).toBe(200);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it("conserva código válido y falla cerrado ante error sin divulgarlo", async () => {
    mock.rpc.mockResolvedValue({ data: null, error: { message: "private detail" } });
    const response = await middleware(request("/join?code=ABCD1234&token=secret"));
    expect(new URL(response.headers.get("Location")!).searchParams.get("return_to")).toBe("/join?code=ABCD1234");
    expect(response.headers.get("Location")).not.toMatch(/secret|private/);
  });
});

describe("cache de superficies autenticadas", () => {
  it.each(["/profile", "/groups", "/wards", "/welcome"])("%s evita almacenar datos privados en el navegador", async path => {
    const response = await middleware(request(path));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.cookies.get("refreshed-session")?.value).toBe("synthetic");
  });
});

describe("HTTP 404 de recursos por grupo", () => {
  it("permite rutas globales y conserva cookies de sesión refrescadas", async () => {
    const response = await middleware(request("/groups/new"));
    expect(response.status).toBe(200);
    expect(mock.from).not.toHaveBeenCalled();
    expect(response.cookies.get("refreshed-session")?.value).toBe("synthetic");
  });
  it("devuelve el mismo 404 para ajeno, inexistente e identificador inválido", async () => {
    mock.maybeSingle.mockResolvedValue({ data: null });
    const bodies = [];
    for (const path of [`/groups/${groupId}`, `/groups/${groupId}/activities/secret`, "/groups/invalid/settings", `/groups/${groupId}/private.png`]) {
      const response = await middleware(request(path));
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect(response.cookies.get("refreshed-session")?.httpOnly).toBe(true);
      bodies.push(await response.text());
    }
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).not.toContain(groupId);
  });
  it("sin sesión devuelve 404 sin consultar datos", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await middleware(request(`/groups/${groupId}`))).status).toBe(404);
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("un ATHLETE no entra por URL directa a configuración", async () => {
    mock.maybeSingle.mockResolvedValue({ data: { id: groupId, roles: ["ATHLETE"] } });
    expect((await middleware(request(`/groups/${groupId}/settings`))).status).toBe(404);
    expect((await middleware(request(`/groups/${groupId}`))).status).toBe(200);
  });
  it("revalida permisos en cada petición y falla cerrado ante error", async () => {
    expect((await middleware(request(`/groups/${groupId}/settings`))).status).toBe(200);
    mock.maybeSingle.mockResolvedValue({ data: null, error: { message: "internal detail" } });
    const response = await middleware(request(`/groups/${groupId}/settings`));
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("internal detail");
  });
  it.each(["ATHLETE", "GUARDIAN"])("%s no accede al alta MANAGED por URL directa", async role => {
    mock.maybeSingle.mockResolvedValue({ data: { id: groupId, roles: [role] } });
    expect((await middleware(request(`/groups/${groupId}/members/new`))).status).toBe(404);
    mock.maybeSingle.mockResolvedValue({ data: { id: groupId, roles: [role, "ADMIN"] } });
    expect((await middleware(request(`/groups/${groupId}/members/new`))).status).toBe(200);
  });
});

describe("HTTP 403 acotado a la toma de asistencia", () => {
  const path = `/groups/${groupId}/activities/17000000-0000-4000-8000-000000000501/attendance`;
  it.each(["ATHLETE", "GUARDIAN"])("%s activo recibe 403 y mantiene cookies", async (role) => {
    mock.maybeSingle.mockResolvedValue({ data: { id: groupId, roles: [role] } });
    const response = await middleware(request(path));
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.cookies.get("refreshed-session")?.httpOnly).toBe(true);
    expect(await response.text()).toContain("No tienes permisos");
    expect((await middleware(request(path.replace("/attendance", "")))).status).toBe(200);
  });
  it("ADMIN multirol accede y un grupo ajeno sigue dando 404", async () => {
    mock.maybeSingle.mockResolvedValue({ data: { id: groupId, roles: ["ATHLETE", "ADMIN"] } });
    expect((await middleware(request(path))).status).toBe(200);
    mock.maybeSingle.mockResolvedValue({ data: null });
    expect((await middleware(request(path))).status).toBe(404);
  });
});

describe("HTTP 404 del perfil de pupilos", () => {
  it("lista sin cache y verifica el vínculo antes de servir un perfil", async () => {
    expect((await middleware(request("/wards"))).headers.get("Cache-Control")).toContain("no-store");
    expect(mock.from).not.toHaveBeenCalled();
    mock.maybeSingle.mockResolvedValue({ data: { athlete_user_id: groupId }, error: null });
    const response = await middleware(request(`/wards/${groupId}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mock.from).toHaveBeenCalledWith("v_my_wards");
  });
  it("ajeno, inexistente, vínculo inactivo y error conservan el mismo 404 sin PII", async () => {
    const bodies = [];
    for (const error of [null, { message: "secret" }]) {
      mock.maybeSingle.mockResolvedValue({ data: null, error });
      for (const id of [groupId, "46000000-0000-4000-8000-000000000999", "invalid", "private.png"]) {
        const response = await middleware(request(`/wards/${id}`));
        expect(response.status).toBe(404);
        expect(response.headers.get("Cache-Control")).toContain("no-store");
        expect(response.cookies.get("refreshed-session")?.httpOnly).toBe(true);
        bodies.push(await response.text());
      }
    }
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).not.toContain("secret");
    expect(bodies[0]).not.toContain(groupId);
  });
  it("sin sesión no consulta ni revela el pupilo", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await middleware(request(`/wards/${groupId}`))).status).toBe(404);
    expect(mock.from).not.toHaveBeenCalled();
  });
  it("pierde el acceso en la siguiente petición tras cumplir 18 o revocar vínculo", async () => {
    mock.maybeSingle.mockResolvedValueOnce({ data: { athlete_user_id: groupId } }).mockResolvedValueOnce({ data: null });
    expect((await middleware(request(`/wards/${groupId}`))).status).toBe(200);
    expect((await middleware(request(`/wards/${groupId}`))).status).toBe(404);
  });
});

describe("COACH: permisos limitados por grupo", () => {
  it.each(["settings", "settings/visibility", "members", "members/new", "members/pending", "invitations/new", "guardians", "activity-types", "activities/new", "activities/id/edit"])("%s responde 403 antes del streaming", async path => {
    mock.maybeSingle.mockResolvedValue({ data: { id: groupId, roles: ["ATHLETE", "COACH"] } });
    const response = await middleware(request(`/groups/${groupId}/${path}`));
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.cookies.get("refreshed-session")?.httpOnly).toBe(true);
  });
  it("permite asistencia/reportes y respeta la unión con ADMIN/GUARDIAN", async () => {
    mock.maybeSingle.mockResolvedValue({ data: { id: groupId, roles: ["COACH"] } });
    for (const path of ["activities/id/attendance", "reports"]) expect((await middleware(request(`/groups/${groupId}/${path}`))).status).toBe(200);
    mock.maybeSingle.mockResolvedValue({ data: { id: groupId, roles: ["COACH", "ADMIN"] } });
    expect((await middleware(request(`/groups/${groupId}/members`))).status).toBe(200);
    mock.maybeSingle.mockResolvedValue({ data: { id: groupId, roles: ["COACH", "GUARDIAN"] } });
    expect((await middleware(request(`/groups/${groupId}/members/consent`))).status).toBe(200);
    mock.maybeSingle.mockResolvedValue({ data: null });
    expect((await middleware(request(`/groups/${groupId}/members`))).status).toBe(404);
  });
  it("revocar COACH retira el acceso operativo en la petición siguiente", async () => {
    mock.maybeSingle.mockResolvedValueOnce({ data: { id: groupId, roles: ["COACH", "ATHLETE"] } })
      .mockResolvedValueOnce({ data: { id: groupId, roles: ["ATHLETE"] } });
    const path = `/groups/${groupId}/activities/id/attendance`;
    expect((await middleware(request(path))).status).toBe(200);
    expect((await middleware(request(path))).status).toBe(403);
  });
});

 describe("facturación del club", () => {
   it.each(["ATHLETE", "GUARDIAN", "COACH"])("%s no puede ver facturas ni checkout", async role => {
     mock.maybeSingle.mockResolvedValue({ data: { id: groupId, roles: [role] } });
     expect((await middleware(request(`/groups/${groupId}/billing`))).status).toBe(403);
     mock.maybeSingle.mockResolvedValue({ data: { id: groupId, roles: [role, "ADMIN"] } });
     expect((await middleware(request(`/groups/${groupId}/billing`))).status).toBe(200);
     mock.maybeSingle.mockResolvedValue({ data: null });
     expect((await middleware(request(`/groups/${groupId}/billing`))).status).toBe(404);
   });
 });
