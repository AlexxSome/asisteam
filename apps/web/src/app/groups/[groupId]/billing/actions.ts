"use server";
import { createServerApiClient } from "@/lib/api/server";
import { ApiClientError } from "@asisteam/api-client";
import { BILLING_ERROR_MESSAGES,subscriptionRequestSchema,httpSchemas } from "@asisteam/core";
import { revalidatePath } from "next/cache";
export type BillingResult = {
    success: true;
    checkout_url?: string;
} | {
    error: {
        code: string;
        message: string;
        details: Record<string, never>;
    };
};
const fail = (code: string): BillingResult => ({ error: { code: Object.hasOwn(BILLING_ERROR_MESSAGES,code)?code:"billing_unavailable", message: BILLING_ERROR_MESSAGES[code] ?? BILLING_ERROR_MESSAGES.billing_unavailable!, details: {} } });
export async function manageSubscription(input: unknown): Promise<BillingResult> {
    const parsed = subscriptionRequestSchema.safeParse(input);
    if (!parsed.success)
        return fail("invalid_billing_request");
    try {
        {
            const response = await createServerApiClient().manageSubscription({ body: parsed.data });
            const checked=httpSchemas.BillingResult.safeParse(response);
            if(!checked.success)return fail("billing_unavailable");
            const data=checked.data;
            revalidatePath(`/groups/${parsed.data.group_id}/billing`);
            return data;
        }
    }
    catch (error) {
        return fail(error instanceof ApiClientError ? error.error.code : "billing_unavailable");
    }
}
