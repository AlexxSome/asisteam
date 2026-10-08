import { createClient } from "@supabase/supabase-js";
import { createMercadoPago } from "./provider.ts";

export function billingOptions() {
  const token = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? "";
  const secret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET") ?? "";
  const collectorId = Deno.env.get("MERCADOPAGO_COLLECTOR_ID") ?? "";
  const webUrl = (Deno.env.get("BILLING_WEB_URL") ?? "").replace(/\/$/, "");
  const webhookUrl = Deno.env.get("BILLING_WEBHOOK_URL") ?? "";
  return {
    client: createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } }),
    provider: createMercadoPago(token), collectorId, webUrl, webhookUrl, webhookSecret: secret,
    allowedOrigins: (Deno.env.get("BILLING_ALLOWED_ORIGINS") ?? webUrl).split(",").map(value => value.trim()),
    enabled: Deno.env.get("BILLING_TRANSPORT_DISABLED") !== "1" && !!(token && secret && /^\d+$/.test(collectorId) && /^https:\/\//.test(webUrl) && /^https:\/\//.test(webhookUrl)),
  };
}
