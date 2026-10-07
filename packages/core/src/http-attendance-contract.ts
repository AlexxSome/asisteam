import { z } from "zod";
import { ATTENDANCE_STATUSES } from "./enums";
import { attendanceBatchSchema, attendanceChangesSchema, attendanceSavedRecordsSchema } from "./schemas/attendance";

const uuid = z.string().uuid();
const path = "/api/v1/groups/{groupId}/activities/{activityId}/attendance";
const common = { module: "attendance", authenticated: true, state: "implemented", status: 200 } as const;
export const attendanceHttpSchemas = {
  AttendanceMemberParams: z.object({ groupId: uuid, activityId: uuid, membershipId: uuid }).strict(),
  AttendanceQuery: z.object({ page: z.number().int().min(1).max(1000000).default(1) }).strict(),
  AttendanceRoster: z.object({
    roster: z.array(z.object({ membership_id: uuid, full_name: z.string(), avatar_url: z.string().nullable(),
      status: z.enum(ATTENDANCE_STATUSES).nullable(), note: z.string().max(500).nullable() }).strict()).max(100),
    canEditNotes: z.boolean(), hasNext: z.boolean(),
  }).strict(),
  SaveAttendance: z.object({ records: attendanceBatchSchema, only_unmarked: z.boolean().default(false) }).strict(),
  AttendanceSaved: z.object({ records: attendanceSavedRecordsSchema.max(500) }).strict(),
  UpdateAttendance: attendanceChangesSchema,
  AttendanceCleared: z.object({ cleared: z.literal(true) }).strict(),
} as const;
export const attendanceHttpOperations = {
  getAttendanceRoster: { ...common, method: "GET", path, params: "ActivityParams", query: "AttendanceQuery", response: "AttendanceRoster", summary: "ADMIN/COACH: nómina ATHLETE ACTIVE, página100; COACH recibe notas nulas" },
  saveAttendance: { ...common, method: "PUT", path, params: "ActivityParams", body: "SaveAttendance", response: "AttendanceSaved", summary: "Lote atómico de1–500; upsert único y only_unmarked preserva marcas previas" },
  updateAttendance: { ...common, method: "PATCH", path: path + "/{membershipId}", params: "AttendanceMemberParams", body: "UpdateAttendance", response: "AttendanceSaved", summary: "Corrección parcial bajo bloqueo; COACH cambia solo estado" },
  clearAttendance: { ...common, method: "DELETE", path: path + "/{membershipId}", params: "AttendanceMemberParams", response: "AttendanceCleared", summary: "ADMIN: desmarcado explícito por RPC canónica" },
} as const;
