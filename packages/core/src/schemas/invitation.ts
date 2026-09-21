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

export const invitationFormSchema = z.object({
  email: z.string().trim().email("Ingresa un email válido").max(254, "El email admite hasta 254 caracteres").toLowerCase(),
  role: z.enum(["ATHLETE", "GUARDIAN"], { message: "Selecciona Deportista o Apoderado" }),
}).strict();
export type InvitationFormInput = z.infer<typeof invitationFormSchema>;
export const sendInvitationRequestSchema = z.discriminatedUnion("action", [
  invitationFormSchema.extend({ action: z.literal("send"), group_id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("resend"), group_id: z.string().uuid(), invitation_id: z.string().uuid() }).strict(),
]);
export const sentInvitationSchema = z.object({
  id: z.string().uuid(), status: z.literal("PENDING"), expires_at: z.string().datetime({ offset: true }),
});
export type SentInvitation = z.infer<typeof sentInvitationSchema>;
export const INVITATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente", ACCEPTED: "Aceptada", EXPIRED: "Expirada",
};
export const SEND_INVITATION_ERROR_MESSAGES: Record<string, string> = {
  authentication_required: "Inicia sesión para enviar invitaciones.",
  group_not_found: "El grupo no existe o no tienes acceso.",
  admin_required: "Solo un administrador del grupo puede enviar invitaciones.",
  invalid_invitation: "Revisa el email y el rol de la invitación.",
  invitation_not_available: "La invitación ya no está pendiente o no pertenece a este grupo. Actualiza la lista.",
  invitation_send_rate_limited: "El grupo alcanzó los 50 envíos de hoy. Inténtalo mañana.",
  email_delivery_failed: "La invitación quedó guardada, pero no se confirmó el envío del correo. Puedes reenviarla desde la lista.",
  unavailable: "No pudimos confirmar el envío. Revisa la lista de invitaciones antes de reintentar.",
};
