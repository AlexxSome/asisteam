
import { browserApi } from "./api";
import { isGroupId } from "../../web/src/lib/group-routing";
import { ApiClientError } from "@asisteam/api-client";
import { ATTENDANCE_ERROR_MESSAGES,attendanceBatchSchema,attendanceChangesSchema,httpSchemas,type AttendanceInput } from "@asisteam/core/browser";

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
            const result = httpSchemas.AttendanceSaved.parse(await browserApi().saveAttendance({ params: { groupId, activityId }, body: { records: parsed.data, only_unmarked: onlyUnmarked } }));

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
            const result = await browserApi().clearAttendance({ params: { groupId, activityId, membershipId } });

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
            const result = httpSchemas.AttendanceSaved.parse(await browserApi().updateAttendance({ params: { groupId, activityId, membershipId }, body: parsed.data }));

            return result;
        }
        catch (error) {
            return failure(error instanceof ApiClientError ? error.error.code : "attendance_save_failed");
        }
    }
}
