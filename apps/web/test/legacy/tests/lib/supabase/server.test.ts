// Historical Supabase origin regression; not evidence of current native runtime.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const jar = vi.hoisted(() => ({ set: vi.fn(), getAll: vi.fn(() => []) }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));
import { createClient } from "@legacy/lib/supabase/server";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-public-key");
});
afterEach(() => vi.unstubAllEnvs());

describe("cliente SSR real: inicio PKCE", () => {
  it.each(["production", "development"])("%s guarda verificador HttpOnly y solicita S256", async environment => {
    vi.stubEnv("NODE_ENV", environment);
    const client = await createClient();
    const { data, error } = await client.auth.signInWithOAuth({ provider: "google", options: {
      redirectTo: "https://asisteam.example/auth/callback", skipBrowserRedirect: true,
    } });
    expect(error).toBeNull();
    const url = new URL(data.url!);
    expect(url.searchParams.get("code_challenge_method")).toBe("s256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(jar.set).toHaveBeenCalled();
    const verifier = jar.set.mock.calls.find(([name]) => name.includes("code-verifier"));
    expect(verifier).toBeTruthy();
    expect(verifier![2]).toMatchObject({ httpOnly: true, secure: environment === "production", sameSite: "lax", path: "/" });
  });
});
