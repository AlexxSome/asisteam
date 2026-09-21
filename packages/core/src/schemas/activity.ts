import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

export const ACTIVITY_TIME_ZONE = "America/Santiago";
export const SYSTEM_ACTIVITY_TYPE_LABELS: Record<string, string> = {
  TRAINING: "Entrenamiento",
  PHYSICAL_PREP: "Preparación física",
  COMPETITION: "Competencia",
  MEETING: "Reunión",
};

export function activityTypeLabel(name: string, isSystem: boolean): string {
  return isSystem ? SYSTEM_ACTIVITY_TYPE_LABELS[name] ?? name : name;
}

/** Un datetime-local representa hora chilena, nunca la zona del navegador. */
export function chileDateTimeToUtc(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new RangeError("invalid_local_datetime");
  return Temporal.ZonedDateTime.from(`${value}[${ACTIVITY_TIME_ZONE}]`, {
    disambiguation: "reject",
  }).toInstant().toString();
}

export function formatActivityDateTime(value: string): string {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: ACTIVITY_TIME_ZONE, dateStyle: "medium", timeStyle: "short", hourCycle: "h23",
  }).format(new Date(value));
}

const localDateTime = z.string().superRefine((value, ctx) => {
  try { chileDateTimeToUtc(value); } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom,
      message: "Ingresa una fecha y hora válida de Chile. Evita las horas inexistentes o repetidas del cambio de hora." });
  }
});

export const activityFormSchema = z.object({
  title: z.string().trim().min(3, "El título debe tener al menos 3 caracteres").max(120, "El título admite hasta 120 caracteres"),
  activity_type_id: z.string().uuid("Selecciona un tipo de actividad"),
  description: z.string().trim().max(2000, "La descripción admite hasta 2000 caracteres"),
  location: z.string().trim().max(200, "El lugar admite hasta 200 caracteres"),
  starts_at: localDateTime,
  ends_at: localDateTime,
}).superRefine((data, ctx) => {
  try {
    const start = Temporal.Instant.from(chileDateTimeToUtc(data.starts_at));
    const end = Temporal.Instant.from(chileDateTimeToUtc(data.ends_at));
    if (Temporal.Instant.compare(end, start) <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ends_at"], message: "El término debe ser posterior al inicio" });
    } else if (end.epochMilliseconds - start.epochMilliseconds > 24 * 60 * 60 * 1000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ends_at"], message: "La actividad no puede durar más de 24 horas" });
    }
  } catch { /* Las fechas inválidas ya tienen un error de campo. */ }
});
export type ActivityFormInput = z.infer<typeof activityFormSchema>;

export const ACTIVITY_ERROR_MESSAGES: Record<string, string> = {
  authentication_required: "Inicia sesión para crear una actividad.",
  group_not_found: "El grupo no existe o no tienes acceso.",
  admin_required: "Solo un administrador del grupo puede crear actividades.",
  invalid_activity: "Revisa los datos de la actividad.",
  invalid_date_range: "El término debe ser posterior al inicio y la duración no puede superar las 24 horas.",
  invalid_activity_type: "Elige un tipo activo de este grupo.",
};
