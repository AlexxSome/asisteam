import { z } from "zod";
import { profileSchema } from "./profile";
import { invitationFormSchema } from "./invitation";

export const guardianshipSchema = z.object({
  athlete_user_id: z.string().uuid("Selecciona un deportista menor de edad"),
  full_name: profileSchema.shape.full_name,
  email: invitationFormSchema.shape.email,
  relationship: z.string().trim().min(2, "Indica el vínculo con el menor").max(40, "El vínculo admite hasta 40 caracteres"),
}).strict();
export type GuardianshipInput = z.input<typeof guardianshipSchema>;
export const guardianshipIdSchema = z.string().uuid();

export const GUARDIANSHIP_ERROR_MESSAGES: Record<string, string> = {
  authentication_required: "Inicia sesión para registrar un apoderado.",
  active_account_required: "Necesitas una cuenta activa para continuar.",
  group_not_found: "El grupo no existe o no tienes acceso.",
  admin_required: "Solo un administrador del grupo puede registrar apoderados.",
  athlete_not_found: "El deportista no está disponible en este grupo. Actualiza la lista.",
  invalid_guardianship: "Revisa el deportista, el nombre, el email y el vínculo.",
  invalid_guardian: "El apoderado debe ser una persona distinta del deportista.",
  guardian_only_for_minor: "Solo puedes vincular apoderados a deportistas menores de 18 años.",
  guardianship_already_exists: "Este apoderado ya tiene un vínculo registrado con el deportista. No se creó otro.",
  guardian_group_limit: "El apoderado superaría el límite de 30 grupos.",
  group_member_limit: "Uno de los grupos del pupilo alcanzó el límite de 500 integrantes activos.",
  unavailable: "No pudimos confirmar el vínculo. Revisa el grupo antes de volver a intentarlo.",
};
