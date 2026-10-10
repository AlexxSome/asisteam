import {randomUUID,createHash} from 'node:crypto';
import {beforeAll,describe,expect,it,vi} from 'vitest';
import {createNativeClient,nativeIntegrationConfig,nativeSql,syntheticEmailTransport} from '../../test/native-persistence.mjs';
import {requestPasswordRecovery} from '../app/forgot-password/actions';
import {resetPassword} from '../app/reset-password/actions';
vi.mock('server-only',()=>({}));
vi.mock('next/headers',()=>({cookies:async()=>({set:vi.fn(),get:()=>undefined,getAll:()=>[]}),headers:async()=>new Headers({origin:'http://127.0.0.1:3120','x-forwarded-for':'recovery-native-'+randomUUID()})}));
const enabled=process.env.RUN_NATIVE_RECOVERY_INTEGRATION==='1';
const oldPassword='clave inicial sintetica 2026',password='una nueva clave sintetica 2026';
let config:Awaited<ReturnType<typeof nativeIntegrationConfig>>;
const messages:{to:string[];text:string}[]=[];
const digest=(token:string)=>createHash('sha256').update(token).digest('hex');
async function account(status:'ACTIVE'|'INVITED'){
 const email=`recovery-${randomUUID()}@example.test`;
 const operator=createNativeClient(config.API_ORIGIN,config.OPERATOR_TOKEN);
 const result=await operator.fixtureAccount({email,password:oldPassword,profile:{full_name:'Cuenta sintética recuperación',birthdate:'1995-01-01'}});
 expect(result.error).toBeNull();expect(result.data.user.id).toMatch(/^[a-f0-9-]{36}$/);
 nativeSql(`update public.users set account_status='${status}' where auth_user_id='${result.data.user.id}'`);
 expect(nativeSql(`select account_status from public.users where auth_user_id='${result.data.user.id}'`)).toBe(status);
 return{email,id:result.data.user.id};
}
function token(email:string){const message=[...messages].reverse().find(message=>message.to.includes(email));expect(message).toBeDefined();expect(message!.text).toContain('60 minutos');const url=new URL(message!.text.match(/http:\/\/\S+/)![0]);expect(url.origin).toBe('http://127.0.0.1:3120');return url.searchParams.get('token')!}
describe.skipIf(!enabled)('HU-GEN-03: acciones web con Auth Nest y PostgreSQL reales',()=>{
 beforeAll(async()=>{config=await nativeIntegrationConfig();syntheticEmailTransport(async(_input,init)=>{messages.push(JSON.parse(String(init?.body)));return Response.json({id:randomUUID()})});vi.stubEnv('ASISTEAM_AUTH_WEB_ORIGIN','http://127.0.0.1:3120');vi.stubEnv('ASISTEAM_API_ORIGIN',config.API_ORIGIN);vi.stubEnv('NATIVE_AUTH_PROXY_SECRET','3'.repeat(64));});
 it.each(['ACTIVE','INVITED'] as const)('envía correo a %s, cambia contraseña y rechaza replay',async status=>{
  const a=await account(status);expect(await requestPasswordRecovery({email:a.email})).toEqual({message:'Si el email existe, enviamos instrucciones'});
  const recovery=token(a.email);expect(await resetPassword(recovery,{password,confirmPassword:password})).toEqual({success:true});
  const client=createNativeClient(config.API_ORIGIN,config.GUEST_TOKEN);expect((await client.auth.signInWithPassword({email:a.email,password})).error).toBeNull();
  const response=await fetch(config.API_ORIGIN+'/api/v1/auth/logout',{method:'POST',headers:{authorization:'Bearer '+(await client.auth.getSession()).data.session!.access_token,'content-type':'application/json'},body:'{}'});expect(response.ok).toBe(true);
  expect((await client.auth.signInWithPassword({email:a.email,password:oldPassword})).error).not.toBeNull();expect(await resetPassword(recovery,{password,confirmPassword:password})).toHaveProperty('error');
 },20000);
 it('respuesta uniforme para email inexistente sin enviar correo',async()=>{const email=`missing-${randomUUID()}@example.test`;expect(await requestPasswordRecovery({email})).toEqual({message:'Si el email existe, enviamos instrucciones'});expect(messages.some(message=>message.to.includes(email))).toBe(false);});
 it('rechaza enlace tras60min y conserva contraseña anterior',async()=>{const a=await account('ACTIVE');await requestPasswordRecovery({email:a.email});const recovery=token(a.email);nativeSql(`update app_private.auth_recovery set expires_at=now()-interval '1 minute' where token_hash='${digest(recovery)}'`);expect(await resetPassword(recovery,{password,confirmPassword:password})).toHaveProperty('error');const client=createNativeClient(config.API_ORIGIN,config.GUEST_TOKEN);expect((await client.auth.signInWithPassword({email:a.email,password:oldPassword})).error).toBeNull();},20000);
});
