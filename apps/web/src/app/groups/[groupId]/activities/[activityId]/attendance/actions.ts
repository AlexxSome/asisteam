"use server";

import { revalidatePath } from "next/cache";
import { ATTENDANCE_ERROR_MESSAGES, attendanceBatchSchema, attendanceChangesSchema, attendanceSavedRecordsSchema, type AttendanceInput } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";
import { isGroupId } from "@/lib/group-routing";

type Failure = { error: { code: string; message: string; details: Record<string, never> } };
export type AttendanceResult = Failure | { records: AttendanceInput[] };

function failure(code: string): Failure {
  const known = Object.hasOwn(ATTENDANCE_ERROR_MESSAGES, code);
  return { error: { code: known ? code : "attendance_save_failed", message: known ? ATTENDANCE_ERROR_MESSAGES[code]! : "No pudimos confirmar el guardado. Recarga la asistencia antes de reintentar.", details: {} } };
}

export async function saveAttendance(groupId: string, activityId: string, input: unknown, onlyUnmarked = false): Promise<AttendanceResult> {
  if (!isGroupId(groupId) || !isGroupId(activityId)) return failure("activity_not_found");
  const parsed = attendanceBatchSchema.safeParse(input);
  if (!parsed.success || typeof onlyUnmarked !== "boolean") return failure("invalid_attendance_batch");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure("authentication_required");
  // groupId forma parte de la ruta, pero el permiso real se resuelve desde
  // activity_id dentro de la RPC; no se confía en IDs o roles del cliente.
  const { data, error } = await supabase.rpc("record_attendance_bulk", {
    p_activity_id: activityId, p_records: parsed.data, p_only_unmarked: onlyUnmarked,
  });
  if (error) return failure(error.message);
  const saved = attendanceSavedRecordsSchema.safeParse(data && typeof data === "object" && !Array.isArray(data) ? data.records : null);
  if (!saved.success) return failure("attendance_save_failed");
  revalidatePath(`/groups/${groupId}/activities/${activityId}/attendance`);
  return { records: saved.data };
}

export async function clearAttendance(groupId: string, activityId: string, membershipId: string): Promise<Failure | { cleared: true }> {
  if (![groupId, activityId, membershipId].every(isGroupId)) return failure("invalid_attendance_batch");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure("authentication_required");
  const { error } = await supabase.rpc("clear_attendance_record", { p_activity_id: activityId, p_membership_id: membershipId });
  if (error) return failure(error.message);
  revalidatePath(`/groups/${groupId}/activities/${activityId}/attendance`);
  return { cleared: true };
}

export async function updateAttendance(groupId: string, activityId: string, membershipId: string, input: unknown): Promise<AttendanceResult> {
  if (![groupId, activityId, membershipId].every(isGroupId)) return failure("attendance_record_not_found");
  const parsed = attendanceChangesSchema.safeParse(input);
  if (!parsed.success) return failure("invalid_attendance_changes");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return failure("authentication_required");
  // Resuelve la identidad desde una proyección solo-ADMIN, acotada a la ruta.
  // La RPC repite autorización y lee los campos omitidos bajo bloqueo.
  const { data: record, error: lookupError } = await supabase.from("v_attendance_admin").select("id")
    .eq("group_id", groupId).eq("activity_id", activityId).eq("membership_id", membershipId).maybeSingle();
  if (lookupError) return failure("attendance_save_failed");
  if (!record?.id) return failure("attendance_record_not_found");
  const { data, error } = await supabase.rpc("update_attendance_record", { p_record_id: record.id, p_changes: parsed.data });
  if (error) return failure(error.message);
  const saved = attendanceSavedRecordsSchema.safeParse(data && typeof data === "object" && !Array.isArray(data) ? data.records : null);
  if (!saved.success) return failure("attendance_save_failed");
  revalidatePath(`/groups/${groupId}/activities/${activityId}/attendance`);
  return { records: saved.data };
}
