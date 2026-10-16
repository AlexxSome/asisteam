// Accepted development workload; synthetic records remain in this owned dataset.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { command } from '../../packages/db/scripts/local.mjs';
import { ApiClient } from '../../packages/api-client/dist/index.js';
process.chdir(new URL('../../', import.meta.url).pathname);
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url)), pg = require('pg');
const directory = '.qa/issue-209/', secret = JSON.parse(readFileSync(directory + 'secrets.json'));
const account = JSON.parse(readFileSync(directory + 'accounts.json'))[0];
const { groupA } = JSON.parse(readFileSync(directory + 'marker.json'));
const owner = new pg.Client({ connectionString: `postgresql://postgres:${secret.owner}@127.0.0.1:5449/asisteam_dev209` });
const pool = new pg.Pool({ connectionString: `postgresql://asisteam_api:${secret.passwords.asisteam_api}@127.0.0.1:5449/asisteam_dev209`, max: 2 });
const save = (name, data) => writeFileSync(directory + name, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
try {
  const inspected = JSON.parse(await command('docker', ['inspect', 'asisteam-dev209-postgres']))[0];
  assert.equal(inspected.Config.Labels['asisteam.development.issue'], '209');
  await owner.connect();
  if (!existsSync(directory + 'load-state.json')) {
    const activities = [];
    await owner.query('begin');
    try {
      // This is a synthetic plan fixture, never a real payment or provider receipt.
      await owner.query("insert into public.group_subscriptions(id,group_id,plan_code,amount_clp,athlete_limit,requested_by,status,activated_at) values($1,$2,'ACADEMY',15990,1000,$3,'AUTHORIZED',now())", [randomUUID(), groupA, account.user]);
      const users = (await owner.query("insert into public.users(full_name,birthdate,account_status) select 'Carga sintética DEV209 '||n,'1990-01-01','MANAGED' from generate_series(1,500) n returning id")).rows.map(row => row.id);
      await owner.query("insert into public.memberships(user_id,group_id,role,status,joined_at) select unnest($1::uuid[]),$2,'ATHLETE','ACTIVE',now()-interval '60 days'", [users, groupA]);
      for (const status of ['PRESENT','PRESENT','PRESENT','PRESENT','PRESENT','PRESENT','LATE','ABSENT','ABSENT','EXCUSED']) {
        const id = randomUUID(); activities.push(id);
        await owner.query("insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values($1,$2,'b2c3d4e5-0001-4b3c-8d4e-111111111111','Carga sintética DEV209',now()-interval '1 day',now()-interval '23 hours',$3)", [id, groupA, account.user]);
        await owner.query("insert into public.attendance_records(activity_id,membership_id,status,recorded_by) select $1,id,$2,$3 from public.memberships where group_id=$4 and role='ATHLETE' and status='ACTIVE'", [id, status, account.user, groupA]);
      }
      await owner.query('commit'); save('load-state.json', { activities });
    } catch (error) { await owner.query('rollback'); throw error; }
  }
  const state = JSON.parse(readFileSync(directory + 'load-state.json'));
  assert.equal((await owner.query("select count(*)::int as n from public.memberships where group_id=$1 and role='ATHLETE' and status='ACTIVE'", [groupA])).rows[0].n, 500);
  assert.equal((await owner.query('select count(*)::int as n from public.attendance_records where activity_id=any($1)', [state.activities])).rows[0].n, 5000);
  await owner.query('analyze');
  const login = await fetch('http://127.0.0.1:3049/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-asisteam-auth-proxy': secret.proxy, 'x-asisteam-client-ip': randomUUID() }, body: JSON.stringify({ email: account.email, password: account.password }) });
  assert.equal(login.status, 200); const session = await login.json();
  const claims = JSON.parse(Buffer.from(session.access_token.split('.')[1], 'base64url'));
  const api = new ApiClient({ origin: 'http://127.0.0.1:3049', accessToken: async () => session.access_token });
  const queries = { report: ['select public.get_group_attendance_report($1,$2,$3::date,$4::date,$5::uuid[],$6,$7,$8,$9) as result', [groupA, 'season', null, null, [], false, 1, 100, 'name']], stats: ['select public.get_group_stats($1,$2,$3) as result', [groupA, 1, 100]] };
  const sql = async operation => {
    const client = await pool.connect();
    try { await client.query('begin'); await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: claims.sub, session_id: claims.session_id, role: 'authenticated', auth_provider: 'nest' })]); return (await client.query(...queries[operation])).rows[0].result; }
    finally { try { await client.query('rollback'); } finally { client.release(); } }
  };
  const http = operation => api[operation === 'report' ? 'getGroupAttendanceReport' : 'getGroupStats']({ params: { groupId: groupA }, query: { ...(operation === 'report' ? { period: 'season', sort: 'name' } : {}), page_size: 100 } });
  const rows = [], resourceSample = async () => JSON.parse((await command('docker', ['stats', '--no-stream', '--format', '{{json .}}', 'asisteam-dev209-postgres'])).trim());
  const before = await resourceSample();
  for (const operation of ['report', 'stats']) {
    const expected = await sql(operation); assert.deepEqual(await http(operation), expected);
    for (const transport of ['canonical-sql', 'nest-http']) for (const concurrency of [1, 4]) {
      const samples = [];
      for (let n = 0; n < 24; n += concurrency) await Promise.all(Array.from({ length: concurrency }, async () => { const start = performance.now(); assert.deepEqual(await (transport === 'canonical-sql' ? sql(operation) : http(operation)), expected); samples.push(performance.now() - start); }));
      samples.sort((a,b) => a-b); const percentile = fraction => Number(samples[Math.ceil(samples.length * fraction) - 1].toFixed(2));
      const row = { operation, transport, concurrency, requests: samples.length, errors: 0, p50Ms: percentile(.5), p95Ms: percentile(.95) }; assert.ok(row.p95Ms <= 500); rows.push(row);
    }
  }
  const after = await resourceSample();
  const connections = (await owner.query("select application_name,count(*)::int as connections from pg_stat_activity where datname=current_database() group by application_name")).rows;
  const report = { date: new Date().toISOString(), environment: 'dev209-local-persistent', status: 'PASS', activeAthletes: 500, attendanceRecords: 5000, period: 'season', pageSize: 100, apiPool: 2, referencePool: 2, requests: 192, adoptedP95Ms: 500, rows, resources: { before: { cpu: before.CPUPerc, memory: before.MemUsage }, after: { cpu: after.CPUPerc, memory: after.MemUsage } }, connections, productionSla: false };
  save('load.json', report); console.log(JSON.stringify(report));
} catch { console.log(JSON.stringify({ check: 'dev209-load', status: 'FAIL', diagnostic: 'Diagnóstico privado omitido' })); process.exitCode = 1; }
finally { await pool.end(); await owner.end(); }
