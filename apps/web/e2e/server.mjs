import { startQaNest } from './nest-runtime.mjs';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import {nativeBrowserDatabase} from '../../api/test/native-browser-database.mjs';
import {randomUUID} from 'node:crypto';
import { roles, email, password, id, groups, activity, rosterName, pendingName, wardName, inviteCode } from './data.mjs';

// Every run owns a fresh database; never reads deployment credentials.
const config=await nativeBrowserDatabase();
const sql = statement => {
  try {
    return execFileSync('docker', ['exec', '-i', config.name, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], {
      input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const code = String(error.stderr).match(/ERROR:\s+([a-z_]+)/)?.[1] ?? 'sql_error';
    throw new Error(`Fixture QA local: ${code}`);
  }
};
const profiles = {};
for (const role of roles) {
  const subject=randomUUID();
  sql(`insert into app_private.auth_subjects(id,email,native_owned) values('${subject}','${email(role)}',true);
    insert into app_private.auth_credentials(subject_id,password_hash) values('${subject}',extensions.crypt('${password}',extensions.gen_salt('bf',4)));
    insert into public.users(auth_user_id,email,full_name,birthdate,account_status) values('${subject}','${email(role)}','Persona QA ${role}','1990-01-01','ACTIVE');`);
  profiles[role] = sql(`select id from public.users where email='${email(role)}';`);
  // Version is the same as the legal notice rendered by the existing app.
  sql(`insert into public.account_consents(user_id,terms_version,channel)
    select '${profiles[role]}','2026-09-21','IN_APP' where not exists
    (select 1 from public.account_consents where user_id='${profiles[role]}' and terms_version='2026-09-21');`);
}
// Refuse to overwrite a namespace owned by anything other than this fixture.
if (sql(`select count(*) from public.groups where id in (${Object.values(groups).map(value => `'${value}'`).join(',')}) and created_by<>'${profiles.admin}';`) !== '0') {
  throw new Error('El namespace QA ya pertenece a otro usuario');
}
for (const [index, [kind, group]] of Object.entries(groups).entries()) {
  sql(`insert into public.groups(id,name,sport,invite_code,created_by)
    values('${group}','Club QA ${kind}','Tenis','${inviteCode(index)}','${profiles.admin}') on conflict(id) do nothing;
    update public.groups set created_at=now()-interval '100 days' where id='${group}';
    insert into public.memberships(user_id,group_id,role,status,joined_at)
    values('${profiles.admin}','${group}','ADMIN','ACTIVE',now()-interval '90 days') on conflict(user_id,group_id,role) do nothing;
    insert into public.memberships(user_id,group_id,role,status,joined_at)
    values('${profiles.multi}','${group}','ADMIN','ACTIVE',now()-interval '90 days') on conflict(user_id,group_id,role) do nothing;
    insert into public.group_subscriptions(id,group_id,plan_code,amount_clp,athlete_limit,requested_by,status,activated_at)
    values('${id(300+index)}','${group}','ACADEMY',15990,1000,'${profiles.admin}','AUTHORIZED',now()) on conflict(id) do nothing;
    insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by)
    values('${activity(group)}','${group}','b2c3d4e5-0001-4b3c-8d4e-111111111111','Entrenamiento QA',date_trunc('day',now())-interval '1 day',date_trunc('day',now())-interval '23 hours','${profiles.admin}')
    on conflict(id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at;`);
}
// Adults without credentials fill the roster; avoid synthetic third-party PII.
sql(`insert into public.users(id,full_name,birthdate,account_status) values ${Array.from({ length: 500 }, (_, index) => `('${id(1001+index)}','${rosterName(index+1)}','1990-01-01','MANAGED')`).join(',')} on conflict(id) do nothing;`);
for (const [kind, count] of [['single', 1], ['fifty', 50], ['large', 500]]) {
  const group = groups[kind];
  // Counts refer to ATHLETE rows; administrative memberships are additional.
  sql(`insert into public.memberships(user_id,group_id,role,status,joined_at)
    select id,'${group}','ATHLETE','ACTIVE',now()-interval '90 days' from public.users
    where id between '${id(1001)}' and '${id(1000+count)}' on conflict(user_id,group_id,role) do nothing;`);
}
for (const [role, membership] of [['athlete','ATHLETE'], ['coach','COACH'], ['multi','ATHLETE']]) {
  sql(`insert into public.memberships(user_id,group_id,role,status,joined_at)
    values('${profiles[role]}','${groups.fifty}','${membership}','ACTIVE',now()-interval '90 days') on conflict(user_id,group_id,role) do nothing;`);
}
// Keep the 50-row group exact, with accounts and a ward replacing three fillers.
sql(`update public.memberships set status='INACTIVE' where group_id='${groups.fifty}' and user_id in ('${id(1048)}','${id(1049)}','${id(1050)}');
  insert into public.users(id,full_name,birthdate,account_status) values
  ('${id(2001)}','${wardName}',(current_date-interval '15 years')::date,'MANAGED'),
  ('${id(2002)}','${pendingName}',(current_date-interval '15 years')::date,'MANAGED') on conflict(id) do nothing;
  insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship)
  values('${id(2101)}','${profiles.guardian}','${id(2001)}','Tutor') on conflict(guardian_user_id,athlete_user_id) do nothing;
  insert into public.consents(guardianship_id,consent_type,terms_version,channel)
  select '${id(2101)}','DATA_PROCESSING_MINOR','2026-09-21','IN_APP' where not exists(select 1 from public.consents where guardianship_id='${id(2101)}' and revoked_at is null);
  insert into public.memberships(user_id,group_id,role,status,joined_at) values
  ('${id(2001)}','${groups.fifty}','ATHLETE','ACTIVE',now()-interval '90 days'),
  ('${id(2002)}','${groups.fifty}','ATHLETE','PENDING',null) on conflict(user_id,group_id,role) do nothing;
  insert into public.memberships(user_id,group_id,role,status,joined_at)
  values('${profiles.guardian}','${groups.fifty}','GUARDIAN','ACTIVE',now()-interval '90 days') on conflict(user_id,group_id,role) do nothing;
  delete from public.attendance_records where activity_id in (${Object.values(groups).map(group => `'${activity(group)}'`).join(',')});`);

// Canonical history: 6 PRESENT + 1 LATE + 2 ABSENT + 1 EXCUSED = 77.8%.
// The domain computes metrics; fixtures only provide the ten recorded states.
for (const [index, status] of ['PRESENT','PRESENT','PRESENT','PRESENT','PRESENT','PRESENT','LATE','ABSENT','ABSENT','EXCUSED'].entries()) {
  sql(`insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by)
    values('${id(10000+index)}','${groups.fifty}','b2c3d4e5-0001-4b3c-8d4e-111111111111','Historial QA ${index+1}',
    now()-interval '${12-index} days',now()-interval '${12-index} days'+interval '1 hour','${profiles.admin}')
    on conflict(id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at;
    insert into public.attendance_records(activity_id,membership_id,status,recorded_by)
    select '${id(10000+index)}',id,'${status}','${profiles.admin}' from public.memberships
    where group_id='${groups.fifty}' and role='ATHLETE' and status='ACTIVE'
    on conflict(activity_id,membership_id) do update set status=excluded.status;`);
}

// QA caches/metadata are outside .next, isolated from production builds.
// Start only this owned cache fresh.
rmSync('.qa/app', { recursive: true, force: true });
mkdirSync('.qa', { recursive: true, mode:0o700 });
const status = { loginPost: false, registerPost: false, actionArguments: false, sensitivePayload: false, token: false, sensitiveUrl: false, qrPayload: false, requests: 0 };
const persist = () => {
  // next build clears .next; a supervised QA server must not crash on logging.
  mkdirSync('.qa', { recursive: true, mode:0o700 });
  writeFileSync('.qa/log-check.json', JSON.stringify(status, null, 2));
};
persist();
// Capture raw output only in memory. Reports retain booleans, never payloads.
let tail = '';
let ready = false;
function inspect(chunk) {
  const text = tail + chunk.toString();
  if (!ready) {
    const startup = chunk.toString().replaceAll(password, '[redacted]').replace(/[\w.+-]+@[\w.-]+/g, '[email]').replace(/eyJ[A-Za-z0-9_.-]+/g, '[token]');
    process.stdout.write(startup);
  }
  ready ||= /Ready in/.test(text);
  status.loginPost ||= /POST \/login\b/.test(text);
  status.registerPost ||= /POST \/register\b/.test(text);
  status.actionArguments ||= /ƒ\s*(?:loginUser|registerUser)\s*\(/.test(text);
  status.sensitivePayload ||= text.includes(password) || /qa(?:100|120)-[\w-]+@qa(?:100|120)\.example\.test/.test(text) || text.includes('QA120 Log Probe');
  status.qrPayload ||= /(?:[0-9a-f]{64}|activity_id=[0-9a-f-]+&token=)/i.test(text);
  status.token ||= /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(text);
  status.sensitiveUrl ||= /(?:GET|POST) \/(?:invitations\/[0-9a-f]{32,}|[^\s]*\?[^\s]*(?:token|token_hash|code|search|next)=)/.test(text);
  status.requests += (chunk.toString().match(/(?:GET|POST) \/[^\s]* \d{3}/g) ?? []).length;
  tail = text.slice(-4096);
  persist();
}
const nest = await startQaNest(config);
writeFileSync('.qa/native-runtime.json',JSON.stringify(nest.runtime),{mode:0o600});
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3120'], {
  env: { ...process.env, ...nest.env,
    NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3120', ASISTEAM_SITE_URL: 'http://127.0.0.1:3120', NEXT_TELEMETRY_DISABLED: '1', ASISTEAM_QA: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', inspect); child.stderr.on('data', inspect);
console.log('QA: fixtures locales listos; diagnósticos privados reducidos a indicadores.');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  await nest.stop();
  await config.cleanup();
  child.kill(signal);
});
child.on('exit', async code => {
  await nest.stop();
  await config.cleanup();
  if (code && !status.sensitivePayload && !status.token && !status.sensitiveUrl && !status.qrPayload) console.error(tail.replace(/[\w.+-]+@[\w.-]+/g, '[email]'));
  process.exit(code ?? 1);
});
