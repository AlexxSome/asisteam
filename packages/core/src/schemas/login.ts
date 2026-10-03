import { z } from "zod";
import { checkinInputSchema } from "./check-in";
import { joinCodeSchema } from "./group";

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

export const SOCIAL_PROVIDERS = ["google", "apple"] as const;
export const SOCIAL_PROVIDER_LABELS = { google: "Google", apple: "Apple" } as const;
export const SOCIAL_AUTH_ERROR = "No pudimos iniciar sesión. Inténtalo nuevamente o usa tu email y contraseña.";

// Solo destinos de producto conocidos; nunca una URL de retorno arbitraria.
export const socialLoginContextSchema = z.object({
  invite_code: joinCodeSchema.optional(),
  checkin: checkinInputSchema.optional(),
}).strict();
export const socialLoginSchema = socialLoginContextSchema.extend({
  provider: z.enum(SOCIAL_PROVIDERS),
});
export type SocialLoginInput = z.infer<typeof socialLoginSchema>;
export type SocialLoginContext = z.infer<typeof socialLoginContextSchema>;
