import { expect, it, vi } from "vitest";
import { invitationAuthHandler } from "../../../../supabase/functions/invitation-auth/handler";
const secret="synthetic-bridge-secret-only";
const body={email:"synthetic@example.test",password:"synthetic-password",nonce:"a".repeat(64)};
const request=(input:unknown,supplied=secret)=>new Request("http://local.test",{method:"POST",headers:{"x-asisteam-auth-bridge":supplied},body:JSON.stringify(input)});
it("bridge rejects missing/wrong secret and injected metadata before touching Auth",async()=>{
  const createUser=vi.fn();const handler=invitationAuthHandler({secret,createUser});
  expect((await handler(request(body,"wrong"))).status).toBe(401);
  expect((await invitationAuthHandler({createUser})(request(body))).status).toBe(503);
  expect((await handler(request({...body,user_metadata:{role:"ADMIN"}}))).status).toBe(400);expect(createUser).not.toHaveBeenCalled();
});
it("bridge invokes Auth once with nonce only, uniform failure and minimum success DTO",async()=>{
  const createUser=vi.fn().mockResolvedValue({data:{user:{id:"synthetic-id",email:"private"}},error:null});const handler=invitationAuthHandler({secret,createUser});
  expect(await (await handler(request(body))).json()).toEqual({id:"synthetic-id"});expect(createUser).toHaveBeenCalledOnce();expect(createUser).toHaveBeenCalledWith({email:body.email,password:body.password,email_confirm:true,user_metadata:{invitation_registration_nonce:body.nonce}});
  createUser.mockResolvedValue({data:{user:null},error:{message:"private-provider-error"}});const response=await handler(request(body));expect(response.status).toBe(422);expect(await response.text()).not.toContain("private-provider-error");
});
