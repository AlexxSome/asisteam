import { ApiClient, ApiClientError } from '@asisteam/api-client';
import { NextResponse, type NextRequest } from 'next/server';
import { accountConsentPath } from '@/lib/account-consent-routing';
import { resourceResponseHtml } from '@/lib/resource-state';
import { canManageAttendance } from '@asisteam/core';
import { isGroupId } from '@/lib/group-routing';
import { NATIVE_ACCESS_COOKIE, NATIVE_REFRESH_COOKIE, authCookieSettings } from './native-auth-config';
const inFlightRefresh=new Map<string,Promise<Awaited<ReturnType<ApiClient['refreshSession']>>>>();
async function rotate(api:ApiClient,token:string){
 const running=inFlightRefresh.get(token);if(running)return running;
 const promise=api.refreshSession({body:{refresh_token:token}});inFlightRefresh.set(token,promise);
 try{return await promise;}finally{inFlightRefresh.delete(token);}
}
export async function nativeAuthMiddleware(request:NextRequest){
 let response=NextResponse.next({request});
 response.headers.set('Cache-Control','private, no-store');
 const finalize=(result:NextResponse)=>{result.headers.set('Cache-Control','private, no-store');response.cookies.getAll().forEach(cookie=>result.cookies.set(cookie));return result;};
 const deny=(status:403|404)=>finalize(new NextResponse(resourceResponseHtml(status),{status,headers:{'Content-Type':'text/html; charset=utf-8'}}));
 let token=request.cookies.get(NATIVE_ACCESS_COOKIE)?.value;
 const refresh=request.cookies.get(NATIVE_REFRESH_COOKIE)?.value;
 try{
  const client=()=>new ApiClient({origin:process.env.ASISTEAM_API_ORIGIN??'',timeoutMs:15000,accessToken:async()=>token??null});
  let user=false;
  if(token){try{await client().getSession();user=true;}catch(error){if(!(error instanceof ApiClientError)||error.status!==401)throw error;}}
  if(!user&&refresh){
   const secret=process.env.NATIVE_AUTH_PROXY_SECRET;if(!secret)throw new ApiClientError(503,'service_unavailable');
   try{
    const tokens=await rotate(new ApiClient({origin:process.env.ASISTEAM_API_ORIGIN??'',authProxy:{secret,clientIp:request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()??'local'}}),refresh);
    token=tokens.access_token;user=true;
    request.cookies.set(NATIVE_ACCESS_COOKIE,token);request.cookies.set(NATIVE_REFRESH_COOKIE,tokens.refresh_token);
    response=NextResponse.next({request});
    response.cookies.set(NATIVE_ACCESS_COOKIE,token,authCookieSettings(900));response.cookies.set(NATIVE_REFRESH_COOKIE,tokens.refresh_token,authCookieSettings(30*24*60*60));
   }catch(error){if(!(error instanceof ApiClientError)||error.status!==401)throw error;for(const name of [NATIVE_ACCESS_COOKIE,NATIVE_REFRESH_COOKIE])response.cookies.set(name,'',authCookieSettings(0));}
  }
  const pathname=request.nextUrl.pathname,segments=pathname.split('/');
  const publicRoute=['/accept-terms','/login','/register','/forgot-password','/reset-password','/auth/callback'].includes(pathname)||pathname.startsWith('/legal/')||pathname.startsWith('/invitations/');
  if(user&&!publicRoute&&!(await client().getCurrentAccountConsent()).accepted)return finalize(NextResponse.redirect(new URL(accountConsentPath(pathname+request.nextUrl.search),request.url),303));
  if(segments[1]==='wards'&&segments[2]){
   if(!user||!isGroupId(segments[2]))return deny(404);
   try{await client().getWard({params:{athleteUserId:segments[2]}});}catch(error){if(error instanceof ApiClientError&&[401,404].includes(error.status))return deny(404);throw error;}
  }
  if(segments[1]==='groups'&&segments[2]&&segments[2]!=='new'){
   if(!user||!isGroupId(segments[2]))return deny(404);
   let group;try{group=await client().getGroup({params:{groupId:segments[2]}});}catch(error){if(error instanceof ApiClientError&&[401,404].includes(error.status))return deny(404);throw error;}
   const management=['settings','invitations','guardians','activity-types'].includes(segments[3]??'')||(segments[3]==='members'&&segments[4]!=='consent')||(segments[3]==='activities'&&(segments[4]==='new'||segments[5]==='edit'));
   if(group.roles.includes('COACH')&&!(group.roles as string[]).includes('ADMIN')&&management)return deny(403);
   if((segments[3]==='settings'||segments[3]==='members'&&segments[4]==='new')&&!(group.roles as string[]).includes('ADMIN'))return deny(404);
   if(segments[3]==='billing'&&!(group.roles as string[]).includes('ADMIN'))return deny(403);
   if(segments[3]==='activities'&&segments[4]&&segments[5]==='attendance'&&!canManageAttendance(group.roles))return deny(403);
  }
  return finalize(response);
 }catch{return finalize(new NextResponse('No pudimos cargar los datos. Vuelve a intentarlo.',{status:503}));}
}
