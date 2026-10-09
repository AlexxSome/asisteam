"use server";
import { createServerApiClient } from "@/lib/api/server";
import { isGroupId } from "@/lib/group-routing";
import { ApiClientError } from "@asisteam/api-client";
import { GROUP_ERROR_MESSAGES,groupFormSchema,groupSettingsChangeSchema,joinCodeSchema,type GroupSettings } from "@asisteam/core";
import { revalidatePath } from "next/cache";
import { forbidden,redirect } from "next/navigation";
type JoinAthleteResult = {
    success: true;
} | {
    error: {
        code: string;
        message: string;
        details: Record<string, never>;
    };
};
type GroupActionError = {
    error: {
        code: string;
        message: string;
        details: Record<string, string[] | undefined>;
    };
};
const groupError = (code: string, fallback?: string): GroupActionError => ({
    error: { code, message: fallback ?? GROUP_ERROR_MESSAGES[code] ?? "No pudimos completar la acción. Vuelve a intentarlo.", details: {} },
});
function nestGroupError(error: unknown, fallback: string): {
    error: {
        code: string;
        message: string;
        details: Record<string, never>;
    };
} {
    const result = groupError(error instanceof ApiClientError ? error.error.code : fallback);
    return { error: { ...result.error, details: {} } };
}
export async function updateGroup(groupId: string, input: unknown): Promise<{
    success: true;
} | GroupActionError> {
    if (!isGroupId(groupId))
        return groupError("group_not_found");
    {
        const parsed = groupFormSchema.safeParse(input);
        if (!parsed.success)
            return { error: { code: "invalid_group", message: GROUP_ERROR_MESSAGES.invalid_group!, details: parsed.error.flatten().fieldErrors } };
        try {
            await createServerApiClient().updateGroup({ params: { groupId }, body: parsed.data });
            revalidatePath("/groups", "layout");
            return { success: true };
        }
        catch (error) {
            if (error instanceof ApiClientError && error.status === 403)
                forbidden();
            return nestGroupError(error, "group_update_failed");
        }
    }
}
export async function rotateInviteCode(groupId: string): Promise<{
    code: string;
} | GroupActionError> {
    if (!isGroupId(groupId))
        return groupError("group_not_found");
    {
        try {
            const data = await createServerApiClient().rotateInviteCode({ params: { groupId } });
            revalidatePath(`/groups/${groupId}`, "layout");
            return data;
        }
        catch (error) {
            return nestGroupError(error, "invite_code_rotate_failed");
        }
    }
}
export async function updateGroupSettings(groupId: string, input: unknown): Promise<{
    settings: GroupSettings;
} | GroupActionError> {
    if (!isGroupId(groupId))
        return groupError("group_not_found");
    {
        const parsed = groupSettingsChangeSchema.safeParse(input);
        if (!parsed.success)
            return groupError("invalid_group_settings");
        try {
            const data = await createServerApiClient().updateGroupSettings({ params: { groupId }, body: parsed.data });
            revalidatePath(`/groups/${groupId}`, "layout");
            return data;
        }
        catch (error) {
            return nestGroupError(error, "group_settings_update_failed");
        }
    }
}
export async function joinAsAthlete(groupId: string): Promise<JoinAthleteResult> {
    if (!isGroupId(groupId))
        return { error: { code: "group_not_found", message: GROUP_ERROR_MESSAGES.group_not_found!, details: {} } };
    {
        try {
            await createServerApiClient().joinAsAthlete({ params: { groupId } });
            revalidatePath("/groups", "layout");
            return { success: true };
        }
        catch (error) {
            return nestGroupError(error, "membership_create_failed");
        }
    }
}
export async function joinByCode(formData: FormData): Promise<void> {
    const parsedCode = joinCodeSchema.safeParse(formData.get("code"));
    if (!parsedCode.success)
        redirect("/join?error=invalid_invite_code");
    {
        let membership;
        try {
            membership = await createServerApiClient().joinByCode({ body: { code: parsedCode.data } });
        }
        catch (error) {
            if (error instanceof ApiClientError && error.status === 401)
                redirect(`/login?invite_code=${parsedCode.data}`);
            const code = error instanceof ApiClientError && Object.hasOwn(GROUP_ERROR_MESSAGES, error.error.code) ? error.error.code : "join_failed";
            redirect(`/join?error=${code}`);
        }
        revalidatePath("/groups", "layout");
        if (membership.membership.status === "PENDING")
            redirect("/join?pending=1");
        redirect(`/groups/${membership.membership.group_id}`);
    }
}
