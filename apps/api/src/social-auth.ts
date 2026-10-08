import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Injectable, Post, Req, ServiceUnavailableException, UnauthorizedException, UseGuards } from '@nestjs/common';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import * as oidc from 'openid-client';
import { z } from 'zod';
import { httpSchemas, socialLoginContextSchema } from '@asisteam/core/runtime';
import type { Request } from 'express';
import { CONFIG, type RuntimeConfig } from './config.js';
import { NativeAuth, tokenHash } from './native-auth.js';
import { SessionGuard, type AuthenticatedRequest } from './auth.js';
const providerSchema = z.enum(['google', 'apple']);
type Provider = z.infer<typeof providerSchema>;
const flowSchema = z.object({
  provider: providerSchema, state: z.string(), nonce: z.string(), verifier: z.string().optional(),
  context: socialLoginContextSchema,
  link: z.object({subject_id:z.string().uuid(),session_id:z.string().uuid()}).strict().optional(),
}).strict();
const servers = {
  google: {issuer:'https://accounts.google.com',authorization_endpoint:'https://accounts.google.com/o/oauth2/v2/auth',token_endpoint:'https://oauth2.googleapis.com/token',jwks_uri:'https://www.googleapis.com/oauth2/v3/certs'},
  apple: {issuer:'https://appleid.apple.com',authorization_endpoint:'https://appleid.apple.com/auth/authorize',token_endpoint:'https://appleid.apple.com/auth/token',jwks_uri:'https://appleid.apple.com/auth/keys'},
};
function parse<S extends z.ZodTypeAny>(schema:S,value:unknown):z.infer<S>{const p=schema.safeParse(value);if(!p.success)throw new BadRequestException();return p.data;}
@Injectable()
export class SocialAuth {
  constructor(@Inject(CONFIG) private readonly config:RuntimeConfig,@Inject(NativeAuth) private readonly auth:NativeAuth){}
  availability(){return {google:!!this.config.OAUTH_GOOGLE_CLIENT_ID,apple:!!this.config.OAUTH_APPLE_CLIENT_ID};}
  private key(){if(!this.config.NATIVE_AUTH_SECRET)throw new ServiceUnavailableException();return createHash('sha256').update('asisteam-oauth:'+this.config.NATIVE_AUTH_SECRET).digest();}
  private client(provider:Provider){
    const id=provider==='google'?this.config.OAUTH_GOOGLE_CLIENT_ID:this.config.OAUTH_APPLE_CLIENT_ID;
    const secret=provider==='google'?this.config.OAUTH_GOOGLE_CLIENT_SECRET:this.config.OAUTH_APPLE_CLIENT_SECRET;
    if(!id||!secret||!this.config.NATIVE_AUTH_WEB_URL)throw new ServiceUnavailableException();
    const client=new oidc.Configuration(servers[provider],id,{id_token_signed_response_alg:'RS256'},oidc.ClientSecretPost(secret));
    client.timeout=this.config.AUTH_TIMEOUT_MS/1000;
    // Verify JWS against the fixed provider JWKS in addition to claims and TLS.
    oidc.enableNonRepudiationChecks(client);
    return client;
  }
  private callback(provider:Provider){return new URL('/auth/callback/'+provider,this.config.NATIVE_AUTH_WEB_URL);}
  async start(input:z.infer<typeof httpSchemas.SocialStart>,request?:AuthenticatedRequest){
    if(request && request.identity?.provider!=='nest')throw new UnauthorizedException();
    const {provider,context}=input,client=this.client(provider);
    const state=oidc.randomState(),nonce=oidc.randomNonce(),verifier=provider==='google'?oidc.randomPKCECodeVerifier():undefined;
    const link=request?.identity?{subject_id:request.identity.authUserId,session_id:request.identity.sessionId}:undefined;
    const id=randomUUID();
    const registered=await this.auth.call('oauth_begin',{transaction_id:id,...(link?{link}: {})});
    if(registered.error)throw new UnauthorizedException();
    const transaction=await new EncryptJWT({flow:{provider,state,nonce,...(verifier?{verifier}:{}),context,...(link?{link}:{})}})
      .setProtectedHeader({alg:'dir',enc:'A256GCM',typ:'JWT'}).setIssuer(this.config.NATIVE_AUTH_ISSUER!)
      .setAudience('asisteam-oauth').setJti(id).setIssuedAt().setExpirationTime('10m').encrypt(this.key());
    const parameters:Record<string,string>={redirect_uri:this.callback(provider).href,response_type:'code',scope:provider==='google'?'openid email profile':'openid email',state,nonce};
    if(verifier){parameters.code_challenge=await oidc.calculatePKCECodeChallenge(verifier);parameters.code_challenge_method='S256';}
    if(provider==='apple')parameters.response_mode='form_post';
    return httpSchemas.SocialStarted.parse({authorization_url:oidc.buildAuthorizationUrl(client,parameters).href,transaction});
  }
  async complete(input:z.infer<typeof httpSchemas.SocialCallback>){
    const client=this.client(input.provider);
    try{
      const {payload}=await jwtDecrypt(input.transaction,this.key(),{issuer:this.config.NATIVE_AUTH_ISSUER!,audience:'asisteam-oauth',keyManagementAlgorithms:['dir'],contentEncryptionAlgorithms:['A256GCM'],requiredClaims:['jti','iat','exp'],maxTokenAge:'10m'});
      const flow=flowSchema.parse(payload.flow),id=z.string().uuid().parse(payload.jti);
      if(flow.provider!==input.provider||!timingSafeEqual(Buffer.from(tokenHash(flow.state),'hex'),Buffer.from(tokenHash(input.state),'hex')))throw new UnauthorizedException();
      const active=await this.auth.call('oauth_check',{transaction_id:id,...(flow.link?{link:flow.link}:{})});
      if(active.error)throw new UnauthorizedException();
      const url=this.callback(input.provider),parameters=new URLSearchParams({code:input.code,state:input.state});
      let response:URL|globalThis.Request=url;
      if(input.provider==='apple')response=new globalThis.Request(url,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:parameters});
      else url.search=parameters.toString();
      const result=await oidc.authorizationCodeGrant(client,response,{expectedState:flow.state,expectedNonce:flow.nonce,idTokenExpected:true,...(flow.verifier?{pkceCodeVerifier:flow.verifier}:{})});
      const claims=result.claims();
      if(!claims||typeof claims.sub!=='string'||!claims.sub||claims.sub.length>255)throw new UnauthorizedException();
      // Email is profile data. It never chooses the account to authenticate/link.
      const email=z.string().email().max(254).parse(claims.email);
      if(claims.email_verified!==true&&claims.email_verified!=='true')throw new UnauthorizedException();
      const refresh=randomBytes(32).toString('hex');
      const value=await this.auth.call('oauth_complete',{transaction_id:id,provider:input.provider,provider_subject:claims.sub,email,name:typeof claims.name==='string'?claims.name.slice(0,200):'Usuario de Asisteam',subject_id:randomUUID(),refresh_hash:tokenHash(refresh),...(flow.link?{link:flow.link}:{})});
      if(value.error)throw new UnauthorizedException();
      return httpSchemas.SocialCompleted.parse({tokens:await this.auth.tokens(value,refresh),context:flow.context,linked:!!flow.link});
    }catch(error){if(error instanceof ServiceUnavailableException)throw error;throw new UnauthorizedException();}
  }
}
@Controller('api/v1/auth/social')
export class SocialAuthController {
  constructor(@Inject(SocialAuth) private readonly social:SocialAuth,@Inject(NativeAuth) private readonly auth:NativeAuth){}
  @Get('providers') providers(){return this.social.availability();}
  @Post('start') @HttpCode(200) async start(@Req() r:Request,@Body() value:unknown){const p=parse(httpSchemas.SocialStart,value);await this.auth.rate(r,'oauth-start');return this.social.start(p);}
  @Post('link') @HttpCode(200) @UseGuards(SessionGuard) async link(@Req() r:AuthenticatedRequest,@Body() value:unknown){const p=parse(httpSchemas.SocialStart,value);await this.auth.rate(r,'oauth-link');return this.social.start(p,r);}
  @Post('callback') @HttpCode(200) async callback(@Req() r:Request,@Body() value:unknown){const p=parse(httpSchemas.SocialCallback,value);await this.auth.rate(r,'oauth-callback');return this.social.complete(p);}
}
