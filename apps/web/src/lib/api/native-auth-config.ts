import { ApiClientError } from '@asisteam/api-client';
import { moduleTransport, TRANSPORT_MODULES } from './config';
export const NATIVE_ACCESS_COOKIE = 'asisteam-access';
export const NATIVE_REFRESH_COOKIE = 'asisteam-refresh';
export function nativeAuthEnabled(): boolean {
 const value=process.env.ASISTEAM_TRANSPORT_AUTH??'supabase';
 if(value!=='supabase'&&value!=='nest')throw new ApiClientError(400,'invalid_transport_configuration');
 if(value==='supabase')return false;
 // Native JWTs cannot be sent to PostgREST/Storage. Every domain consumer must
 // already use Nest on the same database before enabling independent sessions.
 if(TRANSPORT_MODULES.some(module=>moduleTransport(module)!=='nest'))throw new ApiClientError(400,'native_auth_requires_nest');
 return true;
}
export function authCookieSettings(maxAge:number){return{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/',maxAge};}
