// Historical origin fixture 847a666b081353382cf60550030660db4821b43c; not imported by product.
import 'server-only';
import { ApiClient, ApiClientError } from '@asisteam/api-client';
import { cookies, headers } from 'next/headers';
import { NATIVE_ACCESS_COOKIE, NATIVE_REFRESH_COOKIE, authCookieSettings } from '@legacy/lib/api/native-auth-config';
export async function assertAuthOrigin(){
 const origin=(await headers()).get('origin');
 const expected=process.env.ASISTEAM_AUTH_WEB_ORIGIN;
 if(!expected||!origin||new URL(origin).origin!==new URL(expected).origin)throw new ApiClientError(403,'permission_denied');
}
export async function nativeAuthClient(access?:string){
 const h=await headers();
 const secret=process.env.NATIVE_AUTH_PROXY_SECRET;
 if(!secret)throw new ApiClientError(503,'service_unavailable');
 const ip=h.get('x-forwarded-for')?.split(',')[0]?.trim()??'local';
 return new ApiClient({origin:process.env.ASISTEAM_API_ORIGIN??'',timeoutMs:15000,authProxy:{secret,clientIp:ip},accessToken:async()=>access??(await cookies()).get(NATIVE_ACCESS_COOKIE)?.value??null});
}
export async function setNativeCookies(tokens:{access_token:string;refresh_token:string}){
 const store=await cookies();
 // An old provider cookie must not silently restore a logged-out browser.
 for(const cookie of store.getAll())if(cookie.name.startsWith('sb-')&&cookie.name.includes('-auth-token'))store.set(cookie.name,'',authCookieSettings(0));
 store.set(NATIVE_ACCESS_COOKIE,tokens.access_token,authCookieSettings(900));
 store.set(NATIVE_REFRESH_COOKIE,tokens.refresh_token,authCookieSettings(30*24*60*60));
}
export async function clearNativeCookies(){const store=await cookies();for(const name of [NATIVE_ACCESS_COOKIE,NATIVE_REFRESH_COOKIE])store.set(name,'',authCookieSettings(0));}
export async function nativeUser(){
 const token=(await cookies()).get(NATIVE_ACCESS_COOKIE)?.value;
 if(!token)return null;
 try{
  await (await nativeAuthClient(token)).getSession(); // database live-session check
  const payload=JSON.parse(Buffer.from(token.split('.')[1]??'','base64url').toString());
  return {id:String(payload.sub)};
 }catch(error){if(error instanceof ApiClientError&&error.status===401)return null;throw error;}
}
