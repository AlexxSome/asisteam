import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { decodeJwt } from 'jose';
import { ApiClient } from '../../../packages/api-client/dist/index.js';

// Runs only inside MIG-21's owned, disposable PostgreSQL destination. The
// reference is canonical SQL on the identical data, not a production baseline.
export async function qualifyDestination({ owner, app, config, ids, sessions, group, worker, wardId, evidence }) {
  const origin = await app.getUrl(), params = { groupId: group.group_id };
  const api = kind => new ApiClient({ origin, accessToken: async () => sessions[kind].access_token });
  const added = [], activities = [], rows = [];
  evidence.qualification = { status: 'FAIL', fixture: { activeAthletes: 500, newAttendanceRecords: 5000, pageSize: 100 }, workload: { requestsPerCell: 24, concurrency: [1, 4], apiPool: 2, referencePool: 2, workerPool: 2, reportBudgetMs: 500 }, reference: 'canonical SQL on identical destination fixture; not legacy HTTP or production', rows, pending: ['representative-production-volume-and-agreed-load','provider-sandbox','human-reader-native-zoom-and-axe-incomplete'] };
  const baseline = new pg.Pool({ connectionString: config.DATABASE_URL, max: 2, connectionTimeoutMillis: 2000, statement_timeout: 3000, application_name: 'mig23-reference' });
  const percentile = samples => Number(samples.toSorted((a, b) => a - b)[Math.ceil(samples.length * .95) - 1].toFixed(2));
  const references = {
    report: ['select public.get_group_attendance_report($1,$2,$3::date,$4::date,$5::uuid[],$6,$7,$8,$9) as result', [group.group_id, 'season', null, null, [], false, 1, 100, 'name']],
    stats: ['select public.get_group_stats($1,$2,$3) as result', [group.group_id, 1, 100]],
  };
  async function sql(kind, operation) {
    const client = await baseline.connect();
    try {
      await client.query('begin');
      await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: ids[kind].subject, session_id: decodeJwt(sessions[kind].access_token).session_id, role: 'authenticated', auth_provider: 'nest' })]);
      return (await client.query(...references[operation])).rows[0].result;
    } finally { try { await client.query('rollback'); } finally { client.release(); } }
  }
  let multi;
  try {
    assert.equal((await api('guardian').getWard({ params: { athleteUserId: wardId } })).athlete_user_id, wardId);
    const birthday = (await owner.query("select (birthdate+interval '18 years')::date::text as value from public.users where id=$1", [wardId])).rows[0].value;
    assert.match(birthday, /^\d{4}-\d{2}-\d{2}$/);
    const clock = (await owner.query("select pg_get_functiondef('app_private.chile_today()'::regprocedure) as ddl")).rows[0].ddl;
    try {
      // Advance only this disposable fixture's business clock, as MIG-22 does.
      // Birthdates remain immutable; restore the exact original function below.
      await owner.query("create or replace function app_private.chile_today() returns date language sql stable security definer set search_path='' as $$select '" + birthday + "'::date$$");
      // V3 is enforced immediately even before the daily job retires the link.
      await assert.rejects(api('guardian').getWard({ params: { athleteUserId: wardId } }), { status: 404 });
      await assert.rejects(api('guardian').getWardAttendanceHistory({ params: { ...params, athleteUserId: wardId } }), { status: 404 });
    } finally { await owner.query(clock); }
    multi = (await owner.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,'ATHLETE','ACTIVE',now()-interval '60 days') returning id", [ids.admin.profile, group.group_id])).rows[0].id;
    const count = (await owner.query("select count(*)::int as n from public.memberships where group_id=$1 and role='ATHLETE' and status='ACTIVE'", [group.group_id])).rows[0].n;
    added.push(...(await owner.query("insert into public.users(full_name,birthdate,account_status) select 'Carga sintética '||n,'1990-01-01','MANAGED' from generate_series(1,$1::int) n returning id", [500 - count])).rows.map(row => row.id));
    await owner.query("insert into public.memberships(user_id,group_id,role,status,joined_at) select unnest($1::uuid[]),$2,'ATHLETE','ACTIVE',now()-interval '60 days'", [added, group.group_id]);
    for (const status of ['PRESENT','PRESENT','PRESENT','PRESENT','PRESENT','PRESENT','LATE','ABSENT','ABSENT','EXCUSED']) {
      const activity = (await owner.query("insert into public.activities(group_id,activity_type_id,title,starts_at,ends_at,created_by) values($1,'b2c3d4e5-0001-4b3c-8d4e-111111111111','Carga MIG23',now()-interval '1 day',now()-interval '23 hours',$2) returning id", [group.group_id, ids.admin.profile])).rows[0].id;
      activities.push(activity);
      await owner.query("insert into public.attendance_records(activity_id,membership_id,status,recorded_by) select $1,id,$2,$3 from public.memberships where group_id=$4 and role='ATHLETE' and status='ACTIVE'", [activity, status, ids.admin.profile, group.group_id]);
    }
    await owner.query('analyze');
    assert.equal((await owner.query('select count(*)::int as n from public.attendance_records where activity_id=any($1::uuid[])', [activities])).rows[0].n, 5000);
    assert.equal((await api('admin').getMyAttendanceHistory({ params })).totals.attendance_pct, 77.8);
    const attendanceParams = { ...params, activityId: activities[0] }, memberParams = { ...attendanceParams, membershipId: multi };
    assert.equal((await api('coach').getAttendanceRoster({ params: attendanceParams })).canEditNotes, false);
    await assert.rejects(api('coach').updateAttendance({ params: memberParams, body: { note: 'Prohibido' } }), { status: 403 });
    await assert.rejects(api('coach').clearAttendance({ params: memberParams }), { status: 403 });
    await Promise.all(Array.from({ length: 8 }, (_, n) => api(n % 2 ? 'coach' : 'admin').saveAttendance({ params: attendanceParams, body: { records: [{ membership_id: multi, status: 'PRESENT' }] } })));
    assert.equal((await owner.query('select count(*)::int as n from public.attendance_records where activity_id=$1 and membership_id=$2', [activities[0], multi])).rows[0].n, 1);
    const report = await api('coach').getGroupAttendanceReport({ params, query: { period: 'season', page_size: 100, sort: 'name' } });
    assert.equal(report.totals.athletes, 500);
    assert.ok(!/email|phone|birthdate|note|records|guardian/.test(JSON.stringify(report)));
    // Alternate identities on the two real pooled connections, including denied
    // cross-tenant calls, to exercise context reset under simultaneous traffic.
    await Promise.all(Array.from({ length: 12 }, async (_, n) => {
      const kind = ['admin','athlete','guardian','coach'][n % 4];
      await assert.rejects(api(kind).getGroup({ params: { groupId: randomUUID() } }), { status: 404 });
      assert.equal((await api(kind).getSession()).user_id, ids[kind].profile);
    }));
    for (const operation of ['report', 'stats']) {
      const kinds = operation === 'report' ? ['admin','coach'] : ['admin','athlete','guardian','coach'];
      const expected = Object.fromEntries(await Promise.all(kinds.map(async kind => [kind, await sql(kind, operation)])));
      const http = kind => api(kind)[operation === 'report' ? 'getGroupAttendanceReport' : 'getGroupStats']({ params, query: { ...(operation === 'report' ? { period: 'season', sort: 'name' } : {}), page_size: 100 } });
      for (const kind of kinds) assert.deepEqual(await http(kind), expected[kind]);
      for (const concurrency of [1, 4]) {
        for (const transport of ['canonical-sql', 'nest-http']) {
          const samples = [], workerSamples = [];
          const started = performance.now();
          for (let batch = 0; batch < 24; batch += concurrency) {
            const work = Array.from({ length: concurrency }, async (_, n) => {
              const kind = kinds[(batch + n) % kinds.length], start = performance.now();
              const result = await (transport === 'canonical-sql' ? sql(kind, operation) : http(kind));
              samples.push(performance.now() - start);
              assert.deepEqual(result, expected[kind]);
            });
            const workerStart = performance.now();
            await Promise.all([...work, worker.call('metrics').then(() => workerSamples.push(performance.now() - workerStart))]);
          }
          const result = { operation, transport, concurrency, requests: samples.length, errors: 0, p95Ms: percentile(samples), workerP95Ms: percentile(workerSamples), seconds: Number(((performance.now() - started) / 1000).toFixed(3)) };
          rows.push(result);
          // Includes pool queueing and HTTP overhead. Failure blocks this gate.
          assert.ok(result.p95Ms <= 500, 'report_p95_exceeds_canonical_500ms');
          assert.ok(result.workerP95Ms < 2000, 'worker_probe_saturated');
        }
      }
    }
    assert.equal(baseline.waitingCount, 0);
    const connections = (await owner.query("select application_name,count(*)::int as n from pg_stat_activity where datname=current_database() and application_name in ('asisteam-api','asisteam-worker','mig23-reference') group by application_name")).rows;
    for (const row of connections) assert.ok(row.n <= 2);
    assert.equal((await fetch(origin + '/ready')).status, 200);
    return { ...evidence.qualification, status: 'PASS', connections, security: ['native-auth','guardian-eighteenth-birthday-immediate-denial','multirol','coach-no-notes-or-clear','concurrent-upsert','pooled-identity-isolation','third-party-projection'] };
  } finally {
    await baseline.end();
    // Restore only records created by this probe in MIG-21's owned database.
    await owner.query('delete from public.attendance_records where activity_id=any($1::uuid[])', [activities]);
    await owner.query('delete from public.activities where id=any($1::uuid[])', [activities]);
    await owner.query('delete from public.memberships where user_id=any($1::uuid[]) or id=$2', [added, multi ?? null]);
    await owner.query('delete from public.users where id=any($1::uuid[])', [added]);
  }
}
