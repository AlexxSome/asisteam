import { z } from "zod";

export const REPORT_PERIOD_LABELS = { week: "Semana", month: "Mes", custom: "Rango personalizado", season: "Temporada" } as const;
const date = z.string().date("Ingresa una fecha válida").optional();
export const reportFilterSchema = z.object({
  period: z.enum(["week", "month", "custom", "season"]).default("month"),
  from: date,
  to: date,
  activity_type_ids: z.array(z.string().uuid("Selecciona un tipo de actividad válido")).max(100).default([]),
  include_inactive: z.boolean().default(false),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  sort: z.enum(["attendance", "name"]).default("attendance"),
}).superRefine((filter, ctx) => {
  if (filter.period === "custom" && (!filter.from || !filter.to || filter.to < filter.from)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["from"], message: "Indica el inicio y el término del rango, en ese orden." });
  }
});
export type ReportFilter = z.infer<typeof reportFilterSchema>;

const count = z.number().int().nonnegative().safe();
const percentage = z.number().min(0).max(100).nullable();
const metric = z.object({ convened: count, present: count, late: count, absent: count, excused: count, attendance_pct: percentage, late_rate: percentage });
export const groupAttendanceReportSchema = z.object({
  group_id: z.string().uuid(),
  period: z.object({ type: z.enum(["week", "month", "custom", "season"]), from: z.string(), to: z.string(), timezone: z.literal("America/Santiago") }),
  has_activities: z.boolean(),
  totals: metric.extend({ athletes: count, activities: count, average_attendance_pct: percentage, best_full_name: z.string().nullable() }),
  by_athlete: z.array(metric.extend({ membership_id: z.string().uuid(), full_name: z.string(), membership_status: z.enum(["ACTIVE", "INACTIVE"]) })),
  by_activity_type: z.array(metric.extend({ activity_type_id: z.string().uuid(), name: z.string(), color: z.string(), is_system: z.boolean(), activities: count })),
  trend: z.array(z.object({ week_from: z.string(), attendance_pct: percentage, convened: count })),
  page: z.number().int().positive(), page_size: z.number().int().min(1).max(100),
});
export type GroupAttendanceReport = z.infer<typeof groupAttendanceReportSchema>;

export const groupStatsSchema = z.object({
  group_id: z.string().uuid(),
  members: z.array(metric.extend({ membership_id: z.string().uuid(), full_name: z.string(), avatar_url: z.string().nullable() }).strict()),
  totals: metric.extend({ athletes: count }).strict(),
  page: z.number().int().positive(), page_size: z.number().int().min(1).max(100),
}).strict();
export type GroupStats = z.infer<typeof groupStatsSchema>;

/** Misma batería canónica que SQL; half-up exacto sobre contadores enteros. */
export function attendanceMetrics(counts: { present: number; late: number; absent: number; excused: number }) {
  const { present, late, absent, excused } = counts;
  const percent = (numerator: number, denominator: number) => denominator === 0 ? null
    : Number((2n * BigInt(numerator) * 1000n + BigInt(denominator)) / (2n * BigInt(denominator))) / 10;
  return { ...counts, convened: present + late + absent + excused,
    attendance_pct: percent(present + late, present + late + absent), late_rate: percent(late, present + late) };
}

export function reportPercentage(value: number | null) {
  return value === null ? "Sin datos" : `${value.toFixed(1)} %`;
}

export function reportAttendanceTone(value: number | null) {
  if (value === null) return "text-muted-foreground";
  if (value >= 85) return "text-green-700 dark:text-green-400";
  if (value >= 70) return "text-amber-700 dark:text-amber-400";
  return "text-red-700 dark:text-red-400";
}
