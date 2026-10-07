import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { httpSchemas } from '@asisteam/core/runtime';
import type { z } from 'zod';
import { SessionGuard, type AuthenticatedRequest } from './auth.js';
import { Database, type AuthenticatedTransaction } from './database.js';
import { projectGroupDetail, requireMembership } from './authorization.js';
import { DomainException, domainSqlError } from './domain-errors.js';

const columns = 'id, full_name, email, phone, to_char(birthdate, \'YYYY-MM-DD\') as birthdate, avatar_url';
function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException();
  return result.data;
}
async function ownProfile(tx: AuthenticatedTransaction) {
  const { rows: [row] } = await tx.query(`select ${columns} from public.users where id=$1`, [tx.userId]);
  return httpSchemas.OwnProfile.parse(row);
}
@Controller('api/v1')
@UseGuards(SessionGuard)
export class GroupsProfileController {
  constructor(@Inject(Database) private readonly database: Database) {}
  private async run<T>(request: AuthenticatedRequest, operation: (tx: AuthenticatedTransaction) => Promise<T>) {
    try {
      return await this.database.authenticated(request.identity!, async tx => {
        const { rows: [consent] } = await tx.query('select public.has_account_consent() as accepted');
        if (consent?.accepted !== true) throw new DomainException(403, 'account_consent_required');
        return operation(tx);
      });
    } catch (error) { return domainSqlError(error); }
  }
  @Get('me/groups')
  async listGroups(@Req() request: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    const page = parse(httpSchemas.PageQuery, Object.fromEntries(Object.entries(query).map(([key, value]) => [key, typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value])));
    return this.run(request, async tx => {
      // One statement gives the page and count the same database snapshot.
      const { rows: [row] } = await tx.query(`with visible as materialized (select id,name,sport,logo_url,roles from public.v_my_groups),
        paged as (select id,name,sport,logo_url,roles from visible order by name,id limit $1 offset $2)
        select coalesce((select jsonb_agg(to_jsonb(p) order by name,id) from paged p),'[]'::jsonb) as data,
        (select count(*)::int from visible) as total`, [page.page_size, (page.page - 1) * page.page_size]);
      return httpSchemas.MyGroups.parse({ data: row!.data, pagination: { ...page, total: row!.total } });
    });
  }
  @Get('groups/:groupId')
  async getGroup(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { groupId } = parse(httpSchemas.GroupParams, params);
    return this.run(request, async tx => {
      const roles = await requireMembership(tx, groupId);
      const { rows: [row] } = await tx.query('select id,name,sport,logo_url,description,invite_code,settings,settings_updated_at,settings_updated_by_name,can_view_group_stats from public.v_group_detail where id=$1', [groupId]);
      if (!row) throw new NotFoundException();
      if (row.settings_updated_at instanceof Date) row.settings_updated_at = row.settings_updated_at.toISOString();
      return projectGroupDetail(row, roles);
    });
  }
  @Post('groups')
  async createGroup(@Req() request: AuthenticatedRequest, @Body() input: unknown) {
    const body = parse(httpSchemas.CreateGroup, input);
    return this.run(request, async tx => {
      const { rows: [row] } = await tx.query('select public.create_group($1,$2,$3,$4) as group_id', [body.name, body.sport, body.description || null, body.logo_url || null]);
      return httpSchemas.GroupCreated.parse(row);
    });
  }
  @Patch('groups/:groupId')
  async updateGroup(@Req() request: AuthenticatedRequest, @Param() params: unknown, @Body() input: unknown) {
    const { groupId } = parse(httpSchemas.GroupParams, params), body = parse(httpSchemas.CreateGroup, input);
    return this.run(request, async tx => {
      await requireMembership(tx, groupId, ['ADMIN']);
      const { rows } = await tx.query('update public.groups set name=$1,sport=$2,description=$3,logo_url=$4 where id=$5 returning id', [body.name,body.sport,body.description || null,body.logo_url || null,groupId]);
      if (!rows.length) throw new NotFoundException();
      return { success: true as const };
    });
  }
  @Patch('groups/:groupId/settings')
  async settings(@Req() request: AuthenticatedRequest, @Param() params: unknown, @Body() input: unknown) {
    const { groupId } = parse(httpSchemas.GroupParams, params), body = parse(httpSchemas.GroupSettingsChange, input);
    return this.run(request, async tx => {
      const { rows: [row] } = await tx.query('select public.update_group_settings($1,$2::jsonb) as settings', [groupId, JSON.stringify(body)]);
      return httpSchemas.GroupSettings.parse(row);
    });
  }
  @Post('groups/:groupId/invite-code/rotate')
  async rotate(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { groupId } = parse(httpSchemas.GroupParams, params);
    return this.run(request, async tx => httpSchemas.InviteCode.parse((await tx.query('select public.rotate_invite_code($1) as code', [groupId])).rows[0]));
  }
  @Post('groups/:groupId/memberships/self')
  async joinAthlete(@Req() request: AuthenticatedRequest, @Param() params: unknown) {
    const { groupId } = parse(httpSchemas.GroupParams, params);
    return this.run(request, async tx => { await tx.query('select public.join_group_as_athlete($1)', [groupId]); return { success: true as const }; });
  }
  @Post('groups/join')
  async joinCode(@Req() request: AuthenticatedRequest, @Body() input: unknown) {
    const body = parse(httpSchemas.JoinByCode, input);
    const result = await this.run(request, async tx => {
      const { rows: [row] } = await tx.query('select public.join_group_by_code($1) as data', [body.code]);
      const data = row!.data;
      if (data.error) return { error: String(data.error.code) };
      return { membership: { group_id: data.membership.group_id, status: data.membership.status } };
    });
    // Expected rejection must COMMIT the attempt counter before emitting HTTP error.
    if ('error' in result && result.error) throw new DomainException(result.error === 'invalid_invite_code' ? 400 : result.error === 'membership_already_exists' ? 409 : 422, result.error);
    return httpSchemas.JoinedGroup.parse(result);
  }
  @Get('me')
  async getProfile(@Req() request: AuthenticatedRequest) { return this.run(request, ownProfile); }
  @Patch('me')
  async updateProfile(@Req() request: AuthenticatedRequest, @Body() input: unknown) {
    const body = parse(httpSchemas.UpdateOwnProfile, input);
    return this.run(request, async tx => {
      // Keep the actor lock through the SAVEPOINT recovery and age-review request.
      await tx.query('select id from public.users where id=$1 for update', [tx.userId]);
      await tx.query('savepoint profile_update');
      let pending = false;
      try {
        await tx.query('update public.users set full_name=$1,phone=$2,birthdate=$3 where id=$4', [body.full_name,body.phone,body.birthdate,tx.userId]);
      } catch (error) {
        await tx.query('rollback to savepoint profile_update');
        if (!(error instanceof Error) || error.message !== 'birthdate_admin_confirmation_required' || !body.birthdate) throw error;
        await tx.query('select public.request_birthdate_change($1)', [body.birthdate]);
        await tx.query('update public.users set full_name=$1,phone=$2 where id=$3', [body.full_name,body.phone,tx.userId]);
        pending = true;
      }
      await tx.query('release savepoint profile_update');
      return httpSchemas.ProfileUpdated.parse({ profile: await ownProfile(tx), birthdate_change_pending: pending });
    });
  }
  @Get('me/profile-context')
  async profileContext(@Req() request: AuthenticatedRequest) {
    return this.run(request, async tx => {
      const { rows: [flags] } = await tx.query(`select public.can_upload_avatar() as avatar_allowed,
        exists(select 1 from public.memberships where user_id=$1 and role='ADMIN' and status='ACTIVE') as has_admin_role`, [tx.userId]);
      const { rows: [birthdateRequest] } = await tx.query("select id,to_char(requested_birthdate,'YYYY-MM-DD') as requested_birthdate,status from public.birthdate_change_requests where user_id=$1 order by created_at desc,id desc limit 1", [tx.userId]);
      const { rows: permissions } = await tx.query('select guardianship_id,full_name,allows_avatar from public.list_avatar_permissions()');
      return httpSchemas.ProfileContext.parse({ ...flags, birthdate_request: birthdateRequest ?? null, avatar_permissions: permissions });
    });
  }
  @Get('me/birthdate-reviews')
  async reviews(@Req() request: AuthenticatedRequest) {
    return this.run(request, async tx => httpSchemas.BirthdateReviews.parse({ data: (await tx.query('select to_jsonb(r) as data from public.list_birthdate_reviews() r')).rows.map(row => row.data) }));
  }
  @Post('me/birthdate-reviews/:requestId')
  async review(@Req() request: AuthenticatedRequest, @Param() params: unknown, @Body() input: unknown) {
    const { requestId } = parse(httpSchemas.ReviewParams, params), body = parse(httpSchemas.ReviewBirthdate, input);
    return this.run(request, async tx => httpSchemas.BirthdateReviewed.parse((await tx.query('select public.review_birthdate_change($1,$2,$3) as status', [requestId,body.group_id,body.approve])).rows[0]));
  }
  @Patch('me/avatar-permissions/:guardianshipId')
  async avatarPermission(@Req() request: AuthenticatedRequest, @Param() params: unknown, @Body() input: unknown) {
    const { guardianshipId } = parse(httpSchemas.AvatarPermissionParams, params), body = parse(httpSchemas.AvatarPermissionChange, input);
    return this.run(request, async tx => { await tx.query('select public.set_avatar_permission($1,$2)', [guardianshipId,body.allow]); return { success: true as const }; });
  }
}
