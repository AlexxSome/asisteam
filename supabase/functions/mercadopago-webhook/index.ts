import { createMercadoPagoWebhookHandler } from "../subscription-billing/handler.ts";
import { billingOptions } from "../subscription-billing/runtime.ts";
Deno.serve(createMercadoPagoWebhookHandler(billingOptions()));
