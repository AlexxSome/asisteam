import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ getUser: vi.fn(), getSession: vi.fn(), fetch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.getUser, getSession: mock.getSession } }) }));
import { createServerApiClient } from "./server";
import { moduleTransport, runModuleOperation } from "./transport";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ASISTEAM_API_ORIGIN", "http://127.0.0.1:3001");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic.supabase.co");
  vi.stubEnv("ASISTEAM_API_SUPABASE_URL", "https://synthetic.supabase.co/");
  vi.stubEnv("ASISTEAM_TRANSPORT_GROUPS", undefined);
  vi.stubEnv("ASISTEAM_TRANSPORT_PROFILE", undefined);
  vi.stubEnv("ASISTEAM_API_TIMEOUT_MS", "5000");
  vi.stubGlobal("fetch", mock.fetch);
  mock.getUser.mockResolvedValue({ data: { user: { id: "fixture-user" } }, error: null });
  mock.getSession.mockResolvedValue({ data: { session: { user: { id: "fixture-user" }, access_token: "synthetic-only" } }, error: null });
  mock.fetch.mockResolvedValue(new Response(JSON.stringify({ group_id: "17000000-0000-4000-8000-000000000201" }), { status: 201 }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("adaptador exclusivo servidor Next", () => {
  it("valida usuario antes de extraer el token y no retorna sesión al consumidor", async () => {
    const data = await createServerApiClient().createGroup({ body: { name: "Equipo", sport: "Fútbol" } });
    expect(data).toEqual({ group_id: "17000000-0000-4000-8000-000000000201" });
    expect(mock.getUser.mock.invocationCallOrder[0]).toBeLessThan(mock.getSession.mock.invocationCallOrder[0]!);
    expect(mock.fetch.mock.calls[0]![1].headers.authorization).toBe("Bearer synthetic-only");
    expect(JSON.stringify(data)).not.toContain("synthetic-only");
  });
  it.each(["missing", "invalid", "mismatch"])("sesión %s falla sin HTTP ni filtración", async mode => {
    if (mode === "missing") mock.getUser.mockResolvedValue({ data: { user: null }, error: null });
    if (mode === "invalid") mock.getSession.mockResolvedValue({ data: { session: null }, error: { message: "private-fixture" } });
    if (mode === "mismatch") mock.getSession.mockResolvedValue({ data: { session: { user: { id: "other-user" }, access_token: "private-fixture" } }, error: null });
    await expect(createServerApiClient().getOwnProfile()).rejects.toMatchObject({ status: 401 });
    expect(mock.fetch).not.toHaveBeenCalled();
  });
  it("rollback de bandera usa exactamente un ejecutor por write sobre fixture común", async () => {
    const store: string[] = [];
    const supabase = vi.fn(async () => { store.push("supabase"); return "ok"; });
    const nest = vi.fn(async () => { store.push("nest"); return "ok"; });
    expect(await runModuleOperation("groups", { supabase, nest })).toBe("ok");
    vi.stubEnv("ASISTEAM_TRANSPORT_GROUPS", "nest");
    expect(await runModuleOperation("groups", { supabase, nest })).toBe("ok");
    vi.stubEnv("ASISTEAM_TRANSPORT_GROUPS", "supabase");
    expect(await runModuleOperation("groups", { supabase, nest })).toBe("ok");
    expect(store).toEqual(["supabase", "nest", "supabase"]);
    expect(moduleTransport("profile")).toBe("supabase");
  });
  it("timeout o error de Nest nunca ejecuta fallback/segundo write", async () => {
    vi.stubEnv("ASISTEAM_TRANSPORT_GROUPS", "nest");
    vi.stubEnv("ASISTEAM_API_TIMEOUT_MS", "10");
    mock.fetch.mockImplementation(() => new Promise(() => {}));
    const supabase = vi.fn(async () => ({ group_id: "never" }));
    await expect(runModuleOperation("groups", { supabase, nest: client => client.createGroup({ body: { name: "Equipo", sport: "Fútbol" } }) })).rejects.toMatchObject({ status: 504 });
    expect(supabase).not.toHaveBeenCalled();
    expect(mock.fetch).toHaveBeenCalledTimes(1);
  });
  it.each(["https://other.supabase.co", ""])("base de coexistencia distinta/ausente falla antes de escribir", async target => {
    vi.stubEnv("ASISTEAM_TRANSPORT_GROUPS", "nest");
    vi.stubEnv("ASISTEAM_API_SUPABASE_URL", target);
    const supabase = vi.fn(async () => "unexpected"); const nest = vi.fn(async () => "unexpected");
    await expect(runModuleOperation("groups", { supabase, nest })).rejects.toMatchObject({ status: 400 });
    expect(supabase).not.toHaveBeenCalled(); expect(nest).not.toHaveBeenCalled();
  });
  it("valor de bandera desconocido falla cerrado", () => {
    vi.stubEnv("ASISTEAM_TRANSPORT_GROUPS", "nesst");
    expect(() => moduleTransport("groups")).toThrow("Revisa los datos");
  });
});
