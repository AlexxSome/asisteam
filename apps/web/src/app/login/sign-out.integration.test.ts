import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient as createSupabaseClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const mock = vi.hoisted(() => ({ jar: new Map<string, string>(), writes: vi.fn(), revalidatePath: vi.fn(), redirect: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  getAll: () => [...mock.jar].map(([name, value]) => ({ name, value })),
  set: (name: string, value: string, options: { maxAge?: number }) => {
    mock.writes(name, value, options);
    if (options.maxAge === 0) mock.jar.delete(name);
    else mock.jar.set(name, value);
  },
}) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mock.redirect, RedirectType: { replace: "replace" } }));
import { createClient } from "@/lib/supabase/server";
import { signOutUser } from "./actions";

const suite = describe.skipIf(process.env.RUN_SIGN_OUT_INTEGRATION !== "1");
const credentials = { email: `issue101-${randomUUID()}@example.test`, password: `Synthetic-${randomUUID()}!` };
const options = { auth: { persistSession: false, autoRefreshToken: false } };
let service: SupabaseClient;
let otherDevice: SupabaseClient;
let authId: string;
let currentSession: Session;
let otherSession: Session;

suite("logout SSR contra Supabase local", () => {
  beforeAll(async () => {
    const config = JSON.parse(execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_URL).hostname)) throw new Error("Solo Supabase local");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", config.API_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", config.ANON_KEY);
    service = createSupabaseClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
    const account = await service.auth.admin.createUser({ ...credentials, email_confirm: true, user_metadata: { full_name: "Logout sintético", birthdate: "1990-01-01" } });
    if (account.error) throw new Error("No se pudo preparar cuenta sintética");
    authId = account.data.user.id;
    const currentDevice = await createClient({ requireCookieWrites: true });
    const current = await currentDevice.auth.signInWithPassword(credentials);
    expect(current.error).toBeNull();
    currentSession = current.data.session!;
    otherDevice = createSupabaseClient(config.API_URL, config.ANON_KEY, options);
    const other = await otherDevice.auth.signInWithPassword(credentials);
    expect(other.error).toBeNull();
    otherSession = other.data.session!;
    mock.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
  }, 30_000);

  afterAll(async () => {
    vi.unstubAllEnvs();
    mock.jar.clear();
    if (!authId) return;
    execFileSync("docker", ["exec", "-i", "supabase_db_asisteam", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], {
      input: `begin; set local session_replication_role=replica; delete from public.users where auth_user_id='${authId}'; commit;`, stdio: ["pipe", "pipe", "pipe"],
    });
    await service.auth.admin.deleteUser(authId);
  });

  it("elimina cookies HttpOnly, revoca el refresh local y conserva otra sesión de la misma cuenta", async () => {
    expect([...mock.jar.keys()].some(name => name.startsWith("sb-"))).toBe(true);
    mock.writes.mockClear();
    await expect(signOutUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(mock.jar.size).toBe(0);
    expect(mock.writes.mock.calls.some(([, value, options]) => value === "" && options.maxAge === 0 && options.httpOnly)).toBe(true);
    expect(mock.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(mock.redirect).toHaveBeenCalledWith("/login", "replace");
    const afterLogout = await createClient();
    expect((await afterLogout.auth.getUser()).data.user).toBeNull();
    // El refresh revocado no permite reconstruir la sesión del dispositivo saliente.
    expect((await afterLogout.auth.refreshSession({ refresh_token: currentSession.refresh_token })).error).not.toBeNull();
    const stillSignedIn = await otherDevice.auth.refreshSession({ refresh_token: otherSession.refresh_token });
    expect(stillSignedIn.error).toBeNull();
    expect(stillSignedIn.data.user?.id).toBe(authId);
    // Una sesión ya ausente admite una salida idempotente.
    await expect(signOutUser()).rejects.toThrow("NEXT_REDIRECT");
    expect(mock.jar.size).toBe(0);
  });
});
