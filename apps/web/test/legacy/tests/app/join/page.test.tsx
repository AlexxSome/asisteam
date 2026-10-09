// Historical Supabase origin regression; not evidence of current native runtime.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock("@legacy/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mock.getUser }, rpc: mock.rpc }),
}));
vi.mock("@legacy/app/groups/[groupId]/actions", () => ({ joinByCode: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));
vi.mock("@legacy/components/app-shell", () => ({ AppShell: ({ children }: { children: import("react").ReactNode }) => children }));
import { renderToStaticMarkup } from "react-dom/server";
import JoinPage from "@legacy/app/join/page";

beforeEach(() => {
  vi.clearAllMocks();
  mock.rpc.mockResolvedValue({ data: [], error: null });
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

it("recupera la solicitud persistida al volver sin pending=1 y no declara un alta inexistente", async () => {
  mock.getUser.mockResolvedValue({ data: { user: { id: "athlete" } } });
  mock.rpc.mockResolvedValue({ data: [{ membership_id: "membership", group_id: "group", group_name: "Club sintético",
    full_name: "Menor por código", is_minor: true, guardian_linked: true, guardian_ready: false, requires_managed_consent: false,
    membership_status: "PENDING", account_status: "ACTIVE" }], error: null });
  const html = renderToStaticMarkup(await JoinPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("Mis solicitudes guardadas");
  expect(html).toContain("Club sintético");
  expect(html).toContain("No necesitas volver a ingresar el código");
  expect(html).toContain("Pendiente · apoderado");
  expect(html).not.toContain('href="/groups/group"');
});
it("un error de lectura no se disfraza de solicitud inexistente ni usa el querystring como evidencia", async () => {
  mock.getUser.mockResolvedValue({ data: { user: { id: "athlete" } } });
  let html = renderToStaticMarkup(await JoinPage({ searchParams: Promise.resolve({ pending: "1" }) }));
  expect(html).not.toContain("Mis solicitudes guardadas");
  mock.rpc.mockResolvedValue({ data: null, error: { message: "secret" } });
  await expect(JoinPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("No pudimos cargar tus solicitudes pendientes");
});
