import { describe, expect, it, vi } from "vitest";
import { createSubscriptionBillingHandler, createMercadoPagoWebhookHandler } from "@asisteam/core";
import { checkoutUrl, createMercadoPago, verifyMercadoPagoSignature, type RemoteSubscription, type RemoteInvoice } from "@asisteam/core";
const group = "30000000-0000-4000-8000-000000000201", reference = "30000000-0000-4000-8000-000000000901", now = "2026-10-03T12:00:00.000Z";
const remote: RemoteSubscription = { id: "remote1", external_reference: reference, collector_id: "123", status: "authorized", last_modified: now, init_point: "https://www.mercadopago.cl/subscriptions/checkout?preapproval_id=remote1", auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 4990, currency_id: "CLP" } };
const invoice: RemoteInvoice = { id: "100", preapproval_id: remote.id, transaction_amount: 4990, currency_id: "CLP", debit_date: now, last_modified: now, status: "scheduled", payment: { id: "200", status: "approved" } };
function setup() {
  const local = { id: reference, group_id: group, plan_code: "TEAM", amount_clp: 4990, athlete_limit: 50, status: "AUTHORIZED", provider_subscription_id: remote.id as string | null, checkout_url: remote.init_point };
  const client = { rpc: vi.fn(async (name: string, _args: Record<string, unknown>): Promise<{data: unknown; error: {message: string} | null}> => ({ data: ["begin_subscription_checkout", "get_subscription_context", "lookup_billing_subscription"].includes(name) ? local : true, error: null })), auth: { getUser: vi.fn(async () => ({ data: { user: { id: "auth-admin" } }, error: null })) } };
  const provider = { subscription: vi.fn(async () => remote), create: vi.fn(async () => ({ ...remote, status: "pending" as const })), recover: vi.fn(async () => remote), cancel: vi.fn(async () => ({ ...remote, status: "cancelled" as const })), invoices: vi.fn(async () => [] as RemoteInvoice[]), invoice: vi.fn(async () => invoice), payment: vi.fn(async () => ({ id: "200", collector_id: "123", transaction_amount: 4990, currency_id: "CLP", status: "approved", date_approved: now, date_last_updated: now })) };
  const options = { client, provider, collectorId: "123", webUrl: "https://asisteam.test", webhookUrl: "https://edge.test/webhook", webhookSecret: "test-only-secret", allowedOrigins: ["https://asisteam.test"], enabled: true };
  return { local, options, client, provider, handler: createSubscriptionBillingHandler(options), webhook: createMercadoPagoWebhookHandler(options) };
}
const request = (body: unknown) => new Request("https://edge.test/subscription-billing", { method: "POST", headers: { Authorization: "Bearer valid-jwt" }, body: JSON.stringify(body) });
async function signed(id: string, type = "subscription_preapproval", timestamp = Date.now(), secret = "test-only-secret") {
  const ts = String(timestamp), requestId = "request-123";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`));
  const v1 = [...new Uint8Array(signature)].map(value => value.toString(16).padStart(2, "0")).join("");
  return new Request(`https://edge.test/webhook?data.id=${id}`, { method: "POST", headers: { "x-request-id": requestId, "x-signature": `ts=${ts},v1=${v1}` }, body: JSON.stringify({ type, data: { id }, status: "approved", transaction_amount: 1 }) });
}
describe("frontera de suscripciones Edge", () => {
  it("rechaza precio y estado del cliente antes de RPC", async () => {
    const { handler, client } = setup();
    expect((await handler(request({ action: "checkout", group_id: group, plan_code: "TEAM", payer_email: "payer@example.test", amount_clp: 1, status: "PAID" }))).status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it.each([["group_not_found",404], ["admin_required",403], ["authentication_required",401]])("respeta autorización %s de DB", async (message, status) => {
    const { handler, client, provider } = setup(); client.rpc.mockResolvedValue({ data: null, error: { message: String(message) } });
    expect((await handler(request({ action: "sync", group_id: group }))).status).toBe(status); expect(provider.subscription).not.toHaveBeenCalled();
  });
  it("AUTHORIZED sin pago no acredita facturas", async () => {
    const { handler, client } = setup(); expect((await handler(request({ action: "sync", group_id: group }))).status).toBe(200);
    expect(client.rpc.mock.calls.filter(call => call[0] === "sync_subscription_invoice")).toHaveLength(0);
  });
  it("ignora approved del body y factura si la API de pagos responde pending", async () => {
    const { webhook, client, provider } = setup(); provider.payment.mockResolvedValue({ id: "200", collector_id: "123", transaction_amount: 4990, currency_id: "CLP", status: "pending", date_approved: now, date_last_updated: now });
    expect((await webhook(await signed("100", "subscription_authorized_payment"))).status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith("sync_subscription_invoice", expect.objectContaining({ p_status: "PENDING", p_paid_at: null }));
  });
  it("solo acredita pago aprobado consultado a MP y por el importe del catálogo", async () => {
    const { webhook, client, provider } = setup(); expect((await webhook(await signed("100", "subscription_authorized_payment"))).status).toBe(200);
    expect(provider.payment).toHaveBeenCalledWith("200"); expect(client.rpc).toHaveBeenCalledWith("sync_subscription_invoice", expect.objectContaining({ p_status: "PAID", p_paid_at: now, p_amount_clp: 4990 }));
  });
  it.each(["collector", "amount", "currency", "reference"])("rechaza discordancia de %s", async field => {
    const { handler, client, provider } = setup(); provider.subscription.mockResolvedValue({ ...remote,
      ...(field === "collector" ? { collector_id: "evil" } : field === "reference" ? { external_reference: group } : {}),
      auto_recurring: { ...remote.auto_recurring, ...(field === "amount" ? { transaction_amount: 1 } : field === "currency" ? { currency_id: "USD" } : {}) } });
    expect((await handler(request({ action: "sync", group_id: group }))).status).toBe(503);
    expect(client.rpc.mock.calls.filter(call => call[0].startsWith("sync_"))).toHaveLength(0);
  });
  it("no acredita pagos de otro cobrador", async () => {
    const { webhook, client, provider } = setup(); provider.payment.mockResolvedValue({ id: "200", collector_id: "evil", transaction_amount: 1, currency_id: "CLP", status: "approved", date_approved: now, date_last_updated: now });
    expect((await webhook(await signed("100", "subscription_authorized_payment"))).status).toBe(503);
    expect(client.rpc.mock.calls.filter(call => call[0] === "sync_subscription_invoice")).toHaveLength(0);
  });
  it.each([false, true])("crea como máximo una vez ante concurrencia/timeout=%s", async timeout => {
    const { handler, client, provider, local } = setup(); local.provider_subscription_id = null; let claimed = false;
    client.rpc.mockImplementation(async name => ({ data: name === "claim_subscription_creation" ? (claimed ? false : (claimed = true)) : name === "begin_subscription_checkout" ? local : null, error: null }));
    if (timeout) provider.create.mockRejectedValue(new Error("timeout"));
    const input = { action: "checkout", group_id: group, plan_code: "TEAM", payer_email: "payer@example.test" };
    const results = await Promise.all([handler(request(input)), handler(request(input))]);
    expect(results.map(response => response.status)).toEqual([timeout ? 409 : 200,200]); expect(provider.create).toHaveBeenCalledTimes(1); expect(provider.recover).toHaveBeenCalledWith(reference);
    expect(JSON.stringify(client.rpc.mock.calls)).not.toContain(input.payer_email);
    expect(provider.create).toHaveBeenCalledWith(expect.objectContaining({ external_reference: reference, auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 4990, currency_id: "CLP" } }));
  });
  it("sin firma válida o con timestamp antiguo no consulta ni persiste", async () => {
    const { webhook, client, provider } = setup();
    expect((await webhook(request({ type: "subscription_preapproval", data: { id: remote.id } }))).status).toBe(401);
    expect((await webhook(await signed(remote.id, "subscription_preapproval", Date.now(), "wrong-secret"))).status).toBe(401);
    expect((await webhook(await signed(remote.id, "subscription_preapproval", Date.now() - 11 * 60_000))).status).toBe(401);
    expect(client.rpc).not.toHaveBeenCalled(); expect(provider.subscription).not.toHaveBeenCalled();
  });
  it("fallo de persistencia es reintentable y no expone mensajes internos", async () => {
    const { webhook, client, local } = setup(); client.rpc.mockImplementation(async name => ({ data: local, error: name === "sync_group_subscription" ? { message: "internal with PII" } : null }));
    const response = await webhook(await signed(remote.id)); expect(response.status).toBe(503); expect(await response.text()).not.toContain("PII");
  });
});
describe("protocolo Mercado Pago", () => {
  it("acepta firma lowercase y timestamp en milisegundos o segundos", async () => {
    expect(await verifyMercadoPagoSignature(await signed("ABC"), "test-only-secret")).toBe(true);
    expect(await verifyMercadoPagoSignature(await signed("abc", "subscription_preapproval", Math.floor(Date.now() / 1000)), "test-only-secret")).toBe(true);
  });
  it("impide redirecciones externas", () => {
    expect(() => checkoutUrl("https://www.mercadopago.cl.evil.test/subscriptions/checkout")).toThrow(); expect(() => checkoutUrl("http://www.mercadopago.cl/subscriptions/checkout")).toThrow();
  });
  it("pagina facturas desde el host fijo con credencial privada", async () => {
    const transport = vi.fn().mockResolvedValueOnce(Response.json({ paging: { total: 101 }, results: Array.from({ length: 100 }, (_, index) => ({ ...invoice, id: String(index + 1) })) })).mockResolvedValueOnce(Response.json({ paging: { total: 101 }, results: [{ ...invoice, id: "101" }] }));
    const rows = await createMercadoPago("private-token", transport).invoices("remote1"); expect(rows).toHaveLength(101); expect(transport.mock.calls[1]![0]).toContain("offset=100");
    expect(transport.mock.calls[0]![0]).toMatch(/^https:\/\/api.mercadopago.com\/authorized_payments\/search/); expect(transport.mock.calls[0]![1].headers.Authorization).toBe("Bearer private-token");
  });
});
