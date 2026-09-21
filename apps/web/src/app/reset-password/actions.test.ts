import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyOtp, updateUser, signOut, createRecoveryClient } = vi.hoisted(() => ({
  verifyOtp: vi.fn(), updateUser: vi.fn(), signOut: vi.fn(), createRecoveryClient: vi.fn(),
}));

vi.mock("@/lib/supabase/recovery", () => ({ createRecoveryClient }));
import { resetPassword } from "./actions";

const input = { password: "mi nueva clave segura", confirmPassword: "mi nueva clave segura" };

describe("resetPassword", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createRecoveryClient.mockReturnValue({ auth: { verifyOtp, updateUser, signOut } });
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "synthetic" } }, error: null });
    updateUser.mockResolvedValue({ data: {}, error: null });
    signOut.mockResolvedValue({ error: null });
  });

  it("requiere token recovery, cambia la clave y cierra su sesión efímera", async () => {
    expect(await resetPassword("token-del-email", input)).toEqual({ success: true });
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "token-del-email", type: "recovery" });
    expect(updateUser).toHaveBeenCalledWith({ password: input.password });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(updateUser.mock.invocationCallOrder[0]!);
  });

  it.each(["vencido", "reutilizado", "otro-tipo", "inexistente"])("rechaza token %s aunque el navegador tenga sesión", async (token) => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error: { code: "otp_expired" } });
    expect(await resetPassword(token, input)).toEqual({ error: "El enlace es inválido, ya fue utilizado o venció. Solicita uno nuevo." });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("rechaza respuestas sin sesión incluso si no hay error", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
    expect(await resetPassword("token", input)).toHaveProperty("error");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("rechaza token vacío sin usar la sesión existente", async () => {
    expect(await resetPassword("", input)).toHaveProperty("error");
    expect(createRecoveryClient).not.toHaveBeenCalled();
  });

  it.each([
    { password: "corta", confirmPassword: "corta" },
    { password: input.password, confirmPassword: "distinta" },
  ])("valida antes de consumir el enlace", async (invalidInput) => {
    expect(await resetPassword("token", invalidInput)).toHaveProperty("error");
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it.each(["weak_password", "same_password", "unexpected_failure"])("maneja %s y revoca la sesión", async (code) => {
    updateUser.mockResolvedValue({ error: { code } });
    expect(await resetPassword("token", input)).toHaveProperty("error");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("no muestra detalles privados y revoca la sesión si falla updateUser", async () => {
    updateUser.mockRejectedValue(new Error("detalle privado"));
    const result = await resetPassword("token", input);
    expect(result).toHaveProperty("error");
    expect(JSON.stringify(result)).not.toContain("detalle privado");
    expect(signOut).toHaveBeenCalled();
  });

  it("un fallo al cerrar sesión no oculta un cambio exitoso", async () => {
    signOut.mockRejectedValue(new Error("red"));
    expect(await resetPassword("token", input)).toEqual({ success: true });
  });
});
