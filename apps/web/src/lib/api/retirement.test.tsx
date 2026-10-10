// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ACCOUNT_TERMS_VERSION } from '@asisteam/core';
import { ApiClient, ApiClientError } from '@asisteam/api-client';
const f=vi.hoisted(()=>({cookie:vi.fn(),origin:vi.fn(),clear:vi.fn(),tokens:vi.fn(),login:vi.fn(),logout:vi.fn(),refresh:vi.fn(),profile:vi.fn(),onboarding:vi.fn(),activations:vi.fn(),user:vi.fn(),consent:vi.fn(),home:vi.fn(),pending:vi.fn(),group:vi.fn(),revalidate:vi.fn()}));
vi.mock('react',async original=>({...await original<typeof import('react')>(),cache:(fn:unknown)=>fn}));
vi.mock('next/headers',()=>({cookies:async()=>({get:f.cookie}),headers:async()=>new Headers({'x-forwarded-for':'127.0.0.1'})}));
vi.mock('next/navigation',()=>({RedirectType:{replace:'replace'},redirect:(path:string)=>{throw new Error('redirect:'+path)},notFound:()=>{throw new Error('404')}}));
vi.mock('next/cache',()=>({revalidatePath:f.revalidate}));
vi.mock('./native-auth',()=>({assertAuthOrigin:f.origin,clearNativeCookies:f.clear,setNativeCookies:f.tokens,nativeAuthClient:async()=>({loginPassword:f.login,logoutSession:f.logout,refreshSession:f.refresh})}));
vi.mock('./server',()=>({createServerApiClient:()=>({getOwnProfile:f.profile,listMembershipOnboarding:f.onboarding,listManagedActivations:f.activations,getCurrentAccountConsent:f.consent})}));
vi.mock('@/lib/api/session',()=>({createSessionClient:async()=>({auth:{getUser:f.user,getSession:async()=>({data:{session:{user:{id:'synthetic'},access_token:'synthetic'}}})}})}));
vi.mock('@/lib/groups',()=>({groupHomePath:f.home,getMyPendingMemberships:f.pending,getGroup:f.group}));
vi.mock('@/components/app-shell',()=>({AppShell:({children}:{children:React.ReactNode})=><main>{children}</main>}));
vi.mock('@/app/groups/[groupId]/members/pending/membership-review',()=>({PendingJoinRequests:()=>null}));
import { signOutUser } from '@/app/login/actions';
import { acceptInvitation } from '@/app/invitations/[token]/actions';
import WelcomePage from '@/app/welcome/page';
import { GET } from '@/app/auth/callback/route';
import { getGuardianTasks } from '@/lib/wards';
const groupId='34000000-0000-4000-8000-000000000201', athlete='34000000-0000-4000-8000-000000000111';
const token='synthetic-invitation-token-18';
const credentials={email:'invited@example.test',password:'synthetic-password-18',terms_accepted:true,terms_version:ACCOUNT_TERMS_VERSION};
const registration={full_name:'Persona invitada',email:'invited@example.test',password:'synthetic-password-18',birthdate:'1990-01-01',terms_accepted:true,terms_version:ACCOUNT_TERMS_VERSION};
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('ASISTEAM_SITE_URL','https://web.example.test');vi.stubEnv('ASISTEAM_API_ORIGIN','https://api.example.test');vi.stubEnv('INVITATION_PROXY_SECRET','synthetic-only');
 f.user.mockResolvedValue({data:{user:{id:'synthetic'}}});f.home.mockResolvedValue('/welcome');f.pending.mockResolvedValue([]);f.profile.mockResolvedValue({full_name:'Persona nativa',birthdate:null});f.group.mockResolvedValue({id:groupId,roles:['GUARDIAN']});f.onboarding.mockResolvedValue({data:[]});f.activations.mockResolvedValue({data:[]});f.login.mockResolvedValue({access_token:'synthetic',refresh_token:'synthetic',expires_in:900});f.consent.mockResolvedValue({accepted:true});
});
afterEach(()=>{cleanup();vi.unstubAllEnvs();vi.restoreAllMocks()});
it('anonymous logout validates Origin, clears cookies and redirects without an auth provider call',async()=>{
 await expect(signOutUser()).rejects.toThrow('redirect:/login');expect(f.origin).toHaveBeenCalledOnce();expect(f.clear).toHaveBeenCalledOnce();expect(f.logout).not.toHaveBeenCalled();expect(f.revalidate).toHaveBeenCalledWith('/','layout');
});
it('anonymous cross-origin logout fails without clearing cookies',async()=>{
 f.origin.mockRejectedValue(new Error('CSRF'));expect(await signOutUser()).toHaveProperty('error');expect(f.clear).not.toHaveBeenCalled();expect(f.revalidate).not.toHaveBeenCalled();
});
it('retired generic PKCE callback cannot exchange code or redirect to untrusted next',async()=>{
 const response=await GET(new Request('https://web.example.test/auth/callback?code=synthetic&next=https://attacker.example.test'));
 expect(response.status).toBe(303);expect(response.headers.get('location')).toBe('https://web.example.test/login?social_error=1');expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');expect(f.tokens).not.toHaveBeenCalled();
});
it.each(['register','claim'] as const)('%s activates through native API before starting browser session',async mode=>{
 const call=vi.spyOn(ApiClient.prototype,mode==='claim'?'claimInvitation':'registerInvitation').mockResolvedValue({group_id:groupId,membership_status:'ACTIVE'} as never);
 await expect(acceptInvitation(token,mode,mode==='claim'?credentials:registration)).rejects.toThrow('redirect:/groups/'+groupId+(mode==='claim'?'/me/history':''));expect(call).toHaveBeenCalledOnce();expect(call.mock.invocationCallOrder[0]).toBeLessThan(f.login.mock.invocationCallOrder[0]!);expect(f.tokens).toHaveBeenCalledOnce();
});
it.each(['register','claim'] as const)('%s preserves transaction rejection without login or cookies',async mode=>{
 vi.spyOn(ApiClient.prototype,mode==='claim'?'claimInvitation':'registerInvitation').mockRejectedValue(new ApiClientError(422,'registration_failed'));
 expect(await acceptInvitation(token,mode,mode==='claim'?credentials:registration)).toHaveProperty('error');expect(f.login).not.toHaveBeenCalled();expect(f.tokens).not.toHaveBeenCalled();
});
it.each(['PENDING','INACTIVE'] as const)('native registration %s retains membership visibility boundaries',async status=>{
 vi.spyOn(ApiClient.prototype,'registerInvitation').mockResolvedValue({group_id:groupId,membership_status:status} as never);
 if(status==='PENDING')expect(await acceptInvitation(token,'register',registration)).toEqual({pending:true});else await expect(acceptInvitation(token,'register',registration)).rejects.toThrow('redirect:/groups');
});
it('welcome obtains private profile from native API and invites birthdate completion',async()=>{
 render(await WelcomePage());expect(screen.getByRole('heading',{name:'¡Hola, Persona!'})).toBeTruthy();expect(screen.getByText(/completa tu fecha/)).toBeTruthy();expect(f.profile).toHaveBeenCalledOnce();
});
it('welcome redirects anonymous session before fetching private profile',async()=>{
 f.user.mockResolvedValue({data:{user:null}});await expect(WelcomePage()).rejects.toThrow('redirect:/register');expect(f.profile).not.toHaveBeenCalled();
});
it('guardian counter loads all consent pages and filtered native activation total',async()=>{
 f.onboarding.mockResolvedValueOnce({data:[{can_consent:true,total_count:51}]}).mockResolvedValueOnce({data:[{can_consent:true,total_count:51}]});f.activations.mockResolvedValue({data:[{total_count:72}]});
 expect(await getGuardianTasks(groupId,athlete)).toMatchObject({consents:2,activations:72});expect(f.onboarding).toHaveBeenNthCalledWith(2,{query:{group_id:groupId,as_guardian:true,athlete_user_id:athlete,page:2}});expect(f.activations).toHaveBeenCalledWith({params:{groupId},query:{page:1,athlete_user_id:athlete}});
});
it('guardian counter does not read tasks outside guardian role',async()=>{
 f.group.mockResolvedValue({id:groupId,roles:['ATHLETE']});await expect(getGuardianTasks(groupId)).rejects.toThrow('404');expect(f.onboarding).not.toHaveBeenCalled();expect(f.activations).not.toHaveBeenCalled();
});
