import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ signIn: vi.fn(), getUser: vi.fn(), getSession: vi.fn(), fetch: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "192.0.2.18" }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: {
  signInWithPassword: mock.signIn, getUser: mock.getUser, getSession: mock.getSession,
} }) }));
import { acceptInvitation, previewInvitation } from "./actions";
const token = "synthetic-invitation-token-18";
const registration = { full_name: "Persona invitada", email: "invited@example.test", password: "synthetic-password-18", birthdate: "1990-01-01", terms_accepted: true };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("fetch", mock.fetch);
  vi.stubEnv("INVITATION_PROXY_SECRET", "synthetic-proxy-secret");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  mock.signIn.mockResolvedValue({ error: null });
  mock.getUser.mockResolvedValue({ data: { user: { id: "auth-id" } } });
  mock.getSession.mockResolvedValue({ data: { session: { access_token: "validated-session-token" } } });
  mock.fetch.mockResolvedValue(new Response(JSON.stringify({ group_id: "group-id", membership_status: "ACTIVE" })));
});
describe("aceptar invitación", () => {
  it("rechaza formato inválido antes de llamar Edge", async () => {
    expect(await previewInvitation("bad")).toHaveProperty("error");
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it("muestra expiración con la instrucción de reenvío", async () => {
    mock.fetch.mockResolvedValue(new Response(JSON.stringify({ error: { code: "invitation_expired", message: "internal" } }), { status: 410 }));
    expect(await previewInvitation(token)).toEqual({ error: expect.stringContaining("Pide al ADMIN") });
  });
  it("no expone detalles internos ni el secreto al devolver errores", async () => {
    mock.fetch.mockResolvedValue(new Response(JSON.stringify({ error: { code: "unknown", message: "private internal data" } }), { status: 500 }));
    const result = await previewInvitation(token);
    expect(result.error).not.toContain("private");
    expect(result.error).not.toContain("synthetic-proxy");
  });
  it("exige condiciones y contraseña válidas antes de crear Auth", async () => {
    expect(await acceptInvitation(token, "register", { ...registration, terms_accepted: false })).toHaveProperty("error");
    expect(await acceptInvitation(token, "register", { ...registration, password: "short" })).toHaveProperty("error");
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it("activa primero y establece sesión SSR solo tras éxito de Edge", async () => {
    await expect(acceptInvitation(token, "register", registration)).rejects.toThrow("redirect:/groups/group-id");
    expect(mock.signIn).toHaveBeenCalledWith({ email: registration.email, password: registration.password });
    expect(mock.fetch.mock.invocationCallOrder[0]).toBeLessThan(mock.signIn.mock.invocationCallOrder[0]!);
  });
  it("no inicia sesión si la aceptación transaccional fue rechazada", async () => {
    mock.fetch.mockResolvedValue(new Response(JSON.stringify({ error: { code: "registration_failed" } }), { status: 422 }));
    expect(await acceptInvitation(token, "register", registration)).toHaveProperty("error");
    expect(mock.signIn).not.toHaveBeenCalled();
  });
  it("login y aceptación suceden con el JWT de la sesión comprobada", async () => {
    await expect(acceptInvitation(token, "login", registration)).rejects.toThrow("redirect:/groups/group-id");
    const options = mock.fetch.mock.calls[0]?.[1];
    expect(options.headers.Authorization).toBe("Bearer validated-session-token");
    expect(options.headers["x-asisteam-client-ip"]).toBe("192.0.2.18");
    expect(JSON.parse(options.body)).toEqual({ action: "accept", token });
  });
  it("sin sesión no llama a la aceptación", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect(await acceptInvitation(token, "session")).toHaveProperty("error");
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it("menor PENDING recibe estado pendiente, sin redirigir a un grupo invisible", async () => {
    mock.fetch.mockResolvedValue(new Response(JSON.stringify({ group_id: "group-id", membership_status: "PENDING" })));
    expect(await acceptInvitation(token, "session")).toEqual({ pending: true });
  });
});
