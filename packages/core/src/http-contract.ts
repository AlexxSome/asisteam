import { z } from "zod";
import { announcementHttpSchemas, announcementHttpOperations } from "./http-announcements-contract";
import { billingSummarySchema, subscriptionRequestSchema } from "./schemas/subscription";
import { checkoutUrl } from "./billing/provider";
import { reportHttpSchemas, reportHttpOperations } from "./http-reports-contract";
import { attendanceHttpSchemas, attendanceHttpOperations } from "./http-attendance-contract";
import { activityHttpSchemas, activityHttpOperations } from "./http-activities-contract";
import { invitationHttpSchemas, invitationHttpOperations } from "./http-invitations-contract";
import { memberHttpSchemas, memberHttpOperations } from "./http-members-contract";
import { MEMBERSHIP_ROLES } from "./enums";
import { groupFormSchema, groupSettingsSchema, groupSettingsChangeSchema, joinCodeSchema } from "./schemas/group";
import { profileSchema } from "./schemas/profile";
import { apiErrorResponseSchema } from "./schemas/api-error";

/** HTTP DTOs are independent of persistence. Actor and authorization stay on the server. */
const uuid = z.string().uuid();
export const httpPageQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(100).default(50),
}).strict();
export const httpPaginationSchema = z.object({
  page: z.number().int().min(1), page_size: z.number().int().min(1).max(100), total: z.number().int().min(0),
}).strict();
export const httpGroupSummarySchema = z.object({
  id: uuid, name: z.string(), sport: z.string().nullable(), logo_url: z.string().nullable(),
  roles: z.array(z.enum(MEMBERSHIP_ROLES)).min(1),
}).strict();
const detail = httpGroupSummarySchema.extend({ description: z.string().nullable(), can_view_group_stats: z.boolean() });
export const httpGroupMemberSchema = detail.extend({
  access: z.literal("member"), roles: z.array(z.enum(["ATHLETE", "GUARDIAN", "COACH"])).min(1),
}).strict();
export const httpGroupAdminSchema = detail.extend({
  access: z.literal("admin"), invite_code: z.string().regex(/^[A-Za-z0-9]{8}$/), settings: groupSettingsSchema,
  settings_updated_at: z.string().datetime({ offset: true }).nullable(), settings_updated_by_name: z.string().nullable(),
}).strict().refine(value => value.roles.includes("ADMIN"), "La proyección administrativa requiere ADMIN.");
export const httpOwnProfileSchema = z.object({
  id: uuid, full_name: z.string(), email: z.string().nullable(), phone: z.string().nullable(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), avatar_url: z.string().nullable(),
}).strict();

export const httpSchemas = {
  ...announcementHttpSchemas,
  BillingSummary: billingSummarySchema,
  BillingRequest: subscriptionRequestSchema,
  BillingQuery: z.object({ page: z.number().int().min(1).max(1000000).default(1) }).strict(),
  BillingResult: z.object({ success: z.literal(true), checkout_url: z.string().refine(value => { try { checkoutUrl(value); return true; } catch { return false; } }).optional() }).strict(),
  ...activityHttpSchemas,
  ...attendanceHttpSchemas,
  ...memberHttpSchemas,
  ...invitationHttpSchemas,
  Session: z.object({ user_id: uuid }).strict(),
  Empty: z.object({}).strict(),
  PageQuery: httpPageQuerySchema,
  GroupParams: z.object({ groupId: uuid }).strict(),
  MyGroups: z.object({ data: z.array(httpGroupSummarySchema), pagination: httpPaginationSchema }).strict(),
  GroupDetail: z.union([httpGroupMemberSchema, httpGroupAdminSchema]),
  CreateGroup: groupFormSchema.strict(),
  GroupCreated: z.object({ group_id: uuid }).strict(),
  OwnProfile: httpOwnProfileSchema,
  UpdateOwnProfile: profileSchema,
  ProfileUpdated: z.object({ profile: httpOwnProfileSchema, birthdate_change_pending: z.boolean() }).strict(),
  GroupSettingsChange: groupSettingsChangeSchema,
  GroupSettings: z.object({ settings: groupSettingsSchema }).strict(),
  InviteCode: z.object({ code: joinCodeSchema }).strict(),
  JoinByCode: z.object({ code: joinCodeSchema }).strict(),
  JoinedGroup: z.object({ membership: z.object({ group_id: uuid, status: z.enum(["ACTIVE", "PENDING"]) }).strict() }).strict(),
  Success: z.object({ success: z.literal(true) }).strict(),
  ProfileContext: z.object({
    avatar_allowed: z.boolean(), has_admin_role: z.boolean(),
    birthdate_request: z.object({ id: uuid, requested_birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), status: z.enum(["PENDING", "APPROVED", "APPLIED", "REJECTED", "CANCELLED"]) }).strict().nullable(),
    avatar_permissions: z.array(z.object({ guardianship_id: uuid, full_name: z.string(), allows_avatar: z.boolean() }).strict()),
  }).strict(),
  BirthdateReviews: z.object({ data: z.array(z.object({ request_id: uuid, group_id: uuid, group_name: z.string(), full_name: z.string(), old_birthdate: z.string(), requested_birthdate: z.string(), approved: z.boolean() }).strict()) }).strict(),
  ReviewParams: z.object({ requestId: uuid }).strict(),
  ReviewBirthdate: z.object({ group_id: uuid, approve: z.boolean() }).strict(),
  BirthdateReviewed: z.object({ status: z.enum(["PENDING", "APPLIED", "REJECTED"]) }).strict(),
  AvatarPermissionParams: z.object({ guardianshipId: uuid }).strict(),
  AvatarPermissionChange: z.object({ allow: z.boolean() }).strict(),
  ApiError: apiErrorResponseSchema,
  Health: z.object({ status: z.literal("ok") }).strict(),
  Ready: z.object({ status: z.literal("ready") }).strict(),
  ...reportHttpSchemas,
} as const;

export const HTTP_ERROR_STATUSES = [400, 401, 403, 404, 409, 422, 429, 410, 500, 503, 504] as const;

/** Only specified operations enter the generated SDK. Domain handlers arrive in #151 and following module issues. */
export const httpOperations = {
  ...announcementHttpOperations,
  getGroupBilling: { method: "GET", path: "/api/v1/groups/{groupId}/billing", module: "billing", authenticated: true, params: "GroupParams", query: "BillingQuery", response: "BillingSummary", status: 200, state: "implemented", summary: "Ledger y capacidad ADMIN; DTO sin datos privados del proveedor" },
  manageSubscription: { method: "POST", path: "/api/v1/billing/subscriptions", module: "billing", authenticated: true, body: "BillingRequest", response: "BillingResult", status: 200, state: "implemented", summary: "Checkout, conciliación o cancelación; importe y cupos del servidor" },
  ...activityHttpOperations,
  ...attendanceHttpOperations,
  ...memberHttpOperations,
  ...invitationHttpOperations,
  getSession: { method: "GET", path: "/api/v1/auth/session", module: "auth", authenticated: true, response: "Session", status: 200, state: "implemented", summary: "Identidad del perfil verificada; sesión vigente y cuenta ACTIVE" },
  health: { method: "GET", path: "/api/v1/health", module: "runtime", authenticated: false, response: "Health", status: 200, state: "implemented", summary: "Vida del proceso" },
  ready: { method: "GET", path: "/api/v1/ready", module: "runtime", authenticated: false, response: "Ready", status: 200, state: "implemented", summary: "Disponibilidad de PostgreSQL" },
  listMyGroups: { method: "GET", path: "/api/v1/me/groups", module: "groups", authenticated: true, query: "PageQuery", response: "MyGroups", status: 200, state: "implemented", summary: "Grupos con membresía ACTIVE; roles locales unidos, orden name/id" },
  getGroup: { method: "GET", path: "/api/v1/groups/{groupId}", module: "groups", authenticated: true, params: "GroupParams", response: "GroupDetail", status: 200, state: "implemented", summary: "Detalle visible; código/settings solo ADMIN, grupo ajeno 404" },
  createGroup: { method: "POST", path: "/api/v1/groups", module: "groups", authenticated: true, body: "CreateGroup", response: "GroupCreated", status: 201, state: "implemented", summary: "Crear grupo + ADMIN mediante create_group; actor de sesión" },
  updateGroup: { method: "PATCH", path: "/api/v1/groups/{groupId}", module: "groups", authenticated: true, params: "GroupParams", body: "CreateGroup", response: "Success", status: 200, state: "implemented", summary: "Actualizar datos del grupo; ADMIN ACTIVE y RLS" },
  updateGroupSettings: { method: "PATCH", path: "/api/v1/groups/{groupId}/settings", module: "groups", authenticated: true, params: "GroupParams", body: "GroupSettingsChange", response: "GroupSettings", status: 200, state: "implemented", summary: "Toggles independientes mediante RPC" },
  rotateInviteCode: { method: "POST", path: "/api/v1/groups/{groupId}/invite-code/rotate", module: "groups", authenticated: true, params: "GroupParams", response: "InviteCode", status: 201, state: "implemented", summary: "Regenerar código; ADMIN ACTIVE" },
  joinAsAthlete: { method: "POST", path: "/api/v1/groups/{groupId}/memberships/self", module: "groups", authenticated: true, params: "GroupParams", response: "Success", status: 201, state: "implemented", summary: "ADMIN se agrega como ATHLETE; RPC conserva R1 y cupos" },
  joinByCode: { method: "POST", path: "/api/v1/groups/join", module: "groups", authenticated: true, body: "JoinByCode", response: "JoinedGroup", status: 201, state: "implemented", summary: "Ingreso ATHLETE; menor PENDING y contador persistido" },
  getProfileContext: { method: "GET", path: "/api/v1/me/profile-context", module: "profile", authenticated: true, response: "ProfileContext", status: 200, state: "implemented", summary: "Solicitud propia y permisos vigentes de imagen" },
  listBirthdateReviews: { method: "GET", path: "/api/v1/me/birthdate-reviews", module: "profile", authenticated: true, response: "BirthdateReviews", status: 200, state: "implemented", summary: "Correcciones de otros integrantes autorizadas por RPC" },
  reviewBirthdate: { method: "POST", path: "/api/v1/me/birthdate-reviews/{requestId}", module: "profile", authenticated: true, params: "ReviewParams", body: "ReviewBirthdate", response: "BirthdateReviewed", status: 201, state: "implemented", summary: "Revisión ADMIN por grupo; no autoaprobación" },
  setAvatarPermission: { method: "PATCH", path: "/api/v1/me/avatar-permissions/{guardianshipId}", module: "profile", authenticated: true, params: "AvatarPermissionParams", body: "AvatarPermissionChange", response: "Success", status: 200, state: "implemented", summary: "Apoderado vigente autoriza o retira imagen; historia conservada" },
  getOwnProfile: { method: "GET", path: "/api/v1/me", module: "profile", authenticated: true, response: "OwnProfile", status: 200, state: "implemented", summary: "Datos propios; no sirve para perfiles de terceros" },
  updateOwnProfile: { method: "PATCH", path: "/api/v1/me", module: "profile", authenticated: true, body: "UpdateOwnProfile", response: "ProfileUpdated", status: 200, state: "implemented", summary: "Editar perfil conservando revisión de birthdate y consentimiento" },
  ...reportHttpOperations,
} as const;
