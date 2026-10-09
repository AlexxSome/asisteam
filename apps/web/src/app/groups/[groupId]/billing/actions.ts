"use server";
import { createServerApiClient } from "@/lib/api/server";
import { ApiClientError } from "@asisteam/api-client";
import { BILLING_ERROR_MESSAGES,subscriptionRequestSchema } from "@asisteam/core";
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
const fail = (code: string): BillingResult => ({ error: { code, message: BILLING_ERROR_MESSAGES[code] ?? BILLING_ERROR_MESSAGES.billing_unavailable!, details: {} } });
export async function manageSubscription(input: unknown): Promise<BillingResult> {
    const parsed = subscriptionRequestSchema.safeParse(input);
    if (!parsed.success)
        return fail("invalid_billing_request");
    try {
        {
            const data = await createServerApiClient().manageSubscription({ body: parsed.data });
            revalidatePath(`/groups/${parsed.data.group_id}/billing`);
            return data;
        }
    }
    catch (error) {
        return fail(error instanceof ApiClientError ? error.error.code : "billing_unavailable");
    }
}
