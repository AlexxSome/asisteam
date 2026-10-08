import { createMercadoPagoWebhookHandler } from "../subscription-billing/handler.ts";
import { billingOptions } from "../subscription-billing/runtime.ts";
import { createBillingWebhookRelay } from "../../../packages/core/src/billing/relay.ts";
const target = Deno.env.get("BILLING_NEST_WEBHOOK_URL");
Deno.serve(target ? createBillingWebhookRelay(target) : createMercadoPagoWebhookHandler(billingOptions()));
