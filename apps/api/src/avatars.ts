import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { httpSchemas } from '@asisteam/core/runtime';
import { SessionGuard, type AuthenticatedRequest } from './auth.js';
import { Database, type AuthenticatedTransaction } from './database.js';
import { DomainException, domainSqlError } from './domain-errors.js';
import { AvatarStorage, validateAvatar } from './storage.js';

@Controller('api/v1')
@UseGuards(SessionGuard)
export class AvatarsController {
  constructor(@Inject(Database) private readonly database: Database, @Inject(AvatarStorage) private readonly storage: AvatarStorage) {}
  private async run<T>(request: AuthenticatedRequest, operation: (tx: AuthenticatedTransaction) => Promise<T>) {
    try { return await this.database.authenticated(request.identity!, async tx => {
      if ((await tx.query('select public.has_account_consent() as accepted')).rows[0]?.accepted !== true) throw new DomainException(403, 'account_consent_required');
      return operation(tx);
    }); } catch (error) { return domainSqlError(error); }
  }
  @Post('me/avatar')
  async upload(@Req() request: AuthenticatedRequest, @Body() input: unknown) {
    const parsed = httpSchemas.AvatarUpload.safeParse(input);
    if (!parsed.success) throw new BadRequestException();
    const body = parsed.data, bytes = Buffer.from(body.content_base64, 'base64');
    if (bytes.toString('base64') !== body.content_base64) throw new BadRequestException();
    try { validateAvatar(bytes, body.type); } catch { throw new BadRequestException(); }
    return this.run(request, async tx => {
      // Serialize same-profile writes; actor and ownership come from the verified session.
      const own = (await tx.query('select auth_user_id from public.users where id=$1 for update', [tx.userId])).rows[0];
      if ((await tx.query('select public.can_upload_avatar() as allowed')).rows[0]?.allowed !== true) throw new DomainException(422, 'avatar_consent_required');
      const extension = body.type === 'image/png' ? 'png' : body.type === 'image/jpeg' ? 'jpg' : 'webp';
      const key = `${own!.auth_user_id}/${randomUUID()}.${extension}`;
      await this.storage.put(key, bytes, body.type);
      await tx.query('update public.users set avatar_url=$1 where id=$2', ['/profile/avatar/' + key, tx.userId]);
      // Keep old/new orphan objects until reconciliation: COMMIT can have an ambiguous outcome.
      return { success: true as const };
    });
  }
  @Get('avatars/:ownerId/:fileName')
  async download(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const parsed = httpSchemas.AvatarParams.safeParse(params);
    if (!parsed.success) throw new NotFoundException();
    const key = parsed.data.ownerId + '/' + parsed.data.fileName;
    const data = await this.run(request, async tx => {
      if ((await tx.query('select public.can_read_avatar($1) as allowed', [key])).rows[0]?.allowed !== true) throw new NotFoundException();
      try { const data = await this.storage.read(key); return { type: data.type, content_base64: data.bytes.toString('base64') }; }
      catch { throw new NotFoundException(); }
    });
    return httpSchemas.AvatarDownload.parse(data);
  }
}
