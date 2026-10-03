"use server";

import { revalidatePath } from "next/cache";
import { BILLING_ERROR_MESSAGES, subscriptionRequestSchema } from "@asisteam/core";
import { createClient } from "@/lib/supabase/server";

export type BillingResult = { success: true; checkout_url?: string } | { error: { code: string; message: string; details: Record<string, never> } };
const fail = (code: string): BillingResult => ({ error: { code, message: BILLING_ERROR_MESSAGES[code] ?? BILLING_ERROR_MESSAGES.billing_unavailable!, details: {} } });
export async function manageSubscription(input: unknown): Promise<BillingResult> {
  const parsed = subscriptionRequestSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_billing_request");
  try {
    const client = await createClient();
    if (!(await client.auth.getUser()).data.user) return fail("authentication_required");
    const { data, error } = await client.functions.invoke("subscription-billing", { body: parsed.data });
    if (error) {
      const detail = error.context instanceof Response ? await error.context.json().catch(() => null) : null;
      const code = detail?.error?.code;
      return fail(typeof code === "string" && Object.hasOwn(BILLING_ERROR_MESSAGES, code) ? code : "billing_unavailable");
    }
    if (data?.success !== true) return fail("billing_unavailable");
    if (data.checkout_url) {
      const url = new URL(data.checkout_url);
      if (url.protocol !== "https:" || url.username || url.password || url.port || url.pathname !== "/subscriptions/checkout"
        || !["www.mercadopago.cl", "www.mercadopago.com", "www.mercadopago.com.ar"].includes(url.hostname)) return fail("billing_unavailable");
    }
    revalidatePath(`/groups/${parsed.data.group_id}/billing`);
    return { success: true, ...(data.checkout_url ? { checkout_url: data.checkout_url as string } : {}) };
  } catch { return fail("billing_unavailable"); }
}
