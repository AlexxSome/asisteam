
import { browserApi } from "./api";
import { isGroupId } from "../src/lib/group-routing";
import { ApiClientError } from "@asisteam/api-client";
import { ACTIVITY_TYPE_ERROR_MESSAGES,activityTypeSchema,activityTypeUpdateSchema } from "@asisteam/core/browser";

export type ActivityTypeResult = {
    id: string;
} | {
    error: {
        code: string;
        message: string;
        details: Record<string, string[] | undefined>;
    };
};
function failure(code: string, details: Record<string, string[] | undefined> = {}): ActivityTypeResult {
    return { error: { code, message: ACTIVITY_TYPE_ERROR_MESSAGES[code]!, details } };
}
async function saveType(groupId: string, input: unknown, typeId?: string): Promise<ActivityTypeResult> {
    if (!isGroupId(groupId))
        return failure("group_not_found");
    if (typeId !== undefined && !isGroupId(typeId))
        return failure("activity_type_not_found");
    const parsed = (typeId === undefined ? activityTypeSchema : activityTypeUpdateSchema).safeParse(input);
    if (!parsed.success)
        return failure("invalid_activity_type", parsed.error.flatten().fieldErrors);
    {
        try {
            const client = browserApi();
            const result = typeId === undefined
                ? await client.createActivityType({ params: { groupId }, body: activityTypeSchema.parse(parsed.data) })
                : await client.updateActivityType({ params: { groupId, typeId }, body: activityTypeUpdateSchema.parse(parsed.data) });

            return result;
        }
        catch (error) {
            if (error instanceof ApiClientError && error.status < 500)
                return failure(Object.hasOwn(ACTIVITY_TYPE_ERROR_MESSAGES, error.error.code) ? error.error.code : "activity_type_save_failed");
            throw error;
        }
    }
}
export async function createActivityType(groupId: string, input: unknown): Promise<ActivityTypeResult> {
    return saveType(groupId, input);
}
export async function updateActivityType(groupId: string, typeId: string, input: unknown): Promise<ActivityTypeResult> {
    // Un argumento omitido nunca debe convertir una edición en una creación.
    if (!isGroupId(typeId))
        return failure("activity_type_not_found");
    return saveType(groupId, input, typeId);
}
