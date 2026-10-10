import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@asisteam/api-client";
const mock=vi.hoisted(()=>({create:vi.fn(),update:vi.fn(),factory:vi.fn(),revalidate:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:mock.revalidate}));
vi.mock("@/lib/api/server",()=>({createServerApiClient:()=>{mock.factory();return {createActivityType:mock.create,updateActivityType:mock.update};}}));
import {createActivityType,updateActivityType} from "@/app/groups/[groupId]/activity-types/actions";
const groupId="29000000-0000-4000-8000-000000000201",typeId="29000000-0000-4000-8000-000000000301";
const input={name:"Amistoso",color:"#123ABC"};
beforeEach(()=>{vi.resetAllMocks();mock.create.mockResolvedValue({id:typeId});mock.update.mockResolvedValue({id:typeId});});
describe("acciones de tipos nativas",()=>{
 it("crea con grupo explícito y refresca el grupo",async()=>{
  expect(await createActivityType(groupId,{...input,name:" Amistoso "})).toEqual({id:typeId});
  expect(mock.create).toHaveBeenCalledWith({params:{groupId},body:input});
  expect(mock.revalidate).toHaveBeenCalledWith(`/groups/${groupId}`,"layout");
 });
 it("edita/desactiva con ambos IDs, sin escribir identidad",async()=>{
  expect(await updateActivityType(groupId,typeId,{...input,is_active:false})).toEqual({id:typeId});
  expect(mock.update).toHaveBeenCalledWith({params:{groupId,typeId},body:{...input,is_active:false}});
 });
 it("valida antes de acceder a datos",async()=>{
  expect(await createActivityType(groupId,{...input,color:"red"})).toMatchObject({error:{code:"invalid_activity_type",details:{color:expect.any(Array)}}});
  expect(await createActivityType(groupId,{...input,group_id:"otro"})).toHaveProperty("error");
  expect(await updateActivityType(groupId,"",{...input,is_active:false})).toHaveProperty("error");
  expect(mock.factory).not.toHaveBeenCalled();
 });
 it("exige sesión y permiso actual por grupo",async()=>{
  for(const [status,code] of [[401,"authentication_required"],[404,"group_not_found"],[403,"admin_required"]] as const){
   mock.create.mockRejectedValueOnce(new ApiClientError(status,code));
   expect(await createActivityType(groupId,input)).toMatchObject({error:{code}});
  }
  expect(mock.create).toHaveBeenCalledTimes(3);expect(mock.revalidate).not.toHaveBeenCalled();
 });
 it.each(["activity_type_name_exists","admin_required","invalid_activity_type","activity_type_save_failed"])("conserva código %s sin revelar detalles",async expected=>{
  mock.create.mockRejectedValueOnce(new ApiClientError(422,expected,"private sql"));
  const result=await createActivityType(groupId,input);
  expect(result).toMatchObject({error:{code:expected,details:{}}});expect(JSON.stringify(result)).not.toContain("private sql");
  expect(mock.revalidate).not.toHaveBeenCalled();
 });
 it("no informa éxito para tipo ajeno, sistema o permiso revocado",async()=>{
  mock.update.mockRejectedValue(new ApiClientError(404,"activity_type_not_found"));
  expect(await updateActivityType(groupId,typeId,{...input,is_active:false})).toMatchObject({error:{code:"activity_type_not_found"}});
  expect(mock.revalidate).not.toHaveBeenCalled();
 });
});
