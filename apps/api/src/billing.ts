import { Body, Controller, Get, HttpCode, Inject, Injectable, Param, Post, Query, Req, Res, ServiceUnavailableException, UseGuards, type OnApplicationShutdown } from '@nestjs/common';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import pg from 'pg';
import { createMercadoPago, createMercadoPagoWebhookHandler, createSubscriptionBillingHandler, httpSchemas, BILLING_ERROR_MESSAGES } from '@asisteam/core/runtime';
import { CONFIG, type RuntimeConfig } from './config.js';
import { Database } from './database.js';
import { SessionGuard, type AuthenticatedRequest } from './auth.js';
import { requireMembership } from './authorization.js';
import { DomainException, domainSqlError } from './domain-errors.js';

const operations: Record<string, {sql:string; args:string[]}> = {
  begin_subscription_checkout: {sql:'select app_private.begin_subscription_checkout($1,$2,$3) as data',args:['p_group_id','p_actor_auth_id','p_plan_code']},
  get_subscription_context: {sql:'select app_private.get_subscription_context($1,$2) as data',args:['p_group_id','p_actor_auth_id']},
  lookup_billing_subscription: {sql:'select app_private.lookup_billing_subscription($1) as data',args:['p_subscription_id']},
  claim_subscription_creation: {sql:'select app_private.claim_subscription_creation($1) as data',args:['p_subscription_id']},
  reject_subscription_creation: {sql:'select app_private.reject_subscription_creation($1) as data',args:['p_subscription_id']},
  sync_group_subscription: {sql:'select app_private.sync_group_subscription($1,$2,$3,$4,$5,$6) as data',args:['p_subscription_id','p_provider_id','p_status','p_provider_updated_at','p_next_payment_at','p_checkout_url']},
  sync_subscription_invoice: {sql:'select app_private.sync_subscription_invoice($1,$2,$3,$4,$5,$6,$7,$8,$9) as data',args:['p_provider_subscription_id','p_invoice_id','p_due_at','p_amount_clp','p_currency','p_status','p_payment_id','p_paid_at','p_provider_updated_at']},
};
const safeRole = `select current_user='asisteam_billing' and not r.rolsuper and not r.rolbypassrls and not r.rolcreaterole and not r.rolcreatedb and not r.rolreplication
  and not exists(select 1 from pg_auth_members where member=r.oid)
  and not has_schema_privilege(current_user,'public','CREATE') and not has_schema_privilege(current_user,'app_private','CREATE')
  and not exists(select 1 from pg_class c where c.relnamespace in ('public'::regnamespace,'app_private'::regnamespace,to_regnamespace('auth'))
    and (c.relowner=r.oid or has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE')))
  and has_function_privilege(current_user,'app_private.claim_subscription_creation(uuid)','EXECUTE') as safe from pg_roles r where rolname=current_user`;

@Injectable()
export class BillingStore implements OnApplicationShutdown {
  private readonly pool?: pg.Pool;
  constructor(@Inject(CONFIG) config:RuntimeConfig) {
    if(config.BILLING_DATABASE_URL) {
      this.pool=new pg.Pool({connectionString:config.BILLING_DATABASE_URL,max:3,connectionTimeoutMillis:config.PG_CONNECT_TIMEOUT_MS,statement_timeout:config.PG_STATEMENT_TIMEOUT_MS,query_timeout:config.PG_STATEMENT_TIMEOUT_MS});
      this.pool.on('error',()=>{});
    }
  }
  async rpc(name:string,args:Record<string,unknown>) {
    const operation=operations[name];
    if(!this.pool || !operation) return {data:null,error:{message:'billing_unavailable'}};
    const client=await this.pool.connect().catch(()=>undefined);
    if(!client)return {data:null,error:{message:'billing_unavailable'}};
    try {
      if((await client.query(safeRole)).rows[0]?.safe!==true)throw new ServiceUnavailableException();
      return {data:(await client.query(operation.sql,operation.args.map(key=>args[key]))).rows[0]?.data,error:null};
    }catch(error){
      const code=error instanceof Error && Object.hasOwn(BILLING_ERROR_MESSAGES,error.message)?error.message:'billing_unavailable';
      return {data:null,error:{message:code}};
    }finally{client.release();}
  }
  async onApplicationShutdown(){await this.pool?.end();}
}

@Controller('api/v1')
export class BillingController {
  constructor(@Inject(Database) private readonly database:Database,@Inject(BillingStore) private readonly store:BillingStore,@Inject(CONFIG) private readonly config:RuntimeConfig){}
  private options(authId?:string) {
    const c=this.config;
    return {client:{rpc:this.store.rpc.bind(this.store),auth:{getUser:async()=>({data:{user:authId?{id:authId}:null},error:null})}},provider:createMercadoPago(c.MERCADOPAGO_ACCESS_TOKEN??''),collectorId:c.MERCADOPAGO_COLLECTOR_ID??'',webUrl:(c.BILLING_WEB_URL??'').replace(/\/$/,''),webhookUrl:c.BILLING_WEBHOOK_URL??'',webhookSecret:c.MERCADOPAGO_WEBHOOK_SECRET??'',allowedOrigins:[],enabled:!!(c.BILLING_DATABASE_URL&&c.MERCADOPAGO_ACCESS_TOKEN&&c.MERCADOPAGO_WEBHOOK_SECRET&&c.MERCADOPAGO_COLLECTOR_ID&&c.BILLING_WEB_URL&&c.BILLING_WEBHOOK_URL)};
  }
  private async authorized(request:AuthenticatedRequest,groupId:string) {
    try{return await this.database.authenticated(request.identity!,async tx=>{
      if((await tx.query('select public.has_account_consent() as accepted')).rows[0]?.accepted!==true)throw new DomainException(422,'account_terms_required');
      await requireMembership(tx,groupId,['ADMIN']);
      return;
    });}catch(error){return domainSqlError(error);}
  }
  @Get('groups/:groupId/billing') @UseGuards(SessionGuard)
  async summary(@Req() request:AuthenticatedRequest,@Param() params:unknown,@Query() query:Record<string,unknown>) {
    const p=httpSchemas.GroupParams.safeParse(params),q=httpSchemas.BillingQuery.safeParse({...query,...(typeof query.page==='string'&&/^\d+$/.test(query.page)?{page:Number(query.page)}:{})});
    if(!p.success||!q.success)throw new DomainException(400,'invalid_billing_request');
    try{return await this.database.authenticated(request.identity!,async tx=>{
      if((await tx.query('select public.has_account_consent() as accepted')).rows[0]?.accepted!==true)throw new DomainException(422,'account_terms_required');
      await requireMembership(tx,p.data.groupId,['ADMIN']);
      return httpSchemas.BillingSummary.parse((await tx.query('select public.get_group_billing($1,$2) as data',[p.data.groupId,q.data.page])).rows[0]?.data);
    });}catch(error){return domainSqlError(error);}
  }
  @Post('billing/subscriptions') @HttpCode(200) @UseGuards(SessionGuard)
  async manage(@Req() request:AuthenticatedRequest,@Body() input:unknown,@Res() response:ExpressResponse) {
    const parsed=httpSchemas.BillingRequest.safeParse(input);
    if(!parsed.success)throw new DomainException(400,'invalid_billing_request');
    await this.authorized(request,parsed.data.group_id);
    const result=await createSubscriptionBillingHandler(this.options(request.identity!.authUserId))(new Request('https://asisteam.invalid/billing',{method:'POST',headers:{authorization:'Bearer verified-session'},body:JSON.stringify(parsed.data)}));
    response.status(result.status).json(await result.json());
  }
  @Post('billing/mercadopago-webhook') @HttpCode(200)
  async webhook(@Req() request:ExpressRequest,@Body() body:unknown,@Res() response:ExpressResponse) {
    const headers=new Headers();
    for(const key of ['x-signature','x-request-id']){const value=request.headers[key];if(typeof value==='string')headers.set(key,value);}
    const result=await createMercadoPagoWebhookHandler(this.options())(new Request('https://asisteam.invalid'+request.originalUrl,{method:'POST',headers,body:JSON.stringify(body)}));
    if(result.status===200)response.status(200).end();else response.status(result.status).json(await result.json());
  }
}
