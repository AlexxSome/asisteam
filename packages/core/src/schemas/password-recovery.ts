import { z } from "zod";
import { registerSchema } from "./register";

// Registro y recuperación comparten exactamente la política de credenciales.
export const passwordRecoverySchema = registerSchema.pick({ email: true });

export const passwordResetSchema = registerSchema
  .pick({ password: true })
  .extend({
    confirmPassword: z.string({ required_error: "Confirma tu nueva contraseña" }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  });

export const recoveryTokenSchema = z.string().min(1).max(512);

export type PasswordRecoveryInput = z.infer<typeof passwordRecoverySchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
