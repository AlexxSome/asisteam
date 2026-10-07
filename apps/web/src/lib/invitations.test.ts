import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mocks=vi.hoisted(()=>({create:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/api/server",()=>({createServerApiClient:mocks.create}));
import { invitationOperation } from "./invitations";
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","http://127.0.0.1:54321");vi.stubEnv("ASISTEAM_API_SUPABASE_URL","http://127.0.0.1:54321");});
afterEach(()=>vi.unstubAllEnvs());
it("INVITATIONS controls a single executor independently of MEMBERS",async()=>{
  const legacy=vi.fn(async()=>({data:"legacy",error:null})),nest=vi.fn(async()=>"nest");
  vi.stubEnv("ASISTEAM_TRANSPORT_INVITATIONS","nest");vi.stubEnv("ASISTEAM_TRANSPORT_MEMBERS","supabase");
  expect((await invitationOperation(legacy,nest)).data).toBe("nest");expect(legacy).not.toHaveBeenCalled();
  vi.stubEnv("ASISTEAM_TRANSPORT_INVITATIONS","supabase");expect((await invitationOperation(legacy,nest)).data).toBe("legacy");expect(nest).toHaveBeenCalledTimes(1);
});
it.each([503,504])("error %s preserves stable code without fallback or second execution",async(status)=>{
  vi.stubEnv("ASISTEAM_TRANSPORT_INVITATIONS","nest");const legacy=vi.fn(),nest=vi.fn(async()=>{throw new ApiClientError(status,"email_delivery_failed");});
  expect(await invitationOperation(legacy,nest)).toEqual({data:null,error:{code:`PT${status}`,message:"email_delivery_failed"}});expect(legacy).not.toHaveBeenCalled();expect(nest).toHaveBeenCalledTimes(1);
});
