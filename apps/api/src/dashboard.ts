import { BadRequestException, Controller, Get, Inject, Param, Query, Req, UseGuards } from '@nestjs/common';
import { httpSchemas } from '@asisteam/core/runtime';
import { SessionGuard, type AuthenticatedRequest } from './auth.js';
import { Database } from './database.js';
import { requireMembership } from './authorization.js';
import { domainSqlError } from './domain-errors.js';
@Controller('api/v1/groups/:groupId')
@UseGuards(SessionGuard)
export class DashboardController {
 constructor(@Inject(Database) private readonly database: Database) {}
 @Get('dashboard')
 async home(@Req() req: AuthenticatedRequest, @Param() params: unknown, @Query() query: Record<string, unknown>) {
  const group = httpSchemas.GroupParams.safeParse(params);
  const input = httpSchemas.DashboardQuery.safeParse(Object.fromEntries(Object.entries(query).map(([key, value]) => [key,
   ['records_page', 'day_page', 'wards_page'].includes(key) && typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value])));
  if (!group.success || !input.success) throw new BadRequestException();
  try { return await this.database.authenticated(req.identity!, async tx => {
   await requireMembership(tx, group.data.groupId);
   const { activity_id, records_page, day_page, wards_page } = input.data;
   return httpSchemas.GroupDashboard.parse((await tx.query('select public.get_group_dashboard($1,$2,$3,$4,$5) as result',
    [group.data.groupId, activity_id ?? null, records_page, day_page, wards_page])).rows[0]!.result);
  }); } catch (error) { return domainSqlError(error); }
 }
}
