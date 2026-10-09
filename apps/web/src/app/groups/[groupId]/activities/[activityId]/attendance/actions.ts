"use server";
import { createServerApiClient } from "@/lib/api/server";
import { isGroupId } from "@/lib/group-routing";
import { ApiClientError } from "@asisteam/api-client";
import { ATTENDANCE_ERROR_MESSAGES,attendanceBatchSchema,attendanceChangesSchema,type AttendanceInput } from "@asisteam/core";
import { revalidatePath } from "next/cache";
type Failure = {
    error: {
        code: string;
        message: string;
        details: Record<string, never>;
    };
};
export type AttendanceResult = Failure | {
    records: AttendanceInput[];
};
function failure(code: string): Failure {
    const known = Object.hasOwn(ATTENDANCE_ERROR_MESSAGES, code);
    return { error: { code: known ? code : "attendance_save_failed", message: known ? ATTENDANCE_ERROR_MESSAGES[code]! : "No pudimos confirmar el guardado. Recarga la asistencia antes de reintentar.", details: {} } };
}
export async function saveAttendance(groupId: string, activityId: string, input: unknown, onlyUnmarked = false): Promise<AttendanceResult> {
    if (!isGroupId(groupId) || !isGroupId(activityId))
        return failure("activity_not_found");
    const parsed = attendanceBatchSchema.safeParse(input);
    if (!parsed.success || typeof onlyUnmarked !== "boolean")
        return failure("invalid_attendance_batch");
    {
        try {
            const result = await createServerApiClient().saveAttendance({ params: { groupId, activityId }, body: { records: parsed.data, only_unmarked: onlyUnmarked } });
            revalidatePath(`/groups/${groupId}/activities/${activityId}/attendance`);
            return result;
        }
        catch (error) {
            return failure(error instanceof ApiClientError ? error.error.code : "attendance_save_failed");
        }
    }
}
export async function clearAttendance(groupId: string, activityId: string, membershipId: string): Promise<Failure | {
    cleared: true;
}> {
    if (![groupId, activityId, membershipId].every(isGroupId))
        return failure("invalid_attendance_batch");
    {
        try {
            const result = await createServerApiClient().clearAttendance({ params: { groupId, activityId, membershipId } });
            revalidatePath(`/groups/${groupId}/activities/${activityId}/attendance`);
            return result;
        }
        catch (error) {
            return failure(error instanceof ApiClientError ? error.error.code : "attendance_save_failed");
        }
    }
}
export async function updateAttendance(groupId: string, activityId: string, membershipId: string, input: unknown): Promise<AttendanceResult> {
    if (![groupId, activityId, membershipId].every(isGroupId))
        return failure("attendance_record_not_found");
    const parsed = attendanceChangesSchema.safeParse(input);
    if (!parsed.success)
        return failure("invalid_attendance_changes");
    {
        try {
            const result = await createServerApiClient().updateAttendance({ params: { groupId, activityId, membershipId }, body: parsed.data });
            revalidatePath(`/groups/${groupId}/activities/${activityId}/attendance`);
            return result;
        }
        catch (error) {
            return failure(error instanceof ApiClientError ? error.error.code : "attendance_save_failed");
        }
    }
}
