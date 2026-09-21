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

export const GROUP_ERROR_MESSAGES: Record<string, string> = {
  authentication_required: "Inicia sesión para continuar.",
  active_account_required: "Necesitas una cuenta activa para realizar esta acción.",
  invalid_group: "Revisa los datos del grupo.",
  user_group_limit: "Ya alcanzaste el límite de 30 grupos.",
  guardian_group_limit: "Un apoderado vinculado alcanzó el límite de 30 grupos y no puede incorporarse a este grupo.",
  invite_code_unavailable: "No pudimos generar el código del grupo. Vuelve a intentarlo.",
  group_not_found: "El grupo no existe o no tienes acceso.",
  group_update_failed: "No pudimos guardar los cambios del grupo. Vuelve a intentarlo.",
  invite_code_rotate_failed: "No pudimos regenerar el código. Vuelve a intentarlo.",
  admin_required: "Solo un administrador del grupo puede agregarse como deportista desde aquí.",
  athlete_birthdate_required: "Completa tu fecha de nacimiento en Mi perfil antes de agregarte como deportista.",
  minor_requires_guardian_consent: "Para participar como deportista siendo menor necesitas un apoderado vinculado con consentimiento vigente.",
  membership_already_exists: "Ya tienes una membresía de deportista pendiente o inactiva. Debe aprobarse o reactivarse.",
  group_member_limit: "Este grupo alcanzó el límite de 500 membresías activas.",
};
