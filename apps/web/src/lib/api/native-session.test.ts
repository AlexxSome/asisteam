import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiClientError } from "@asisteam/api-client";
const mock = vi.hoisted(() => ({ get: vi.fn(), getAll: vi.fn(), set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => mock, headers: async () => new Headers({ origin: "https://web.example.test" }) }));
import { clearNativeCookies, nativeAuthClient, nativeUser, setNativeCookies } from "./native-auth";
import { NATIVE_ACCESS_COOKIE, NATIVE_REFRESH_COOKIE, authCookieSettings } from "./native-auth-config";
import { saveSocialTransaction, SOCIAL_TRANSACTION_COOKIE } from "./social-auth";
import { createClient } from "@/lib/supabase/server";
const access = `header.${Buffer.from(JSON.stringify({ sub: "synthetic-subject" })).toString("base64url")}.signature`;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ASISTEAM_API_ORIGIN", "https://api.example.test");
  vi.stubEnv("NATIVE_AUTH_PROXY_SECRET", "synthetic-only-".repeat(5));
  mock.getAll.mockReturnValue([]);
  mock.get.mockImplementation(name => name === NATIVE_ACCESS_COOKIE ? { value: access } : undefined);
  vi.spyOn(ApiClient.prototype, "getSession").mockResolvedValue({ user_id: "synthetic-subject" });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe("cookies y sesión SSR del stack independiente", () => {
  it("elimina ambas cookies conservando HttpOnly/Secure/Lax/path y expiración cero", async () => {
    await clearNativeCookies();
    expect(mock.set.mock.calls).toEqual([
      [NATIVE_ACCESS_COOKIE, "", authCookieSettings(0)],
      [NATIVE_REFRESH_COOKIE, "", authCookieSettings(0)],
    ]);
  });
  it("propaga errores de escritura y leer una sesión no intenta escribir cookies", async () => {
    mock.set.mockImplementation(() => { throw new Error("read-only cookies"); });
    await expect(clearNativeCookies()).rejects.toThrow("read-only cookies");
    await expect(setNativeCookies({ access_token: access, refresh_token: "r".repeat(64) })).rejects.toThrow("read-only cookies");
    mock.set.mockClear();
    expect((await (await createClient()).auth.getUser()).data.user?.id).toBe("synthetic-subject");
    expect(mock.set).not.toHaveBeenCalled();
  });
  it("recuperación en otro navegador usa el token explícito sin almacenar ni sustituir una sesión", async () => {
    mock.get.mockReturnValue(undefined);
    const reset = vi.spyOn(ApiClient.prototype, "resetPassword").mockResolvedValue({ success: true });
    const refresh = vi.spyOn(ApiClient.prototype, "refreshSession");
    await (await nativeAuthClient()).resetPassword({ body: { token: "a".repeat(64), password: "Synthetic-password-1" } });
    expect(reset).toHaveBeenCalledWith({ body: { token: "a".repeat(64), password: "Synthetic-password-1" } });
    expect(refresh).not.toHaveBeenCalled();
    expect(mock.set).not.toHaveBeenCalled();
  });
  it.each(["production", "development"])("%s persiste la transacción OAuth nativa con HttpOnly y un plazo corto", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    // S256 and encrypted verifier are verified by API social-auth.integration.mjs.
    // The browser persists only the API transaction, never the verifier itself.
    await saveSocialTransaction("google", "synthetic-encrypted-transaction");
    expect(mock.set).toHaveBeenCalledWith(SOCIAL_TRANSACTION_COOKIE, "synthetic-encrypted-transaction", expect.objectContaining({
      httpOnly: true, secure: environment === "production", sameSite: "lax", path: "/auth/callback/google", maxAge: 600,
    }));
    expect(mock.set.mock.calls.some(([name]) => name.includes("code-verifier"))).toBe(false);
  });
  it("no confía en un sub decodificado si la API rechaza la firma o la familia", async () => {
    vi.spyOn(ApiClient.prototype, "getSession").mockRejectedValue(new ApiClientError(401, "authentication_required"));
    expect(await nativeUser()).toBeNull();
    expect((await (await createClient()).auth.getSession()).data.session).toBeNull();
    expect(mock.set).not.toHaveBeenCalled();
  });
  it("no convierte una indisponibilidad de autenticación en un usuario anónimo", async () => {
    vi.spyOn(ApiClient.prototype, "getSession").mockRejectedValue(new ApiClientError(503, "service_unavailable"));
    await expect(nativeUser()).rejects.toMatchObject({ status: 503 });
  });
});
