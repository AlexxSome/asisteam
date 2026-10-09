// Historical Supabase origin regression; not evidence of current native runtime.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkinPath } from "@asisteam/core";
const mock = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), exchange: vi.fn(), from: vi.fn(), select: vi.fn(), eq: vi.fn(), profile: vi.fn(), signOut: vi.fn(), rpc: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mock.get, set: mock.set }) }));
vi.mock("@legacy/lib/supabase/server", () => ({ createClient: async () => ({ auth: { exchangeCodeForSession: mock.exchange, signOut: mock.signOut }, from: mock.from, rpc: mock.rpc }) }));
import { GET } from "@legacy/app/auth/callback/route";
import { SOCIAL_CONTEXT_COOKIE } from "@legacy/lib/social-auth";
const callback = (query = "code=valid") => GET(new Request(`https://untrusted-host.example/auth/callback?${query}`));

beforeEach(() => {
  vi.resetAllMocks();
  mock.rpc.mockResolvedValue({ data: true, error: null });
  vi.stubEnv("ASISTEAM_SITE_URL", "https://asisteam.example");
  mock.get.mockReturnValue({ value: "{}" });
  mock.exchange.mockResolvedValue({ data: { user: { id: "existing-auth-id" } }, error: null });
  mock.from.mockReturnValue({ select: mock.select });
  mock.select.mockReturnValue({ eq: mock.eq });
  mock.eq.mockReturnValue({ maybeSingle: mock.profile });
  mock.profile.mockResolvedValue({ data: { account_status: "ACTIVE" }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("retorno OAuth PKCE", () => {
  it("reutiliza la identidad de Auth y envía a bienvenida sin escrituras de perfil", async () => {
    const response = await callback("code=valid&next=https://evil.example");
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("https://asisteam.example/welcome");
    expect(mock.exchange).toHaveBeenCalledExactlyOnceWith("valid");
    expect(mock.from).toHaveBeenCalledExactlyOnceWith("users");
    expect(mock.select).toHaveBeenCalledWith("account_status");
    expect(mock.eq).toHaveBeenCalledWith("auth_user_id", "existing-auth-id");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(mock.set).toHaveBeenCalledWith(SOCIAL_CONTEXT_COOKIE, "", expect.objectContaining({ path: "/auth/callback", maxAge: 0 }));
  });
  it("conserva el código de grupo", async () => {
    mock.get.mockReturnValue({ value: JSON.stringify({ invite_code: "ABCD1234" }) });
    expect((await callback()).headers.get("Location")).toBe("https://asisteam.example/join?code=ABCD1234");
  });
  it("devuelve el QR en fragmento sin poner el token en query", async () => {
    const checkin = { activity_id: "58000000-0000-4000-8000-000000000501", token: "a".repeat(64) };
    mock.get.mockReturnValue({ value: JSON.stringify({ checkin }) });
    const location = (await callback()).headers.get("Location")!;
    expect(location).toBe(`https://asisteam.example${checkinPath(checkin)}`);
    expect(new URL(location).search).toBe("");
  });
  it.each(["error=access_denied&error_description=private", "", "code=one&code=two"])("cancelación/código inválido devuelve error genérico: %s", async query => {
    const response = await callback(query);
    expect(response.headers.get("Location")).toBe("https://asisteam.example/login?social_error=1");
    expect(mock.exchange).not.toHaveBeenCalled();
  });
  it.each([undefined, "not-json", '{"next":"//evil.example"}'])("no intercambia sin contexto válido (%s)", async value => {
    mock.get.mockReturnValue(value ? { value } : undefined);
    expect((await callback()).headers.get("Location")).toContain("social_error=1");
    expect(mock.exchange).not.toHaveBeenCalled();
  });
  it("código vencido/reutilizado y fallos de red no revelan detalles", async () => {
    mock.exchange.mockResolvedValueOnce({ data: { user: null }, error: { message: "code expired" } }).mockRejectedValueOnce(new Error("network token"));
    for (let i = 0; i < 2; i++) expect((await callback()).headers.get("Location")).toBe("https://asisteam.example/login?social_error=1");
    expect(mock.from).not.toHaveBeenCalled();
  });
  it.each([null, "MANAGED", "INVITED"])("rechaza perfil no ACTIVE (%s) y revoca solo la sesión local", async status => {
    mock.profile.mockResolvedValue({ data: status ? { account_status: status } : null, error: null });
    expect((await callback()).headers.get("Location")).toContain("social_error=1");
    expect(mock.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });
});

it.each(["error=access_denied", "code=valid"])("fallo OAuth conserva invitación validada para reintentar (%s)", async query => {
  mock.get.mockReturnValue({ value: JSON.stringify({ invite_code: "ABCD1234" }) });
  mock.exchange.mockRejectedValue(new Error("network"));
  expect((await callback(query)).headers.get("Location")).toBe("https://asisteam.example/login?invite_code=ABCD1234&social_error=1");
});

it("OAuth sin evidencia pide aceptación y conserva la invitación", async () => {
  mock.rpc.mockResolvedValue({ data: false, error: null });
  mock.get.mockReturnValue({ value: JSON.stringify({ invite_code: "ABCD1234" }) });
  const url = new URL((await callback()).headers.get("Location")!);
  expect(url.pathname).toBe("/accept-terms");
  expect(url.searchParams.get("return_to")).toBe("/join?code=ABCD1234");
  expect(mock.rpc).toHaveBeenCalledExactlyOnceWith("has_account_consent");
});
it("OAuth pendiente conserva QR en fragmento y falla cerrado si no puede verificar evidencia", async () => {
  const checkin = { activity_id: "58000000-0000-4000-8000-000000000501", token: "a".repeat(64) };
  mock.get.mockReturnValue({ value: JSON.stringify({ checkin }) });
  mock.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
  const url = new URL((await callback()).headers.get("Location")!);
  expect(url.pathname).toBe("/accept-terms");
  expect(url.searchParams.get("return_to")).toBe("/check-in");
  expect(url.search).not.toContain(checkin.token);
  expect(url.hash).toBe(new URL(checkinPath(checkin), "https://asisteam.example").hash);
});
