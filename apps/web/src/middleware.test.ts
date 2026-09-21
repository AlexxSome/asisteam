import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mock = vi.hoisted(() => ({ getUser: vi.fn(), maybeSingle: vi.fn(), from: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (cookies: unknown[]) => void } }) => {
  options.cookies.setAll([{ name: "refreshed-session", value: "synthetic", options: { httpOnly: true } }]);
  return { auth: { getUser: mock.getUser }, from: mock.from };
} }));
import { middleware } from "./middleware";
const groupId = "17000000-0000-4000-8000-000000000201";
beforeEach(() => {
  vi.resetAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "user" } } });
  mock.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: mock.maybeSingle }) }) });
  mock.maybeSingle.mockResolvedValue({ data: { id: groupId, roles: ["ADMIN"] }, error: null });
});
const request = (path: string) => new NextRequest(`http://localhost:3000${path}`);

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
