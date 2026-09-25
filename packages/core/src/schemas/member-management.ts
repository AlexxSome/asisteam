import { z } from "zod";
import { ACCOUNT_STATUSES, MEMBERSHIP_ROLES, MEMBERSHIP_STATUSES } from "../enums";
import { managedMemberProfileSchema } from "./managed-member";
import { profileSchema } from "./profile";
import { MANAGED_ACTIVATION_ERRORS } from "./invitation";

export const MEMBERSHIP_STATUS_LABELS = { ACTIVE: "Activo", INACTIVE: "Inactivo", PENDING: "Pendiente", INVITED: "Invitado" } as const;
export const ACCOUNT_STATUS_LABELS = { ACTIVE: "Cuenta propia", MANAGED: "Cuenta gestionada", INVITED: "Cuenta invitada" } as const;
export const memberFilterSchema = z.object({
  role: z.enum(MEMBERSHIP_ROLES).optional(), status: z.enum(MEMBERSHIP_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(100001).default(1),
});
export const memberIdentitySchema = z.object({ group_id: z.string().uuid(), membership_id: z.string().uuid() });
export const managedActivationSchema = memberIdentitySchema.strict();
export const activationReviewSchema = z.object({ request_id: z.string().uuid(), accepted: z.boolean() }).strict();
export const memberStatusSchema = memberIdentitySchema.extend({ action: z.enum(["deactivate", "reactivate"]) }).strict();
export const managedMemberEditSchema = managedMemberProfileSchema.extend({ phone: profileSchema.shape.phone });
export const managedMemberUpdateSchema = memberIdentitySchema.extend({ profile: managedMemberEditSchema }).strict();
export type ManagedMemberEdit = z.infer<typeof managedMemberEditSchema>;
export const groupMemberSchema = z.object({
  membership_id: z.string().uuid(), full_name: z.string(), email: z.string().nullable(), phone: z.string().nullable(),
  birthdate: z.string().nullable(), account_status: z.enum(ACCOUNT_STATUSES), role: z.enum(MEMBERSHIP_ROLES),
  status: z.enum(MEMBERSHIP_STATUSES), total_count: z.number(),
});
export type GroupMember = z.infer<typeof groupMemberSchema>;
export const MEMBER_MANAGEMENT_ERRORS: Record<string, string> = {
  ...MANAGED_ACTIVATION_ERRORS,
  authentication_required: "Inicia sesión para gestionar integrantes.",
  admin_required: "Solo un administrador activo del grupo puede gestionar integrantes.",
  group_not_found: "El grupo no existe o no tienes acceso.",
  membership_not_found: "El integrante no existe o no pertenece a este grupo.",
  managed_profile_required: "Solo puedes editar cuentas gestionadas. Las cuentas propias las edita su titular.",
  invalid_managed_member: "Revisa el nombre, email, teléfono y fecha de nacimiento.",
  invalid_member_request: "Revisa los datos de la solicitud.",
  managed_email_unavailable: "No se pudo usar ese email. Revisa los datos del integrante.",
  membership_status_changed: "El estado del integrante cambió. Actualiza la página antes de continuar.",
  LAST_ADMIN: "No puedes desactivar al último administrador activo del grupo.",
  guardian_has_active_wards: "El apoderado conserva acceso mientras tenga pupilos activos o pendientes en el grupo.",
  guardian_requires_active_ward: "El apoderado necesita un pupilo menor vigente en este grupo para reactivarse.",
  minor_requires_guardian_consent: "El menor requiere apoderado vinculado y consentimiento vigente antes de activarse.",
  managed_consent_required: "El alta gestionada aún requiere la ratificación del apoderado.",
  athlete_birthdate_required: "El deportista necesita una fecha de nacimiento.",
  group_member_limit: "El grupo alcanzó su límite de 500 integrantes activos.",
  user_group_limit: "El integrante alcanzó su límite de 30 grupos.",
  guardian_group_limit: "El apoderado alcanzó su límite de 30 grupos.",
  unavailable: "No pudimos guardar el cambio. Actualiza la página y vuelve a intentarlo.",
};
