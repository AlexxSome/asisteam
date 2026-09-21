import { z } from "zod";
import { registerSchema } from "./register";

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function chileToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function isMinor(birthdate: string | null, today = chileToday()): boolean {
  if (!birthdate) return false;
  const cutoff = `${Number(today.slice(0, 4)) - 18}${today.slice(4)}`;
  return birthdate > cutoff;
}

const profileBirthdate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Fecha inválida")
  .refine((value) => value < chileToday(), "La fecha debe estar en el pasado")
  .refine((value) => {
    const today = chileToday();
    const age = Number(today.slice(0, 4)) - Number(value.slice(0, 4))
      - (today.slice(5) < value.slice(5) ? 1 : 0);
    return age <= 110;
  }, "La edad no puede superar los 110 años");

export const profileSchema = z.object({
  full_name: registerSchema.shape.full_name,
  phone: z.string().trim().regex(/^\+[1-9][0-9]{7,14}$/, "Teléfono inválido (ej. +56912345678)").nullable(),
  birthdate: profileBirthdate.nullable(),
}).strict();
export type ProfileInput = z.infer<typeof profileSchema>;
export type OwnProfile = ProfileInput & { id: string; email: string | null; avatar_url: string | null };

export const avatarFileSchema = z.object({
  type: z.enum(AVATAR_MIME_TYPES, { message: "Usa una imagen JPEG, PNG o WebP" }),
  size: z.number().int().positive("El archivo está vacío").max(AVATAR_MAX_BYTES, "La imagen no puede superar los 2 MB"),
});

/** Verifica la firma además del MIME declarado por el navegador. */
export function avatarContentType(bytes: Uint8Array): typeof AVATAR_MIME_TYPES[number] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
      && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}
