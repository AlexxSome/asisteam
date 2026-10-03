import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ user: vi.fn(), invoke: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.user }, functions: { invoke: mock.invoke } }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import { manageSubscription } from "./actions";
const group = "56000000-0000-4000-8000-000000000201";
beforeEach(() => { vi.resetAllMocks(); mock.user.mockResolvedValue({ data: { user: { id: "admin" } } }); });
it("no invoca Edge sin sesión ni con importe/estado enviados por cliente", async () => {
  mock.user.mockResolvedValue({ data: { user: null } });
  expect(await manageSubscription({ action: "sync", group_id: group })).toMatchObject({ error: { code: "authentication_required" } });
  expect(await manageSubscription({ action: "checkout", group_id: group, plan_code: "TEAM", payer_email: "payer@example.test", amount_clp: 1 })).toMatchObject({ error: { code: "invalid_billing_request" } });
  expect(mock.invoke).not.toHaveBeenCalled();
});
it("preserva permisos Edge y oculta errores internos", async () => {
  mock.invoke.mockResolvedValueOnce({ error: { context: Response.json({ error: { code: "admin_required" } }, { status: 403 }) } });
  expect(await manageSubscription({ action: "sync", group_id: group })).toMatchObject({ error: { code: "admin_required" } });
  mock.invoke.mockResolvedValueOnce({ error: { context: Response.json({ error: { code: "secret" } }) } });
  expect(await manageSubscription({ action: "sync", group_id: group })).toMatchObject({ error: { code: "billing_unavailable" } });
});
it("acepta checkout verificado de MP y rechaza redirecciones externas", async () => {
  const input = { action: "checkout", group_id: group, plan_code: "ACADEMY", payer_email: "payer@example.test" };
  mock.invoke.mockResolvedValueOnce({ data: { success: true, checkout_url: "https://evil.test/subscriptions/checkout" } });
  expect(await manageSubscription(input)).toMatchObject({ error: { code: "billing_unavailable" } });
  const url = "https://www.mercadopago.cl/subscriptions/checkout?preapproval_id=1";
  mock.invoke.mockResolvedValueOnce({ data: { success: true, checkout_url: url } });
  expect(await manageSubscription(input)).toEqual({ success: true, checkout_url: url });
  expect(mock.invoke).toHaveBeenLastCalledWith("subscription-billing", { body: input });
  expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${group}/billing`);
});
