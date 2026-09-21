import { describe, expect, it } from "vitest";
import { passwordRecoverySchema, passwordResetSchema, recoveryTokenSchema } from "./password-recovery";
import { registerSchema } from "./register";

describe("recuperación de contraseña (HU-GEN-03)", () => {
  it("valida y normaliza el email sin cambiar su contenido", () => {
    expect(passwordRecoverySchema.parse({ email: "  atleta@example.cl  " })).toEqual({ email: "atleta@example.cl" });
    expect(passwordRecoverySchema.safeParse({ email: "inválido" }).success).toBe(false);
  });

  it.each(["", "123456789", "1234567890", "a".repeat(128), "a".repeat(129)])(
    "conserva la misma política del registro para una contraseña de longitud %s",
    (password) => {
      expect(passwordResetSchema.safeParse({ password, confirmPassword: password }).success)
        .toBe(registerSchema.shape.password.safeParse(password).success);
    },
  );

  it("no recorta espacios de la contraseña ni exige composición arbitraria", () => {
    const password = " una frase segura ";
    expect(passwordResetSchema.parse({ password, confirmPassword: password }).password).toBe(password);
  });

  it("exige confirmación idéntica", () => {
    const result = passwordResetSchema.safeParse({ password: "clave nueva segura", confirmPassword: "otra clave segura" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
  });

  it.each([undefined, "", ["token", "otro"], "a".repeat(513)])("rechaza token ausente o malformado", (token) => {
    expect(recoveryTokenSchema.safeParse(token).success).toBe(false);
  });
});
