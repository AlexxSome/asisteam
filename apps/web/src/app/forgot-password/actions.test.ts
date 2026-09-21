import { beforeEach, describe, expect, it, vi } from "vitest";

const { resetPasswordForEmail, createRecoveryClient } = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  createRecoveryClient: vi.fn(),
}));

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
