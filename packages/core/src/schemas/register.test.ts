import { describe, expect, it } from "vitest";
import { registerSchema } from "./register";

const validInput = {
  full_name: "Carla Reyes",
  email: "carla.reyes@example.cl",
  birthdate: "1994-03-15",
  password: "S3gura!2026",
};

describe("registerSchema (HU-GEN-01)", () => {
  it("acepta un registro válido sin teléfono", () => {
    const result = registerSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("acepta teléfono opcional en formato E.164", () => {
    const result = registerSchema.safeParse({ ...validInput, phone: "+56912345678" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBe("+56912345678");
  });

  it("trata el teléfono vacío como no informado", () => {
    const result = registerSchema.safeParse({ ...validInput, phone: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.phone).toBeUndefined();
  });

  it("rechaza contraseñas de menos de 10 caracteres", () => {
    const result = registerSchema.safeParse({ ...validInput, password: "corta1234" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/al menos 10 caracteres/);
    }
  });

  it("acepta contraseñas de exactamente 10 caracteres sin exigir composición", () => {
    const result = registerSchema.safeParse({ ...validInput, password: "solominusc" });
    expect(result.success).toBe(true);
  });

  it("rechaza emails inválidos", () => {
    const result = registerSchema.safeParse({ ...validInput, email: "no-es-email" });
    expect(result.success).toBe(false);
  });

  it("rechaza nombres de menos de 2 caracteres", () => {
    const result = registerSchema.safeParse({ ...validInput, full_name: "A" });
    expect(result.success).toBe(false);
  });

  it("rechaza fechas de nacimiento futuras", () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const result = registerSchema.safeParse({ ...validInput, birthdate: future });
    expect(result.success).toBe(false);
  });

  it("rechaza edades mayores a 110 años", () => {
    const result = registerSchema.safeParse({ ...validInput, birthdate: "1900-01-01" });
    expect(result.success).toBe(false);
  });

  it("rechaza fechas de calendario inexistentes", () => {
    const result = registerSchema.safeParse({ ...validInput, birthdate: "2000-02-30" });
    expect(result.success).toBe(false);
  });

  it("rechaza teléfonos con formato inválido", () => {
    const result = registerSchema.safeParse({ ...validInput, phone: "no-numero" });
    expect(result.success).toBe(false);
  });
});
