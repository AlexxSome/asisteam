import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createSubscriptionBillingHandler } from "../../../../supabase/functions/subscription-billing/handler";
import { BillingFailure, type RemoteSubscription, type RemoteInvoice } from "../../../../supabase/functions/subscription-billing/provider";
const suite = describe.skipIf(process.env.RUN_BILLING_INTEGRATION !== "1");
const run = randomUUID().replaceAll("-", ""), email = (name: string) => `billing-${run}-${name}@example.test`;
const groupId = randomUUID();
let owner: SupabaseClient, service: SupabaseClient, config: { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string };
let ownerAuthId: string, jwt: string, outsiderJwt: string;
let remote: RemoteSubscription | undefined;
const invoices: RemoteInvoice[] = [];
function sql(query: string) { return execFileSync("docker", ["exec", "-i", "supabase_db_asisteam", "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim(); }
const create = vi.fn(async (body: unknown) => {
  const input = body as { external_reference: string; auto_recurring: RemoteSubscription["auto_recurring"] };
  await new Promise(resolve => setTimeout(resolve, 150));
  remote = { id: `test${run}`, external_reference: input.external_reference, collector_id: "123", status: "pending", last_modified: new Date().toISOString(), auto_recurring: input.auto_recurring, init_point: "https://www.mercadopago.cl/subscriptions/checkout?preapproval_id=test" };
  return remote;
});
const provider = { create, subscription: async () => remote!, recover: async () => { if (!remote) throw new BillingFailure("checkout_uncertain", 409); return remote; }, cancel: async () => ({ ...remote!, status: "cancelled" as const }),
  invoices: async () => invoices, invoice: async () => invoices[0]!, payment: async () => ({ id: "5600001", collector_id: "123", transaction_amount: 4990, currency_id: "CLP", status: "approved", date_approved: new Date().toISOString(), date_last_updated: new Date().toISOString() }) };
let handler: ReturnType<typeof createSubscriptionBillingHandler>;
function request(action: string, token = jwt, extra = {}) { return new Request("https://edge.test/subscription-billing", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, group_id: groupId, ...extra }) }); }
suite("facturación: Auth + RPC reales, transporte MP simulado", () => {
  beforeAll(async () => {
    config = JSON.parse(execFileSync(resolve(import.meta.dirname, "../../../../node_modules/.bin/supabase"), ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    if (!["127.0.0.1", "localhost"].includes(new URL(config.API_URL).hostname)) throw new Error("Solo Supabase local");
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
    for (const name of ["owner", "outsider"]) {
      const password = `Synthetic-${randomUUID()}!`;
      const account = await service.auth.admin.createUser({ email: email(name), password, email_confirm: true, user_metadata: { full_name: "Fixture suscripciones", birthdate: "1990-01-01" } });
      if (account.error) throw account.error;
      const client = createClient(config.API_URL, config.ANON_KEY, options);
      const session = await client.auth.signInWithPassword({ email: email(name), password });
      if (!session.data.session) throw new Error("No se pudo autenticar fixture");
      if (name === "owner") { owner = client; ownerAuthId = account.data.user.id; jwt = session.data.session.access_token; } else outsiderJwt = session.data.session.access_token;
    }
    sql(`insert into public.groups(id,name,invite_code,created_by) select '${groupId}','Club de prueba suscripción','${run.slice(0,8)}',id from public.users where auth_user_id='${ownerAuthId}';
      insert into public.memberships(user_id,group_id,role,status) select id,'${groupId}','ADMIN','ACTIVE' from public.users where auth_user_id='${ownerAuthId}';`);
    handler = createSubscriptionBillingHandler({ client: service, provider, collectorId: "123", webUrl: "https://asisteam.test", webhookUrl: "https://edge.test/webhook", webhookSecret: "fixture-only", allowedOrigins: [], enabled: true });
  },30_000);
  afterAll(async () => {
    if (!service) return;
    const authIds = sql(`select auth_user_id from public.users where email like 'billing-${run}-%@example.test' and auth_user_id is not null;`).split("\n").filter(Boolean);
    // Borrado exclusivamente de los fixtures identificados por este run local.
    sql(`begin; set local session_replication_role=replica;
      delete from public.subscription_invoices where subscription_id in (select id from public.group_subscriptions where group_id='${groupId}');
      delete from public.group_subscriptions where group_id='${groupId}';
      delete from app_private.managed_member_enrollments where membership_id in (select id from public.memberships where group_id='${groupId}');
      delete from public.memberships where group_id='${groupId}'; delete from public.groups where id='${groupId}';
      delete from public.users where email like 'billing-${run}-%@example.test'; commit;`);
    for (const id of authIds) await service.auth.admin.deleteUser(id);
  });
  it("un JWT real ajeno recibe 404 y el propio no puede auto-pagarse", async () => {
    expect((await handler(request("sync", outsiderJwt))).status).toBe(404);
    expect((await owner.rpc("sync_group_subscription", { p_subscription_id: groupId, p_provider_id: "fake", p_status: "AUTHORIZED", p_provider_updated_at: new Date().toISOString(), p_next_payment_at: null, p_checkout_url: null })).status).toBe(403);
    expect((await owner.rpc("join_group_as_athlete", { p_group_id: groupId })).error?.message).toBe("subscription_athlete_limit");
  });
  it("dos requests concurrentes reservan una única suscripción y solo un POST remoto", async () => {
    const input = { plan_code: "TEAM", payer_email: email("payer") };
    const responses = await Promise.all([handler(request("checkout", jwt, input)), handler(request("checkout", jwt, input))]);
    expect(responses.map(response => response.status).sort()).toEqual([200,409]);
    expect(create).toHaveBeenCalledTimes(1);
    expect(sql(`select count(*) from public.group_subscriptions where group_id='${groupId}';`)).toBe("1");
    expect((await handler(request("checkout", jwt, input))).status).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("autorización sin pago no abre cupos; conciliación aprobada sí", async () => {
    remote = { ...remote!, status: "authorized", last_modified: new Date().toISOString() };
    expect((await handler(request("sync"))).status).toBe(200);
    expect((await owner.rpc("join_group_as_athlete", { p_group_id: groupId })).error?.message).toBe("subscription_athlete_limit");
    const now = new Date().toISOString();
    invoices.push({ id: "5600001", preapproval_id: remote.id, transaction_amount: 4990, currency_id: "CLP", debit_date: now, last_modified: now, status: "scheduled", payment: { id: "5600001" } });
    expect((await handler(request("sync"))).status).toBe(200);
    const summary = await owner.rpc("get_group_billing", { p_group_id: groupId });
    expect(summary.data).toMatchObject({ athlete_limit: 50, invoices: [expect.objectContaining({ status: "PAID", amount_clp: 4990 })] });
    expect((await handler(request("sync"))).status).toBe(200);
    expect(sql(`select count(*) from public.subscription_invoices where subscription_id='${remote.external_reference}';`)).toBe("1");
  });
  it("dos altas compiten por el último cupo y no pasan de 50", async () => {
    sql(`with fixtures as (insert into public.users(full_name,email,birthdate,account_status) select 'Fixture '||n,'billing-${run}-athlete-'||n||'@example.test','1990-01-01','MANAGED' from generate_series(1,49)n returning id)
      insert into public.memberships(user_id,group_id,role,status) select id,'${groupId}','ATHLETE','ACTIVE' from fixtures;`);
    const results = await Promise.all([1,2].map(n => owner.rpc("create_managed_member", { p_group_id: groupId, p_full_name: `Último cupo ${n}`, p_email: email(`race${n}`), p_birthdate: "1990-01-01" })));
    expect(results.filter(result => result.error === null)).toHaveLength(1);
    expect(results.find(result => result.error)?.error?.message).toBe("subscription_athlete_limit");
    expect(sql(`select count(*) from public.memberships where group_id='${groupId}' and role='ATHLETE' and status='ACTIVE';`)).toBe("50");
  });
});
