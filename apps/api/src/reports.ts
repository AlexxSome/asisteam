import { BadRequestException, Controller, Get, Inject, Param, Query, Req, UseGuards } from '@nestjs/common';
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
function queryInput(query: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(query).map(([key, value]) => [key,
    ['page', 'page_size'].includes(key) && typeof value === 'string' && /^\d+$/.test(value) ? Number(value)
      : key === 'include_inactive' && (value === 'true' || value === 'false') ? value === 'true' : value]));
}
function filters(input: z.infer<typeof httpSchemas.HistoryQuery>) {
  return [input.period, input.from ?? null, input.to ?? null, input.activity_type_ids ? input.activity_type_ids.split(',') : []];
}
@Controller('api/v1/groups/:groupId')
@UseGuards(SessionGuard)
export class ReportsController {
  constructor(@Inject(Database) private readonly database: Database) {}
  private async run<T>(req: AuthenticatedRequest, groupId: string, action: (tx: AuthenticatedTransaction) => Promise<T>) {
    try {
      return await this.database.authenticated(req.identity!, async tx => {
        if ((await tx.query('select public.has_account_consent() as accepted')).rows[0]?.accepted !== true) throw new DomainException(403, 'account_consent_required');
        await requireMembership(tx, groupId);
        // Canonical RPCs authorize the exact operation and project each role.
        // No cache or copied metric/period logic at the HTTP boundary.
        return action(tx);
      });
    } catch (error) { return domainSqlError(error); }
  }
  @Get('me/history')
  async own(@Req() req: AuthenticatedRequest, @Param() params: unknown, @Query() query: Record<string, unknown>) {
    const { groupId } = parse(httpSchemas.GroupParams, params), input = parse(httpSchemas.HistoryQuery, queryInput(query));
    return this.run(req, groupId, async tx => httpSchemas.AttendanceHistory.parse((await tx.query(
      'select public.get_my_attendance_history($1,$2,$3::date,$4::date,$5::uuid[],$6,$7) as result',
      [groupId, ...filters(input), input.page, input.page_size])).rows[0]!.result));
  }
  @Get('wards/:athleteUserId/history')
  async ward(@Req() req: AuthenticatedRequest, @Param() params: unknown, @Query() query: Record<string, unknown>) {
    const { groupId, athleteUserId } = parse(httpSchemas.WardHistoryParams, params), input = parse(httpSchemas.HistoryQuery, queryInput(query));
    return this.run(req, groupId, async tx => httpSchemas.AttendanceHistory.parse((await tx.query(
      'select public.get_ward_attendance_history($1,$2,$3,$4::date,$5::date,$6::uuid[],$7,$8) as result',
      [groupId, athleteUserId, ...filters(input), input.page, input.page_size])).rows[0]!.result));
  }
  @Get('reports')
  async report(@Req() req: AuthenticatedRequest, @Param() params: unknown, @Query() query: Record<string, unknown>) {
    const { groupId } = parse(httpSchemas.GroupParams, params), input = parse(httpSchemas.ReportQuery, queryInput(query));
    return this.run(req, groupId, async tx => httpSchemas.GroupAttendanceReport.parse((await tx.query(
      'select public.get_group_attendance_report($1,$2,$3::date,$4::date,$5::uuid[],$6,$7,$8,$9) as result',
      [groupId, ...filters(input), input.include_inactive, input.page, input.page_size, input.sort])).rows[0]!.result));
  }
  @Get('stats')
  async stats(@Req() req: AuthenticatedRequest, @Param() params: unknown, @Query() query: Record<string, unknown>) {
    const { groupId } = parse(httpSchemas.GroupParams, params), input = parse(httpSchemas.StatsQuery, queryInput(query));
    return this.run(req, groupId, async tx => httpSchemas.GroupStats.parse((await tx.query(
      'select public.get_group_stats($1,$2,$3) as result', [groupId, input.page, input.page_size])).rows[0]!.result));
  }
}
