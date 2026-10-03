import { createSubscriptionBillingHandler } from "./handler.ts";
import { billingOptions } from "./runtime.ts";
Deno.serve(createSubscriptionBillingHandler(billingOptions()));
