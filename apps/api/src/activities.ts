import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { httpSchemas } from '@asisteam/core/runtime';
import type { z } from 'zod';
import { SessionGuard, type AuthenticatedRequest } from './auth.js';
import { Database, type AuthenticatedTransaction } from './database.js';
import { requireMembership } from './authorization.js';
import { DomainException, domainSqlError } from './domain-errors.js';

async function typeQuery(tx: AuthenticatedTransaction, sql: string, values: unknown[]) {
  try { return await tx.query(sql, values); }
  catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
    if (code === '23505') throw new DomainException(409, 'activity_type_name_exists');
    if (code === '23514') throw new DomainException(400, 'invalid_activity_type');
    throw error;
  }
}
const columns = 'id,group_id,activity_type_id,title,description,location,starts_at,ends_at,activity_type_name,activity_type_color,is_system_type,recurrence_rule,recurrence_source_id';
function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value); if (!result.success) throw new BadRequestException(); return result.data;
}
function queryInput(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    key === 'page' && typeof item === 'string' && /^\d+$/.test(item) ? Number(item)
      : key === 'include_inactive' && (item === 'true' || item === 'false') ? item === 'true' : item]));
}
function serialize(row: Record<string, unknown>) {
  return httpSchemas.Activity.parse({ ...row, starts_at: (row.starts_at as Date).toISOString(), ends_at: (row.ends_at as Date).toISOString() });
}
@Controller('api/v1')
@UseGuards(SessionGuard)
export class ActivitiesController {
  constructor(@Inject(Database) private readonly database: Database) {}
  private async run<T>(request: AuthenticatedRequest, action: (tx: AuthenticatedTransaction) => Promise<T>) {
    try { return await this.database.authenticated(request.identity!, async tx => {
      if ((await tx.query('select public.has_account_consent() as accepted')).rows[0]?.accepted !== true) throw new DomainException(403, 'account_consent_required');
      return action(tx);
    }); } catch (error) { return domainSqlError(error); }
  }
  private async groups(tx: AuthenticatedTransaction, selection: string) {
    const ids = selection.split(','); for (const id of ids) await requireMembership(tx, id); return ids;
  }
  private async page(tx: AuthenticatedTransaction, ids: string[], body: { page: number; period: string }) {
    const upcoming = body.period === 'upcoming';
    const { rows } = await tx.query(`select ${columns} from public.v_group_activities where group_id=any($1::uuid[]) and starts_at ${upcoming ? '>=' : '<'} now() order by starts_at ${upcoming ? 'asc' : 'desc'},id limit 51 offset $2`, [ids,(body.page-1)*50]);
    return { activities: rows.slice(0,50).map(serialize), hasNext: rows.length > 50 };
  }
  @Get('groups/:groupId/activities')
  async listGroup(@Req() req: AuthenticatedRequest, @Param() params: unknown, @Query() query: Record<string, unknown>) {
    const { groupId } = parse(httpSchemas.GroupParams, params), body = parse(httpSchemas.GroupActivityQuery, queryInput(query));
    return this.run(req, async tx => { await requireMembership(tx, groupId); return this.page(tx, [groupId], body); });
  }
  @Get('me/activities')
  async list(@Req() req: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    const body = parse(httpSchemas.ActivityQuery, queryInput(query));
    return this.run(req, async tx => this.page(tx, await this.groups(tx, body.group_ids), body));
  }
  @Get('me/activities/home')
  async home(@Req() req: AuthenticatedRequest, @Query() query: unknown) {
    const body = parse(httpSchemas.ActivitySelection, query);
    return this.run(req, async tx => {
      const ids = await this.groups(tx, body.group_ids);
      const { rows: [clock] } = await tx.query('select now() as now');
      const now = (clock!.now as Date).toISOString();
      const next = (await tx.query(`select ${columns} from public.v_group_activities where group_id=any($1::uuid[]) and ends_at >= $2::timestamptz order by starts_at,id limit 1`, [ids,now])).rows[0];
      const previous = (await tx.query(`select ${columns} from public.v_group_activities where group_id=any($1::uuid[]) and ends_at < $2::timestamptz order by starts_at desc,id limit 1`, [ids,now])).rows[0];
      return { next: next ? serialize(next) : null, previous: previous ? serialize(previous) : null, now };
    });
  }
  @Get('groups/:groupId/activities/:activityId')
  async detail(@Req() req: AuthenticatedRequest, @Param() params: unknown) {
    const {groupId,activityId} = parse(httpSchemas.ActivityParams,params);
    return this.run(req,async tx => { await requireMembership(tx,groupId); const row=(await tx.query(`select ${columns} from public.v_group_activities where group_id=$1 and id=$2`,[groupId,activityId])).rows[0]; if(!row)throw new NotFoundException(); return serialize(row); });
  }
  @Post('groups/:groupId/activities')
  async create(@Req() req: AuthenticatedRequest, @Param() params: unknown, @Body() input: unknown) {
    const {groupId}=parse(httpSchemas.GroupParams,params), body=parse(httpSchemas.CreateActivity,input);
    return this.run(req,async tx => { await requireMembership(tx,groupId,['ADMIN']); return httpSchemas.ActivityCreated.parse((await tx.query('select public.create_activity($1,$2,$3,$4::timestamptz,$5::timestamptz,$6,$7,$8::jsonb) as "activityId"',[groupId,body.activity_type_id,body.title,body.starts_at,body.ends_at,body.description||null,body.location||null,body.recurrence_rule ? JSON.stringify(body.recurrence_rule) : null])).rows[0]); });
  }
  @Patch('groups/:groupId/activities/:activityId')
  async update(@Req() req: AuthenticatedRequest,@Param() params: unknown,@Body() input: unknown) {
    const {groupId,activityId}=parse(httpSchemas.ActivityParams,params),body=parse(httpSchemas.UpdateActivity,input);
    return this.run(req,async tx => {await requireMembership(tx,groupId,['ADMIN']);return httpSchemas.ActivitiesAffected.parse((await tx.query('select public.update_activity($1,$2,$3,$4,$5::timestamptz,$6::timestamptz,$7,$8,$9) as affected',[groupId,activityId,body.activity_type_id,body.title,body.starts_at,body.ends_at,body.description||null,body.location||null,body.scope])).rows[0]);});
  }
  @Delete('groups/:groupId/activities/:activityId')
  async remove(@Req() req: AuthenticatedRequest,@Param() params: unknown,@Body() input: unknown) {
    const {groupId,activityId}=parse(httpSchemas.ActivityParams,params),body=parse(httpSchemas.DeleteActivity,input);
    return this.run(req,async tx => {await requireMembership(tx,groupId,['ADMIN']);return httpSchemas.ActivitiesAffected.parse((await tx.query('select public.delete_activity($1,$2,$3,$4) as affected',[groupId,activityId,body.scope,body.confirm_attendance])).rows[0]);});
  }
  @Get('groups/:groupId/activity-types')
  async types(@Req() req: AuthenticatedRequest,@Param() params: unknown,@Query() query: Record<string,unknown>) {
    const {groupId}=parse(httpSchemas.GroupParams,params),body=parse(httpSchemas.ActivityTypeQuery,queryInput(query));
    return this.run(req,async tx => {await requireMembership(tx,groupId);const {rows}=await tx.query('select id,group_id,name,color,is_active from public.v_activity_types where (group_id is null or group_id=$1) and ($2 or is_active) order by name,id limit 101 offset $3',[groupId,body.include_inactive,(body.page-1)*100]);return httpSchemas.ActivityTypes.parse({data:rows.slice(0,100),hasNext:rows.length>100});});
  }
  @Post('groups/:groupId/activity-types')
  async createType(@Req() req: AuthenticatedRequest,@Param() params: unknown,@Body() input: unknown) {
    const {groupId}=parse(httpSchemas.GroupParams,params),body=parse(httpSchemas.CreateActivityType,input);
    return this.run(req,async tx => {await requireMembership(tx,groupId,['ADMIN']);return httpSchemas.ActivityTypeSaved.parse((await typeQuery(tx,'insert into public.activity_types(group_id,name,color) values($1,$2,$3) returning id',[groupId,body.name,body.color])).rows[0]);});
  }
  @Patch('groups/:groupId/activity-types/:typeId')
  async updateType(@Req() req: AuthenticatedRequest,@Param() params: unknown,@Body() input: unknown) {
    const {groupId,typeId}=parse(httpSchemas.ActivityTypeParams,params),body=parse(httpSchemas.UpdateActivityType,input);
    return this.run(req,async tx => {await requireMembership(tx,groupId,['ADMIN']);const row=(await typeQuery(tx,'update public.activity_types set name=$1,color=$2,is_active=$3 where group_id=$4 and id=$5 returning id',[body.name,body.color,body.is_active,groupId,typeId])).rows[0];if(!row)throw new DomainException(404,'activity_type_not_found');return httpSchemas.ActivityTypeSaved.parse(row);});
  }
}
