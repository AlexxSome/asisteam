import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SOCIAL_AUTH_ERROR, type SocialLoginInput } from "@asisteam/core";

const mock = vi.hoisted(() => ({ start: vi.fn(), nativeAuthClient: vi.fn(), set: vi.fn(), redirect: vi.fn() }));
vi.mock("@/lib/api/native-auth", () => ({ nativeAuthClient: mock.nativeAuthClient, assertAuthOrigin: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mock.set }) }));
vi.mock("next/navigation", () => ({ redirect: mock.redirect }));
import { loginWithSocial } from "@/app/login/actions";
import { SOCIAL_TRANSACTION_COOKIE } from "@/lib/api/social-auth";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ASISTEAM_SITE_URL", "https://asisteam.example");
  mock.nativeAuthClient.mockResolvedValue({ startSocialLogin: mock.start });
  mock.start.mockResolvedValue({ authorization_url: "https://accounts.google.com/o/oauth2/v2/auth?state=synthetic", transaction: "encrypted-context" });
});
afterEach(() => vi.unstubAllEnvs());

describe("inicio OAuth en servidor", () => {
  it.each(["google", "apple"] as const)("%s guarda la transacción nativa en el callback fijo", async provider => {
    await loginWithSocial({ provider });
    expect(mock.start).toHaveBeenCalledExactlyOnceWith({ body: { provider, context: {} } });
    expect(mock.set).toHaveBeenLastCalledWith(SOCIAL_TRANSACTION_COOKIE, "encrypted-context", expect.objectContaining({
      httpOnly: true, secure: true, sameSite: provider === "apple" ? "none" : "lax", path: "/auth/callback/" + provider, maxAge: 600,
    }));
    expect(mock.redirect).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth?state=synthetic");
  });
  it("envía contexto a Nest y solo guarda su transacción cifrada en cookie", async () => {
    const context = { invite_code: "ABCD1234", checkin: { activity_id: "58000000-0000-4000-8000-000000000501", token: "a".repeat(64) } };
    await loginWithSocial({ provider: "google", ...context });
    expect(mock.start).toHaveBeenCalledWith({ body: { provider: "google", context } });
    expect(mock.set).toHaveBeenLastCalledWith(SOCIAL_TRANSACTION_COOKIE, "encrypted-context", expect.any(Object));
    expect(JSON.stringify(mock.set.mock.calls)).not.toContain(context.checkin.token);
    expect(JSON.stringify(mock.redirect.mock.calls)).not.toContain(context.invite_code);
  });
  it.each([{ provider: "github" }, { provider: "google", next: "https://evil.example" }, { provider: "apple", invite_code: "bad" }])("rechaza entradas fuera del contrato %j", async input => {
    expect(await loginWithSocial(input as SocialLoginInput)).toEqual({ error: SOCIAL_AUTH_ERROR });
    expect(mock.start).not.toHaveBeenCalled();
  });
  it.each(["", "http://asisteam.example", "https://asisteam.example/otro", "https://user:password@asisteam.example"])("rechaza un origen de despliegue inválido %s", async origin => {
    vi.stubEnv("ASISTEAM_SITE_URL", origin);
    expect(await loginWithSocial({ provider: "google" })).toEqual({ error: SOCIAL_AUTH_ERROR });
    expect(mock.start).not.toHaveBeenCalled();
  });
  it("error de proveedor/red conserva respuesta genérica sin redirección", async () => {
    mock.start.mockRejectedValueOnce(new Error("invalid_response private email"))
      .mockRejectedValueOnce(new Error("private token"));
    for (let i = 0; i < 2; i++) expect(await loginWithSocial({ provider: "google" })).toEqual({ error: SOCIAL_AUTH_ERROR });
    expect(mock.redirect).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
  });
});
