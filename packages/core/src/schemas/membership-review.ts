import { z } from "zod";

export const membershipReviewSchema = z.object({
  group_id: z.string().uuid(),
  membership_id: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
}).strict();

export type PendingMembership = {
  membership_id: string;
  athlete_user_id?: string;
  membership_status?: string;
  account_status?: string;
  capacity_block?: string | null;
  can_consent?: boolean;
  full_name: string;
  is_minor: boolean;
  guardian_linked: boolean;
  guardian_ready: boolean;
  requires_managed_consent: boolean;
};

export function membershipApprovalBlock(member: PendingMembership): string | null {
  if (!member.is_minor) return null;
  if (!member.guardian_linked) return "Requiere apoderado vinculado";
  if (member.requires_managed_consent) return "El apoderado debe ratificar el consentimiento en Consentimientos de mis pupilos; esa confirmación activa la membresía si hay cupo. La cuenta sigue gestionada.";
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
  subscription_athlete_limit: "El club no tiene cupos disponibles en su suscripción. Solicita al administrador revisar el plan y su primer pago.",
  group_member_limit: "El grupo alcanzó su límite operativo de integrantes activos.",
  unavailable: "No pudimos confirmar la decisión. Actualiza la lista antes de volver a intentarlo.",
};

/** Presentation of server-computed state; never authorizes a transition. */
export function membershipOnboardingSteps(member: PendingMembership) {
  const active = member.membership_status === "ACTIVE";
  return [
    ...(member.is_minor ? [
      { label: "Vínculo con apoderado", detail: member.guardian_linked ? "Registrado" : "Pendiente · administrador" },
      { label: "Tratamiento de datos", detail: member.requires_managed_consent || !member.guardian_ready ? "Pendiente · apoderado" : "Consentimiento vigente" },
    ] : []),
    { label: "Participación en el grupo", detail: active ? "Membresía activa" : member.requires_managed_consent
      ? "Alta aprobada por el administrador; se activa al consentir, si hay cupo"
      : "Pendiente de aprobación · administrador" },
    ...(member.capacity_block ? [{ label: "Capacidad", detail: member.capacity_block === "subscription_athlete_limit"
      ? "Sin cupo habilitado · administrador debe revisar el plan"
      : "Límite de integrantes · administrador debe revisar la nómina" }] : []),
  ];
}
