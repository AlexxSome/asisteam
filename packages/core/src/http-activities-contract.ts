import { z } from "zod";
import { activityDateTimeInput, activityFormSchema, activityRecurrenceSchema, activityScopeSchema } from "./schemas/activity";
import { activityTypeSchema, activityTypeUpdateSchema } from "./schemas/activity-type";

const uuid = z.string().uuid();
const instant = z.string().datetime({ offset: true });
const activity = z.object({
  id: uuid, group_id: uuid, activity_type_id: uuid, title: z.string(), description: z.string().nullable(),
  location: z.string().nullable(), starts_at: instant, ends_at: instant, activity_type_name: z.string(),
  activity_type_color: z.string().nullable(), is_system_type: z.boolean(),
  recurrence_rule: activityRecurrenceSchema.nullable(), recurrence_source_id: uuid.nullable(),
}).strict();
const type = z.object({ id: uuid, group_id: uuid.nullable(), name: z.string(), color: z.string().nullable(), is_active: z.boolean() }).strict();
const fields = {
  title: z.string().trim().min(3).max(120), activity_type_id: uuid,
  description: z.string().trim().max(2000), location: z.string().trim().max(200), starts_at: instant, ends_at: instant,
};
// The HTTP boundary uses instants; the same form validator checks Chilean dates,
// duration and recurrence bounds. SQL remains the transactional source of truth.
function validSchedule(value: z.infer<typeof create>) {
  try { return activityFormSchema.safeParse({ ...value, starts_at: activityDateTimeInput(value.starts_at), ends_at: activityDateTimeInput(value.ends_at) }).success; }
  catch { return false; }
}
const create = z.object({ ...fields, recurrence_rule: activityRecurrenceSchema.nullable().optional() }).strict();
const groupIds = z.string().refine(value => {
  const ids = value.split(","); return ids.length <= 30 && new Set(ids).size === ids.length && ids.every(id => uuid.safeParse(id).success);
});
const selection = { group_ids: groupIds };
const common = { module: "activities", authenticated: true, state: "implemented" } as const;
export const activityHttpSchemas = {
  ActivityParams: z.object({ groupId: uuid, activityId: uuid }).strict(),
  ActivityTypeParams: z.object({ groupId: uuid, typeId: uuid }).strict(),
  GroupActivityQuery: z.object({ page: z.number().int().min(1).max(1000000).default(1), period: z.enum(["upcoming", "past"]).default("upcoming") }).strict(),
  ActivityQuery: z.object({ ...selection, page: z.number().int().min(1).max(1000000).default(1), period: z.enum(["upcoming", "past"]).default("upcoming") }).strict(),
  ActivitySelection: z.object(selection).strict(),
  ActivityTypeQuery: z.object({ page: z.number().int().min(1).max(1000000).default(1), include_inactive: z.boolean().default(false) }).strict(),
  Activity: activity,
  Activities: z.object({ activities: z.array(activity).max(50), hasNext: z.boolean() }).strict(),
  HomeActivities: z.object({ next: activity.nullable(), previous: activity.nullable(), now: instant }).strict(),
  ActivityTypes: z.object({ data: z.array(type).max(100), hasNext: z.boolean() }).strict(),
  CreateActivity: create.refine(validSchedule, "Revisa el horario y los límites de la serie."),
  UpdateActivity: z.object({ ...fields, scope: activityScopeSchema }).strict().refine(validSchedule, "Revisa el horario de la actividad."),
  DeleteActivity: z.object({ scope: activityScopeSchema, confirm_attendance: z.boolean() }).strict(),
  ActivityCreated: z.object({ activityId: uuid }).strict(),
  ActivitiesAffected: z.object({ affected: z.number().int().min(0) }).strict(),
  CreateActivityType: activityTypeSchema, UpdateActivityType: activityTypeUpdateSchema,
  ActivityTypeSaved: z.object({ id: uuid }).strict(),
} as const;
export const activityHttpOperations = {
  listGroupActivities: { ...common, method: "GET", path: "/api/v1/groups/{groupId}/activities", params: "GroupParams", query: "GroupActivityQuery", response: "Activities", status: 200, summary: "Agenda del grupo ACTIVE; página50, próximas/pasadas" },
  listActivities: { ...common, method: "GET", path: "/api/v1/me/activities", query: "ActivityQuery", response: "Activities", status: 200, summary: "Agenda de grupos ACTIVE seleccionados; 50 filas, próxima o pasada" },
  getHomeActivities: { ...common, method: "GET", path: "/api/v1/me/activities/home", query: "ActivitySelection", response: "HomeActivities", status: 200, summary: "Próxima/en curso y anterior para inicio por grupos autorizados" },
  getActivity: { ...common, method: "GET", path: "/api/v1/groups/{groupId}/activities/{activityId}", params: "ActivityParams", response: "Activity", status: 200, summary: "Detalle con columnas explícitas y 404 anti-enumeración" },
  createActivity: { ...common, method: "POST", path: "/api/v1/groups/{groupId}/activities", params: "GroupParams", body: "CreateActivity", response: "ActivityCreated", status: 201, summary: "ADMIN: materializar actividad/serie mediante RPC canónica" },
  updateActivity: { ...common, method: "PATCH", path: "/api/v1/groups/{groupId}/activities/{activityId}", params: "ActivityParams", body: "UpdateActivity", response: "ActivitiesAffected", status: 200, summary: "ADMIN: puntual o futuras sin asistencia, sin reexpandir" },
  deleteActivity: { ...common, method: "DELETE", path: "/api/v1/groups/{groupId}/activities/{activityId}", params: "ActivityParams", body: "DeleteActivity", response: "ActivitiesAffected", status: 200, summary: "ADMIN: preservar historial de serie; confirmación puntual adicional" },
  listActivityTypes: { ...common, method: "GET", path: "/api/v1/groups/{groupId}/activity-types", params: "GroupParams", query: "ActivityTypeQuery", response: "ActivityTypes", status: 200, summary: "Tipos de sistema/grupo, página100" },
  createActivityType: { ...common, method: "POST", path: "/api/v1/groups/{groupId}/activity-types", params: "GroupParams", body: "CreateActivityType", response: "ActivityTypeSaved", status: 201, summary: "ADMIN: crear tipo personalizado" },
  updateActivityType: { ...common, method: "PATCH", path: "/api/v1/groups/{groupId}/activity-types/{typeId}", params: "ActivityTypeParams", body: "UpdateActivityType", response: "ActivityTypeSaved", status: 200, summary: "ADMIN: editar/desactivar propio, sistema inmutable" },
} as const;
