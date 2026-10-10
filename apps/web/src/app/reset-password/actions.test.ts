import { beforeEach, describe, expect, it, vi } from "vitest";

const { reset, clearNativeCookies, nativeAuthClient } = vi.hoisted(() => ({
  reset: vi.fn(), clearNativeCookies: vi.fn(), nativeAuthClient: vi.fn(),
}));
vi.mock("@/lib/api/native-auth", () => ({ nativeAuthClient, clearNativeCookies, assertAuthOrigin: vi.fn() }));
import { resetPassword } from "@/app/reset-password/actions";

const token = "a".repeat(64);
const input = { password: "mi nueva clave segura", confirmPassword: "mi nueva clave segura" };

describe("resetPassword nativo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    nativeAuthClient.mockResolvedValue({ resetPassword: reset });
    reset.mockResolvedValue({ success: true });
    clearNativeCookies.mockResolvedValue(undefined);
  });

  it("requiere el token recovery y limpia las cookies después del cambio", async () => {
    expect(await resetPassword(token, input)).toEqual({ success: true });
    expect(reset).toHaveBeenCalledWith({ body: { token, password: input.password } });
    expect(clearNativeCookies).toHaveBeenCalled();
    expect(reset.mock.invocationCallOrder[0]).toBeLessThan(clearNativeCookies.mock.invocationCallOrder[0]!);
  });

  it.each(["vencido", "reutilizado", "otro-tipo", "inexistente"])("rechaza token %s sin autorizarlo mediante la sesión del navegador", async () => {
    reset.mockRejectedValue(new Error("token inválido"));
    expect(await resetPassword(token, input)).toEqual({ error: "El enlace es inválido, ya fue utilizado o venció. Solicita uno nuevo." });
    expect(clearNativeCookies).not.toHaveBeenCalled();
  });

  it("rechaza respuesta de API inválida sin limpiar una sesión existente", async () => {
    // El cliente HTTP valida el DTO y rechaza una respuesta sin success.
    reset.mockRejectedValue(new Error("invalid_response"));
    expect(await resetPassword(token, input)).toHaveProperty("error");
    expect(clearNativeCookies).not.toHaveBeenCalled();
  });

  it("rechaza token vacío sin usar la sesión existente", async () => {
    expect(await resetPassword("", input)).toHaveProperty("error");
    expect(nativeAuthClient).not.toHaveBeenCalled();
  });

  it.each([
    { password: "corta", confirmPassword: "corta" },
    { password: input.password, confirmPassword: "distinta" },
  ])("valida antes de consumir el enlace", async (invalidInput) => {
    expect(await resetPassword(token, invalidInput)).toHaveProperty("error");
    expect(reset).not.toHaveBeenCalled();
  });

  it.each(["weak_password", "same_password", "unexpected_failure"])("maneja %s sin detalles privados", async (code) => {
    reset.mockRejectedValue(new Error(code));
    const result = await resetPassword(token, input);
    expect(result).toHaveProperty("error");
    expect(JSON.stringify(result)).not.toContain(code);
    expect(clearNativeCookies).not.toHaveBeenCalled();
  });

  it("no muestra detalles privados ante una excepción del API", async () => {
    reset.mockRejectedValue(new Error("detalle privado"));
    const result = await resetPassword(token, input);
    expect(result).toHaveProperty("error");
    expect(JSON.stringify(result)).not.toContain("detalle privado");
    expect(clearNativeCookies).not.toHaveBeenCalled();
  });

  it("un fallo al limpiar cookies no oculta un cambio exitoso", async () => {
    clearNativeCookies.mockRejectedValue(new Error("cookie"));
    expect(await resetPassword(token, input)).toEqual({ success: true });
  });
});
