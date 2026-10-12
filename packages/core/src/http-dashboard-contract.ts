import { z } from "zod";
import { activityHttpSchemas } from "./http-activities-contract";
import { attendanceHistorySchema } from "./schemas/attendance-history";
import { ATTENDANCE_STATUSES } from "./enums";
const uuid = z.string().uuid(), count = z.number().int().nonnegative().safe();
const instant = z.string().datetime({ offset: true });
const metric = attendanceHistorySchema.shape.totals;
const period = z.object({ from: z.string().date(), to: z.string().date(), from_utc: instant, until_utc: instant }).strict();
const record = z.object({ id: uuid, status: z.enum(ATTENDANCE_STATUSES), note: z.string().nullable() }).strict();
const page = z.number().int().min(1).max(1000000).default(1);
const summary = z.object({ activity_id: uuid, phase: z.enum(["preparation", "started"]), active_athletes: count,
 recorded: count, unmarked: count, counts: metric,
 records: z.object({ data: z.array(record.extend({ membership_id: uuid, full_name: z.string() }).strict()).max(4), total: count, page }).strict().nullable(),
}).strict();
export const dashboardHttpSchemas = {
 DashboardQuery: z.object({ activity_id: uuid.optional(), records_page: page, day_page: page, wards_page: page }).strict(),
 GroupDashboard: z.object({
  group_id: uuid, now: instant, access: z.enum(["admin", "coach", "member"]),
  periods: z.object({ week: period, month: period, timezone: z.literal("America/Santiago") }).strict(),
  indicators: z.object({ active_athletes: count, week_activities: count, monthly: metric }).strict().nullable(),
  latest_announcement: z.object({id:uuid,title:z.string(),body:z.string(),created_at:instant,updated_at:instant}).strict().nullable(),
  pending: count.nullable(), upcoming: z.array(activityHttpSchemas.Activity).max(3), previous: activityHttpSchemas.Activity.nullable(),
  today: z.object({ data: z.array(activityHttpSchemas.Activity).max(50), total: count, page }).strict(), selected_activity_id: uuid.nullable(), selected_activity: activityHttpSchemas.Activity.nullable(),
  guardian_tasks:z.object({consents:count,activations:count}).strict().nullable(),
  context: summary.nullable(), personal: z.object({ monthly: metric, selected_record: record.nullable() }).strict().nullable(),
  wards: z.object({ data: z.array(z.object({ athlete_user_id: uuid, full_name: z.string(), monthly: metric, selected_record: record.nullable() }).strict()).max(4), total: count, page }).strict().nullable(),
 }).strict().superRefine((value, ctx) => {
  if (value.access !== "admin" && (value.pending !== null || value.context?.records != null)) ctx.addIssue({ code: "custom", message: "La proyección administrativa requiere ADMIN." });
  if (value.access === "member" && value.context !== null) ctx.addIssue({ code: "custom", message: "El resumen operativo requiere ADMIN o COACH." });
  if (value.context?.phase === "preparation" && (value.context.counts.attendance_pct !== null || value.context.counts.late_rate !== null)) ctx.addIssue({ code: "custom", message: "Una actividad futura no tiene porcentaje realizado." });
 }),
} as const;
export const dashboardHttpOperations = {
 getGroupDashboard: { method: "GET", path: "/api/v1/groups/{groupId}/dashboard", module: "groups", authenticated: true,
  params: "GroupParams", query: "DashboardQuery", response: "GroupDashboard", status: 200, state: "implemented",
  summary: "UI-03: snapshot autorizado de inicio; métricas Chile ponderadas, previews4 ADMIN y propios/pupilos" },
} as const;
