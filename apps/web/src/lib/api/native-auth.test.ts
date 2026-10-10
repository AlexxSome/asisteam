import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ApiClient} from '@asisteam/api-client';
const fixture=vi.hoisted(()=>({values:new Map<string,string>(),set:vi.fn(),origin:'https://web.example.test'}));
vi.mock('next/headers',()=>({headers:async()=>new Headers({origin:fixture.origin,'x-forwarded-for':'127.0.0.1'}),cookies:async()=>({get:(name:string)=>fixture.values.has(name)?{value:fixture.values.get(name)}:undefined,getAll:()=>Array.from(fixture.values,([name,value])=>({name,value})),set:fixture.set})}));
import {TRANSPORT_MODULES} from './config';
import {nativeAuthEnabled as enabled,NATIVE_ACCESS_COOKIE,NATIVE_REFRESH_COOKIE} from './native-auth-config';
import {assertAuthOrigin,setNativeCookies,nativeUser} from './native-auth';
import {nativeAuthMiddleware} from './native-auth-middleware';
import {NextRequest} from 'next/server';
beforeEach(()=>{
 vi.stubEnv('ASISTEAM_TRANSPORT_AUTH','nest');for(const module of TRANSPORT_MODULES)vi.stubEnv('ASISTEAM_TRANSPORT_'+module.toUpperCase(),'nest');
 vi.stubEnv('ASISTEAM_API_ORIGIN','https://api.example.test');vi.stubEnv('ASISTEAM_AUTH_WEB_ORIGIN','https://web.example.test');vi.stubEnv('NATIVE_AUTH_PROXY_SECRET','synthetic-only-secret-'.repeat(3));
 fixture.origin='https://web.example.test';fixture.values.clear();fixture.set.mockReset();
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it('mixed configuration fails closed before domain calls',()=>{expect(enabled()).toBe(true);vi.stubEnv('ASISTEAM_TRANSPORT_STORAGE','unsupported');expect(enabled).toThrow();});
it('cookie attributes, provider replacement and origin protect server credentials',async()=>{
 vi.stubEnv('NODE_ENV','production');fixture.values.set('sb-fixture-auth-token','old');
 await setNativeCookies({access_token:'synthetic-access',refresh_token:'a'.repeat(64)});
 expect(fixture.set).toHaveBeenCalledWith(NATIVE_ACCESS_COOKIE,'synthetic-access',expect.objectContaining({secure:true,httpOnly:true,sameSite:'lax',path:'/',maxAge:900}));
 expect(fixture.set).toHaveBeenCalledWith(NATIVE_REFRESH_COOKIE,'a'.repeat(64),expect.objectContaining({secure:true,httpOnly:true,sameSite:'lax',maxAge:2592000}));
 expect(fixture.set).toHaveBeenCalledWith('sb-fixture-auth-token','',expect.objectContaining({maxAge:0}));
 await expect(assertAuthOrigin()).resolves.toBeUndefined();fixture.origin='https://attacker.example.test';await expect(assertAuthOrigin()).rejects.toMatchObject({status:403});
});
it('user is resolved only after live backend validation',async()=>{
 fixture.values.set(NATIVE_ACCESS_COOKIE,'x.'+Buffer.from(JSON.stringify({sub:'synthetic-id'})).toString('base64url')+'.x');
 const session=vi.spyOn(ApiClient.prototype,'getSession').mockResolvedValue({user_id:'profile-id'});
 expect(await nativeUser()).toEqual({id:'synthetic-id'});expect(session).toHaveBeenCalledTimes(1);
});
it('middleware refresh writes both request and response cookies before permission checks',async()=>{
 const refreshed={access_token:'fresh-access',refresh_token:'b'.repeat(64),expires_in:900 as const};
 vi.spyOn(ApiClient.prototype,'refreshSession').mockResolvedValue(refreshed);
 const request=new NextRequest('https://web.example.test/login',{headers:{cookie:NATIVE_REFRESH_COOKIE+'='+'a'.repeat(64)}});
 const response=await nativeAuthMiddleware(request);
 expect(response.cookies.get(NATIVE_ACCESS_COOKIE)?.value).toBe('fresh-access');expect(request.cookies.get(NATIVE_ACCESS_COOKIE)?.value).toBe('fresh-access');
 expect(response.cookies.get(NATIVE_REFRESH_COOKIE)?.httpOnly).toBe(true);expect(response.headers.get('Cache-Control')).toContain('no-store');
});
