import { beforeEach, describe, expect, it, vi } from "vitest";

const { requestRecovery, nativeAuthClient, setCookie } = vi.hoisted(() => ({
  setCookie: vi.fn(),
  requestRecovery: vi.fn(),
  nativeAuthClient: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ set: setCookie }) }));
vi.mock("@/lib/api/native-auth", () => ({ nativeAuthClient, assertAuthOrigin: vi.fn() }));
import { requestPasswordRecovery } from "@/app/forgot-password/actions";

describe("requestPasswordRecovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    nativeAuthClient.mockResolvedValue({ requestRecovery });
  });

  it.each([
    ["ACTIVE", { data: {}, error: null }],
    ["INVITED", { data: {}, error: null }],
    ["inexistente", { data: {}, error: null }],
    ["limitado por email", { data: null, error: { status: 429 } }],
    ["fallo de envío", { data: null, error: { status: 500 } }],
  ])("mantiene la misma respuesta pública para %s", async (_scenario, response) => {
    if (response.error) requestRecovery.mockRejectedValue(new Error("fallo privado"));
    else requestRecovery.mockResolvedValue({ message: "Si el email existe, enviamos instrucciones" });
    expect(await requestPasswordRecovery({ email: " atleta@example.cl " }))
      .toEqual({ message: "Si el email existe, enviamos instrucciones" });
    expect(requestRecovery).toHaveBeenCalledWith({ body: { email: "atleta@example.cl" } });
  });

  it("no revela excepciones del proveedor", async () => {
    requestRecovery.mockRejectedValue(new Error("detalle privado"));
    expect(await requestPasswordRecovery({ email: "atleta@example.cl" }))
      .toEqual({ message: "Si el email existe, enviamos instrucciones" });
  });

  it("valida nuevamente en servidor sin llamar a Auth para datos inválidos", async () => {
    expect(await requestPasswordRecovery({ email: "inválido" }))
      .toEqual({ message: "Si el email existe, enviamos instrucciones" });
    expect(nativeAuthClient).not.toHaveBeenCalled();
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
