import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOCIAL_AUTH_ERROR, type SocialLoginInput } from "@asisteam/core";

const mock = vi.hoisted(() => ({ oauth: vi.fn(), set: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signInWithOAuth: mock.oauth } }) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mock.set }) }));
vi.mock("next/navigation", () => ({ redirect: mock.redirect }));
import { loginWithSocial } from "./actions";
import { SOCIAL_CONTEXT_COOKIE } from "@/lib/social-auth";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ASISTEAM_SITE_URL", "https://asisteam.example");
  mock.oauth.mockResolvedValue({ data: { url: "https://auth.example/auth/v1/authorize" }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("inicio OAuth en servidor", () => {
  it.each(["google", "apple"] as const)("%s usa callback fijo y conserva PKCE en el cliente SSR", async provider => {
    await loginWithSocial({ provider });
    expect(mock.oauth).toHaveBeenCalledExactlyOnceWith({ provider, options: {
      redirectTo: "https://asisteam.example/auth/callback", skipBrowserRedirect: true,
    } });
    expect(mock.set).toHaveBeenCalledWith(SOCIAL_CONTEXT_COOKIE, "{}", {
      httpOnly: true, secure: true, sameSite: "lax", path: "/auth/callback", maxAge: 600,
    });
    expect(mock.redirect).toHaveBeenCalledWith("https://auth.example/auth/v1/authorize");
  });
  it("guarda código/QR en cookie; no los envía al proveedor", async () => {
    const context = { invite_code: "ABCD1234", checkin: { activity_id: "58000000-0000-4000-8000-000000000501", token: "a".repeat(64) } };
    await loginWithSocial({ provider: "google", ...context });
    expect(mock.set.mock.calls[0]![1]).toBe(JSON.stringify(context));
    expect(JSON.stringify(mock.oauth.mock.calls)).not.toContain(context.checkin.token);
    expect(JSON.stringify(mock.oauth.mock.calls)).not.toContain(context.invite_code);
  });
  it.each([{ provider: "github" }, { provider: "google", next: "https://evil.example" }, { provider: "apple", invite_code: "bad" }])("rechaza entradas fuera del contrato %j", async input => {
    expect(await loginWithSocial(input as SocialLoginInput)).toEqual({ error: SOCIAL_AUTH_ERROR });
    expect(mock.oauth).not.toHaveBeenCalled();
  });
  it.each(["", "http://asisteam.example", "https://asisteam.example/otro", "https://user:password@asisteam.example"])("rechaza un origen de despliegue inválido %s", async origin => {
    vi.stubEnv("ASISTEAM_SITE_URL", origin);
    expect(await loginWithSocial({ provider: "google" })).toEqual({ error: SOCIAL_AUTH_ERROR });
    expect(mock.oauth).not.toHaveBeenCalled();
  });
  it("error de proveedor/red conserva respuesta genérica sin redirección", async () => {
    mock.oauth.mockResolvedValueOnce({ data: { url: null }, error: { message: "private email" } })
      .mockRejectedValueOnce(new Error("private token"));
    for (let i = 0; i < 2; i++) expect(await loginWithSocial({ provider: "google" })).toEqual({ error: SOCIAL_AUTH_ERROR });
    expect(mock.redirect).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
  });
});
