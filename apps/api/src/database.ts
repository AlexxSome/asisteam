import { Inject, Injectable, type OnApplicationShutdown, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import pg from 'pg';
import { CONFIG, type RuntimeConfig } from './config.js';
import { isVerifiedIdentity, type VerifiedIdentity } from './identity.js';
import { SafeLogger } from './logger.js';

export type AuthenticatedTransaction = Readonly<{
  userId: string;
  query: <R extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, values?: unknown[]) => Promise<pg.QueryResult<R>>;
}>;

const runtimeRoleSql = `
  select current_user = 'asisteam_api'
    and not r.rolsuper and not r.rolbypassrls
    and not r.rolcreaterole and not r.rolcreatedb and not r.rolreplication
    and not exists (select 1 from pg_roles forbidden where forbidden.rolname in ('service_role','asisteam_migrator') and pg_has_role(current_user, forbidden.oid, 'MEMBER'))
    and not has_schema_privilege(current_user, 'public', 'CREATE')
    and not has_schema_privilege(current_user, 'app_private', 'CREATE')
    and has_function_privilege(current_user, 'app_private.native_session_user_id(uuid)', 'EXECUTE')
    and not exists (
      select 1 from pg_class c
      where c.relnamespace in ('public'::regnamespace, 'app_private'::regnamespace)
        and pg_has_role(current_user, c.relowner, 'USAGE')
    ) as safe
  from pg_roles r where r.rolname = current_user
`;

@Injectable()
export class Database implements OnApplicationShutdown {
  private readonly pool: pg.Pool;
  private draining = false;
  constructor(@Inject(CONFIG) private readonly config: RuntimeConfig, @Inject(SafeLogger) private readonly logger: SafeLogger) {
    this.pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
      max: config.PG_POOL_MAX,
      connectionTimeoutMillis: config.PG_CONNECT_TIMEOUT_MS,
      idleTimeoutMillis: 10000,
      statement_timeout: config.PG_STATEMENT_TIMEOUT_MS,
      query_timeout: config.PG_STATEMENT_TIMEOUT_MS,
      application_name: 'asisteam-api',
    });
    this.pool.on('error', () => this.logger.event('error', 'database_unavailable'));
  }
  async authenticated<T>(identity: VerifiedIdentity, operation: (transaction: AuthenticatedTransaction) => Promise<T>): Promise<T> {
    if (!isVerifiedIdentity(identity) || identity.provider !== 'nest' || identity.expiresAt <= Math.floor(Date.now() / 1000)) throw new UnauthorizedException();
    if (this.draining) throw new ServiceUnavailableException();
    const client = await this.pool.connect().catch(() => { throw new ServiceUnavailableException(); });
    let destroy = false;
    let active = false;
    try {
      await client.query('BEGIN');
      if (this.config.NATIVE_AUTH_SECRET && (await client.query('select app_private.auth_is_native() as native')).rows[0]?.native !== true) throw new ServiceUnavailableException();
      const { rows: [role] } = await client.query<{ safe: boolean }>(runtimeRoleSql);
      if (!role?.safe) throw new ServiceUnavailableException();
      // Erase legacy per-claim GUCs too: auth.uid() prefers claim.sub over JSON.
      await client.query(`select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', '', true), set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: identity.authUserId, role: 'authenticated', session_id: identity.sessionId, auth_provider: 'nest' })]);
      const { rows: [profile] } = await client.query<{ user_id: string | null }>('select app_private.native_session_user_id($1::uuid) as user_id', [identity.sessionId]);
      if (!profile?.user_id) throw new UnauthorizedException();
      active = true;
      const transaction: AuthenticatedTransaction = Object.freeze({ userId: profile.user_id, query: <R extends pg.QueryResultRow>(sql: string, values?: unknown[]) => {
        if (!active) return Promise.reject(new Error('La transacción ya terminó.'));
        return client.query<R>(sql, values);
      } });
      const result = await operation(transaction);
      active = false;
      if (identity.expiresAt <= Math.floor(Date.now() / 1000)) throw new UnauthorizedException();
      const { rows: [stillValid] } = await client.query<{ user_id: string | null }>('select app_private.native_session_user_id($1::uuid) as user_id', [identity.sessionId]);
      if (stillValid?.user_id !== profile.user_id) throw new UnauthorizedException();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      active = false;
      try { await client.query('ROLLBACK'); } catch { destroy = true; }
      throw error;
    } finally { client.release(destroy); }
  }
  async ready(): Promise<boolean> {
    if (this.draining) return false;
    try {
      if (this.config.NATIVE_AUTH_SECRET && (await this.pool.query('select app_private.auth_is_native() as native')).rows[0]?.native !== true) return false;
      const { rows: [role] } = await this.pool.query<{ safe: boolean }>(this.config.NATIVE_AUTH_SECRET ? runtimeRoleSql : 'SELECT true as safe');
      return !!role?.safe && !this.draining;
    } catch {
      return false;
    }
  }
  async onApplicationShutdown() {
    this.draining = true;
    await this.pool.end();
  }
}
