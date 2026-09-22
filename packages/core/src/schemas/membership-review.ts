import { z } from "zod";

export const membershipReviewSchema = z.object({
  group_id: z.string().uuid(),
  membership_id: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
}).strict();

export type PendingMembership = {
  membership_id: string;
  full_name: string;
  is_minor: boolean;
  guardian_linked: boolean;
  guardian_ready: boolean;
  requires_managed_consent: boolean;
};

export function membershipApprovalBlock(member: PendingMembership): string | null {
  if (!member.is_minor) return null;
  if (!member.guardian_linked) return "Requiere apoderado vinculado";
  if (member.requires_managed_consent) return "El apoderado debe ratificar el consentimiento en Consentimientos de mis pupilos; esa confirmación activa la cuenta gestionada en el grupo.";
  if (!member.guardian_ready) return "Requiere consentimiento vigente del apoderado";
  return null;
}

export const MEMBERSHIP_REVIEW_ERROR_MESSAGES: Record<string, string> = {
  authentication_required: "Inicia sesión para revisar las incorporaciones.",
  active_account_required: "Necesitas una cuenta activa para continuar.",
  group_not_found: "El grupo no existe o no tienes acceso.",
  admin_required: "Solo un administrador del grupo puede revisar incorporaciones.",
  membership_not_found: "La membresía no está disponible en este grupo. Actualiza la lista.",
  membership_not_pending: "Esta incorporación ya fue resuelta. Actualiza la lista.",
  invalid_membership_review: "Revisa el grupo, la membresía y la decisión.",
  athlete_birthdate_required: "El deportista debe tener fecha de nacimiento registrada.",
  minor_requires_guardian: "Requiere apoderado vinculado",
  minor_requires_guardian_consent: "Requiere consentimiento vigente del apoderado",
  managed_consent_required: "El apoderado debe ratificar el consentimiento de la cuenta gestionada.",
  guardian_group_limit: "El apoderado superaría el límite de 30 grupos.",
  group_member_limit: "La incorporación y sus apoderados superarían el límite de 500 membresías activas del grupo.",
  unavailable: "No pudimos confirmar la decisión. Actualiza la lista antes de volver a intentarlo.",
};
