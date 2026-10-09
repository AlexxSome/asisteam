"use server";
import { createServerApiClient } from "@/lib/api/server";
import { ApiClientError } from "@asisteam/api-client";
import { GROUP_ERROR_MESSAGES,groupFormSchema } from "@asisteam/core";
import { revalidatePath } from "next/cache";
export type CreateGroupResult = {
    groupId: string;
} | {
    error: {
        code: string;
        message: string;
        details: Record<string, string[] | undefined>;
    };
};
export async function createGroup(input: unknown): Promise<CreateGroupResult> {
    const parsed = groupFormSchema.safeParse(input);
    if (!parsed.success)
        return { error: { code: "invalid_group", message: "Revisa los campos indicados.", details: parsed.error.flatten().fieldErrors } };
    {
        try {
            const result = await createServerApiClient().createGroup({ body: parsed.data });
            revalidatePath("/groups");
            return { groupId: result.group_id };
        }
        catch (error) {
            const code = error instanceof ApiClientError ? error.error.code : "group_create_failed";
            return { error: { code, message: GROUP_ERROR_MESSAGES[code] ?? "No pudimos crear el grupo. Vuelve a intentarlo.", details: {} } };
        }
    }
}
