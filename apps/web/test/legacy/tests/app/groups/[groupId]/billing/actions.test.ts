// Historical Supabase origin regression; not evidence of current native runtime.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mock = vi.hoisted(() => ({ user: vi.fn(), invoke: vi.fn(), revalidate: vi.fn(), api: vi.fn() }));
vi.mock("@legacy/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mock.user }, functions: { invoke: mock.invoke } }) }));
vi.mock("@legacy/lib/api/server",()=>({createServerApiClient:()=>({manageSubscription:mock.api})}));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import { manageSubscription } from "@legacy/app/groups/[groupId]/billing/actions";
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

afterEach(() => vi.unstubAllEnvs());
const useNest = () => { vi.stubEnv("ASISTEAM_TRANSPORT_BILLING", "nest"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321"); vi.stubEnv("ASISTEAM_API_SUPABASE_URL", "http://127.0.0.1:54321"); };
it("billing Nest revalida únicamente después de confirmación y entrega solo intención",async()=>{
 useNest();
 mock.api.mockResolvedValue({success:true});
 expect(await manageSubscription({action:"sync",group_id:group})).toEqual({success:true});
 expect(mock.api).toHaveBeenCalledExactlyOnceWith({body:{action:"sync",group_id:group}});
 expect(mock.invoke).not.toHaveBeenCalled();expect(mock.revalidate).toHaveBeenCalledExactlyOnceWith(`/groups/${group}/billing`);
});
it("creación incierta no se repite ni ejecuta Edge y conserva su código",async()=>{
 useNest();
 mock.api.mockRejectedValue(new ApiClientError(409,"checkout_uncertain"));
 const result=await manageSubscription({action:"checkout",group_id:group,plan_code:"TEAM",payer_email:"synthetic@example.test"});
 expect(result).toMatchObject({error:{code:"checkout_uncertain"}});expect(mock.api).toHaveBeenCalledTimes(1);expect(mock.invoke).not.toHaveBeenCalled();expect(mock.revalidate).not.toHaveBeenCalled();
});
it("importe y actor ajenos fallan antes del transporte",async()=>{
 useNest();
 expect(await manageSubscription({action:"sync",group_id:group,amount_clp:1,actor:group})).toMatchObject({error:{code:"invalid_billing_request"}});
 expect(mock.api).not.toHaveBeenCalled();expect(mock.invoke).not.toHaveBeenCalled();
});
