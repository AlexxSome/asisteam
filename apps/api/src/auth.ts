import { Inject, Injectable, UnauthorizedException, ServiceUnavailableException, Controller, Get, Req, UseGuards, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from 'jose';
import { z } from 'zod';
import type { Request } from 'express';
import { CONFIG, type RuntimeConfig } from './config.js';
import { Database } from './database.js';

const claimsSchema = z.object({ sub: z.string().uuid(), session_id: z.string().uuid(), exp: z.number().int(), iat: z.number().int(), iss: z.string(), aud: z.union([z.string(), z.array(z.string())]) });
import { sealIdentity, type VerifiedIdentity } from './identity.js';
export type AuthenticatedRequest = Request & { identity?: VerifiedIdentity };

@Injectable()
export class TokenVerifier {
  private readonly jwks;
  constructor(@Inject(CONFIG) private readonly config: RuntimeConfig) {
    this.jwks = config.SUPABASE_AUTH_URL ? createRemoteJWKSet(new URL(config.SUPABASE_AUTH_URL + '/.well-known/jwks.json'), { timeoutDuration: config.AUTH_TIMEOUT_MS, cacheMaxAge: 60_000, cooldownDuration: 1000 }) : undefined;
  }
  async verify(authorization: string | undefined): Promise<VerifiedIdentity> {
    const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
    if (!match || match[1]!.length > 16_384) throw new UnauthorizedException();
    const token = match[1]!;
    if (this.config.NATIVE_AUTH_SECRET && this.config.NATIVE_AUTH_ISSUER) {
      try {
        if (decodeJwt(token).iss === this.config.NATIVE_AUTH_ISSUER) {
          const {payload}=await jwtVerify(token,new TextEncoder().encode(this.config.NATIVE_AUTH_SECRET),{issuer:this.config.NATIVE_AUTH_ISSUER,audience:'asisteam-api',algorithms:['HS256'],requiredClaims:['sub','session_id','iat','exp'],maxTokenAge:'15m'});
          const claims=claimsSchema.parse(payload);
          if(claims.iat>Math.floor(Date.now()/1000)||claims.exp<=claims.iat||claims.exp-claims.iat>900)throw new Error('Invalid claims');
          return sealIdentity({authUserId:claims.sub,sessionId:claims.session_id,expiresAt:claims.exp,provider:'nest'});
        }
      } catch {throw new UnauthorizedException();}
    }
    if (!this.jwks || !this.config.SUPABASE_AUTH_PUBLIC_KEY) throw new UnauthorizedException();
    let claims;
    try {
      const header = decodeProtectedHeader(token);
      // Legacy shared keys stay in Auth, never in this runtime. Auth verifies HS256.
      const payload = header.alg === 'HS256' ? decodeJwt(token) : (await jwtVerify(token, this.jwks, { issuer: this.config.SUPABASE_AUTH_URL, audience: 'authenticated', algorithms: ['ES256', 'RS256'], requiredClaims: ['sub', 'exp', 'iat', 'session_id'] })).payload;
      claims = claimsSchema.parse(payload);
      const now = Math.floor(Date.now() / 1000);
      if (claims.iss !== this.config.SUPABASE_AUTH_URL || !(Array.isArray(claims.aud) ? claims.aud.includes('authenticated') : claims.aud === 'authenticated') || claims.exp <= now || claims.iat > now || claims.exp <= claims.iat || (typeof payload.nbf === 'number' && payload.nbf > now)) throw new Error('Invalid claims');
    } catch { throw new UnauthorizedException(); }
    let response;
    try {
      // Fixed configured origin: never follow a token jku/iss or HTTP redirect.
      response = await fetch(this.config.SUPABASE_AUTH_URL + '/user', { redirect: 'error', headers: { apikey: this.config.SUPABASE_AUTH_PUBLIC_KEY, authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(this.config.AUTH_TIMEOUT_MS) });
      if (response.status >= 500 || response.status === 429) throw new ServiceUnavailableException();
      if (!response.ok) throw new UnauthorizedException();
      const user: unknown = await response.json();
      if (!user || typeof user !== 'object' || !('id' in user) || user.id !== claims.sub) throw new UnauthorizedException();
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException();
    }
    return sealIdentity({ authUserId: claims.sub, sessionId: claims.session_id, expiresAt: claims.exp });
  }
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(TokenVerifier) private readonly verifier: TokenVerifier) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.identity = await this.verifier.verify(request.headers.authorization);
    return true;
  }
}
@Controller('api/v1/auth')
@UseGuards(SessionGuard)
export class SessionController {
  constructor(@Inject(Database) private readonly database: Database) {}
  @Get('session')
  async session(@Req() request: AuthenticatedRequest) {
    return this.database.authenticated(request.identity!, async (transaction) => ({ user_id: transaction.userId }));
  }
}
