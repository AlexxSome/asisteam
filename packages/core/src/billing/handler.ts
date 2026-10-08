import { mercadoPagoWebhookSchema } from "../schemas/mercado-pago.ts";
import { subscriptionRequestSchema, BILLING_ERROR_MESSAGES, localSubscriptionSchema, type LocalSubscription } from "../schemas/subscription.ts";
import { BillingFailure, ProviderRejection, checkoutUrl, verifyMercadoPagoSignature, type MercadoPago, type RemoteSubscription, type RemoteInvoice } from "./provider.ts";

type Client = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  auth: { getUser(token: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }> };
};
type Options = { client: Client; provider: MercadoPago; collectorId: string; webUrl: string; webhookUrl: string;
  webhookSecret: string; allowedOrigins: string[]; enabled: boolean };

async function rpc(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.rpc(name, args);
  if (result.error) {
    const code = result.error.message ?? "billing_unavailable";
    const status = code === "authentication_required" ? 401 : code === "admin_required" ? 403
      : ["group_not_found", "subscription_not_found"].includes(code) ? 404 : code === "subscription_exists" ? 409 : code === "invalid_billing_request" ? 400 : 503;
    throw new BillingFailure(Object.hasOwn(BILLING_ERROR_MESSAGES, code) ? code : "billing_unavailable", status);
  }
  return result.data;
}
async function lookup(options: Options, reference: string) {
  return localSubscriptionSchema.parse(await rpc(options.client, "lookup_billing_subscription", { p_subscription_id: reference }));
}
function checkSubscription(options: Options, local: LocalSubscription, remote: RemoteSubscription) {
  if (remote.external_reference !== local.id || remote.collector_id !== options.collectorId
    || (local.provider_subscription_id !== null && local.provider_subscription_id !== remote.id)
    || remote.auto_recurring.currency_id !== "CLP" || remote.auto_recurring.transaction_amount !== local.amount_clp
    || remote.auto_recurring.frequency !== 1 || remote.auto_recurring.frequency_type !== "months") {
    throw new BillingFailure("billing_unavailable");
  }
}
async function syncSubscription(options: Options, local: LocalSubscription, remote: RemoteSubscription) {
  checkSubscription(options, local, remote);
  await rpc(options.client, "sync_group_subscription", { p_subscription_id: local.id, p_provider_id: remote.id,
    p_status: remote.status.toUpperCase(), p_provider_updated_at: remote.last_modified,
    p_next_payment_at: remote.next_payment_date ?? null, p_checkout_url: remote.init_point ? checkoutUrl(remote.init_point) : null });
}
async function syncInvoice(options: Options, local: LocalSubscription, remote: RemoteSubscription, invoice: RemoteInvoice) {
  if (invoice.preapproval_id !== remote.id || invoice.currency_id !== "CLP" || invoice.transaction_amount !== local.amount_clp) throw new BillingFailure("billing_unavailable");
  let status = invoice.status === "cancelled" ? "CANCELLED" : "PENDING";
  let paidAt: string | null = null;
  let modifiedAt = invoice.last_modified;
  const paymentId = invoice.payment?.id ?? null;
  if (paymentId) {
    const payment = await options.provider.payment(paymentId);
    if (payment.id !== paymentId || payment.collector_id !== options.collectorId || payment.currency_id !== "CLP"
      || payment.transaction_amount !== local.amount_clp) throw new BillingFailure("billing_unavailable");
    if (Date.parse(payment.date_last_updated) > Date.parse(modifiedAt)) modifiedAt = payment.date_last_updated;
    if (payment.status === "approved") {
      if (!payment.date_approved) throw new BillingFailure("billing_unavailable");
      status = "PAID"; paidAt = payment.date_approved;
    } else if (["refunded", "charged_back"].includes(payment.status)) status = "REFUNDED";
  }
  await rpc(options.client, "sync_subscription_invoice", { p_provider_subscription_id: remote.id, p_invoice_id: invoice.id,
    p_due_at: invoice.debit_date, p_amount_clp: invoice.transaction_amount, p_currency: invoice.currency_id,
    p_status: status, p_payment_id: paymentId, p_paid_at: paidAt, p_provider_updated_at: modifiedAt });
}
async function syncAll(options: Options, local: LocalSubscription, remote: RemoteSubscription) {
  await syncSubscription(options, local, remote);
  for (const invoice of await options.provider.invoices(remote.id)) await syncInvoice(options, local, remote, invoice);
}
function failure(error: unknown, headers: Record<string, string> = {}) {
  const code = error instanceof BillingFailure ? error.code : "billing_unavailable";
  return Response.json({ error: { code, message: BILLING_ERROR_MESSAGES[code] ?? BILLING_ERROR_MESSAGES.billing_unavailable, details: {} } },
    { status: error instanceof BillingFailure ? error.status : 503, headers: { ...headers, "Cache-Control": "private, no-store" } });
}
export function createSubscriptionBillingHandler(options: Options): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const origin = request.headers.get("Origin");
    if (origin && !options.allowedOrigins.includes(origin)) return failure(new BillingFailure("forbidden_origin", 403));
    const headers = { "Cache-Control": "private, no-store", "Vary": "Origin", ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return failure(new BillingFailure("method_not_allowed", 405), headers);
    try {
      if (!options.enabled) throw new BillingFailure("billing_unavailable");
      const token = /^Bearer (.+)$/.exec(request.headers.get("Authorization") ?? "")?.[1];
      if (!token) throw new BillingFailure("authentication_required", 401);
      const auth = await options.client.auth.getUser(token);
      if (auth.error || !auth.data.user) throw new BillingFailure("authentication_required", 401);
      if (Number(request.headers.get("content-length") ?? 0) > 4096) throw new BillingFailure("invalid_billing_request", 400);
      const body = await request.text();
      if (body.length > 4096) throw new BillingFailure("invalid_billing_request", 400);
      let json: unknown;
      try { json = JSON.parse(body); } catch { throw new BillingFailure("invalid_billing_request", 400); }
      const parsed = subscriptionRequestSchema.safeParse(json);
      if (!parsed.success) throw new BillingFailure("invalid_billing_request", 400);
      const input = parsed.data;
      const args = { p_group_id: input.group_id, p_actor_auth_id: auth.data.user.id };
      const local = localSubscriptionSchema.parse(await rpc(options.client,
        input.action === "checkout" ? "begin_subscription_checkout" : "get_subscription_context",
        input.action === "checkout" ? { ...args, p_plan_code: input.plan_code } : args));
      let remote: RemoteSubscription;
      if (local.provider_subscription_id) remote = await options.provider.subscription(local.provider_subscription_id);
      else if (input.action === "checkout" && await rpc(options.client, "claim_subscription_creation", { p_subscription_id: local.id })) {
        try {
          remote = await options.provider.create({ reason: `Asisteam · ${local.plan_code}`, external_reference: local.id,
            payer_email: input.payer_email, status: "pending", back_url: `${options.webUrl}/groups/${local.group_id}/billing`,
            notification_url: options.webhookUrl,
            auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: local.amount_clp, currency_id: "CLP" } });
        } catch (error) {
          if (error instanceof ProviderRejection) {
            await rpc(options.client, "reject_subscription_creation", { p_subscription_id: local.id });
            throw new BillingFailure("payment_rejected", 422);
          }
          throw new BillingFailure("checkout_uncertain", 409);
        }
      } else remote = await options.provider.recover(local.id);
      checkSubscription(options, local, remote);
      if (input.action === "cancel") remote = await options.provider.cancel(remote.id);
      await syncAll(options, local, remote);
      return Response.json({ success: true, ...(input.action === "checkout" && remote.status === "pending" && remote.init_point
        ? { checkout_url: checkoutUrl(remote.init_point) } : {}) }, { headers });
    } catch (error) { return failure(error, headers); }
  };
}

export function createMercadoPagoWebhookHandler(options: Options): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    if (request.method !== "POST") return failure(new BillingFailure("method_not_allowed", 405));
    try {
      if (!options.enabled) throw new BillingFailure("billing_unavailable");
      if (!await verifyMercadoPagoSignature(request, options.webhookSecret)) return failure(new BillingFailure("invalid_webhook", 401));
      if (Number(request.headers.get("content-length") ?? 0) > 8192) throw new BillingFailure("invalid_webhook", 400);
      const text = await request.text();
      if (text.length > 8192) return failure(new BillingFailure("invalid_webhook", 400));
      let json: unknown;
      try { json = JSON.parse(text); } catch { throw new BillingFailure("invalid_webhook", 400); }
      const body = mercadoPagoWebhookSchema.safeParse(json);
      if (!body.success || body.data.data.id.toLowerCase() !== new URL(request.url).searchParams.get("data.id")?.toLowerCase()) return failure(new BillingFailure("invalid_webhook", 400));
      const event = body.data;
      if (event.type === "subscription_preapproval") {
        const remote = await options.provider.subscription(event.data.id);
        const local = await lookup(options, remote.external_reference);
        await syncSubscription(options, local, remote);
      } else {
        const invoices = event.type === "subscription_authorized_payment"
          ? [await options.provider.invoice(event.data.id)] : await options.provider.invoices(undefined, event.data.id);
        if (!invoices.length) throw new BillingFailure("billing_unavailable");
        for (const invoice of invoices) {
          if (event.type === "payment" && invoice.payment?.id !== event.data.id) throw new BillingFailure("billing_unavailable");
          const remote = await options.provider.subscription(invoice.preapproval_id);
          const local = await lookup(options, remote.external_reference);
          await syncSubscription(options, local, remote);
          await syncInvoice(options, local, remote, invoice);
        }
      }
      return new Response(null, { status: 200 });
    } catch (error) { return failure(error); }
  };
}
