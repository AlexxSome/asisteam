import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Injectable, Param, Post, Req, Res, ServiceUnavailableException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { EncryptJWT, jwtDecrypt, decodeJwt } from 'jose';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { httpOperations, httpSchemas, checkinPath } from '@asisteam/core/runtime';
import { CONFIG, type RuntimeConfig } from './config.js';
import { NativeAuth, tokenHash } from './native-auth.js';
import { SocialAuth } from './social-auth.js';
import { TokenVerifier, type AuthenticatedRequest } from './auth.js';
import { Database } from './database.js';
import { errorBody } from './errors.js';

const SESSION = 'asisteam-web-session', CSRF = 'asisteam-web-csrf', FLOW = 'asisteam-web-oauth';
const credentials = httpSchemas.AuthTokens;
const equal = (a: string, b: string) => timingSafeEqual(Buffer.from(tokenHash(a),'hex'),Buffer.from(tokenHash(b),'hex'));
function parse<S extends z.ZodTypeAny>(schema:S,value:unknown):z.infer<S>{const p=schema.safeParse(value);if(!p.success)throw new BadRequestException();return p.data;}
function cookie(request:Request,name:string){
 const values=(request.headers.cookie??'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(name+'='));
 if(values.length!==1)return undefined;
 const value=values[0]!.slice(name.length+1);return value.length<=24000?value:undefined;
}
// Return destinations never carry arbitrary query parameters or outside origins.
export function webReturnPath(value:unknown){
 if(typeof value!=='string'||value.length>2048||!value.startsWith('/')||/[\\\r\n]/.test(value))return '/welcome';
 const url=new URL(value,'https://asisteam.invalid');
 if(url.origin!=='https://asisteam.invalid')return '/welcome';
 if(url.pathname==='/join'){const code=url.searchParams.getAll('code').length===1?url.searchParams.get('code'):null;return /^[A-Za-z0-9]{8}$/.test(code??'')?'/join?code='+code:'/join';}
 if(/^\/(?:welcome|profile|check-in|groups(?:\/[A-Za-z0-9_-]+)*|wards(?:\/[A-Za-z0-9_-]+)*|invitations\/[A-Za-z0-9_-]{22,256})$/.test(url.pathname))return url.pathname;
 return '/welcome';
}
@Injectable()
export class WebAuth {
 constructor(@Inject(CONFIG) readonly config:RuntimeConfig,@Inject(NativeAuth) readonly auth:NativeAuth,
  @Inject(TokenVerifier) private readonly verifier:TokenVerifier,@Inject(Database) readonly database:Database){}
 private key(purpose:string){if(!this.config.NATIVE_AUTH_SECRET)throw new ServiceUnavailableException();return createHash('sha256').update('asisteam-web:'+purpose+':'+this.config.NATIVE_AUTH_SECRET).digest();}
 private async seal(purpose:string,value:Record<string,unknown>,age:number){return new EncryptJWT(value).setProtectedHeader({alg:'dir',enc:'A256GCM'}).setIssuer(this.config.NATIVE_AUTH_ISSUER!).setAudience('asisteam-web:'+purpose).setIssuedAt().setExpirationTime(Math.floor(Date.now()/1000)+age).encrypt(this.key(purpose));}
 private async unseal(purpose:string,value:string){return (await jwtDecrypt(value,this.key(purpose),{issuer:this.config.NATIVE_AUTH_ISSUER!,audience:'asisteam-web:'+purpose,keyManagementAlgorithms:['dir'],contentEncryptionAlgorithms:['A256GCM'],requiredClaims:['iat','exp'],maxTokenAge:purpose==='credentials'?'30d':'10m'})).payload;}
 enabled(){if(!this.config.WEB_AUTH_ENABLED)throw new ServiceUnavailableException();}
 private settings(age:number,path='/',apple=false){return {httpOnly:true,secure:apple||this.config.NATIVE_AUTH_WEB_URL?.startsWith('https:')===true,sameSite:apple?'none' as const:'lax' as const,path,maxAge:age*1000};}
 clear(response:Response){for(const name of [SESSION,CSRF,'asisteam-access','asisteam-refresh'])response.cookie(name,'',this.settings(0));}
 origin(request:Request,required=false){
  this.enabled();const expected=new URL(this.config.NATIVE_AUTH_WEB_URL!).origin;
  if(request.headers['sec-fetch-site']==='cross-site'||request.headers.origin!==undefined&&request.headers.origin!==expected||required&&request.headers.origin!==expected)throw new ForbiddenException();
 }
 private binding(request:Request){return tokenHash(cookie(request,SESSION)??'');}
 async csrf(request:Request,response:Response){
  this.origin(request);let value:Record<string,unknown>|undefined;
  try{value=await this.unseal('csrf',cookie(request,CSRF)??'');}catch{/* Fresh anonymous or expired CSRF context. */}
  if(value?.binding===this.binding(request)&&typeof value.token==='string')return {csrf_token:value.token};
  const token=randomBytes(32).toString('hex');response.cookie(CSRF,await this.seal('csrf',{token,binding:this.binding(request)},600),this.settings(600));return {csrf_token:token};
 }
 async write(request:Request){
  this.origin(request,true);
  if(!request.is('application/json'))throw new BadRequestException();
  try{const value=await this.unseal('csrf',cookie(request,CSRF)??'');const token=request.headers['x-csrf-token'];
   if(value.binding!==this.binding(request)||typeof value.token!=='string'||typeof token!=='string'||!equal(value.token,token))throw new ForbiddenException();
  }catch{throw new ForbiddenException();}
 }
 clientIp(request:Request){
  const peer=request.socket.remoteAddress??'unknown';
  if(this.config.WEB_TRUSTED_PROXY_IPS.split(',').map(v=>v.trim()).includes(peer)){
   const forwarded=request.headers['x-forwarded-for'];
   if(typeof forwarded!=='string'||!isIP(forwarded))throw new ForbiddenException();
   return forwarded;
  }
  return peer;
 }
 async rate(request:Request,action:string,email?:string){
  // Only this server creates the proxy credentials; browser headers are rejected.
  const internal={...request,socket:request.socket,headers:{'x-asisteam-auth-proxy':this.config.NATIVE_AUTH_PROXY_SECRET,'x-asisteam-client-ip':this.clientIp(request)}};
  return this.auth.rate(internal,action,email);
 }
 async open(tokens:z.infer<typeof credentials>,request:Request,response:Response){
  const identity=await this.verifier.verify('Bearer '+tokens.access_token),handle=randomBytes(32).toString('hex');
  const sealed=await this.seal('credentials',{tokens},30*86400);
  const opened=await this.auth.webTransaction(call=>call('web','open',{token_hash:tokenHash(handle),family_id:identity.sessionId,credentials:sealed}));
  if(typeof opened.expires_at!=='string')throw new UnauthorizedException();
  // Replacing a browser session revokes the old family before setting a new handle.
  const previous=cookie(request,SESSION);if(previous)await this.auth.webTransaction(call=>call('web','close',{token_hash:tokenHash(previous)}));
  this.clear(response);response.cookie(SESSION,handle,this.settings(Math.max(0,Math.floor((Date.parse(opened.expires_at)-Date.now())/1000))));
 }
 async session(request:Request,response:Response){
  const handle=cookie(request,SESSION);if(!handle||!/^[a-f0-9]{64}$/.test(handle)){this.clear(response);throw new UnauthorizedException();}
  const tokens=await this.auth.webTransaction(async call=>{
   const data=await call('web','lock',{token_hash:tokenHash(handle)});
   if(typeof data.credentials!=='string')return null;
   let tokens:z.infer<typeof credentials>;
   try{tokens=credentials.parse((await this.unseal('credentials',data.credentials)).tokens);}catch{await call('web','close',{token_hash:tokenHash(handle)});return null;}
   if((decodeJwt(tokens.access_token).exp??0)<=Math.floor(Date.now()/1000)+60){
    const refresh=randomBytes(32).toString('hex');
    const value=await call('auth','refresh',{token_hash:tokenHash(tokens.refresh_token),next_hash:tokenHash(refresh)});
    if(value.error){await call('web','close',{token_hash:tokenHash(handle)});return null;}
    tokens=await this.auth.tokens(value,refresh);
    await call('web','save',{token_hash:tokenHash(handle),credentials:await this.seal('credentials',{tokens},30*86400)});
   }
   return tokens;
  });
  if(!tokens){this.clear(response);throw new UnauthorizedException();}
  request.headers.authorization='Bearer '+tokens.access_token;
  const identity=await this.verifier.verify(request.headers.authorization);
  (request as AuthenticatedRequest).identity=identity;
  return identity;
 }
 async close(request:Request,response:Response){const handle=cookie(request,SESSION);if(handle)await this.auth.webTransaction(call=>call('web','close',{token_hash:tokenHash(handle)}));this.clear(response);return {success:true as const};}
 flowCookie(response:Response,provider:string,value:string,age=600){response.cookie(FLOW,value,this.settings(age,'/auth/callback/'+provider,provider==='apple'));}
 clearFlow(response:Response){for(const provider of ['google','apple'])this.flowCookie(response,provider,'',0);}
 async saveFlow(response:Response,provider:string,transaction:string){this.clearFlow(response);this.flowCookie(response,provider,transaction);}
 flow(request:Request){return cookie(request,FLOW);}
 // Exact generated operations only: no external destinations, health or webhook.
 async middleware(request:Request,response:Response,next:()=>void){
  const path=request.path,lower=path.toLowerCase(),web=lower.startsWith('/web-api/v1/'),callback=lower==='/auth/callback'||lower.startsWith('/auth/callback/');
  if(!web&&!callback)return next();
  response.setHeader('cache-control','private, no-store');response.setHeader('referrer-policy','no-referrer');response.setHeader('x-content-type-options','nosniff');response.setHeader('x-robots-tag','noindex,nofollow');
  try{
   this.enabled();
   // Express may initialize a case-insensitive router before app settings.
   // Recognize all variants here, then reject a noncanonical reserved prefix.
   if(web&&!path.startsWith('/web-api/v1/')||callback&&!(path==='/auth/callback'||path.startsWith('/auth/callback/'))){response.status(404).json(errorBody(404));return;}
   if(['authorization','x-asisteam-auth-proxy','x-asisteam-proxy','x-asisteam-client-ip'].some(h=>request.headers[h]!==undefined))throw new ForbiddenException();
   if(callback)return next();
   this.origin(request);
   if(!['GET','HEAD','OPTIONS'].includes(request.method))await this.write(request);
   if(path.startsWith('/web-api/v1/auth/'))return next();
   const target='/api/v1/'+path.slice('/web-api/v1/'.length);
   const operation=Object.values(httpOperations).find(op=>op.method===request.method&&op.module!=='runtime'&&!op.path.startsWith('/api/v1/auth/')&&new RegExp('^'+op.path.replace(/\{[^}]+\}/g,'[^/]+')+'$').test(target));
   if(!operation){response.status(404).json(errorBody(404));return;}
   if(operation.authenticated)await this.session(request,response);
   if(target.startsWith('/api/v1/invitations/')){
    request.headers['x-asisteam-proxy']=this.config.INVITATION_PROXY_SECRET;
    request.headers['x-asisteam-client-ip']=this.clientIp(request);
   }
   request.url=target+request.url.slice(path.length);next();
  }catch(error){const status=error instanceof UnauthorizedException?401:error instanceof ForbiddenException?403:error instanceof BadRequestException?400:503;response.status(status).json(errorBody(status));}
 }
}
@Controller('web-api/v1/auth')
export class WebAuthController {
 constructor(@Inject(WebAuth) private readonly web:WebAuth,@Inject(SocialAuth) private readonly social:SocialAuth){}
 @Get('csrf') csrf(@Req() r:Request,@Res({passthrough:true}) res:Response){return this.web.csrf(r,res);}
 @Get('session') async session(@Req() r:Request,@Res({passthrough:true}) res:Response){
  const identity=await this.web.session(r,res);return this.web.database.authenticated(identity,async tx=>({user_id:tx.userId,accepted:(await tx.query('select public.has_account_consent() as accepted')).rows[0]?.accepted===true}));
 }
 @Post('login') @HttpCode(200) async login(@Req() r:Request,@Res({passthrough:true}) res:Response,@Body() input:unknown){const p=parse(httpSchemas.AuthLogin,input);await this.web.rate(r,'login',p.email);await this.web.open(await this.web.auth.login(p.email,p.password),r,res);return {success:true};}
 @Post('register') @HttpCode(200) async register(@Req() r:Request,@Res({passthrough:true}) res:Response,@Body() input:unknown){const p=parse(httpSchemas.AuthRegister,input);await this.web.rate(r,'register');await this.web.auth.register(p);await this.web.open(await this.web.auth.login(p.email,p.password),r,res);return {success:true};}
 @Post('refresh') @HttpCode(200) async refresh(@Req() r:Request,@Res({passthrough:true}) res:Response,@Body() input:unknown){parse(httpSchemas.Empty,input);await this.web.rate(r,'web-refresh');await this.web.session(r,res);return {success:true};}
 @Post('logout') @HttpCode(200) async logout(@Req() r:Request,@Res({passthrough:true}) res:Response){await this.web.rate(r,'logout');return this.web.close(r,res);}
 @Post('recovery') @HttpCode(200) async recovery(@Req() r:Request,@Body() input:unknown){const p=parse(httpSchemas.WebRecovery,input);await this.web.rate(r,'recovery');return this.web.auth.recover(p.email,p.invite_code);}
 @Post('reset') @HttpCode(200) async reset(@Req() r:Request,@Res({passthrough:true}) res:Response,@Body() input:unknown){const p=parse(httpSchemas.AuthReset,input);await this.web.rate(r,'reset');const result=await this.web.auth.reset(p.token,p.password);await this.web.close(r,res);return result;}
 @Post('password') @HttpCode(200) async password(@Req() r:AuthenticatedRequest,@Res({passthrough:true}) res:Response,@Body() input:unknown){const p=parse(httpSchemas.AuthPassword,input);await this.web.rate(r,'password');await this.web.session(r,res);const result=await this.web.auth.change(r,p.current_password,p.password);await this.web.close(r,res);return result;}
 @Get('social/providers') providers(){return this.social.availability();}
 @Post('social/start') @HttpCode(200) async start(@Req() r:Request,@Res({passthrough:true}) res:Response,@Body() input:unknown){const p=parse(httpSchemas.SocialStart,input);await this.web.rate(r,'oauth-start');const result=await this.social.start(p);await this.web.saveFlow(res,p.provider,result.transaction);return {authorization_url:result.authorization_url};}
 @Post('social/link') @HttpCode(200) async link(@Req() r:AuthenticatedRequest,@Res({passthrough:true}) res:Response,@Body() input:unknown){const p=parse(httpSchemas.SocialStart,input);await this.web.rate(r,'oauth-link');await this.web.session(r,res);const result=await this.social.start(p,r);await this.web.saveFlow(res,p.provider,result.transaction);return {authorization_url:result.authorization_url};}
}
@Controller('auth/callback')
export class WebCallbackController {
 constructor(@Inject(WebAuth) private readonly web:WebAuth,@Inject(SocialAuth) private readonly social:SocialAuth){}
 @Get() generic(@Res() res:Response){res.redirect(303,new URL('/login',this.web.config.NATIVE_AUTH_WEB_URL!).href);}
 @Get(':provider') get(@Req() r:Request,@Res() res:Response,@Param('provider') provider:string){return this.complete(r,res,provider);}
 @Post(':provider') post(@Req() r:Request,@Res() res:Response,@Param('provider') provider:string){return this.complete(r,res,provider);}
 private async complete(r:Request,res:Response,provider:string){
  let destination='/login?social_error=1';const transaction=this.web.flow(r);this.web.clearFlow(res);
  try{
   if(r.headers.host!==new URL(this.web.config.NATIVE_AUTH_WEB_URL!).host||r.method!==(provider==='apple'?'POST':'GET'))throw new UnauthorizedException();
   if(provider==='apple'&&!r.is('application/x-www-form-urlencoded'))throw new BadRequestException();
   const values=provider==='apple'?r.body:Object.fromEntries(new URLSearchParams(r.url.split('?')[1]??''));
   const params=provider==='google'?new URLSearchParams(r.url.split('?')[1]??''):null;
   if(!transaction||!['google','apple'].includes(provider)||values.error||params&&(params.getAll('code').length!==1||params.getAll('state').length!==1))throw new UnauthorizedException();
   const input=parse(httpSchemas.SocialCallback,{provider,code:values.code,state:values.state,transaction});
   await this.web.rate(r,'oauth-callback');const result=await this.social.complete(input);await this.web.open(result.tokens,r,res);
   destination=result.linked?'/profile?social_linked=1':result.context.checkin?checkinPath(result.context.checkin):result.context.invite_code?'/join?code='+result.context.invite_code:'/welcome';
   const identity=await new TokenVerifier(this.web.config).verify('Bearer '+result.tokens.access_token);
   const accepted=await this.web.database.authenticated(identity,async tx=>(await tx.query('select public.has_account_consent() as accepted')).rows[0]?.accepted===true).catch(()=>false);
   if(!accepted){const fragment=destination.startsWith('/check-in#')?destination.slice(destination.indexOf('#')):'';destination='/accept-terms?return_to='+encodeURIComponent(webReturnPath(destination))+fragment;}
  }catch{/* No claims, provider codes, body or secrets in errors/logs. */}
  res.redirect(303,new URL(destination,this.web.config.NATIVE_AUTH_WEB_URL!).href);
 }
}
