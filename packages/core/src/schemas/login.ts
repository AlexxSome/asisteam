import { z } from "zod";

/**
 * Schema de inicio de sesión con email y contraseña (HU-GEN-02).
 * A diferencia de registerSchema, no reimpone la política de fortaleza de
 * contraseña: el login solo exige presencia, nunca bloquea un intento de
 * acceso por longitud (la política se valida al crear la cuenta).
 */
export const loginSchema = z.object({
  email: z
    .string({ required_error: "El email es obligatorio" })
    .trim()
    .email("Email inválido"),
  password: z.string({ required_error: "La contraseña es obligatoria" }).min(1, "La contraseña es obligatoria"),
});

export type LoginInput = z.infer<typeof loginSchema>;
