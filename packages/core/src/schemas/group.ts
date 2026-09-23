import { z } from "zod";

export const groupFormSchema = z.object({
  name: z.string().trim().min(3, "El nombre debe tener al menos 3 caracteres").max(80, "El nombre admite hasta 80 caracteres"),
  sport: z.string().trim().min(2, "El deporte debe tener al menos 2 caracteres").max(50, "El deporte admite hasta 50 caracteres"),
  description: z.string().trim().optional(),
  logo_url: z.string().trim().refine(
    (value) => !value || /^https?:\/\/[^\s/?#]+([/?#][^\s]*)?$/.test(value),
    "Ingresa una URL http o https válida para el logo",
  ).optional(),
});
export type GroupFormInput = z.infer<typeof groupFormSchema>;

export const groupSettingsSchema = z.object({
  athletes_can_view_group_stats: z.boolean(),
  guardians_can_view_group_stats: z.boolean(),
}).strict();
export type GroupSettings = z.infer<typeof groupSettingsSchema>;
export const groupSettingsChangeSchema = groupSettingsSchema.partial().refine(
  (changes) => Object.keys(changes).length > 0, "Selecciona una opción de visibilidad.",
);
export const GROUP_VISIBILITY_LABELS: Record<keyof GroupSettings, string> = {
  athletes_can_view_group_stats: "Los deportistas pueden ver las estadísticas del grupo (nombre y % de asistencia de cada integrante)",
  guardians_can_view_group_stats: "Los apoderados pueden ver las estadísticas del grupo",
};
export const GROUP_STATS_PRIVACY_NOTICE = "Aunque actives estas opciones, nunca se muestran datos de contacto, fechas de nacimiento, notas de asistencia individuales ni datos de apoderados de otros integrantes. Solo nombre y métricas agregadas.";

export const joinCodeSchema = z.string().trim().regex(/^[A-Za-z0-9]{8}$/, "Código no válido");
export const joinCodeResponseSchema = z.object({
  membership: z.object({ group_id: z.string().uuid(), status: z.enum(["ACTIVE", "PENDING"]) }),
});

export const GROUP_ERROR_MESSAGES: Record<string, string> = {
  authentication_required: "Inicia sesión para continuar.",
  active_account_required: "Necesitas una cuenta activa para realizar esta acción.",
  invalid_group: "Revisa los datos del grupo.",
  user_group_limit: "Ya alcanzaste el límite de 30 grupos.",
  guardian_group_limit: "Un apoderado vinculado alcanzó el límite de 30 grupos y no puede incorporarse a este grupo.",
  invite_code_unavailable: "No pudimos generar el código del grupo. Vuelve a intentarlo.",
  group_not_found: "El grupo no existe o no tienes acceso.",
  group_update_failed: "No pudimos guardar los cambios del grupo. Vuelve a intentarlo.",
  invalid_group_settings: "Revisa las opciones de visibilidad del grupo.",
  group_settings_update_failed: "No pudimos guardar la visibilidad. Vuelve a intentarlo.",
  invite_code_rotate_failed: "No pudimos regenerar el código. Vuelve a intentarlo.",
  admin_required: "Solo un administrador del grupo puede agregarse como deportista desde aquí.",
  athlete_birthdate_required: "Completa tu fecha de nacimiento en Mi perfil antes de agregarte como deportista.",
  minor_requires_guardian_consent: "Para participar como deportista siendo menor necesitas un apoderado vinculado con consentimiento vigente.",
  membership_already_exists: "Ya tienes una membresía de deportista en este grupo. Si está pendiente o inactiva, solicita su aprobación o reactivación.",
  group_member_limit: "Este grupo alcanzó el límite de 500 membresías activas.",
  invalid_invite_code: "Código no válido.",
  join_rate_limited: "Demasiados intentos. Vuelve a intentarlo en 15 minutos.",
  join_failed: "No pudimos unirte al grupo. Vuelve a intentarlo.",
};
