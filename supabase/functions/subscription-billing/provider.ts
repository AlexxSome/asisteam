import { remoteSubscriptionSchema, remoteInvoiceSchema, remotePaymentSchema, remoteSubscriptionSearchSchema, remoteInvoiceSearchSchema, type RemoteSubscription, type RemoteInvoice } from "../../../packages/core/src/schemas/mercado-pago.ts";
export type { RemoteSubscription, RemoteInvoice };

export class BillingFailure extends Error {
  constructor(public code: string, public status = 503) { super(code); }
}
export class ProviderRejection extends Error {}

export function checkoutUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || !["www.mercadopago.cl", "www.mercadopago.com", "www.mercadopago.com.ar"].includes(url.hostname)
    || url.pathname !== "/subscriptions/checkout") throw new BillingFailure("billing_unavailable");
  return url.href;
}

export function createMercadoPago(accessToken: string, transport: typeof fetch = fetch) {
  async function request(path: string, body?: unknown, method = body ? "POST" : "GET"): Promise<unknown> {
    const response = await transport(`https://api.mercadopago.com${path}`, {
      method, headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12_000), redirect: "error",
    });
    if (!response.ok) {
      if (method === "POST" && [400,401,403,404,422].includes(response.status)) throw new ProviderRejection();
      throw new BillingFailure("billing_unavailable");
    }
    return response.json();
  }
  const subscription = async (id: string) => remoteSubscriptionSchema.parse(await request(`/preapproval/${encodeURIComponent(id)}`));
  return {
    subscription,
    async create(body: unknown) { return remoteSubscriptionSchema.parse(await request("/preapproval", body)); },
    async cancel(id: string) {
      await request(`/preapproval/${encodeURIComponent(id)}`, { status: "cancelled" }, "PUT");
      return subscription(id);
    },
    async recover(reference: string) {
      const parsed = remoteSubscriptionSearchSchema.parse(await request(`/preapproval/search?external_reference=${encodeURIComponent(reference)}`));
      const matches = parsed.results.filter(item => item.external_reference === reference);
      if (matches.length !== 1) throw new BillingFailure("checkout_uncertain", 409);
      return matches[0]!;
    },
    async invoice(id: string) { return remoteInvoiceSchema.parse(await request(`/authorized_payments/${encodeURIComponent(id)}`)); },
    async payment(id: string) { return remotePaymentSchema.parse(await request(`/v1/payments/${encodeURIComponent(id)}`)); },
    async invoices(subscriptionId?: string, paymentId?: string) {
      const invoices: RemoteInvoice[] = [];
      for (let offset = 0; offset < 10000; offset += 100) {
        const query = new URLSearchParams({ limit: "100", offset: String(offset), ...(subscriptionId ? { preapproval_id: subscriptionId } : {}), ...(paymentId ? { payment_id: paymentId } : {}) });
        const result = remoteInvoiceSearchSchema
          .parse(await request(`/authorized_payments/search?${query}`));
        invoices.push(...result.results);
        if (offset + result.results.length >= result.paging.total) return invoices;
        if (!result.results.length) break;
      }
      throw new BillingFailure("billing_unavailable");
    },
  };
}
export type MercadoPago = ReturnType<typeof createMercadoPago>;

/** HMAC de los campos definidos por MP; nunca valida el estado enviado en el body. */
export async function verifyMercadoPagoSignature(request: Request, secret: string, now = Date.now()) {
  const signature = request.headers.get("x-signature") ?? "";
  const requestId = request.headers.get("x-request-id") ?? "";
  const id = new URL(request.url).searchParams.get("data.id");
  if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id) || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) return false;
  const parts = signature.split(",").map(part => part.trim().split("="));
  if (parts.length !== 2 || parts.some(part => part.length !== 2) || new Set(parts.map(part => part[0])).size !== 2) return false;
  const fields: Record<string, string> = Object.fromEntries(parts);
  if (!/^\d{10,13}$/.test(fields.ts ?? "") || !/^[a-f0-9]{64}$/i.test(fields.v1 ?? "")) return false;
  const instant = Number(fields.ts) * (fields.ts!.length <= 10 ? 1000 : 1);
  if (Math.abs(now - instant) > 10 * 60_000) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const digest = Uint8Array.from(fields.v1!.match(/../g)!, value => parseInt(value, 16));
  return crypto.subtle.verify("HMAC", key, digest, new TextEncoder().encode(`id:${id.toLowerCase()};request-id:${requestId};ts:${fields.ts};`));
}
