import { describe, expect, it } from "vitest";
import { loginSchema } from "./login";

describe("loginSchema (HU-GEN-02)", () => {
  it("acepta email y contraseña válidos", () => {
    const result = loginSchema.safeParse({
      email: "carla.reyes@example.cl",
      password: "S3gura!2026",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza email inválido", () => {
    const result = loginSchema.safeParse({ email: "no-es-email", password: "cualquiera" });
    expect(result.success).toBe(false);
  });

  it("rechaza contraseña vacía", () => {
    const result = loginSchema.safeParse({ email: "carla.reyes@example.cl", password: "" });
    expect(result.success).toBe(false);
  });

  it("no reimpone la longitud mínima de 10 caracteres del registro", () => {
    const result = loginSchema.safeParse({ email: "carla.reyes@example.cl", password: "abc" });
    expect(result.success).toBe(true);
  });

  it("recorta espacios del email", () => {
    const result = loginSchema.safeParse({ email: "  carla.reyes@example.cl  ", password: "x" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("carla.reyes@example.cl");
  });
});
