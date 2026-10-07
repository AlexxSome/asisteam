import { z } from "zod";
import { MEMBERSHIP_ROLES } from "./enums";
import { groupFormSchema, groupSettingsSchema } from "./schemas/group";
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
  ApiError: apiErrorResponseSchema,
  Health: z.object({ status: z.literal("ok") }).strict(),
  Ready: z.object({ status: z.literal("ready") }).strict(),
} as const;

export const HTTP_ERROR_STATUSES = [400, 401, 403, 404, 409, 422, 429, 500, 503, 504] as const;

/** Only specified operations enter the generated SDK. Domain handlers arrive in #149/#151. */
export const httpOperations = {
  health: { method: "GET", path: "/api/v1/health", module: "runtime", authenticated: false, response: "Health", status: 200, state: "implemented", summary: "Vida del proceso" },
  ready: { method: "GET", path: "/api/v1/ready", module: "runtime", authenticated: false, response: "Ready", status: 200, state: "implemented", summary: "Disponibilidad de PostgreSQL" },
  listMyGroups: { method: "GET", path: "/api/v1/me/groups", module: "groups", authenticated: true, query: "PageQuery", response: "MyGroups", status: 200, state: "contract-only", summary: "Grupos con membresía ACTIVE; roles locales unidos, orden name/id" },
  getGroup: { method: "GET", path: "/api/v1/groups/{groupId}", module: "groups", authenticated: true, params: "GroupParams", response: "GroupDetail", status: 200, state: "contract-only", summary: "Detalle visible; código/settings solo ADMIN, grupo ajeno 404" },
  createGroup: { method: "POST", path: "/api/v1/groups", module: "groups", authenticated: true, body: "CreateGroup", response: "GroupCreated", status: 201, state: "contract-only", summary: "Crear grupo + ADMIN mediante create_group; actor de sesión" },
  getOwnProfile: { method: "GET", path: "/api/v1/me", module: "profile", authenticated: true, response: "OwnProfile", status: 200, state: "contract-only", summary: "Datos propios; no sirve para perfiles de terceros" },
  updateOwnProfile: { method: "PATCH", path: "/api/v1/me", module: "profile", authenticated: true, body: "UpdateOwnProfile", response: "ProfileUpdated", status: 200, state: "contract-only", summary: "Editar perfil conservando revisión de birthdate y consentimiento" },
} as const;
