import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { email, id, password, fixtureFlowCode } from './data.mjs';

// Server-side test utilities only: no credentials in browser, logs or reports.
/** @param {string} statement */
export function sql(statement) {
  try {
    return execFileSync('docker', ['exec', '-i', 'supabase_db_asisteam', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'],
      { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    const code = String(error.stderr).match(/ERROR:\s+([a-z_]+)/)?.[1] ?? 'sql_error';
    throw new Error(`Fixture local: ${code}`);
  }
}
/** @param {string} value */
export const quote = (value) => `'${value.replaceAll("'", "''")}'`;
export const flowGroup = id(5000);
export const flowCode = fixtureFlowCode;
export const activityType = 'b2c3d4e5-0001-4b3c-8d4e-111111111111';

export function localConfig() {
  const config = JSON.parse(execFileSync('../../node_modules/.bin/supabase', ['status', '-o', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  if (!['127.0.0.1', 'localhost'].includes(new URL(config.API_URL).hostname)) throw new Error('Solo se admite Supabase local');
  return config;
}

/** @param {string} role */
export async function actor(role) {
  const config = localConfig();
  const client = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  if ((await client.auth.signInWithPassword({ email: email(role), password })).error) throw new Error('No se pudo iniciar sesión sintética');
  return client;
}

export function prepareFlowGroup() {
  const owner = sql(`select id from public.users where email=${quote(email('admin'))}`);
  if (!owner) throw new Error('Ejecutar el servidor QA para preparar las cuentas');
  if (sql(`select count(*) from public.groups where id='${flowGroup}' and created_by<>'${owner}'`) !== '0') throw new Error('Namespace QA ocupado');
  sql(`insert into public.groups(id,name,sport,invite_code,created_by) values
    ('${flowGroup}','Club QA cierre de épica','Tenis','${flowCode}','${owner}') on conflict(id) do nothing;
    insert into public.memberships(user_id,group_id,role,status)
      select id,'${flowGroup}',case when email=${quote(email('admin'))} then 'ADMIN' else 'GUARDIAN' end,'ACTIVE'
      from public.users where email in (${quote(email('admin'))},${quote(email('guardian'))})
      on conflict(user_id,group_id,role) do nothing;
    insert into public.group_subscriptions(id,group_id,plan_code,amount_clp,athlete_limit,requested_by,status,activated_at)
    values('${id(5001)}','${flowGroup}','ACADEMY',15990,1000,'${owner}','AUTHORIZED',now()) on conflict(id) do nothing;
    insert into public.memberships(user_id,group_id,role,status,joined_at)
      values('${id(1001)}','${flowGroup}','ATHLETE','ACTIVE',now()-interval '90 days')
      on conflict(user_id,group_id,role) do nothing;`);
}
