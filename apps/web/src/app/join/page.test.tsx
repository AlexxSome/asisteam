import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mock.getUser } }),
}));
vi.mock("@/app/groups/[groupId]/actions", () => ({ joinByCode: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));
import JoinPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: null } });
});

describe("enlace compartido sin sesión", () => {
  it("conserva código válido al pedir inicio de sesión", async () => {
    await expect(JoinPage({ searchParams: Promise.resolve({ code: "CODE0001" }) }))
      .rejects.toThrow("redirect:/login?invite_code=CODE0001");
  });
  it("no transporta un código malformado", async () => {
    await expect(JoinPage({ searchParams: Promise.resolve({ code: "javascript:" }) }))
      .rejects.toThrow("redirect:/login");
  });
});
