import { beforeEach, describe, expect, it, vi } from "vitest";

const { resetPasswordForEmail, createRecoveryClient, setCookie } = vi.hoisted(() => ({
  setCookie: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  createRecoveryClient: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ set: setCookie }) }));
vi.mock("@/lib/supabase/recovery", () => ({ createRecoveryClient }));
import { requestPasswordRecovery } from "./actions";

describe("requestPasswordRecovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createRecoveryClient.mockReturnValue({ auth: { resetPasswordForEmail } });
  });

  it.each([
    ["ACTIVE", { data: {}, error: null }],
    ["INVITED", { data: {}, error: null }],
    ["inexistente", { data: {}, error: null }],
    ["limitado por email", { data: null, error: { status: 429 } }],
    ["fallo de envío", { data: null, error: { status: 500 } }],
  ])("mantiene la misma respuesta pública para %s", async (_scenario, response) => {
    resetPasswordForEmail.mockResolvedValue(response);
    expect(await requestPasswordRecovery({ email: " atleta@example.cl " }))
      .toEqual({ message: "Si el email existe, enviamos instrucciones" });
    expect(resetPasswordForEmail).toHaveBeenCalledWith("atleta@example.cl");
  });

  it("no revela excepciones del proveedor", async () => {
    resetPasswordForEmail.mockRejectedValue(new Error("detalle privado"));
    expect(await requestPasswordRecovery({ email: "atleta@example.cl" }))
      .toEqual({ message: "Si el email existe, enviamos instrucciones" });
  });

  it("valida nuevamente en servidor sin llamar a Auth para datos inválidos", async () => {
    expect(await requestPasswordRecovery({ email: "inválido" }))
      .toEqual({ message: "Si el email existe, enviamos instrucciones" });
    expect(createRecoveryClient).not.toHaveBeenCalled();
  });
});

it("conserva solo un código validado en cookie HttpOnly y elimina contextos anteriores", async () => {
  await requestPasswordRecovery({ email: "atleta@example.cl" }, " ABCD1234 ");
  expect(setCookie).toHaveBeenLastCalledWith("asisteam-recovery-invite", "ABCD1234", expect.objectContaining({
    httpOnly: true, sameSite: "lax", path: "/reset-password", maxAge: 3600,
  }));
  for (const code of [undefined, "//evil.test", "ABCD1234&token=secret"]) {
    await requestPasswordRecovery({ email: "atleta@example.cl" }, code);
    expect(setCookie).toHaveBeenLastCalledWith("asisteam-recovery-invite", "", expect.objectContaining({ maxAge: 0 }));
  }
});
