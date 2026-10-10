import {expect,it,vi} from 'vitest';
import {InvitationsController} from '../../../api/dist/invitations.js';
const secret='synthetic-native-proxy-secret-only';
const registration={full_name:'Fixture',email:'synthetic@example.test',password:'Synthetic-password-168!',birthdate:'1990-01-01',terms_accepted:true,terms_version:'2026-09-21'};
const input={token:'a'.repeat(64),registration};
const request=(supplied=secret)=>({headers:{'x-asisteam-proxy':supplied,'x-asisteam-client-ip':'synthetic'}} as unknown as Parameters<InvitationsController['register']>[0]);
function fixture(config:Record<string,string|undefined>={INVITATION_PROXY_SECRET:secret,NATIVE_AUTH_SECRET:secret}){
 const register=vi.fn(),call=vi.fn(async(operation)=>operation==='attempt'?true:{group_name:'Fixture',role:'ATHLETE'});
 return{register,call,controller:new InvitationsController({register} as unknown as ConstructorParameters<typeof InvitationsController>[0],undefined as unknown as ConstructorParameters<typeof InvitationsController>[1],{call} as unknown as ConstructorParameters<typeof InvitationsController>[2],config as unknown as ConstructorParameters<typeof InvitationsController>[3],undefined as unknown as ConstructorParameters<typeof InvitationsController>[4])};
}
it('native invitation proxy and strict registration reject forged input before Auth',async()=>{
 const f=fixture();await expect(f.controller.register(request('wrong'),input)).rejects.toMatchObject({status:401});
 await expect(fixture({INVITATION_PROXY_SECRET:undefined,NATIVE_AUTH_SECRET:secret}).controller.register(request(),input)).rejects.toMatchObject({status:503});
 await expect(f.controller.register(request(),{...input,actor:'ADMIN'})).rejects.toMatchObject({status:400});expect(f.register).not.toHaveBeenCalled();
});
it('native invitation calls Auth with verified token and returns bounded domain DTO',async()=>{
 const f=fixture();const result={group_id:'16800000-0000-4000-8000-000000000001',membership_status:'ACTIVE'};
 f.register.mockResolvedValue(result);expect(await f.controller.register(request(),input)).toEqual(result);expect(f.register).toHaveBeenCalledOnce();
 expect(f.register).toHaveBeenCalledWith(registration,{token:input.token,claim:false});
 f.register.mockRejectedValue(new Error('synthetic provider failure'));
 await expect(f.controller.register(request(),input)).rejects.toThrow();
});
