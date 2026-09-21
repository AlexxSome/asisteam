import { z } from "zod";

// ≥128 bits de entropía al emitir; aquí se valida el formato URL-safe.
export const invitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{22,256}$/);
export const invitationRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("preview"), token: invitationTokenSchema }).strict(),
  z.object({ action: z.literal("accept"), token: invitationTokenSchema }).strict(),
  z.object({ action: z.literal("register"), token: invitationTokenSchema, registration: z.unknown() }).strict(),
]);
export const INVITATION_TERMS_VERSION = "2026-09-21";
export const invitationErrorMessages: Record<string, string> = {
  invitation_expired: "Invitación expirada. Pide al ADMIN del grupo que te envíe una nueva invitación.",
  invitation_not_available: "La invitación no está disponible. Revisa el enlace y la cuenta con la que iniciaste sesión.",
  invalid_registration: "Revisa los datos y acepta las condiciones de uso y privacidad.",
  birthdate_confirmation_required: "La fecha de nacimiento no coincide con la registrada. Contacta al ADMIN.",
  guardian_consent_required: "Tu apoderado debe otorgar el consentimiento antes de activar tu cuenta.",
  athlete_birthdate_required: "Completa tu fecha de nacimiento en el perfil antes de aceptar.",
  group_member_limit: "El grupo alcanzó su límite de integrantes. Contacta al ADMIN.",
  user_group_limit: "Alcanzaste el límite de 30 grupos.",
  authentication_required: "Inicia sesión con la cuenta que recibió la invitación.",
  registration_failed: "No pudimos activar la cuenta. Si ya tienes una cuenta, inicia sesión; de lo contrario, consulta al ADMIN sobre tus datos y consentimientos.",
  rate_limit: "Demasiados intentos. Inténtalo de nuevo en una hora.",
  unavailable: "No pudimos procesar la invitación. Inténtalo nuevamente en unos minutos.",
};
export type InvitationPreview = { group_name: string; role: "ATHLETE" | "GUARDIAN" };
export type InvitationAcceptance = { group_id: string; membership_status: "ACTIVE" | "PENDING" };
