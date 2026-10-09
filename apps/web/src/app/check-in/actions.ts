"use server";
import { createServerApiClient } from "@/lib/api/server";
import { isGroupId } from "@/lib/group-routing";
import { ApiClientError } from "@asisteam/api-client";
import { CHECKIN_ERROR_MESSAGES,checkinInputSchema,checkinQrSchema,checkinResultSchema,qrCheckinSettingsSchema,type CheckinQr,type CheckinReceipt,type QrCheckinSettings } from "@asisteam/core";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
async function nestResult<S extends z.ZodTypeAny>(action: () => Promise<unknown>, schema: S) {
    try {
        const parsed = schema.safeParse(await action());
        return parsed.success ? { data: parsed.data as z.infer<S> } : failure("checkin_failed");
    }
    catch (error) {
        return failure(error instanceof ApiClientError ? error.error.code : "checkin_failed");
    }
}
type Failure = {
    error: {
        code: string;
        message: string;
        details: Record<string, never>;
    };
};
function failure(code: string): Failure {
    const safe = Object.hasOwn(CHECKIN_ERROR_MESSAGES, code) ? code : "checkin_failed";
    return { error: { code: safe, message: CHECKIN_ERROR_MESSAGES[safe]!, details: {} } };
}
export async function loadQrSettings(groupId: string): Promise<Failure | {
    settings: QrCheckinSettings;
}> {
    if (!isGroupId(groupId))
        return failure("group_not_found");
    {
        const result = await nestResult(() => createServerApiClient().getQrSettings({ params: { groupId } }), qrCheckinSettingsSchema);
        return "error" in result ? result : { settings: result.data };
    }
}
export async function saveQrSettings(groupId: string, input: unknown): Promise<Failure | {
    settings: QrCheckinSettings;
}> {
    if (!isGroupId(groupId))
        return failure("group_not_found");
    const parsed = qrCheckinSettingsSchema.safeParse(input);
    if (!parsed.success)
        return failure("invalid_qr_settings");
    {
        const result = await nestResult(() => createServerApiClient().setQrSettings({ params: { groupId }, body: parsed.data }), qrCheckinSettingsSchema);
        return "error" in result ? result : { settings: result.data };
    }
}
export async function issueCheckinQr(activityId: string): Promise<Failure | {
    qr: CheckinQr;
}> {
    if (!isGroupId(activityId))
        return failure("activity_not_found");
    {
        const result = await nestResult(() => createServerApiClient().issueCheckinQr({ params: { activityId } }), checkinQrSchema);
        return "error" in result ? result : { qr: result.data };
    }
}
export async function redeemCheckin(input: unknown): Promise<Failure | {
    receipt: CheckinReceipt;
}> {
    const parsed = checkinInputSchema.safeParse(input);
    if (!parsed.success)
        return failure("checkin_qr_expired");
    {
        const result = await nestResult(() => createServerApiClient().selfCheckin({ body: parsed.data }), checkinResultSchema);
        if ("error" in result)
            return result;
        revalidatePath(`/groups/${result.data.group_id}/activities/${result.data.activity_id}/attendance`);
        revalidatePath(`/groups/${result.data.group_id}/me/history`);
        return { receipt: result.data };
    }
}
