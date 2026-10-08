import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { httpSchemas } from '@asisteam/core/runtime';
import type { z } from 'zod';
import { SessionGuard, type AuthenticatedRequest } from './auth.js';
import { Database, type AuthenticatedTransaction } from './database.js';
import { DomainException, domainSqlError } from './domain-errors.js';

function parse<S extends z.ZodTypeAny>(schema: S, value: unknown, code: string): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new DomainException(400, code);
  return result.data;
}
@Controller('api/v1')
@UseGuards(SessionGuard)
export class QrController {
  constructor(@Inject(Database) private readonly database: Database) {}
  private async run<T>(req: AuthenticatedRequest, action: (tx: AuthenticatedTransaction) => Promise<T>) {
    try {
      return await this.database.authenticated(req.identity!, async tx => {
        if ((await tx.query('select public.has_account_consent() as accepted')).rows[0]?.accepted !== true) throw new DomainException(403, 'account_consent_required');
        // Canonical RPCs authorize ACTIVE membership/role and take shared domain
        // locks. Never accept actor, membership, status, time or signing keys.
        return action(tx);
      });
    } catch (error) { return domainSqlError(error); }
  }
  @Get('groups/:groupId/check-in-settings')
  async settings(@Req() req: AuthenticatedRequest, @Param() params: unknown) {
    const { groupId } = parse(httpSchemas.GroupParams, params, 'group_not_found');
    return this.run(req, async tx => httpSchemas.QrSettings.parse((await tx.query('select public.get_qr_checkin_settings($1) as result', [groupId])).rows[0]!.result));
  }
  @Put('groups/:groupId/check-in-settings')
  async configure(@Req() req: AuthenticatedRequest, @Param() params: unknown, @Body() input: unknown) {
    const { groupId } = parse(httpSchemas.GroupParams, params, 'group_not_found');
    const body = parse(httpSchemas.QrSettings, input, 'invalid_qr_settings');
    return this.run(req, async tx => httpSchemas.QrSettings.parse((await tx.query('select public.set_qr_checkin_settings($1,$2::jsonb) as result', [groupId, JSON.stringify(body)])).rows[0]!.result));
  }
  @Post('activities/:activityId/check-in-qr')
  @HttpCode(200)
  async issue(@Req() req: AuthenticatedRequest, @Param() params: unknown) {
    const { activityId } = parse(httpSchemas.CheckinActivityParams, params, 'activity_not_found');
    return this.run(req, async tx => httpSchemas.CheckinQr.parse((await tx.query('select public.issue_activity_checkin_qr($1) as result', [activityId])).rows[0]!.result));
  }
  @Post('me/check-in')
  @HttpCode(200)
  async checkin(@Req() req: AuthenticatedRequest, @Body() input: unknown) {
    const body = parse(httpSchemas.CheckinInput, input, 'checkin_qr_expired');
    return this.run(req, async tx => httpSchemas.CheckinReceipt.parse((await tx.query('select public.self_checkin($1,$2) as result', [body.activity_id, body.token])).rows[0]!.result));
  }
}
