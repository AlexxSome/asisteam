import { describe, expect, it, vi } from "vitest";
const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));
import { createRecoveryClient } from "./recovery";

describe("cliente de recuperación", () => {
  it("no persiste sesiones ni requiere un verificador PKCE de otro navegador", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-anon-key");
    try {
      createRecoveryClient();
      expect(createClient).toHaveBeenCalledWith("http://127.0.0.1:54321", "synthetic-anon-key", {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: "implicit" },
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
