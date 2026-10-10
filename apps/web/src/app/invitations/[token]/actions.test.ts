import { ACCOUNT_TERMS_VERSION } from "@asisteam/core";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const mock = vi.hoisted(() => ({ signIn: vi.fn(), getUser: vi.fn(), getSession: vi.fn(), consent: vi.fn(),fetch: vi.fn(),cookie: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "192.0.2.18" }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: {
  getUser: mock.getUser, getSession: mock.getSession,
} }) }));
vi.mock("@/lib/api/native-auth",()=>({nativeAuthClient:async()=>({loginPassword:mock.signIn}),setNativeCookies:mock.cookie,assertAuthOrigin:vi.fn()}));
vi.mock("@/lib/api/server",()=>({createServerApiClient:()=>({getCurrentAccountConsent:mock.consent})}));
import { acceptInvitation, previewInvitation } from "@/app/invitations/[token]/actions";
import { InvitationForm } from "@/app/invitations/[token]/invitation-form";
const token = "synthetic-invitation-token-18";
const registration = { full_name: "Persona invitada", email: "invited@example.test", password: "synthetic-password-18", birthdate: "1990-01-01", terms_accepted: true, terms_version: ACCOUNT_TERMS_VERSION };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("fetch", mock.fetch);
  vi.stubEnv("INVITATION_PROXY_SECRET", "synthetic-proxy-secret");
  vi.stubEnv("ASISTEAM_API_ORIGIN", "http://127.0.0.1:3100");
  mock.signIn.mockResolvedValue({access_token:"new-native-access",refresh_token:"new-native-refresh",expires_in:900});
  mock.consent.mockResolvedValue({accepted:true});
  mock.getUser.mockResolvedValue({ data: { user: { id: "auth-id" } } });
  mock.getSession.mockResolvedValue({ data: { session: { user:{id:"auth-id"}, access_token: "validated-session-token" } } });
  mock.fetch.mockResolvedValue(new Response(JSON.stringify({ group_id: "23000000-0000-4000-8000-000000000201", membership_status: "ACTIVE" })));
});
describe("aceptar invitación", () => {
  it("indisponibilidad de consentimiento falla sin consumir ni redirigir a aceptación", async () => {
    mock.consent.mockRejectedValue(new ApiClientError(503,"unavailable","private-error"));
    expect(await acceptInvitation(token,"session")).toEqual({error:expect.stringContaining("No pudimos procesar")});expect(mock.fetch).not.toHaveBeenCalled();
  });
  it("sesión mezclada con otro usuario falla antes de consumir", async () => {
    mock.getSession.mockResolvedValue({data:{session:{user:{id:"other"},access_token:"private"}}});
    expect(await acceptInvitation(token,"session")).toHaveProperty("error");expect(mock.consent).not.toHaveBeenCalled();expect(mock.fetch).not.toHaveBeenCalled();
  });
  it("cuenta existente sin evidencia acepta condiciones antes de consumir la invitación", async () => {
    mock.consent.mockResolvedValue({accepted:false});
    await expect(acceptInvitation(token, "session")).rejects.toThrow(`redirect:/accept-terms?return_to=${encodeURIComponent(`/invitations/${token}`)}`);
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it("rechaza formato inválido antes de llamar API", async () => {
    expect(await previewInvitation("bad")).toHaveProperty("error");
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it("muestra expiración con la instrucción de reenvío", async () => {
    mock.fetch.mockResolvedValue(new Response(JSON.stringify({ error: { code: "invitation_expired", message: "internal", details:{} } }), { status: 410 }));
    expect(await previewInvitation(token)).toEqual({ error: expect.stringContaining("Pide al ADMIN") });
  });
  it("no expone detalles internos ni el secreto al devolver errores", async () => {
    mock.fetch.mockResolvedValue(new Response(JSON.stringify({ error: { code: "unknown", message: "private internal data", details:{} } }), { status: 500 }));
    const result = await previewInvitation(token);
    expect(result.error).not.toContain("private");
    expect(result.error).not.toContain("synthetic-proxy");
  });
  it("exige condiciones y contraseña válidas antes de crear Auth", async () => {
    expect(await acceptInvitation(token, "register", { ...registration, terms_accepted: false })).toHaveProperty("error");
    expect(await acceptInvitation(token, "register", { ...registration, password: "short" })).toHaveProperty("error");
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it("activa primero y establece cookies nativas solo tras éxito de API", async () => {
    await expect(acceptInvitation(token, "register", registration)).rejects.toThrow("redirect:/groups/23000000-0000-4000-8000-000000000201");
    expect(mock.signIn).toHaveBeenCalledWith({ body:{email:registration.email,password:registration.password} });
    expect(mock.fetch.mock.invocationCallOrder[0]).toBeLessThan(mock.signIn.mock.invocationCallOrder[0]!);
  });
  it("no inicia sesión si la aceptación transaccional fue rechazada", async () => {
    mock.fetch.mockResolvedValue(new Response(JSON.stringify({ error: { code: "registration_failed", message:"Error sintético", details:{} } }), { status: 422 }));
    expect(await acceptInvitation(token, "register", registration)).toHaveProperty("error");
    expect(mock.signIn).not.toHaveBeenCalled();
  });
  it("login y aceptación suceden con el JWT de la sesión comprobada", async () => {
    await expect(acceptInvitation(token, "login", registration)).rejects.toThrow("redirect:/groups/23000000-0000-4000-8000-000000000201");
    const options = mock.fetch.mock.calls[0]?.[1];
    expect(new Headers(options.headers).get("authorization")).toBe("Bearer validated-session-token");
    expect(new Headers(options.headers).get("x-asisteam-client-ip")).toBe("192.0.2.18");
    expect(JSON.parse(options.body)).toEqual({token});
  });
  it("sin sesión no llama a la aceptación", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    expect(await acceptInvitation(token, "session")).toHaveProperty("error");
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it("menor PENDING recibe estado pendiente, sin redirigir a un grupo invisible", async () => {
    mock.fetch.mockResolvedValue(new Response(JSON.stringify({ group_id: "23000000-0000-4000-8000-000000000201", membership_status: "PENDING" })));
    expect(await acceptInvitation(token, "session")).toEqual({ pending: true });
  });
  it("claim de membership INACTIVE no redirige a un grupo sin acceso", async () => {
    mock.fetch.mockResolvedValue(new Response(JSON.stringify({ group_id: "23000000-0000-4000-8000-000000000201", membership_status: "INACTIVE" })));
    await expect(acceptInvitation(token, "register", registration)).rejects.toThrow("redirect:/groups");
  });
  it("el enlace MANAGED muestra contraseña propia y conserva el perfil sin pedir sus datos otra vez", () => {
    const html = renderToStaticMarkup(createElement(InvitationForm, { token, managedActivation: true, signedInUser: true }));
    expect(html).toContain("Activar mi cuenta y ver mi historial");
    expect(html).toContain('name="terms_accepted"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).not.toContain('name="birthdate"');
    expect(html).not.toContain('name="full_name"');
    expect(html).not.toContain("Usar mi sesión");
  });
  it("reclama con credenciales, establece sesión y abre el historial previo", async () => {
    const credentials = { email: registration.email, password: registration.password, terms_accepted: true, terms_version: ACCOUNT_TERMS_VERSION };
    await expect(acceptInvitation(token, "claim", credentials)).rejects.toThrow("redirect:/groups/23000000-0000-4000-8000-000000000201/me/history");
    expect(JSON.parse(mock.fetch.mock.calls[0]?.[1].body)).toEqual({token,registration:credentials});
    expect(mock.signIn).toHaveBeenCalledWith({ body:{email:credentials.email,password:credentials.password} });
  });
  it("reclamo bloqueado por apoderado muestra consentimiento y no inicia sesión", async () => {
    mock.fetch.mockResolvedValue(new Response(JSON.stringify({ error: { code: "guardian_consent_required", message:"Error sintético", details:{} } }), { status: 422 }));
    expect(await acceptInvitation(token, "claim", { email: registration.email, password: registration.password, terms_accepted: true, terms_version: ACCOUNT_TERMS_VERSION }))
      .toEqual({ error: expect.stringContaining("Tu apoderado debe otorgar") });
    expect(mock.signIn).not.toHaveBeenCalled();
  });
  it("el reclamo no reemplaza perfil ni habilita grupos pendientes o inactivos", async () => {
    expect(await acceptInvitation(token, "claim", registration)).toHaveProperty("error");
    expect(mock.fetch).not.toHaveBeenCalled();
    const credentials = { email: registration.email, password: registration.password, terms_accepted: true, terms_version: ACCOUNT_TERMS_VERSION };
    mock.fetch.mockResolvedValue(new Response(JSON.stringify({ group_id: "23000000-0000-4000-8000-000000000201", membership_status: "PENDING" })));
    expect(await acceptInvitation(token, "claim", credentials)).toEqual({ pending: true });
    mock.fetch.mockResolvedValue(new Response(JSON.stringify({ group_id: "23000000-0000-4000-8000-000000000201", membership_status: "INACTIVE" })));
    await expect(acceptInvitation(token, "claim", credentials)).rejects.toThrow("redirect:/groups");
  });
});

afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
