import { z } from "zod";
import { ATTENDANCE_STATUSES } from "../enums";

export const qrCheckinSettingsSchema = z.object({
  opens_before_minutes: z.number().int().min(0).max(1440),
  closes_after_minutes: z.number().int().min(1).max(1440),
  late_after_minutes: z.number().int().min(0).max(1440),
}).strict().refine(value => value.late_after_minutes <= value.closes_after_minutes, {
  message: "El umbral de atraso debe estar dentro de la ventana de registro.", path: ["late_after_minutes"],
});
export type QrCheckinSettings = z.infer<typeof qrCheckinSettingsSchema>;
export const checkinInputSchema = z.object({ activity_id: z.string().uuid(), token: z.string().regex(/^[0-9a-f]{64}$/) }).strict();
export type CheckinInput = z.infer<typeof checkinInputSchema>;
export const checkinQrSchema = checkinInputSchema.extend({
  server_time: z.string().datetime({ offset: true }), expires_at: z.string().datetime({ offset: true }),
});
export type CheckinQr = z.infer<typeof checkinQrSchema>;
export const checkinResultSchema = z.object({
  activity_id: z.string().uuid(), group_id: z.string().uuid(), activity_title: z.string(),
  status: z.enum(ATTENDANCE_STATUSES), recorded_at: z.string().datetime({ offset: true }), created: z.boolean(),
}).strict();
export type CheckinReceipt = z.infer<typeof checkinResultSchema>;

// El fragmento no se envía en GET, logs de acceso ni Referer. Nunca acepta un destino externo.
export function checkinPath(input: CheckinInput): string {
  const valid = checkinInputSchema.parse(input);
  return `/check-in#${new URLSearchParams(valid).toString()}`;
}
export function parseCheckinFragment(fragment: string): CheckinInput | null {
  const params = new URLSearchParams(fragment.replace(/^#/, ""));
  if ([...params.keys()].length !== 2) return null;
  const parsed = checkinInputSchema.safeParse(Object.fromEntries(params));
  return parsed.success ? parsed.data : null;
}

export const CHECKIN_ERROR_MESSAGES: Record<string, string> = {
  authentication_required: "Inicia sesión para registrar tu llegada.",
  admin_required: "Solo un administrador del grupo puede configurar y mostrar el QR.",
  group_not_found: "El grupo no existe o no tienes acceso.",
  activity_not_found: "La actividad no existe o no tienes acceso.",
  invalid_qr_settings: "Revisa los minutos: entre 0 y 1440, cierre mayor que 0 y atraso no posterior al cierre.",
  checkin_not_available: "No puedes registrar asistencia en esta actividad. Necesitas una membresía de deportista activa en este grupo.",
  checkin_qr_expired: "El QR venció o no es válido. Escanea el código actual que muestra el administrador.",
  checkin_window_closed: "El registro por QR está fuera del horario habilitado para esta actividad.",
  checkin_failed: "No pudimos confirmar la operación. Vuelve a intentarlo.",
};
