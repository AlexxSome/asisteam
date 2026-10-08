import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { httpSchemas } from '@asisteam/core/runtime';
import type { z } from 'zod';
import { SessionGuard, type AuthenticatedRequest } from './auth.js';
import { Database, type AuthenticatedTransaction } from './database.js';
import { DomainException, domainSqlError } from './domain-errors.js';
function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value); if (!result.success) throw new BadRequestException(); return result.data;
}
@Controller('api/v1')
@UseGuards(SessionGuard)
export class AnnouncementsController {
  constructor(@Inject(Database) private readonly database: Database) {}
  private async run<T>(req: AuthenticatedRequest, action: (tx: AuthenticatedTransaction) => Promise<T>) {
    try { return await this.database.authenticated(req.identity!, async tx => {
      if ((await tx.query('select public.has_account_consent() as accepted')).rows[0]?.accepted !== true) throw new DomainException(403, 'account_consent_required');
      return action(tx);
    }); } catch (error) { return domainSqlError(error); }
  }
  private async state(tx: AuthenticatedTransaction) {
    const preference = (await tx.query('select enabled from public.announcement_push_preferences')).rows[0];
    const devices = (await tx.query('select id from public.push_tokens where is_active limit 1')).rows;
    return { enabled: preference?.enabled ?? false, hasDevices: devices.length > 0 };
  }
  @Get('groups/:groupId/announcements')
  async list(@Req() req: AuthenticatedRequest, @Param() params: unknown, @Query() query: Record<string, unknown>) {
    const { groupId } = parse(httpSchemas.GroupParams, params);
    const input = Object.fromEntries(Object.entries(query).map(([key, value]) => [key, key === 'page' && typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value]));
    const { page } = parse(httpSchemas.AnnouncementQuery, input);
    return this.run(req, async tx => {
      const wall = (await tx.query(`select id,group_id,title,body,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as updated_at,total_count::integer from public.list_group_announcements($1,$2)`, [groupId, page])).rows;
      const state = await this.state(tx);
      return httpSchemas.AnnouncementWall.parse({ announcements: wall, page, pushEnabled: state.enabled, hasDevices: state.hasDevices });
    });
  }
  @Post('groups/:groupId/announcements')
  @HttpCode(200)
  async publish(@Req() req: AuthenticatedRequest, @Param() params: unknown, @Body() input: unknown) {
    const { groupId } = parse(httpSchemas.GroupParams, params), body = parse(httpSchemas.PublishAnnouncement, input);
    return this.run(req, async tx => httpSchemas.AnnouncementPublished.parse((await tx.query('select public.publish_group_announcement($1,$2,$3,$4) as id', [groupId, body.title, body.body, body.request_id])).rows[0]));
  }
  @Patch('groups/:groupId/announcements/:announcementId')
  async update(@Req() req: AuthenticatedRequest, @Param() params: unknown, @Body() input: unknown) {
    const { groupId, announcementId } = parse(httpSchemas.AnnouncementParams, params), body = parse(httpSchemas.UpdateAnnouncement, input);
    return this.run(req, async tx => { await tx.query('select public.update_group_announcement($1,$2,$3,$4,$5)', [groupId, announcementId, body.title, body.body, body.updated_at]); return { success: true as const }; });
  }
  @Delete('groups/:groupId/announcements/:announcementId')
  async remove(@Req() req: AuthenticatedRequest, @Param() params: unknown, @Body() input: unknown) {
    const { groupId, announcementId } = parse(httpSchemas.AnnouncementParams, params), body = parse(httpSchemas.DeleteAnnouncement, input);
    return this.run(req, async tx => { await tx.query('select public.delete_group_announcement($1,$2,$3)', [groupId, announcementId, body.updated_at]); return { success: true as const }; });
  }
  @Get('me/announcement-push')
  async preference(@Req() req: AuthenticatedRequest) { return this.run(req, async tx => httpSchemas.PushState.parse(await this.state(tx))); }
  @Patch('me/announcement-push')
  async setPreference(@Req() req: AuthenticatedRequest, @Body() input: unknown) {
    const body = parse(httpSchemas.PushPreference, input);
    return this.run(req, async tx => { await tx.query('select public.set_announcement_push_enabled($1)', [body.enabled]); return { success: true as const }; });
  }
  @Post('me/announcement-push/tokens')
  @HttpCode(200)
  async register(@Req() req: AuthenticatedRequest, @Body() input: unknown) {
    const body = parse(httpSchemas.RegisterPushToken, input);
    return this.run(req, async tx => httpSchemas.PushTokenRegistered.parse((await tx.query('select public.register_announcement_push_token($1,$2) as id', [body.token, body.platform])).rows[0]));
  }
  @Delete('me/announcement-push/tokens')
  async unregister(@Req() req: AuthenticatedRequest, @Body() input: unknown) {
    const body = parse(httpSchemas.UnregisterPushToken, input);
    return this.run(req, async tx => { await tx.query('select public.unregister_announcement_push_token($1)', [body.token]); return { success: true as const }; });
  }
}
