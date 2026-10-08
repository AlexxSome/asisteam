import { z } from "zod";
import { attendancePeriodFilterSchema, groupAttendanceReportSchema, groupStatsSchema, reportFilterSchema } from "./schemas/report";
import { attendanceHistorySchema } from "./schemas/attendance-history";

const uuid = z.string().uuid();
const page = z.number().int().min(1).max(1000000).default(1);
const pageSize = z.number().int().min(1).max(100).default(50);
// CSV is the HTTP representation only; SQL/core still consume UUID arrays.
const typeIds = z.string().default("").refine(value => value === ""
  || (value.split(",").length <= 100 && value.split(",").every(id => uuid.safeParse(id).success)));
const periodFields = {
  period: z.enum(["week", "month", "custom", "season"]).default("month"),
  from: z.string().date().optional(), to: z.string().date().optional(),
  activity_type_ids: typeIds, page, page_size: pageSize,
};
const historyQuery = z.object(periodFields).strict();
const reportQuery = historyQuery.extend({ include_inactive: z.boolean().default(false), sort: z.enum(["attendance", "name"]).default("attendance") });
const canonical = (query: z.infer<typeof historyQuery>) => ({ ...query, activity_type_ids: query.activity_type_ids ? query.activity_type_ids.split(",") : [] });
const common = { module: "reports", authenticated: true, state: "implemented", method: "GET", status: 200 } as const;
export const reportHttpSchemas = {
  WardHistoryParams: z.object({ groupId: uuid, athleteUserId: uuid }).strict(),
  HistoryQuery: historyQuery.refine(value => attendancePeriodFilterSchema.safeParse(canonical(value)).success, "Revisa el período seleccionado."),
  ReportQuery: reportQuery.refine(value => reportFilterSchema.safeParse(canonical(value)).success, "Revisa los filtros del reporte."),
  StatsQuery: z.object({ page, page_size: pageSize }).strict(),
  AttendanceHistory: attendanceHistorySchema,
  GroupAttendanceReport: groupAttendanceReportSchema.strict(),
  GroupStats: groupStatsSchema,
} as const;
export const reportHttpOperations = {
  getMyAttendanceHistory: { ...common, path: "/api/v1/groups/{groupId}/me/history", params: "GroupParams", query: "HistoryQuery", response: "AttendanceHistory", summary: "V1: historial ATHLETE propio; identidad resuelta por SQL, período Chile y paginación" },
  getWardAttendanceHistory: { ...common, path: "/api/v1/groups/{groupId}/wards/{athleteUserId}/history", params: "WardHistoryParams", query: "HistoryQuery", response: "AttendanceHistory", summary: "V2/V3: pupilo vigente; vínculo, edad y membresías reevaluados en SQL" },
  getGroupAttendanceReport: { ...common, path: "/api/v1/groups/{groupId}/reports", params: "GroupParams", query: "ReportQuery", response: "GroupAttendanceReport", summary: "ADMIN/COACH: agregados canónicos, inactivos opcionales y orden estable; sin PII ni notas" },
  getGroupStats: { ...common, path: "/api/v1/groups/{groupId}/stats", params: "GroupParams", query: "StatsQuery", response: "GroupStats", summary: "V4/V5: toggles por rol evaluados en SQL; solo nombre/avatar y métricas agregadas" },
} as const;
