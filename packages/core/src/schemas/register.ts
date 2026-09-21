import { z } from "zod";

/**
 * Schema de registro con email y contraseña (HU-GEN-01).
 * Reglas de docs/07-api-y-backend.md §4 (recurso users) y
 * docs/11-legal-seguridad-privacidad.md §5.2 (política de contraseñas):
 * mínimo 10 caracteres, sin exigencia de composición arbitraria.
 * La verificación contra listas de contraseñas filtradas la aplica
 * Supabase Auth (ajuste de plataforma), no este schema.
 */

const MAX_AGE_YEARS = 110;

function isValidCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function yearsSince(value: string, reference: Date): number {
  const [year, month, day] = value.split("-").map(Number);
  let age = reference.getUTCFullYear() - (year ?? 0);
  const monthDiff = reference.getUTCMonth() + 1 - (month ?? 0);
  const dayDiff = reference.getUTCDate() - (day ?? 0);
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age;
}

export const birthdateSchema = z
  .string({ required_error: "La fecha de nacimiento es obligatoria" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (formato AAAA-MM-DD)")
  .refine(isValidCalendarDate, "Fecha inválida")
  .refine(
    (value) => new Date(`${value}T00:00:00Z`).getTime() < Date.now(),
    "La fecha de nacimiento debe estar en el pasado",
  )
  .refine(
    (value) => yearsSince(value, new Date()) <= MAX_AGE_YEARS,
    `La edad no puede superar los ${MAX_AGE_YEARS} años`,
  );

export const registerSchema = z.object({
  full_name: z
    .string({ required_error: "El nombre es obligatorio" })
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(120, "El nombre no puede superar los 120 caracteres"),
  email: z
    .string({ required_error: "El email es obligatorio" })
    .trim()
    .email("Email inválido")
    .max(254, "Email demasiado largo"),
  birthdate: birthdateSchema,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{8,15}$/, "Teléfono inválido (formato E.164, ej. +56912345678)")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  password: z
    .string({ required_error: "La contraseña es obligatoria" })
    .min(10, "La contraseña debe tener al menos 10 caracteres")
    .max(128, "La contraseña no puede superar los 128 caracteres"),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const invitationRegistrationSchema = registerSchema.extend({
  phone: registerSchema.shape.phone.refine((value) => !value || /^\+[1-9][0-9]{7,14}$/.test(value), "Teléfono inválido (ej. +56912345678)"),
  terms_accepted: z.literal(true, { errorMap: () => ({ message: "Debes aceptar las condiciones de uso y privacidad" }) }),
});
export type InvitationRegistrationInput = z.infer<typeof invitationRegistrationSchema>;
