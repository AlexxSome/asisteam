import { z } from "zod";
import { ATTENDANCE_STATUSES } from "../enums";
import { groupAttendanceReportSchema } from "./report";

export const attendanceHistorySchema = z.object({
  group_id: z.string().uuid(),
  membership_id: z.string().uuid(),
  full_name: z.string(),
  period: groupAttendanceReportSchema.shape.period,
  totals: groupAttendanceReportSchema.shape.totals.omit({ athletes: true, activities: true, average_attendance_pct: true, best_full_name: true }).strict(),
  records: z.array(z.object({
    id: z.string().uuid(), activity_id: z.string().uuid(), title: z.string(), starts_at: z.string().datetime({ offset: true }),
    activity_type_id: z.string().uuid(), activity_type_name: z.string(), activity_type_color: z.string(), is_system_type: z.boolean(),
    status: z.enum(ATTENDANCE_STATUSES), note: z.string().nullable(),
  }).strict()),
  page: z.number().int().positive(), page_size: z.number().int().min(1).max(100),
}).strict();
export type AttendanceHistory = z.infer<typeof attendanceHistorySchema>;
