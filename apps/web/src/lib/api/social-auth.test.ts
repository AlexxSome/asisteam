import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { ApiClient } from '@asisteam/api-client';
const fixture=vi.hoisted(()=>({transaction:'synthetic-encrypted-transaction',set:vi.fn(),tokens:vi.fn(),origin:vi.fn()}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>fixture.transaction?{value:fixture.transaction}:undefined,set:fixture.set}),headers:async()=>new Headers({'x-forwarded-for':'127.0.0.1'})}));
vi.mock('./native-auth',async()=>{const original=await vi.importActual<typeof import('./native-auth')>('./native-auth');return {...original,setNativeCookies:fixture.tokens};});
import {TRANSPORT_MODULES} from './config';
import {completeSocialCallback,saveSocialTransaction,SOCIAL_TRANSACTION_COOKIE} from './social-auth';
beforeEach(()=>{
 vi.stubEnv('ASISTEAM_TRANSPORT_AUTH','nest');for(const module of TRANSPORT_MODULES)vi.stubEnv('ASISTEAM_TRANSPORT_'+module.toUpperCase(),'nest');
 vi.stubEnv('ASISTEAM_API_ORIGIN','https://api.example.test');vi.stubEnv('ASISTEAM_SITE_URL','https://web.example.test');vi.stubEnv('NATIVE_AUTH_PROXY_SECRET','synthetic-only-secret-'.repeat(3));vi.stubEnv('NODE_ENV','production');
 fixture.transaction='synthetic-encrypted-transaction';fixture.set.mockReset();fixture.tokens.mockReset();
 vi.spyOn(ApiClient.prototype,'completeSocialLogin').mockResolvedValue({tokens:{access_token:'synthetic-access',refresh_token:'a'.repeat(64),expires_in:900},context:{},linked:false});
 vi.spyOn(ApiClient.prototype,'getCurrentAccountConsent').mockResolvedValue({accepted:true});
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it('cookies bind Google Lax and Apple form_post None with Secure/HttpOnly and short lifetime',async()=>{
 for(const provider of ['google','apple']){
  await saveSocialTransaction(provider,'encrypted');
  expect(fixture.set).toHaveBeenCalledWith(SOCIAL_TRANSACTION_COOKIE,'encrypted',expect.objectContaining({httpOnly:true,secure:true,sameSite:provider==='apple'?'none':'lax',path:'/auth/callback/'+provider,maxAge:600}));
 }
});
it('Google callback consumes browser cookie and applies consent before onboarding',async()=>{
 vi.spyOn(ApiClient.prototype,'getCurrentAccountConsent').mockResolvedValue({accepted:false});
 const response=await completeSocialCallback(new Request('https://web.example.test/auth/callback/google?code=code&state=state'),'google');
 expect(response.headers.get('location')).toContain('/accept-terms');expect(fixture.tokens).toHaveBeenCalled();
 expect(fixture.set).toHaveBeenCalledWith(SOCIAL_TRANSACTION_COOKIE,'',expect.objectContaining({maxAge:0}));
 expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
});
it('Apple form_post uses body and preserves QR only in final destination fragment',async()=>{
 const api=vi.spyOn(ApiClient.prototype,'completeSocialLogin').mockResolvedValue({tokens:{access_token:'synthetic-access',refresh_token:'a'.repeat(64),expires_in:900},context:{checkin:{activity_id:'11111111-1111-4111-8111-111111111111',token:'a'.repeat(64)}},linked:false});
 const response=await completeSocialCallback(new Request('https://web.example.test/auth/callback/apple',{method:'POST',body:new URLSearchParams({code:'code',state:'state'}),headers:{'content-type':'application/x-www-form-urlencoded'}}),'apple');
 expect(api).toHaveBeenCalledWith({body:{provider:'apple',code:'code',state:'state',transaction:fixture.transaction}});
 const location=new URL(response.headers.get('location')!);expect(location.pathname).toBe('/check-in');expect(location.hash).toContain('a'.repeat(64));expect(location.search).not.toContain('a'.repeat(64));
});
it('missing browser binding, wrong origin/provider/method, duplicate state and cancellation never exchange',async()=>{
 const api=vi.spyOn(ApiClient.prototype,'completeSocialLogin');
 for(const request of [new Request('https://attacker.example.test/auth/callback/google?code=x&state=x'),new Request('https://web.example.test/auth/callback/google?code=x&state=x',{headers:{host:'attacker.example.test'}}),new Request('https://web.example.test/auth/callback/google?code=x&state=x&state=y'),new Request('https://web.example.test/auth/callback/google?error=cancelled'),new Request('https://web.example.test/auth/callback/google',{method:'POST'})]){
   expect((await completeSocialCallback(request,'google')).headers.get('location')).toContain('social_error=1');
 }
 fixture.transaction='';await completeSocialCallback(new Request('https://web.example.test/auth/callback/google?code=x&state=x'),'google');
 expect(api).not.toHaveBeenCalled();expect(fixture.tokens).not.toHaveBeenCalled();
});
it('explicit linking goes back to profile after consent; API conflicts remain generic',async()=>{
 const api=vi.spyOn(ApiClient.prototype,'completeSocialLogin').mockResolvedValue({tokens:{access_token:'synthetic-access',refresh_token:'a'.repeat(64),expires_in:900},context:{},linked:true});
 const request=()=>new Request('https://web.example.test/auth/callback/google?code=x&state=x');
 expect((await completeSocialCallback(request(),'google')).headers.get('location')).toBe('https://web.example.test/profile?social_linked=1');
 api.mockRejectedValueOnce(new Error('Private provider details'));const response=await completeSocialCallback(request(),'google');
 expect(response.headers.get('location')).toBe('https://web.example.test/login?social_error=1');expect(await response.text()).not.toContain('Private');
});
