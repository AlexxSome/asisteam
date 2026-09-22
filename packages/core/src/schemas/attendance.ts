import { z } from "zod";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "../enums";

export const attendanceRecordSchema = z.object({
  membership_id: z.string().uuid("El integrante no es válido"),
  status: z.enum(ATTENDANCE_STATUSES, { message: "Elige un estado de asistencia válido" }),
  note: z.string().max(500, "La nota admite hasta 500 caracteres").nullable().optional(),
}).strict();

export const attendanceBatchSchema = z.array(attendanceRecordSchema).min(1, "Selecciona al menos un deportista")
  .max(500, "Un lote admite hasta 500 deportistas").superRefine((records, ctx) => {
    const seen = new Set<string>();
    records.forEach((record, index) => {
      const id = record.membership_id.toLowerCase();
      if (seen.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "membership_id"], message: "El deportista está repetido" });
      seen.add(id);
    });
  });
export const attendanceSavedRecordsSchema = z.array(attendanceRecordSchema);
export const attendanceChangesSchema = attendanceRecordSchema.pick({ status: true, note: true }).partial()
  .refine((changes) => changes.status !== undefined || changes.note !== undefined, "Indica un estado o una nota para corregir");
export type AttendanceChanges = z.infer<typeof attendanceChangesSchema>;
export type AttendanceInput = z.infer<typeof attendanceRecordSchema>;
export type AttendanceRosterRow = {
  membership_id: string; full_name: string; avatar_url: string | null;
  status: AttendanceStatus | null; note: string | null;
};

export function attendanceCounts(rows: Pick<AttendanceRosterRow, "status">[]) {
  const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, unmarked: 0 };
  for (const row of rows) counts[row.status ?? "unmarked"]++;
  return counts;
}

export const ATTENDANCE_ERROR_MESSAGES: Record<string, string> = {
  authentication_required: "Inicia sesión para registrar asistencia.",
  activity_not_found: "La actividad no existe o no tienes acceso.",
  attendance_record_not_found: "El registro ya no existe o no tienes acceso. Recarga la asistencia.",
  admin_required: "Solo un administrador del grupo puede registrar asistencia.",
  invalid_attendance_changes: "Indica un estado o una nota válida para corregir.",
  invalid_attendance_batch: "Revisa los estados y las notas (máximo 500 caracteres).",
  duplicate_membership: "Un deportista no puede aparecer dos veces en el lote.",
  membership_not_athlete_in_group: "El integrante ya no es deportista activo de este grupo. Recarga la lista.",
};
