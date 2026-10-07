import { z } from "zod";
import { ACCOUNT_STATUSES, MEMBERSHIP_STATUSES } from "./enums";
import { groupMemberSchema, memberFilterSchema, managedMemberEditSchema } from "./schemas/member-management";
import { managedMemberSchema, managedMemberResultSchema, managedConsentSchema } from "./schemas/managed-member";
import { guardianshipSchema } from "./schemas/guardianship";
import { accountConsentSchema } from "./schemas/account-consent";

const uuid = z.string().uuid();
const page = z.number().int().min(1).max(100001).default(1);
const onboarding = z.object({
  membership_id: uuid, athlete_user_id: uuid, group_id: uuid, group_name: z.string(), full_name: z.string(),
  membership_status: z.enum(["ACTIVE", "PENDING"]), account_status: z.enum(ACCOUNT_STATUSES),
  is_minor: z.boolean(), guardian_linked: z.boolean(), guardian_ready: z.boolean(), requires_managed_consent: z.boolean(),
  can_consent: z.boolean(), relationship: z.string().nullable(), capacity_block: z.enum(["subscription_athlete_limit", "group_member_limit"]).nullable(),
  total_count: z.number().int().min(0),
}).strict();
const wardGroup = z.object({ athlete_user_id: uuid, group_id: uuid, name: z.string(), sport: z.string().nullable(), membership_status: z.enum(["ACTIVE", "PENDING"]) }).strict();
const ward = z.object({ athlete_user_id: uuid, full_name: z.string(), avatar_url: z.string().nullable(), age: z.number().int().min(0).max(17), days_until_majority: z.number().int().min(1), groups: z.array(wardGroup).min(1) }).strict();
export const memberHttpSchemas = {
  MemberParams: z.object({ groupId: uuid, membershipId: uuid }).strict(),
  MembershipParams: z.object({ membershipId: uuid }).strict(),
  MemberQuery: memberFilterSchema.strict(),
  Members: z.object({ data: z.array(groupMemberSchema.extend({ person_roles: z.array(z.object({ role: groupMemberSchema.shape.role, status: z.enum(MEMBERSHIP_STATUSES) }).strict()) }).strict()), total: z.number().int().min(0) }).strict(),
  ManagedMember: managedMemberSchema,
  ManagedMemberCreated: managedMemberResultSchema.strict(),
  ManagedMemberEdit: managedMemberEditSchema.strict(),
  ManagedMemberUpdated: z.object({ status: z.enum(["UPDATED", "BIRTHDATE_PENDING"]) }).strict(),
  OnboardingQuery: z.object({ group_id: uuid.optional(), athlete_user_id: uuid.optional(), membership_id: uuid.optional(), as_guardian: z.boolean().default(false), page }).strict(),
  Onboarding: z.object({ data: z.array(onboarding) }).strict(),
  DataConsent: managedConsentSchema.omit({ membership_id: true }).strict(),
  DataConsented: z.object({ status: z.enum(["ACTIVE", "PENDING"]) }).strict(),
  Guardianship: guardianshipSchema,
  GuardianshipCreated: z.object({ guardianship_id: uuid }).strict(),
  EligibleAthletesQuery: z.object({ search: z.string().trim().max(120).default(""), page }).strict(),
  EligibleAthletes: z.object({ data: z.array(z.object({ user_id: uuid, full_name: z.string(), total_count: z.number().int().min(0) }).strict()) }).strict(),
  PendingSummary: z.object({ total: z.number().int().min(0) }).strict(),
  AccountConsent: accountConsentSchema.strict(),
  CurrentAccountConsent: z.object({ accepted: z.boolean() }).strict(),
  WardQuery: z.object({ page, group_id: uuid.optional() }).strict(),
  WardParams: z.object({ athleteUserId: uuid }).strict(),
  Wards: z.object({ data: z.array(ward), has_next: z.boolean() }).strict(),
  Ward: ward,
};
const common = { module: "members", authenticated: true, state: "implemented" } as const;
export const memberHttpOperations = {
  listGroupMembers: { ...common, method: "GET", path: "/api/v1/groups/{groupId}/memberships", params: "GroupParams", query: "MemberQuery", response: "Members", status: 200, summary: "Nómina ADMIN; búsqueda literal y página de 50 con total" },
  createManagedMember: { ...common, method: "POST", path: "/api/v1/groups/{groupId}/managed-members", params: "GroupParams", body: "ManagedMember", response: "ManagedMemberCreated", status: 201, summary: "Alta MANAGED por RPC; menor PENDING hasta ratificación" },
  updateManagedMember: { ...common, method: "PATCH", path: "/api/v1/groups/{groupId}/memberships/{membershipId}/managed-profile", params: "MemberParams", body: "ManagedMemberEdit", response: "ManagedMemberUpdated", status: 200, summary: "Perfil MANAGED ADMIN; corrección de mayoría requiere revisión" },
  approveMembership: { ...common, method: "POST", path: "/api/v1/groups/{groupId}/memberships/{membershipId}/approve", params: "MemberParams", response: "Success", status: 201, summary: "Aprobar PENDING mediante RPC; locks R1 y cupos" },
  rejectMembership: { ...common, method: "POST", path: "/api/v1/groups/{groupId}/memberships/{membershipId}/reject", params: "MemberParams", response: "Success", status: 201, summary: "Rechazo lógico ADMIN; historia conservada" },
  deactivateMembership: { ...common, method: "POST", path: "/api/v1/groups/{groupId}/memberships/{membershipId}/deactivate", params: "MemberParams", response: "Success", status: 201, summary: "Baja ADMIN; último ADMIN y GUARDIAN con pupilos protegidos" },
  reactivateMembership: { ...common, method: "POST", path: "/api/v1/groups/{groupId}/memberships/{membershipId}/reactivate", params: "MemberParams", response: "Success", status: 201, summary: "Reactivar mediante RPC con R1/cupos/30 grupos" },
  assignMemberCoach: { ...common, method: "POST", path: "/api/v1/groups/{groupId}/memberships/{membershipId}/coach", params: "MemberParams", response: "Success", status: 201, summary: "COACH independiente; no altera ATHLETE" },
  listMembershipOnboarding: { ...common, method: "GET", path: "/api/v1/memberships/onboarding", query: "OnboardingQuery", response: "Onboarding", status: 200, summary: "Progreso propio, ADMIN o GUARDIAN autorizado; sin contacto/fecha/notas" },
  consentMembershipData: { ...common, method: "POST", path: "/api/v1/memberships/{membershipId}/data-consents", params: "MembershipParams", body: "DataConsent", response: "DataConsented", status: 201, summary: "Ratificar consentimiento del pupilo; solo MANAGED se activa atómicamente" },
  createGuardianship: { ...common, method: "POST", path: "/api/v1/groups/{groupId}/guardianships", params: "GroupParams", body: "Guardianship", response: "GuardianshipCreated", status: 201, summary: "Vínculo de menor ADMIN; membership GUARDIAN sin deducir consentimiento" },
  listGuardianshipAthletes: { ...common, method: "GET", path: "/api/v1/groups/{groupId}/guardianships/eligible-athletes", params: "GroupParams", query: "EligibleAthletesQuery", response: "EligibleAthletes", status: 200, summary: "Menores elegibles ADMIN; búsqueda/página de 50" },
  getPendingSummary: { ...common, method: "GET", path: "/api/v1/groups/{groupId}/memberships/pending-summary", params: "GroupParams", response: "PendingSummary", status: 200, summary: "Total PENDING autorizado para inicio ADMIN" },
  getCurrentAccountConsent: { ...common, method: "GET", path: "/api/v1/account-consents/current", response: "CurrentAccountConsent", status: 200, summary: "Aceptación actual propia; accesible antes del gate de consentimiento" },
  acceptAccountTerms: { ...common, method: "POST", path: "/api/v1/account-consents", body: "AccountConsent", response: "Success", status: 201, summary: "Aceptación versionada append-only, accesible antes del gate" },
  listMyWards: { ...common, method: "GET", path: "/api/v1/me/wards", query: "WardQuery", response: "Wards", status: 200, summary: "Pupilos vigentes con grupos autorizados, sin contacto ni fecha; página 50" },
  getWard: { ...common, method: "GET", path: "/api/v1/me/wards/{athleteUserId}", params: "WardParams", response: "Ward", status: 200, summary: "Pupilo vigente; ajeno/adulto/revocado 404" },
} as const;
