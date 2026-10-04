import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getSocialProviderAvailability } from "./social-auth";
const fetchSettings = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchSettings);
  vi.stubEnv("ASISTEAM_SITE_URL", "https://asisteam.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic.supabase.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-public-key");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("proyecta solo los booleanos públicos de Google/Apple sin propagar configuración", async () => {
  fetchSettings.mockResolvedValue(new Response(JSON.stringify({ external: { google: true, apple: false, github: true }, private_setting: "do-not-project" })));
  expect(await getSocialProviderAvailability()).toEqual({ google: true, apple: false });
  expect(fetchSettings).toHaveBeenCalledWith("https://synthetic.supabase.test/auth/v1/settings", expect.objectContaining({
    headers: { apikey: "synthetic-public-key" }, cache: "no-store", signal: expect.any(AbortSignal),
  }));
});

it.each([null, {}, { external: null }, { external: { google: "false", apple: 1 } }])("no confunde capacidad desconocida con deshabilitada: %j", async settings => {
  fetchSettings.mockResolvedValue(new Response(JSON.stringify(settings)));
  expect(await getSocialProviderAvailability()).toEqual({ google: null, apple: null });
});

it("fallos de red/HTTP se recuperan como desconocidos sin error privado", async () => {
  fetchSettings.mockRejectedValueOnce(new Error("private details"))
    .mockResolvedValueOnce(new Response("private error", { status: 503 }));
  for (let i = 0; i < 2; i++) expect(await getSocialProviderAvailability()).toEqual({ google: null, apple: null });
});

it("sin origen seguro comunica OAuth no disponible y no consulta al proveedor", async () => {
  vi.stubEnv("ASISTEAM_SITE_URL", "https://user:password@asisteam.test");
  expect(await getSocialProviderAvailability()).toEqual({ google: false, apple: false });
  expect(fetchSettings).not.toHaveBeenCalled();
});
