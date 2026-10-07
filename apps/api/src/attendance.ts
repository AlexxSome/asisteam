import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Put, Query, Req, UseGuards } from '@nestjs/common';
import { httpSchemas } from '@asisteam/core/runtime';
import type { z } from 'zod';
import { SessionGuard, type AuthenticatedRequest } from './auth.js';
import { Database, type AuthenticatedTransaction } from './database.js';
import { requireMembership } from './authorization.js';
import { DomainException, domainSqlError } from './domain-errors.js';

function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException();
  return result.data;
}
@Controller('api/v1/groups/:groupId/activities/:activityId/attendance')
@UseGuards(SessionGuard)
export class AttendanceController {
  constructor(@Inject(Database) private readonly database: Database) {}
  private async run<T>(req: AuthenticatedRequest, groupId: string, activityId: string,
    action: (tx: AuthenticatedTransaction, canEditNotes: boolean) => Promise<T>) {
    try {
      return await this.database.authenticated(req.identity!, async tx => {
        if ((await tx.query('select public.has_account_consent() as accepted')).rows[0]?.accepted !== true) throw new DomainException(403, 'account_consent_required');
        const roles = await requireMembership(tx, groupId, ['ADMIN', 'COACH']);
        // Check the route tenant before RPCs that accept activity_id only.
        const activity = (await tx.query('select id from public.v_group_activities where group_id=$1 and id=$2', [groupId, activityId])).rows[0];
        if (!activity) throw new DomainException(404, 'activity_not_found');
        return action(tx, roles.includes('ADMIN'));
      });
    } catch (error) { return domainSqlError(error); }
  }
  @Get()
  async roster(@Req() req: AuthenticatedRequest, @Param() params: unknown, @Query() query: Record<string, unknown>) {
    const { groupId, activityId } = parse(httpSchemas.ActivityParams, params);
    const input = Object.fromEntries(Object.entries(query).map(([key, value]) => [key,
      key === 'page' && typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value]));
    const { page } = parse(httpSchemas.AttendanceQuery, input);
    return this.run(req, groupId, activityId, async (tx, canEditNotes) => {
      // Bound each security-barrier view separately. Joining the two views
      // repeatedly evaluates authorization for the entire recorded roster.
      const { rows } = await tx.query(`select membership_id,full_name,avatar_url
        from public.v_attendance_roster where group_id=$1
        order by full_name,membership_id limit 101 offset $2`, [groupId, (page - 1) * 100]);
      const pageRows = rows.slice(0, 100);
      const saved = pageRows.length ? (await tx.query(`select membership_id,status,note
        from public.v_attendance_operator where group_id=$1 and activity_id=$2
        and membership_id=any($3::uuid[])`, [groupId, activityId, pageRows.map(row => row.membership_id)])).rows : [];
      const byMember = new Map(saved.map(row => [row.membership_id, row]));
      const roster = pageRows.map(row => ({ ...row, status: byMember.get(row.membership_id)?.status ?? null,
        note: canEditNotes ? byMember.get(row.membership_id)?.note ?? null : null }));
      return httpSchemas.AttendanceRoster.parse({ roster, canEditNotes, hasNext: rows.length > 100 });
    });
  }
  @Put()
  async save(@Req() req: AuthenticatedRequest, @Param() params: unknown, @Body() input: unknown) {
    const { groupId, activityId } = parse(httpSchemas.ActivityParams, params);
    const body = parse(httpSchemas.SaveAttendance, input);
    return this.run(req, groupId, activityId, async tx => {
      const result = (await tx.query('select public.record_attendance_bulk($1,$2::jsonb,$3) as result', [activityId, JSON.stringify(body.records), body.only_unmarked])).rows[0]!.result;
      return httpSchemas.AttendanceSaved.parse({ records: result.records });
    });
  }
  @Patch(':membershipId')
  async update(@Req() req: AuthenticatedRequest, @Param() params: unknown, @Body() input: unknown) {
    const { groupId, activityId, membershipId } = parse(httpSchemas.AttendanceMemberParams, params);
    const body = parse(httpSchemas.UpdateAttendance, input);
    return this.run(req, groupId, activityId, async tx => {
      const row = (await tx.query('select id from public.v_attendance_operator where group_id=$1 and activity_id=$2 and membership_id=$3', [groupId, activityId, membershipId])).rows[0];
      if (!row) throw new DomainException(404, 'attendance_record_not_found');
      const result = (await tx.query('select public.update_attendance_record($1,$2::jsonb) as result', [row.id, JSON.stringify(body)])).rows[0]!.result;
      return httpSchemas.AttendanceSaved.parse({ records: result.records });
    });
  }
  @Delete(':membershipId')
  async clear(@Req() req: AuthenticatedRequest, @Param() params: unknown) {
    const { groupId, activityId, membershipId } = parse(httpSchemas.AttendanceMemberParams, params);
    return this.run(req, groupId, activityId, async tx => {
      await tx.query('select public.clear_attendance_record($1,$2)', [activityId, membershipId]);
      return { cleared: true as const };
    });
  }
}
