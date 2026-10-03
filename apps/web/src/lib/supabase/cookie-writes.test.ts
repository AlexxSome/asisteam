import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ set: vi.fn(), getAll: vi.fn(), createServerClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mock.set, getAll: mock.getAll }) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mock.createServerClient }));
import { createClient } from "./server";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  mock.createServerClient.mockImplementation((_url, _key, options) => options);
});
afterEach(() => vi.unstubAllEnvs());

describe("persistencia SSR de cookies", () => {
  it("aplica las eliminaciones indicadas por Supabase conservando sus opciones", async () => {
    await createClient({ requireCookieWrites: true });
    const options = mock.createServerClient.mock.calls[0]![2];
    expect(options.cookieOptions).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    const expiration = { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 };
    options.cookies.setAll([{ name: "sb-session.0", value: "", options: expiration }, { name: "sb-session.1", value: "", options: expiration }]);
    expect(mock.set.mock.calls).toEqual([["sb-session.0", "", expiration], ["sb-session.1", "", expiration]]);
  });

  it("el logout detecta errores de escritura y los Server Components mantienen la tolerancia existente", async () => {
    mock.set.mockImplementation(() => { throw new Error("read-only cookies"); });
    for (const requireCookieWrites of [false, true]) {
      await createClient({ requireCookieWrites });
      const options = mock.createServerClient.mock.calls.at(-1)![2];
      const write = () => options.cookies.setAll([{ name: "sb-session", value: "", options: { maxAge: 0 } }]);
      if (requireCookieWrites) expect(write).toThrow("read-only cookies");
      else expect(write).not.toThrow();
    }
  });
});
