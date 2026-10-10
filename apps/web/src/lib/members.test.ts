import { beforeEach, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mocks=vi.hoisted(()=>({ call:vi.fn(), create:vi.fn() }));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/api/server",()=>({createServerApiClient:mocks.create}));
import { memberOperation } from "@/lib/members";
beforeEach(()=>{vi.resetAllMocks();mocks.create.mockReturnValue({listMembershipOnboarding:mocks.call});});
it("MEMBERS usa solo API nativa y conserva el resultado confirmado",async()=>{
 const operation=vi.fn(async()=>"native-confirmed");
 expect(await memberOperation(operation)).toEqual({data:"native-confirmed",error:null});
 expect(operation).toHaveBeenCalledExactlyOnceWith(mocks.create.mock.results[0]!.value);expect(mocks.create).toHaveBeenCalledTimes(1);
});
it.each([401,403,404,409,422,429,503,504])("HTTP %i no provoca segunda escritura ni expone mensaje remoto",async status=>{
 const operation=vi.fn(async()=>{throw new ApiClientError(status,"stable_domain_code","private provider detail");});
 expect(await memberOperation(operation)).toEqual({data:null,error:{code:`PT${status}`,message:"stable_domain_code"}});
 expect(operation).toHaveBeenCalledTimes(1);expect(mocks.create).toHaveBeenCalledTimes(1);
});
it("configuración API inválida falla antes de ejecutar la operación",async()=>{
 mocks.create.mockImplementation(()=>{throw new ApiClientError(400,"invalid_api_origin");});
 const operation=vi.fn();
 expect(await memberOperation(operation)).toEqual({data:null,error:{code:"PT400",message:"invalid_api_origin"}});expect(operation).not.toHaveBeenCalled();
});
