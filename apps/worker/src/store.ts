import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import pg from 'pg';
import { WORKER_CONFIG, type WorkerConfig } from './config.js';
const roleSql = `select current_user='asisteam_jobs' and not r.rolsuper and not r.rolbypassrls and not r.rolcreaterole
  and not r.rolcreatedb and not r.rolreplication and not exists(select 1 from pg_auth_members where member=r.oid)
  and not has_schema_privilege(current_user,'public','CREATE') and not has_schema_privilege(current_user,'app_private','CREATE')
  and not exists(select 1 from pg_class c where c.relnamespace in ('public'::regnamespace,'app_private'::regnamespace,'auth'::regnamespace)
    and (c.relowner=r.oid or has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE')))
  and has_function_privilege(current_user,'app_private.worker_claim_transition()','EXECUTE') as safe
  from pg_roles r where rolname=current_user`;
const operations = {
  transition: 'select run_date::text,lease_token from app_private.worker_claim_transition()',
  complete: 'select app_private.worker_complete_transition($1::date,$2::uuid) as completed',
  email: 'select delivery_id,claim_token,email,full_name,audience,payload from app_private.worker_claim_email()',
  payload: 'select app_private.worker_email_payload($1::uuid,$2::uuid,$3::jsonb) as payload',
  finish: 'select app_private.worker_finish_email($1::uuid,$2::uuid,$3::boolean) as completed',
  metrics: 'select app_private.worker_metrics() as metrics',
} as const;
@Injectable()
export class WorkerStore implements OnApplicationShutdown {
  private readonly pool: pg.Pool;
  constructor(@Inject(WORKER_CONFIG) config: WorkerConfig) {
    this.pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 2, connectionTimeoutMillis: 2000, statement_timeout: 20000, query_timeout: 22000, application_name: 'asisteam-worker' });
    this.pool.on('error', () => {});
  }
  async call(operation: keyof typeof operations, values: unknown[] = []) {
    const client = await this.pool.connect();
    try {
      if ((await client.query(roleSql)).rows[0]?.safe !== true) throw new Error('Rol de worker inválido.');
      return (await client.query(operations[operation], values)).rows;
    } finally { client.release(); }
  }
  async onApplicationShutdown() { await this.pool.end(); }
}
