import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithPassword: mock.signIn } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));
import { loginUser } from "./actions";

const credentials = { email: "ana@example.com", password: "una-clave-segura" };
beforeEach(() => {
  vi.clearAllMocks();
  mock.signIn.mockResolvedValue({ error: null });
});

describe("continuar invitación por código tras iniciar sesión", () => {
  it("conserva el código válido en la navegación", async () => {
    await expect(loginUser(credentials, "CODE0001")).rejects.toThrow("redirect:/join?code=CODE0001");
    expect(mock.signIn).toHaveBeenCalledWith(credentials);
  });
  it("ignora destinos no válidos y evita redirecciones externas", async () => {
    await expect(loginUser(credentials, "//otro-sitio.example")).rejects.toThrow("redirect:/");
  });
  it("no continúa si fallan las credenciales", async () => {
    mock.signIn.mockResolvedValue({ error: { status: 400 } });
    expect(await loginUser(credentials, "CODE0001")).toEqual({ error: "Email o contraseña incorrectos" });
  });
});
