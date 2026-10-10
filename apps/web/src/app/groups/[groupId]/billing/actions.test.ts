import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mock = vi.hoisted(() => ({ user: vi.fn(), revalidate: vi.fn(), api: vi.fn() }));
vi.mock("@/lib/api/session", () => ({ createSessionClient: async () => ({ auth: { getUser: mock.user },  }) }));
vi.mock("@/lib/api/server",()=>({createServerApiClient:()=>({manageSubscription:mock.api})}));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
import { manageSubscription } from "@/app/groups/[groupId]/billing/actions";
const group = "56000000-0000-4000-8000-000000000201";
beforeEach(() => { vi.resetAllMocks(); mock.user.mockResolvedValue({ data: { user: { id: "admin" } } }); });
it("no invoca API sin sesión ni con importe/estado enviados por cliente", async () => {
  mock.api.mockRejectedValueOnce(new ApiClientError(401,"authentication_required"));
  expect(await manageSubscription({ action: "sync", group_id: group })).toMatchObject({ error: { code: "authentication_required" } });
  expect(await manageSubscription({ action: "checkout", group_id: group, plan_code: "TEAM", payer_email: "payer@example.test", amount_clp: 1 })).toMatchObject({ error: { code: "invalid_billing_request" } });

});
it("preserva permisos API y oculta errores internos", async () => {
  mock.api.mockRejectedValueOnce(new ApiClientError(403,"admin_required"));
  expect(await manageSubscription({ action: "sync", group_id: group })).toMatchObject({ error: { code: "admin_required" } });
  mock.api.mockRejectedValueOnce(new ApiClientError(503,"secret"));
  expect(await manageSubscription({ action: "sync", group_id: group })).toMatchObject({ error: { code: "billing_unavailable" } });
});
it("acepta checkout verificado de MP y rechaza redirecciones externas", async () => {
  const input = { action: "checkout", group_id: group, plan_code: "ACADEMY", payer_email: "payer@example.test" };
  mock.api.mockResolvedValueOnce({success:true,checkout_url:"https://evil.test/subscriptions/checkout"});
  expect(await manageSubscription(input)).toMatchObject({ error: { code: "billing_unavailable" } });
  const url = "https://www.mercadopago.cl/subscriptions/checkout?preapproval_id=1";
  mock.api.mockResolvedValueOnce({success:true,checkout_url:url});
  expect(await manageSubscription(input)).toEqual({ success: true, checkout_url: url });
  expect(mock.api).toHaveBeenLastCalledWith({body:input});
  expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${group}/billing`);
});

afterEach(() => vi.unstubAllEnvs());
const useNest = () => { vi.stubEnv("ASISTEAM_TRANSPORT_BILLING", "nest");  };
it("billing Nest revalida únicamente después de confirmación y entrega solo intención",async()=>{
 useNest();
 mock.api.mockResolvedValue({success:true});
 expect(await manageSubscription({action:"sync",group_id:group})).toEqual({success:true});
 expect(mock.api).toHaveBeenCalledExactlyOnceWith({body:{action:"sync",group_id:group}});
 expect(mock.revalidate).toHaveBeenCalledExactlyOnceWith(`/groups/${group}/billing`);
});
it("creación incierta no se repite y conserva su código",async()=>{
 useNest();
 mock.api.mockRejectedValue(new ApiClientError(409,"checkout_uncertain"));
 const result=await manageSubscription({action:"checkout",group_id:group,plan_code:"TEAM",payer_email:"synthetic@example.test"});
 expect(result).toMatchObject({error:{code:"checkout_uncertain"}});expect(mock.api).toHaveBeenCalledTimes(1);expect(mock.revalidate).not.toHaveBeenCalled();
});
it("importe y actor ajenos fallan antes del transporte",async()=>{
 useNest();
 expect(await manageSubscription({action:"sync",group_id:group,amount_clp:1,actor:group})).toMatchObject({error:{code:"invalid_billing_request"}});
 expect(mock.api).not.toHaveBeenCalled();
});
