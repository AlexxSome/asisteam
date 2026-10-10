import { beforeEach, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mocks=vi.hoisted(()=>({create:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/api/server",()=>({createServerApiClient:mocks.create}));
import { invitationOperation } from "@/lib/invitations";
beforeEach(()=>{vi.resetAllMocks();mocks.create.mockReturnValue({});});
  it("INVITATIONS usa una sola API nativa y conserva resultado confirmado",async()=>{
    const operation=vi.fn(async()=>"native-confirmed");
    expect(await invitationOperation(operation)).toEqual({data:"native-confirmed",error:null});
    expect(operation).toHaveBeenCalledExactlyOnceWith(mocks.create.mock.results[0]!.value);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
it.each([503,504])("error %s preserva código estable sin segunda ejecución",async status=>{
 const operation=vi.fn(async()=>{throw new ApiClientError(status,"email_delivery_failed","private provider detail");});
 expect(await invitationOperation(operation)).toEqual({data:null,error:{code:`PT${status}`,message:"email_delivery_failed"}});
 expect(operation).toHaveBeenCalledTimes(1);expect(mocks.create).toHaveBeenCalledTimes(1);
});
