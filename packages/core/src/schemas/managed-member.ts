import { z } from "zod";
import { isMinor, profileSchema } from "./profile";
import { invitationFormSchema } from "./invitation";

export const managedMemberProfileSchema = z.object({
  full_name: profileSchema.shape.full_name,
  birthdate: profileSchema.shape.birthdate.unwrap(),
  email: z.union([invitationFormSchema.shape.email, z.string().trim().length(0)]),
}).strict();
export type ManagedMemberProfileInput = z.input<typeof managedMemberProfileSchema>;

export const managedMemberSchema = managedMemberProfileSchema.extend({
  guardian: z.object({
    full_name: profileSchema.shape.full_name,
    email: invitationFormSchema.shape.email,
    relationship: z.string().trim().min(2, "Indica el vínculo con el menor").max(40),
    authorized: z.literal(true, { errorMap: () => ({ message: "Debes declarar la autorización del apoderado" }) }),
  }).strict().optional(),
}).superRefine((value, context) => {
  if (isMinor(value.birthdate) && !value.guardian) context.addIssue({ code: "custom", path: ["guardian"], message: "Vincula un apoderado para registrar al menor" });
  if (!isMinor(value.birthdate) && value.guardian) context.addIssue({ code: "custom", path: ["guardian"], message: "Los adultos no requieren apoderado" });
  if (value.email && value.guardian?.email === value.email) context.addIssue({ code: "custom", path: ["guardian", "email"], message: "El apoderado debe usar un email distinto del deportista" });
});
export type ManagedMemberInput = z.input<typeof managedMemberSchema>;
export const managedConsentSchema = z.object({
  membership_id: z.string().uuid(), accepted: z.literal(true),
}).strict();
export const MANAGED_CONSENT_TERMS_VERSION = "2026-09-21";

export const managedMemberResultSchema = z.object({
  membership_id: z.string().uuid(), membership_status: z.enum(["ACTIVE", "PENDING"]),
});
export type ManagedMemberResult = z.infer<typeof managedMemberResultSchema>;

export const MANAGED_MEMBER_ERROR_MESSAGES: Record<string, string> = {
  authentication_required: "Inicia sesión para crear una cuenta gestionada.",
  active_account_required: "Necesitas una cuenta activa para continuar.",
  group_not_found: "El grupo no existe o no tienes acceso.",
  admin_required: "Solo un administrador del grupo puede crear cuentas gestionadas.",
  invalid_managed_member: "Revisa el nombre, la fecha de nacimiento y el email.",
  managed_email_unavailable: "No se pudo usar ese email. Revisa los datos o utiliza la invitación dirigida para una cuenta existente.",
  group_member_limit: "El grupo alcanzó su límite de 500 integrantes activos.",
  guardian_group_limit: "El apoderado alcanzó su límite de 30 grupos.",
  minor_requires_guardian_consent: "El menor necesita un apoderado vinculado y su consentimiento vigente.",
  invalid_guardian: "Completa los datos del apoderado y declara su autorización.",
  managed_consent_not_found: "El consentimiento no está disponible para tu cuenta.",
  consent_required: "Debes aceptar el tratamiento de los datos de tu pupilo.",
  managed_member_not_pending: "El alta ya no está pendiente. Contacta al administrador.",
  unavailable: "No pudimos confirmar el alta. Revisa el grupo antes de volver a intentarlo.",
};
