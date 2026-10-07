import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { httpSchemas } from '@asisteam/core/runtime';
import type { z } from 'zod';
import { SessionGuard, type AuthenticatedRequest } from './auth.js';
import { Database, type AuthenticatedTransaction } from './database.js';
import { DomainException, domainSqlError } from './domain-errors.js';

function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException();
  return result.data;
}
function queryInput(query: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(query).map(([key, value]) => [key,
    key === 'page' && typeof value === 'string' && /^\d+$/.test(value) ? Number(value)
      : key === 'as_guardian' && value === 'true' ? true : key === 'as_guardian' && value === 'false' ? false : value]));
}
function countRows(rows: Record<string, unknown>[]) {
  return rows.map(row => ({ ...row, total_count: Number(row.total_count) }));
}
const onboardingColumns = 'membership_id,athlete_user_id,group_id,group_name,full_name,membership_status,account_status,is_minor,guardian_linked,guardian_ready,requires_managed_consent,can_consent,relationship,capacity_block,total_count';
const memberColumns = "membership_id,full_name,email,phone,to_char(birthdate,'YYYY-MM-DD') as birthdate,account_status,role,status,total_count,user_id,person_roles,is_last_admin";
const wardColumns = 'athlete_user_id,full_name,avatar_url,age,days_until_majority';

@Controller('api/v1')
@UseGuards(SessionGuard)
export class MembersConsentsController {
  constructor(@Inject(Database) private readonly database: Database) {}
  private async run<T>(request: AuthenticatedRequest, operation: (tx: AuthenticatedTransaction) => Promise<T>, requiresConsent = true) {
    try {
      return await this.database.authenticated(request.identity!, async tx => {
        if (requiresConsent && (await tx.query('select public.has_account_consent() as accepted')).rows[0]?.accepted !== true) {
          throw new DomainException(403, 'account_consent_required');
        }
        return operation(tx);
      });
    } catch (error) { return domainSqlError(error); }
  }
  @Get('account-consents/current')
  async currentConsent(@Req() request: AuthenticatedRequest) {
    return this.run(request, async tx => httpSchemas.CurrentAccountConsent.parse((await tx.query('select public.has_account_consent() as accepted')).rows[0]), false);
  }
  @Post('account-consents')
  async accountConsent(@Req() request: AuthenticatedRequest, @Body() input: unknown) {
    const body = parse(httpSchemas.AccountConsent, input);
    return this.run(request, async tx => { await tx.query('select public.accept_account_terms($1,$2)', [body.terms_accepted, body.terms_version]); return { success: true as const }; }, false);
  }
  @Get('groups/:groupId/memberships')
  async listMembers(@Req() request: AuthenticatedRequest, @Param() params: unknown, @Query() query: Record<string, unknown>) {
    const { groupId } = parse(httpSchemas.GroupParams, params), body = parse(httpSchemas.MemberQuery, queryInput(query));
    return this.run(request, async tx => {
      const values = [groupId, body.role ?? null, body.status ?? null, (body.page - 1) * 50, body.search ?? null];
      const sql = `select ${memberColumns} from public.list_group_members($1,$2,$3,$4,$5)`;
      const rows = countRows((await tx.query(sql, values)).rows);
      // RPC pages are bounded to 50; recover count on an empty later page in the same transaction.
      const total = rows[0]?.total_count ?? (body.page > 1 ? Number((await tx.query(sql, [groupId, body.role ?? null, body.status ?? null, 0, body.search ?? null])).rows[0]?.total_count ?? 0) : 0);
      return httpSchemas.Members.parse({ data: rows, total });
    });
  }
  @Post('groups/:groupId/managed-members')
  async createManaged(@Req() request: AuthenticatedRequest, @Param() params: unknown, @Body() input: unknown) {
    const { groupId } = parse(httpSchemas.GroupParams, params), body = parse(httpSchemas.ManagedMember, input);
    return this.run(request, async tx => httpSchemas.ManagedMemberCreated.parse((await tx.query('select public.create_managed_member($1,$2,$3,$4,$5::jsonb) as data', [groupId, body.full_name, body.birthdate, body.email || null, body.guardian ? JSON.stringify(body.guardian) : null])).rows[0]?.data));
  }
  @Patch('groups/:groupId/memberships/:membershipId/managed-profile')
  async updateManaged(@Req() request: AuthenticatedRequest, @Param() params: unknown, @Body() input: unknown) {
    const { groupId, membershipId } = parse(httpSchemas.MemberParams, params), body = parse(httpSchemas.ManagedMemberEdit, input);
    return this.run(request, async tx => httpSchemas.ManagedMemberUpdated.parse((await tx.query('select public.update_managed_member($1,$2,$3,$4,$5,$6) as status', [groupId, membershipId, body.full_name, body.birthdate, body.email || null, body.phone ?? null])).rows[0]));
  }
  private transition(request: AuthenticatedRequest, params: unknown, input: unknown, operation: 'approve_membership' | 'reject_pending_membership' | 'deactivate_membership' | 'reactivate_membership' | 'assign_member_coach') {
    const { groupId, membershipId } = parse(httpSchemas.MemberParams, params);
    parse(httpSchemas.Empty, input ?? {});
    // operation comes only from these fixed handlers, never from request data.
    return this.run(request, async tx => { await tx.query(`select public.${operation}($1,$2)`, [groupId, membershipId]); return { success: true as const }; });
  }
  @Post('groups/:groupId/memberships/:membershipId/approve')
  approve(@Req() request: AuthenticatedRequest, @Param() params: unknown, @Body() body: unknown) { return this.transition(request, params, body, 'approve_membership'); }
  @Post('groups/:groupId/memberships/:membershipId/reject')
  reject(@Req() request: AuthenticatedRequest, @Param() params: unknown, @Body() body: unknown) { return this.transition(request, params, body, 'reject_pending_membership'); }
  @Post('groups/:groupId/memberships/:membershipId/deactivate')
  deactivate(@Req() request: AuthenticatedRequest, @Param() params: unknown, @Body() body: unknown) { return this.transition(request, params, body, 'deactivate_membership'); }
  @Post('groups/:groupId/memberships/:membershipId/reactivate')
  reactivate(@Req() request: AuthenticatedRequest, @Param() params: unknown, @Body() body: unknown) { return this.transition(request, params, body, 'reactivate_membership'); }
  @Post('groups/:groupId/memberships/:membershipId/coach')
  coach(@Req() request: AuthenticatedRequest, @Param() params: unknown, @Body() body: unknown) { return this.transition(request, params, body, 'assign_member_coach'); }
  @Get('memberships/onboarding')
  async onboarding(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    const body = parse(httpSchemas.OnboardingQuery, queryInput(query));
    return this.run(request, async tx => httpSchemas.Onboarding.parse({ data: countRows((await tx.query(`select ${onboardingColumns} from public.list_membership_onboarding($1,$2,$3,$4,$5)`, [body.group_id ?? null, body.athlete_user_id ?? null, body.membership_id ?? null, (body.page - 1) * 50, body.as_guardian])).rows) }));
  }
  @Post('memberships/:membershipId/data-consents')
  async dataConsent(@Req() request: AuthenticatedRequest, @Param() params: unknown, @Body() input: unknown) {
    const { membershipId } = parse(httpSchemas.MembershipParams, params), body = parse(httpSchemas.DataConsent, input);
    return this.run(request, async tx => httpSchemas.DataConsented.parse((await tx.query('select public.consent_membership_data($1,$2) as status', [membershipId, body.accepted])).rows[0]));
  }
  @Post('groups/:groupId/guardianships')
  async guardianship(@Req() request: AuthenticatedRequest, @Param() params: unknown, @Body() input: unknown) {
    const { groupId } = parse(httpSchemas.GroupParams, params), body = parse(httpSchemas.Guardianship, input);
    return this.run(request, async tx => httpSchemas.GuardianshipCreated.parse((await tx.query('select public.create_guardianship($1,$2,$3,$4,$5) as guardianship_id', [groupId, body.athlete_user_id, body.full_name, body.email, body.relationship])).rows[0]));
  }
  @Get('groups/:groupId/guardianships/eligible-athletes')
  async eligibleAthletes(@Req() request: AuthenticatedRequest, @Param() params: unknown, @Query() query: Record<string, unknown>) {
    const { groupId } = parse(httpSchemas.GroupParams, params), body = parse(httpSchemas.EligibleAthletesQuery, queryInput(query));
    return this.run(request, async tx => httpSchemas.EligibleAthletes.parse({ data: countRows((await tx.query('select user_id,full_name,total_count from public.list_guardianship_athletes($1,$2,$3)', [groupId, body.search, (body.page - 1) * 50])).rows) }));
  }
  @Get('groups/:groupId/memberships/pending-summary')
  async pendingSummary(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { groupId } = parse(httpSchemas.GroupParams, params);
    return this.run(request, async tx => httpSchemas.PendingSummary.parse({ total: Number((await tx.query('select total_count from public.list_pending_athletes($1) limit 1', [groupId])).rows[0]?.total_count ?? 0) }));
  }
  @Get('me/wards')
  async wards(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    const body = parse(httpSchemas.WardQuery, queryInput(query));
    return this.run(request, async tx => {
      const data = await this.wardRows(tx, body.group_id ?? null, null, (body.page - 1) * 50, 51);
      return httpSchemas.Wards.parse({ data: data.slice(0, 50), has_next: data.length > 50 });
    });
  }
  @Get('me/wards/:athleteUserId')
  async ward(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { athleteUserId } = parse(httpSchemas.WardParams, params);
    return this.run(request, async tx => {
      const data = await this.wardRows(tx, null, athleteUserId, 0, 1);
      if (!data[0]) throw new NotFoundException();
      return httpSchemas.Ward.parse(data[0]);
    });
  }
  private async wardRows(tx: AuthenticatedTransaction, groupId: string | null, athleteUserId: string | null, offset: number, limit: number) {
    // A single statement keeps authorization/profile/group projections on the same snapshot.
    return (await tx.query(`select ${wardColumns},
      (select jsonb_agg(jsonb_build_object('athlete_user_id',g.athlete_user_id,'group_id',g.group_id,'name',g.name,'sport',g.sport,'membership_status',g.membership_status) order by g.name,g.group_id)
        from public.v_my_ward_groups g where g.athlete_user_id=w.athlete_user_id) as groups
      from public.v_my_wards w where ($1::uuid is null or exists(select 1 from public.v_my_ward_groups g where g.athlete_user_id=w.athlete_user_id and g.group_id=$1 and g.membership_status='ACTIVE'))
      and ($2::uuid is null or w.athlete_user_id=$2) order by full_name,athlete_user_id limit $3 offset $4`, [groupId, athleteUserId, limit, offset])).rows;
  }
}
