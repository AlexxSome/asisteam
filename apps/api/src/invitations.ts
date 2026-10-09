import { NativeAuth } from './native-auth.js';
import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Injectable, Param, Post, Query, Req, ServiceUnavailableException, UnauthorizedException, UseGuards, type OnApplicationShutdown } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import pg from 'pg';
import { z } from 'zod';
import type { Request } from 'express';
import { httpSchemas, invitationRegistrationSchema, INVITATION_TERMS_VERSION, MEMBERSHIP_ROLE_LABELS } from '@asisteam/core/runtime';
import { SessionGuard, type AuthenticatedRequest } from './auth.js';
import { Database, type AuthenticatedTransaction } from './database.js';
import { TransactionalEmail } from './email.js';
import { CONFIG, type RuntimeConfig } from './config.js';
import { DomainException, domainSqlError } from './domain-errors.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const secretMatches = (a: string, b: string) => timingSafeEqual(Buffer.from(hash(a),'hex'), Buffer.from(hash(b),'hex'));
function parse<S extends z.ZodTypeAny>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException();
  return result.data;
}
const statuses: Record<string, number> = { invitation_expired: 410, invitation_not_available: 404, authentication_required: 401, invalid_registration: 400, registration_failed: 422, guardian_consent_required: 422, birthdate_confirmation_required: 422, athlete_birthdate_required: 422, group_member_limit: 422, subscription_athlete_limit: 422, user_group_limit: 422, rate_limit: 429, unavailable: 503 };
function result(value: unknown) {
  if (value && typeof value === 'object' && 'error' in value && typeof value.error === 'string') throw new DomainException(statuses[value.error] ?? 503, value.error);
  return value;
}
const serviceRoleSql = `select current_user='asisteam_invitation' and not r.rolsuper and not r.rolbypassrls and not r.rolcreaterole and not r.rolcreatedb
  and not exists(select 1 from pg_auth_members where member=r.oid)
  and not has_schema_privilege(current_user,'public','CREATE') and not has_schema_privilege(current_user,'app_private','CREATE')
  and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private','auth')
    and (c.relowner=r.oid or has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE')))
  and has_function_privilege(current_user,'public.invitation_context(text)','EXECUTE') as safe from pg_roles r where rolname=current_user`;

@Injectable()
export class InvitationRegistrationStore implements OnApplicationShutdown {
  private readonly pool: pg.Pool | undefined;
  constructor(@Inject(CONFIG) config: RuntimeConfig) {
    if (config.INVITATION_DATABASE_URL) {
      this.pool = new pg.Pool({ connectionString: config.INVITATION_DATABASE_URL, max: 3, connectionTimeoutMillis: config.PG_CONNECT_TIMEOUT_MS, statement_timeout: config.PG_STATEMENT_TIMEOUT_MS });
      this.pool.on('error', () => {});
    }
  }
  async call(operation: 'context' | 'attempt' | 'prepare' | 'cancel' | 'registrationResult', values: unknown[]) {
    if (!this.pool) throw new ServiceUnavailableException();
    const sql = { context: 'select public.invitation_context($1) as data', attempt: 'select public.consume_invitation_attempt($1) as data', prepare: 'select public.prepare_invitation_registration($1,$2,$3,$4::jsonb) as data', cancel: 'select public.cancel_invitation_registration($1) as data', registrationResult: 'select public.invitation_registration_result($1,$2) as data' }[operation];
    const client = await this.pool.connect().catch(() => { throw new ServiceUnavailableException(); });
    try {
      if ((await client.query(serviceRoleSql)).rows[0]?.safe !== true) throw new ServiceUnavailableException();
      return (await client.query(sql, values)).rows[0]?.data;
    } catch (error) { return domainSqlError(error); }
    finally { client.release(); }
  }
  async onApplicationShutdown() { await this.pool?.end(); }
}

@Controller('api/v1')
export class InvitationsController {
  constructor(@Inject(NativeAuth) private readonly nativeAuth: NativeAuth, @Inject(Database) private readonly database: Database, @Inject(InvitationRegistrationStore) private readonly registrations: InvitationRegistrationStore, @Inject(CONFIG) private readonly config: RuntimeConfig, @Inject(TransactionalEmail) private readonly email: TransactionalEmail) {}
  private async run<T>(request: AuthenticatedRequest, operation: (tx: AuthenticatedTransaction) => Promise<T>) {
    try { return await this.database.authenticated(request.identity!, async tx => {
      if ((await tx.query('select public.has_account_consent() as accepted')).rows[0]?.accepted !== true) throw new DomainException(422, 'account_terms_required');
      return operation(tx);
    }); } catch (error) { return domainSqlError(error); }
  }
  private async attempt(request: Request, action: 'preview' | 'accept') {
    const secret = this.config.INVITATION_PROXY_SECRET, supplied = request.headers['x-asisteam-proxy'], ip = request.headers['x-asisteam-client-ip'];
    if (!secret) throw new ServiceUnavailableException();
    if (typeof supplied !== 'string' || !secretMatches(secret, supplied) || typeof ip !== 'string' || !ip || ip.length > 128) throw new UnauthorizedException();
    if (!(await this.registrations.call('attempt',[hash(`${secret}:${action}:${ip}`)]))) throw new DomainException(429,'rate_limit');
  }
  @Post('invitations/send') @UseGuards(SessionGuard)
  async send(@Req() request: AuthenticatedRequest, @Body() input: unknown) {
    const body = parse(httpSchemas.InvitationSend,input);
    const { RESEND_API_KEY: key, INVITATION_EMAIL_FROM: from, INVITATION_WEB_URL: origin } = this.config;
    if (!key || !from || !origin) throw new ServiceUnavailableException();
    const web = new URL(origin);
    if (web.username || web.password || web.pathname !== '/' || web.search || web.hash || !(web.protocol==='https:' || (this.config.NODE_ENV!=='production' && web.protocol==='http:' && ['127.0.0.1','localhost'].includes(web.hostname)))) throw new ServiceUnavailableException();
    const token = randomBytes(32).toString('hex');
    // Commit canonical issuance before external delivery: uncertain delivery must remain visible to ADMIN.
    const issued = await this.run(request, async tx => (await tx.query('select app_private.api_issue_invitation($1,$2,$3,$4,$5,$6) as data', [body.group_id,hash(token),body.action==='send'?body.email:null,body.action==='send'?body.role:null,body.action==='resend'?body.invitation_id:null,body.action==='activate'?body.membership_id:null])).rows[0]?.data);
    const delivery = z.object({ id:z.string().uuid(),status:z.literal('PENDING'),expires_at:z.string(),email:z.string(),group_name:z.string(),role:z.enum(['ATHLETE','GUARDIAN']) }).parse(issued);
    const invitation = httpSchemas.InvitationSent.parse({invitation:{id:delivery.id,status:delivery.status,expires_at:delivery.expires_at}});
    try {
      await this.email.send(this.email.payload(delivery.email, 'Invitación a Asisteam', `Te invitaron al grupo ${delivery.group_name} como ${MEMBERSHIP_ROLE_LABELS[delivery.role]}.\n\nAcepta la invitación en este enlace:\n${new URL('/invitations/'+token,web).href}\n\nEl enlace vence en 7 días y es de un solo uso. Si recibiste un reenvío, el enlace anterior ya no funciona.\n\nSi no esperabas esta invitación, puedes ignorar este correo.`), 'invitation-' + delivery.id);
    } catch { throw new DomainException(503,'email_delivery_failed'); }
    return invitation;
  }
  @Post('invitations/preview') @HttpCode(200)
  async preview(@Req() request: Request,@Body() input:unknown) {
    const body=parse(httpSchemas.InvitationToken,input);await this.attempt(request,'preview');
    const context=z.object({group_name:z.string(),role:z.enum(['ATHLETE','GUARDIAN']),managed_activation:z.boolean().optional()}).parse(result(await this.registrations.call('context',[hash(body.token)])));
    return httpSchemas.InvitationPreview.parse({group_name:context.group_name,role:context.role,...(context.managed_activation?{managed_activation:true}:{})});
  }
  @Post('invitations/accept') @HttpCode(200) @UseGuards(SessionGuard)
  async accept(@Req() request: AuthenticatedRequest,@Body() input:unknown) {
    const body=parse(httpSchemas.InvitationToken,input);await this.attempt(request,'accept');
    const accepted=await this.run(request,async tx=>(await tx.query('select app_private.api_accept_invitation($1) as data',[hash(body.token)])).rows[0]?.data);
    // JSON business errors are handled AFTER COMMIT, preserving EXPIRED/attempt counters.
    return httpSchemas.InvitationAccepted.parse(result(accepted));
  }
  @Post('invitations/register') @HttpCode(200)
  register(@Req() request: Request,@Body() input:unknown) { return this.createAccount(request,input,false); }
  @Post('invitations/claim') @HttpCode(200)
  claim(@Req() request: Request,@Body() input:unknown) { return this.createAccount(request,input,true); }
  private async createAccount(request: Request,input:unknown,claim:boolean) {
    const body=parse(claim?httpSchemas.InvitationClaim:httpSchemas.InvitationRegistration,input);
    await this.attempt(request,'accept');
    if (!this.config.NATIVE_AUTH_SECRET) throw new ServiceUnavailableException();
    return httpSchemas.InvitationAccepted.parse(await this.nativeAuth.register(body.registration, { token: body.token, claim }));
  }
  @Get('groups/:groupId/invitations') @UseGuards(SessionGuard)
  async list(@Req() request:AuthenticatedRequest,@Param() params:unknown,@Query() query:Record<string,unknown>) {
    const {groupId}=parse(httpSchemas.GroupParams,params),body=parse(httpSchemas.InvitationQuery,{...query,...(typeof query.page==='string'&&/^\d+$/.test(query.page)?{page:Number(query.page)}:{})});
    return this.run(request,async tx=>{
      if((await tx.query('select public.is_group_admin($1) as allowed',[groupId])).rows[0]?.allowed!==true)throw new DomainException(404,'group_not_found');
      const data=(await tx.query('select id,email,role,status,expires_at::text,created_at::text from public.invitations where group_id=$1 order by created_at desc,id desc limit 10 offset $2',[groupId,(body.page-1)*10])).rows.map(row=>({...row,expires_at:new Date(row.expires_at).toISOString(),created_at:new Date(row.created_at).toISOString()}));
      const total=Number((await tx.query('select count(id) as n from public.invitations where group_id=$1',[groupId])).rows[0]?.n);
      return httpSchemas.Invitations.parse({data,total});
    });
  }
  @Post('groups/:groupId/memberships/:membershipId/activation') @UseGuards(SessionGuard)
  async requestActivation(@Req() request:AuthenticatedRequest,@Param() params:unknown,@Body() input:unknown){const p=parse(httpSchemas.MemberParams,params);parse(httpSchemas.Empty,input??{});return this.run(request,async tx=>httpSchemas.ActivationRequested.parse((await tx.query('select public.request_managed_activation($1,$2) as status',[p.groupId,p.membershipId])).rows[0]));}
  @Post('activation-requests/:requestId') @UseGuards(SessionGuard)
  async reviewActivation(@Req() request:AuthenticatedRequest,@Param() params:unknown,@Body() input:unknown){const p=parse(httpSchemas.ReviewParams,params),body=parse(httpSchemas.ActivationReview,input);return this.run(request,async tx=>httpSchemas.ActivationReviewed.parse((await tx.query('select public.review_managed_activation($1,$2) as data',[p.requestId,body.accepted])).rows[0]?.data));}
  @Get('groups/:groupId/activation-requests') @UseGuards(SessionGuard)
  async activations(@Req() request:AuthenticatedRequest,@Param() params:unknown,@Query() query:Record<string,unknown>){const p=parse(httpSchemas.GroupParams,params),body=parse(httpSchemas.ActivationQuery,{...query,...(typeof query.page==='string'&&/^\d+$/.test(query.page)?{page:Number(query.page)}:{})});return this.run(request,async tx=>httpSchemas.Activations.parse({data:(await tx.query('select request_id,membership_id,full_name,relationship,status,total_count from public.list_managed_activation_requests($1,$2,$3)',[p.groupId,(body.page-1)*50,body.athlete_user_id??null])).rows.map(row=>({...row,total_count:Number(row.total_count)}))}));}
}
