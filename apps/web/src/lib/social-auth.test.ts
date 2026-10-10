import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getSocialProviderAvailability } from "@/lib/social-auth";
const fetchSettings = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchSettings);
  vi.stubEnv("ASISTEAM_SITE_URL", "https://asisteam.test");
  vi.stubEnv("ASISTEAM_API_ORIGIN", "https://api.example.test");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("proyecta solo los booleanos públicos de Google/Apple sin propagar configuración", async () => {
  fetchSettings.mockResolvedValue(new Response(JSON.stringify({google:true,apple:false})));
  expect(await getSocialProviderAvailability()).toEqual({ google: true, apple: false });
  const [url,options]=fetchSettings.mock.calls[0]!;
  expect(String(url)).toBe("https://api.example.test/api/v1/auth/social/providers");
  expect(options.method).toBe("GET");expect(options.credentials).toBe("omit");expect(options.cache).toBe("no-store");
  expect(typeof options.signal.addEventListener).toBe("function");
  expect(new Headers(options.headers).has("apikey")).toBe(false);
});

it.each([null, {}, {google:true,apple:false,private_setting:"do-not-project"}, {google:"false",apple:1}])("no confunde capacidad desconocida con deshabilitada: %j", async settings => {
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
