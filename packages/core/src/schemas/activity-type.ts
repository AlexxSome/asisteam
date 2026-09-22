import { z } from "zod";

export const activityTypeSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(40, "El nombre admite hasta 40 caracteres"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Ingresa un color hexadecimal de 6 dígitos, por ejemplo #2563EB"),
}).strict();
export const activityTypeUpdateSchema = activityTypeSchema.extend({ is_active: z.boolean() });
export type ActivityTypeInput = z.infer<typeof activityTypeSchema>;
export type ActivityTypeUpdateInput = z.infer<typeof activityTypeUpdateSchema>;

export const ACTIVITY_TYPE_ERROR_MESSAGES: Record<string, string> = {
  authentication_required: "Inicia sesión para gestionar tipos de actividad.",
  group_not_found: "El grupo no existe o no tienes acceso.",
  admin_required: "Solo un administrador del grupo puede gestionar tipos de actividad.",
  activity_type_not_found: "El tipo no existe, es de sistema o no tienes permiso para modificarlo.",
  activity_type_name_exists: "Ya existe un tipo con ese nombre en el grupo, incluso si está desactivado.",
  invalid_activity_type: "Revisa el nombre y el color del tipo de actividad.",
  activity_type_save_failed: "No pudimos guardar el tipo de actividad. Vuelve a intentarlo.",
};
