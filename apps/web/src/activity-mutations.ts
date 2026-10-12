
import { browserApi } from "./api";
import { isGroupId } from "../src/lib/group-routing";
import { ApiClientError } from "@asisteam/api-client";
import { ACTIVITY_ERROR_MESSAGES,activityFormSchema,activityScopeSchema,chileDateTimeToUtc } from "@asisteam/core/browser";

export type CreateActivityResult = {
    activityId: string;
} | {
    error: {
        code: string;
        message: string;
        details: Record<string, string[] | undefined>;
    };
};
export async function createActivity(groupId: string, input: unknown): Promise<CreateActivityResult> {
    if (!isGroupId(groupId))
        return { error: { code: "group_not_found", message: ACTIVITY_ERROR_MESSAGES.group_not_found!, details: {} } };
    const parsed = activityFormSchema.safeParse(input);
    if (!parsed.success)
        return { error: { code: "invalid_activity", message: "Revisa los campos indicados.", details: parsed.error.flatten().fieldErrors } };
    {
        try {
            const value = parsed.data;
            const result = await browserApi().createActivity({ params: { groupId }, body: { ...value, starts_at: chileDateTimeToUtc(value.starts_at), ends_at: chileDateTimeToUtc(value.ends_at) } });

            return result;
        }
        catch (error) {
            return nativeFailure(error, "activity_create_failed");
        }
    }
}
type MutationResult = {
    affected: number;
} | {
    error: {
        code: string;
        message: string;
        details: Record<string, string[] | undefined>;
    };
};
function failure(code: string): {
    error: {
        code: string;
        message: string;
        details: Record<string, string[] | undefined>;
    };
} {
    return { error: { code, message: ACTIVITY_ERROR_MESSAGES[code] ?? (code === "activity_create_failed" ? "No pudimos crear la actividad. Vuelve a intentarlo." : "No pudimos guardar el cambio. Vuelve a intentarlo."), details: {} } };
}
function nativeFailure(error: unknown, fallback: string) {
    return error instanceof ApiClientError && error.status < 500 ? failure(error.error.code) : { error: { code: fallback, message: "No pudimos confirmar el cambio. Actualiza la agenda y comprueba el estado antes de reintentar.", details: {} } };
}
export async function updateActivity(groupId: string, activityId: string, input: unknown, scope: unknown): Promise<MutationResult> {
    if (!isGroupId(groupId) || !isGroupId(activityId))
        return failure("activity_not_found");
    const parsedScope = activityScopeSchema.safeParse(scope);
    if (!parsedScope.success)
        return failure("invalid_activity_scope");
    const parsed = activityFormSchema.safeParse(input);
    if (!parsed.success)
        return { error: { code: "invalid_activity", message: "Revisa los campos indicados.", details: parsed.error.flatten().fieldErrors } };
    {
        try {
            const { recurrence_rule: _recurrence, ...value } = parsed.data;
            const result = await browserApi().updateActivity({ params: { groupId, activityId }, body: { ...value, starts_at: chileDateTimeToUtc(value.starts_at), ends_at: chileDateTimeToUtc(value.ends_at), scope: parsedScope.data } });

            return result;
        }
        catch (error) {
            return nativeFailure(error, "activity_update_failed");
        }
    }
}
export async function deleteActivity(groupId: string, activityId: string, scope: unknown, confirmAttendance: boolean): Promise<MutationResult> {
    if (!isGroupId(groupId) || !isGroupId(activityId))
        return failure("activity_not_found");
    const parsed = activityScopeSchema.safeParse(scope);
    if (!parsed.success)
        return failure("invalid_activity_scope");
    {
        try {
            const result = await browserApi().deleteActivity({ params: { groupId, activityId }, body: { scope: parsed.data, confirm_attendance: confirmAttendance === true } });

            return result;
        }
        catch (error) {
            return nativeFailure(error, "activity_delete_failed");
        }
    }
}

export { createActivityType, updateActivityType } from "./activity-type-mutations";
export { saveAttendance, updateAttendance, clearAttendance } from "./attendance-mutations";
