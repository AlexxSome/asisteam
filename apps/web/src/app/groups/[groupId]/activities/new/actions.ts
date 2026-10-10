"use server";
import { createServerApiClient } from "@/lib/api/server";
import { isGroupId } from "@/lib/group-routing";
import { ApiClientError } from "@asisteam/api-client";
import { ACTIVITY_ERROR_MESSAGES,activityFormSchema,activityScopeSchema,chileDateTimeToUtc } from "@asisteam/core";
import { revalidatePath } from "next/cache";
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
            const result = await createServerApiClient().createActivity({ params: { groupId }, body: { ...value, starts_at: chileDateTimeToUtc(value.starts_at), ends_at: chileDateTimeToUtc(value.ends_at) } });
            revalidatePath(`/groups/${groupId}/activities`);
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
    return failure(error instanceof ApiClientError && Object.hasOwn(ACTIVITY_ERROR_MESSAGES, error.error.code) ? error.error.code : fallback);
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
            const result = await createServerApiClient().updateActivity({ params: { groupId, activityId }, body: { ...value, starts_at: chileDateTimeToUtc(value.starts_at), ends_at: chileDateTimeToUtc(value.ends_at), scope: parsedScope.data } });
            revalidatePath(`/groups/${groupId}/activities`, "layout");
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
            const result = await createServerApiClient().deleteActivity({ params: { groupId, activityId }, body: { scope: parsed.data, confirm_attendance: confirmAttendance === true } });
            revalidatePath(`/groups/${groupId}/activities`, "layout");
            return result;
        }
        catch (error) {
            return nativeFailure(error, "activity_delete_failed");
        }
    }
}
