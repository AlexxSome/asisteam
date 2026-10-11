import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, Inject, Injectable, Post, Req, ServiceUnavailableException, UnauthorizedException, UseGuards, type OnApplicationShutdown } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { SignJWT } from 'jose';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import type { Request } from 'express';
import { httpSchemas, invitationRegistrationSchema, managedClaimSchema } from '@asisteam/core/runtime';
import type { z } from 'zod';
import { CONFIG, type RuntimeConfig } from './config.js';
import { Passwords } from './passwords.js';
import { TransactionalEmail } from './email.js';
import { SessionGuard, type AuthenticatedRequest } from './auth.js';
import { DomainException, domainSqlError } from './domain-errors.js';
export const tokenHash = (value:string) => createHash('sha256').update(value).digest('hex');
const matches=(a:string,b:string)=>timingSafeEqual(Buffer.from(tokenHash(a),'hex'),Buffer.from(tokenHash(b),'hex'));
const roleSql=`select current_user='asisteam_auth' and not r.rolsuper and not r.rolbypassrls and not r.rolcreatedb and not r.rolcreaterole
 and not exists(select 1 from pg_auth_members where member=r.oid)
 and not has_schema_privilege(current_user,'public','CREATE') and not has_schema_privilege(current_user,'app_private','CREATE')
 and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private','auth')
   and (c.relowner=r.oid or has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE')))
 and has_function_privilege(current_user,'app_private.auth_operation(text,jsonb)','EXECUTE') as safe from pg_roles r where rolname=current_user`;
function parse<S extends z.ZodTypeAny>(schema:S,input:unknown):z.infer<S>{const p=schema.safeParse(input);if(!p.success)throw new BadRequestException();return p.data;}
@Injectable()
export class NativeAuth implements OnApplicationShutdown {
 private readonly pool?:pg.Pool;
 private dummy?:Promise<string>;
 constructor(@Inject(CONFIG) private readonly config:RuntimeConfig,@Inject(Passwords) private readonly passwords:Passwords,@Inject(TransactionalEmail) private readonly email:TransactionalEmail){
  if(config.NATIVE_AUTH_DATABASE_URL){this.pool=new pg.Pool({connectionString:config.NATIVE_AUTH_DATABASE_URL,max:3,connectionTimeoutMillis:config.PG_CONNECT_TIMEOUT_MS,statement_timeout:config.PG_STATEMENT_TIMEOUT_MS});this.pool.on('error',()=>{});}
 }
 async call(operation:string,data:Record<string,unknown>):Promise<Record<string,unknown>>{
  if(!this.pool)throw new ServiceUnavailableException();
  const client=await this.pool.connect().catch(()=>{throw new ServiceUnavailableException();});
  try{
   if((await client.query(roleSql)).rows[0]?.safe!==true)throw new ServiceUnavailableException();
   if((await client.query('select app_private.auth_is_native() as native')).rows[0]?.native!==true)throw new ServiceUnavailableException();
   // RPC is a single transaction. Returned errors are interpreted AFTER commit
   // so replay revocation and rate counters survive denied requests.
   return (await client.query('select app_private.auth_operation($1,$2::jsonb) as data',[operation,JSON.stringify(data)])).rows[0]?.data;
  }catch(error){return domainSqlError(error);}finally{client.release();}
 }
 // Keep the web row lock, canonical refresh consumption and encrypted replacement
 // in one transaction across instances. Error results commit replay revocation.
 async webTransaction<T>(run:(call:(kind:'auth'|'web',operation:string,data:Record<string,unknown>)=>Promise<Record<string,unknown>>)=>Promise<T>):Promise<T>{
  if(!this.pool)throw new ServiceUnavailableException();
  const client=await this.pool.connect().catch(()=>{throw new ServiceUnavailableException();});
  try{
   if((await client.query(roleSql)).rows[0]?.safe!==true)throw new ServiceUnavailableException();
   await client.query('begin');
   const result=await run(async(kind,operation,data)=>(await client.query(kind==='web'
    ?'select app_private.web_session_operation($1,$2::jsonb) as data'
    :'select app_private.auth_operation($1,$2::jsonb) as data',[operation,JSON.stringify(data)])).rows[0]?.data);
   await client.query('commit');return result;
  }catch(error){await client.query('rollback');return domainSqlError(error);}finally{client.release();}
 }
 private result(value:Record<string,unknown>){if(value.error)throw new UnauthorizedException();return value;}
 async rate(request:Pick<Request,'headers'|'socket'>,action:string,email?:string){
  if(request.headers.cookie)throw new ForbiddenException(); // bearer-only API
  let ip=request.socket.remoteAddress??'unknown';
  const proxy=request.headers['x-asisteam-auth-proxy'], supplied=request.headers['x-asisteam-client-ip'];
  if(proxy!==undefined){
   if(typeof proxy!=='string'||!this.config.NATIVE_AUTH_PROXY_SECRET||!matches(proxy,this.config.NATIVE_AUTH_PROXY_SECRET)||typeof supplied!=='string'||!supplied||supplied.length>128)throw new UnauthorizedException();
   ip=supplied;
  }
  const salt=this.config.NATIVE_AUTH_PROXY_SECRET;
  if(!salt)throw new ServiceUnavailableException();
  const allowed=await this.call('rate',{key:tokenHash(`${salt}:${action}:ip:${ip}`),limit:action==='login'?30:10});
  if(!allowed.allowed)throw new DomainException(429,'rate_limit');
  if(email){const account=await this.call('rate',{key:tokenHash(`${salt}:${action}:email:${email.toLowerCase()}`),limit:5});if(!account.allowed)throw new DomainException(429,'rate_limit');}
 }
 async register(profile:unknown, invitation?:{token:string;claim:boolean}){
  const body=parse(invitation?(invitation.claim?managedClaimSchema:invitationRegistrationSchema):httpSchemas.AuthRegister,profile);
  await this.passwords.assertAllowed(body.password);
  let registered:Record<string,unknown>;
  try{registered=await this.call('register',{profile:{...body,password:undefined},subject_id:randomUUID(),password_hash:await this.passwords.hash(body.password),...(invitation?{invitation_hash:tokenHash(invitation.token),claim:invitation.claim}:{} )});}
  catch(error){if(error&&typeof error==='object'&&'code' in error&&error.code==='23505')throw new DomainException(422,'registration_failed');throw error;}
  return invitation?{group_id:registered.group_id,membership_status:registered.membership_status}:{success:true as const};
 }
 async login(email:string,password:string){
  const found=await this.call('lookup',{email});
  const encoded=typeof found.password_hash==='string'?found.password_hash:null;
  this.dummy??=this.passwords.hash(randomBytes(32).toString('hex'));
  const valid=await this.passwords.verify(encoded??await this.dummy,password);
  if(!encoded||!valid||typeof found.subject_id!=='string')throw new UnauthorizedException();
  const refresh=randomBytes(32).toString('hex');
  const value=this.result(await this.call('login',{subject_id:found.subject_id,expected_hash:encoded,refresh_hash:tokenHash(refresh),...(this.passwords.needsRehash(encoded)?{rehash:await this.passwords.hash(password)}:{})}));
  await this.call('rate_success',{key:tokenHash(`${this.config.NATIVE_AUTH_PROXY_SECRET}:login:email:${email.toLowerCase()}`)});
  return this.tokens(value,refresh);
 }
 async tokens(value:Record<string,unknown>,refresh:string){
  if(!this.config.NATIVE_AUTH_SECRET||!this.config.NATIVE_AUTH_ISSUER||typeof value.subject_id!=='string'||typeof value.session_id!=='string')throw new ServiceUnavailableException();
  const access=await new SignJWT({session_id:value.session_id}).setProtectedHeader({alg:'HS256',typ:'JWT'}).setSubject(value.subject_id).setIssuer(this.config.NATIVE_AUTH_ISSUER).setAudience('asisteam-api').setIssuedAt().setExpirationTime('15m').sign(new TextEncoder().encode(this.config.NATIVE_AUTH_SECRET));
  return httpSchemas.AuthTokens.parse({access_token:access,refresh_token:refresh,expires_in:900});
 }
 async refresh(token:string){const next=randomBytes(32).toString('hex');return this.tokens(this.result(await this.call('refresh',{token_hash:tokenHash(token),next_hash:tokenHash(next)})),next);}
 async recover(email:string,inviteCode?:string){
  if(!this.config.NATIVE_AUTH_WEB_URL||!this.config.RESEND_API_KEY||!this.config.INVITATION_EMAIL_FROM)throw new ServiceUnavailableException();
  const token=randomBytes(32).toString('hex');
  const value=await this.call('recovery',{email,token_hash:tokenHash(token)});
  const started=performance.now();
  if(value.send){
   const link=new URL('/reset-password',this.config.NATIVE_AUTH_WEB_URL);link.searchParams.set('token',token);if(inviteCode)link.searchParams.set('invite_code',httpSchemas.JoinByCode.shape.code.parse(inviteCode));
   try{await this.email.send(this.email.payload(email,'Restablecer contraseña de Asisteam',`Para cambiar tu contraseña abre este enlace de un uso, vigente durante 60 minutos:\n${link.href}\nSi no lo solicitaste, ignora este correo.`),'recovery-'+randomUUID(),2000);}catch{/* Same public result whether delivery/account exists. No sensitive logs. */}
  }
  // Equalize the observable delivery phase for unknown and known accounts.
  await delay(Math.max(0,2100-(performance.now()-started)));
  return {message:'Si el email existe, enviamos instrucciones' as const};
 }
 async reset(token:string,password:string){await this.passwords.assertAllowed(password);this.result(await this.call('reset',{token_hash:tokenHash(token),password_hash:await this.passwords.hash(password)}));return{success:true as const};}
 async logout(request:AuthenticatedRequest){if(request.identity?.provider!=='nest')throw new UnauthorizedException();return this.call('logout',{session_id:request.identity.sessionId,subject_id:request.identity.authUserId});}
 async change(request:AuthenticatedRequest,current:string,password:string){
  if(request.identity?.provider!=='nest')throw new UnauthorizedException();
  // Look up by verified subject without exposing credentials through domain API.
  const found=await this.call('subject',{subject_id:request.identity.authUserId});
  if(typeof found.password_hash!=='string'||!await this.passwords.verify(found.password_hash,current))throw new UnauthorizedException();
  await this.passwords.assertAllowed(password);
  this.result(await this.call('password',{subject_id:request.identity.authUserId,session_id:request.identity.sessionId,expected_hash:found.password_hash,password_hash:await this.passwords.hash(password)}));return{success:true as const};
 }
 async onApplicationShutdown(){await this.pool?.end();}
}
@Controller('api/v1/auth')
export class NativeAuthController {
 constructor(@Inject(NativeAuth) private readonly auth:NativeAuth){}
 @Post('register') @HttpCode(200) async register(@Req() r:Request,@Body() input:unknown){const p=parse(httpSchemas.AuthRegister,input);await this.auth.rate(r,'register');return this.auth.register(p);}
 @Post('login') @HttpCode(200) async login(@Req() r:Request,@Body() input:unknown){const p=parse(httpSchemas.AuthLogin,input);await this.auth.rate(r,'login',p.email);return this.auth.login(p.email,p.password);}
 @Post('refresh') @HttpCode(200) async refresh(@Req() r:Request,@Body() input:unknown){const p=parse(httpSchemas.AuthRefresh,input);await this.auth.rate(r,'refresh');return this.auth.refresh(p.refresh_token);}
 @Post('recovery') @HttpCode(200) async recovery(@Req() r:Request,@Body() input:unknown){const p=parse(httpSchemas.AuthRecovery,input);await this.auth.rate(r,'recovery');return this.auth.recover(p.email);}
 @Post('reset') @HttpCode(200) async reset(@Req() r:Request,@Body() input:unknown){const p=parse(httpSchemas.AuthReset,input);await this.auth.rate(r,'reset');return this.auth.reset(p.token,p.password);}
 @Post('logout') @HttpCode(200) @UseGuards(SessionGuard) async logout(@Req() r:AuthenticatedRequest){await this.auth.rate(r,'logout');return this.auth.logout(r);}
 @Post('password') @HttpCode(200) @UseGuards(SessionGuard) async password(@Req() r:AuthenticatedRequest,@Body() input:unknown){const p=parse(httpSchemas.AuthPassword,input);await this.auth.rate(r,'password');return this.auth.change(r,p.current_password,p.password);}
}
