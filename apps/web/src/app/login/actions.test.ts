import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ signIn: vi.fn() }));
vi.mock("@/lib/api/native-auth",()=>({assertAuthOrigin:async()=>{},setNativeCookies:async()=>{},nativeAuthClient:async()=>({loginPassword:mock.signIn})}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));
import { loginUser } from "@/app/login/actions";

const credentials = { email: "ana@example.com", password: "una-clave-segura" };
beforeEach(() => {
  vi.clearAllMocks();
  mock.signIn.mockResolvedValue({access_token:"synthetic-access",refresh_token:"a".repeat(64)});
});

describe("continuar invitación por código tras iniciar sesión", () => {
  it("conserva el código válido en la navegación", async () => {
    await expect(loginUser(credentials, "CODE0001")).rejects.toThrow("redirect:/join?code=CODE0001");
    expect(mock.signIn).toHaveBeenCalledWith({body:credentials});
  });
  it("ignora destinos no válidos y evita redirecciones externas", async () => {
    await expect(loginUser(credentials, "//otro-sitio.example")).rejects.toThrow("redirect:/");
  });
  it("no continúa si fallan las credenciales", async () => {
    mock.signIn.mockRejectedValue(new Error("invalid_credentials"));
    expect(await loginUser(credentials, "CODE0001")).toEqual({ error: "Email o contraseña incorrectos" });
  });
  it("retorna a la llegada QR con payload estricto en fragmento", async () => {
    const checkin = { activity_id: "58000000-0000-4000-8000-000000000501", token: "a".repeat(64) };
    await expect(loginUser(credentials, undefined, checkin)).rejects.toThrow(`redirect:/check-in#activity_id=${checkin.activity_id}&token=${checkin.token}`);
    await expect(loginUser(credentials, undefined, { ...checkin, token: "//evil.test" })).rejects.toThrow("redirect:/");
  });
});
