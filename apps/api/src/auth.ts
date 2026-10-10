import { Inject, Injectable, UnauthorizedException, ServiceUnavailableException, Controller, Get, Req, UseGuards, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { z } from 'zod';
import type { Request } from 'express';
import { CONFIG, type RuntimeConfig } from './config.js';
import { Database } from './database.js';

const claimsSchema = z.object({ sub: z.string().uuid(), session_id: z.string().uuid(), exp: z.number().int(), iat: z.number().int(), iss: z.string(), aud: z.union([z.string(), z.array(z.string())]) });
import { sealIdentity, type VerifiedIdentity } from './identity.js';
export type AuthenticatedRequest = Request & { identity?: VerifiedIdentity };

@Injectable()
export class TokenVerifier {
  constructor(@Inject(CONFIG) private readonly config: RuntimeConfig) {}
  async verify(authorization: string | undefined): Promise<VerifiedIdentity> {
    const match = authorization?.match(/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/);
    if (!match || match[1]!.length > 16_384 || !this.config.NATIVE_AUTH_SECRET || !this.config.NATIVE_AUTH_ISSUER) throw new UnauthorizedException();
    try {
      const { payload } = await jwtVerify(match[1]!, new TextEncoder().encode(this.config.NATIVE_AUTH_SECRET), {
        issuer: this.config.NATIVE_AUTH_ISSUER, audience: 'asisteam-api', algorithms: ['HS256'],
        requiredClaims: ['sub', 'session_id', 'iat', 'exp'], maxTokenAge: '15m',
      });
      const claims = claimsSchema.parse(payload);
      if (claims.iat > Math.floor(Date.now() / 1000) || claims.exp <= claims.iat || claims.exp - claims.iat > 900) throw new Error('Invalid claims');
      return sealIdentity({ authUserId: claims.sub, sessionId: claims.session_id, expiresAt: claims.exp, provider: 'nest' });
    } catch { throw new UnauthorizedException(); }
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
