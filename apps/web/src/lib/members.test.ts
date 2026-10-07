import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mocks=vi.hoisted(()=>({ call:vi.fn(), create:vi.fn() }));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/api/server",()=>({createServerApiClient:mocks.create}));
import { memberOperation } from "./members";
beforeEach(()=>{
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://synthetic.supabase.co");
  vi.stubEnv("ASISTEAM_API_SUPABASE_URL","https://synthetic.supabase.co");
  vi.stubEnv("ASISTEAM_TRANSPORT_MEMBERS","supabase");
  mocks.create.mockReturnValue({listMembershipOnboarding:mocks.call});
});
afterEach(()=>vi.unstubAllEnvs());
it("MEMBERS on/off selects one executor and retains the confirmed result",async()=>{
  const legacy=vi.fn(async()=>({data:"legacy-confirmed",error:null}));
  const nest=vi.fn(async()=>"nest-confirmed");
  expect(await memberOperation(legacy,nest)).toEqual({data:"legacy-confirmed",error:null});
  vi.stubEnv("ASISTEAM_TRANSPORT_MEMBERS","nest");
  expect(await memberOperation(legacy,nest)).toEqual({data:"nest-confirmed",error:null});
  vi.stubEnv("ASISTEAM_TRANSPORT_MEMBERS","supabase");
  expect(await memberOperation(legacy,nest)).toEqual({data:"legacy-confirmed",error:null});
  expect(legacy).toHaveBeenCalledTimes(2);expect(nest).toHaveBeenCalledTimes(1);
});
it.each([401,403,404,409,422,429,503,504])("Nest %i never triggers a second write or exposes a remote message",async status=>{
  vi.stubEnv("ASISTEAM_TRANSPORT_MEMBERS","nest");
  const legacy=vi.fn(async()=>({data:"unexpected",error:null}));
  const result=await memberOperation(legacy,async()=>{throw new ApiClientError(status,"stable_domain_code");});
  expect(result).toEqual({data:null,error:{code:`PT${status}`,message:"stable_domain_code"}});
  expect(legacy).not.toHaveBeenCalled();
});
it("an invalid same-database attestation fails before either executor",async()=>{
  vi.stubEnv("ASISTEAM_TRANSPORT_MEMBERS","nest");vi.stubEnv("ASISTEAM_API_SUPABASE_URL","https://other.supabase.co");
  const legacy=vi.fn(),nest=vi.fn();
  await expect(memberOperation(legacy,nest)).rejects.toMatchObject({status:400});
  expect(legacy).not.toHaveBeenCalled();expect(nest).not.toHaveBeenCalled();
});
