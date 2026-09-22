import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

export const ACTIVITY_TIME_ZONE = "America/Santiago";
export const ACTIVITY_WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export const ACTIVITY_WEEKDAY_LABELS = { MO: "Lunes", TU: "Martes", WE: "Miércoles", TH: "Jueves", FR: "Viernes", SA: "Sábado", SU: "Domingo" };
export const activityRecurrenceSchema = z.object({
  freq: z.literal("WEEKLY"),
  by_weekday: z.array(z.enum(ACTIVITY_WEEKDAYS)).min(1, "Selecciona al menos un día").max(7)
    .refine((days) => new Set(days).size === days.length, "No repitas días de semana"),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ingresa una fecha de término válida"),
}).strict();

export function activityDateTimeInput(value: string): string {
  return Temporal.Instant.from(value).toZonedDateTimeISO(ACTIVITY_TIME_ZONE).toPlainDateTime().toString({ smallestUnit: "minute" });
}
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
  recurrence_rule: activityRecurrenceSchema.nullable().optional(),
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
  if (data.recurrence_rule) {
    let message: string | undefined;
    try {
      const start = Temporal.PlainDate.from(data.starts_at.slice(0, 10));
      const until = Temporal.PlainDate.from(data.recurrence_rule.until);
      if (Temporal.PlainDate.compare(until, start) < 0 || Temporal.PlainDate.compare(until, start.add({ weeks: 26 })) > 0) {
        message = "La recurrencia debe terminar entre la fecha de inicio y las siguientes 26 semanas.";
      }
      let count = 0;
      for (let date = start; !message && Temporal.PlainDate.compare(date, until) <= 0; date = date.add({ days: 1 })) {
        if (data.recurrence_rule.by_weekday.includes(ACTIVITY_WEEKDAYS[date.dayOfWeek - 1]!)) count++;
      }
      if (!message && count === 0) message = "El período no contiene ninguno de los días seleccionados.";
      if (count > 150) message = "La serie admite hasta 150 actividades. Reduce los días o la fecha de término.";
    } catch { message = "Revisa las fechas de la recurrencia."; }
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recurrence_rule"], message });
  }
});
export type ActivityFormInput = z.infer<typeof activityFormSchema>;
export const activityScopeSchema = z.enum(["single", "series"]);
export type ActivityScope = z.infer<typeof activityScopeSchema>;

export const ACTIVITY_ERROR_MESSAGES: Record<string, string> = {
  authentication_required: "Inicia sesión para gestionar actividades.",
  group_not_found: "El grupo no existe o no tienes acceso.",
  admin_required: "Solo un administrador del grupo puede gestionar actividades.",
  invalid_activity: "Revisa los datos de la actividad.",
  invalid_date_range: "El término debe ser posterior al inicio y la duración no puede superar las 24 horas.",
  invalid_activity_type: "Elige un tipo activo de este grupo.",
  activity_not_found: "La actividad no existe o no tienes acceso.",
  invalid_recurrence: "Revisa los días y la fecha de término de la recurrencia.",
  recurrence_limit_exceeded: "La serie admite hasta 26 semanas y 150 actividades. Reduce el período o los días.",
  invalid_local_datetime: "Una ocurrencia coincide con una hora inexistente o repetida del cambio de hora en Chile. Elige otro horario.",
  invalid_activity_scope: "Selecciona si quieres cambiar solo esta actividad o la serie.",
  series_date_change: "Al editar la serie se conservan las fechas. Para mover una fecha, edita solo esa actividad.",
  no_editable_occurrences: "No hay ocurrencias futuras sin asistencia para modificar desde esta actividad.",
  attendance_confirmation_required: "Esta actividad tiene asistencia registrada. Confirma también la eliminación de esos registros.",
};
