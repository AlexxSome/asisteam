import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID, randomBytes } from 'node:crypto';
import pg from 'pg';
import { createApplication } from '../dist/application.js';
import { loadFixtureConfig, fixtureConnection } from './fixture-config.mjs';
import { SafeLogger } from '../dist/logger.js';
import { ApiClient } from '../../../packages/api-client/dist/index.js';
import { writers } from '../../../packages/db/scripts/cutover.mjs';

test('native authority: maintenance freeze/abort, durable password/session/history and forward restart', { skip: process.env.API_RLS_TEST !== '1', timeout: 60000 }, async () => {
  const db = new pg.Client({ connectionString: fixtureConnection() });
  const secret = randomBytes(32).toString('hex'), run = randomUUID(), password = 'Synthetic-cutover-' + run;
  const email = 'native-cutover-' + run + '@example.test', replacement = 'After-cutover-' + run;
  const configuration = { DATABASE_URL: fixtureConnection('asisteam_api'), NATIVE_AUTH_DATABASE_URL: fixtureConnection('asisteam_auth'), NATIVE_AUTH_SECRET: secret, NATIVE_AUTH_PROXY_SECRET: secret };
  const logs = [], originalFetch = globalThis.fetch;
  let app, origin, subject, profile, group;
  const start = async () => { app = await createApplication(loadFixtureConfig(configuration), new SafeLogger(line => logs.push(line))); await app.listen(0, '127.0.0.1'); origin = await app.getUrl(); };
  const client = token => new ApiClient({ origin, accessToken: async () => token ?? null, authProxy: { secret, clientIp: randomUUID() }, nativeAuth: true, timeoutMs: 30000 });
  const history = async () => (await db.query("select jsonb_build_object('users',(select jsonb_agg(to_jsonb(u) order by id) from public.users u where id=$1),'members',(select jsonb_agg(to_jsonb(m) order by id) from public.memberships m where user_id=$1),'consents',(select jsonb_agg(to_jsonb(c) order by id) from public.account_consents c where user_id=$1)) as data", [profile])).rows[0].data;
  try {
    await db.connect();
    const database = (await db.query('select current_database() as name')).rows[0].name;
    assert.match(database, /^[a-z_][a-z_0-9]*$/);
    assert.equal((await db.query("select count(*)::int as n from pg_namespace where nspname in ('auth','storage','cron')")).rows[0].n, 0);
    assert.equal((await db.query('select mode from app_private.auth_authority')).rows[0].mode, 'NATIVE');
    globalThis.fetch = (input, init) => String(input).startsWith('https://api.pwnedpasswords.com/range/') ? Promise.resolve(new Response('A'.repeat(35) + ':0')) : originalFetch(input, init);
    await start();
    await client().registerPassword({ body: { email, password, full_name: 'Perfil corte nativo', birthdate: '1990-01-01', terms_accepted: true, terms_version: '2026-09-21' } });
    ({ id: profile, auth_user_id: subject } = (await db.query('select id,auth_user_id from public.users where email=$1', [email])).rows[0]);
    let session = await client().loginPassword({ body: { email, password } });
    group = (await client(session.access_token).createGroup({ body: { name: 'Club corte nativo', sport: 'Tenis' } })).group_id;
    const before = await history();
    await app.close(); app = undefined;
    await db.query('revoke connect on database "' + database + '" from public,' + writers.join(','));
    for (const role of writers) {
      const denied = new pg.Client({ connectionString: fixtureConnection(role) });
      try { await assert.rejects(denied.connect(), { code: '42501' }); } finally { await denied.end().catch(() => {}); }
    }
    assert.deepEqual(await history(), before);
    // Abort maintenance before writes by reopening the same native authority.
    await db.query('grant connect on database "' + database + '" to ' + writers.join(','));
    await start(); assert.deepEqual(await client(session.access_token).getSession(), { user_id: profile });
    await client(session.access_token).changePassword({ body: { current_password: password, password: replacement } });
    await assert.rejects(client(session.access_token).getSession(), { status: 401 });
    await assert.rejects(client().loginPassword({ body: { email, password } }), { status: 401 });
    session = await client().loginPassword({ body: { email, password: replacement } });
    assert.deepEqual(await history(), before);
    const digest = (await db.query('select password_hash from app_private.auth_credentials where subject_id=$1', [subject])).rows[0].password_hash;
    const recoveryStart = performance.now();
    await app.close(); app = undefined; await start();
    assert.ok(performance.now() - recoveryStart < 10000);
    assert.deepEqual(await client(session.access_token).getSession(), { user_id: profile });
    assert.equal((await client(session.access_token).getGroup({ params: { groupId: group } })).id, group);
    assert.equal((await db.query('select password_hash from app_private.auth_credentials where subject_id=$1', [subject])).rows[0].password_hash, digest);
    assert.deepEqual(await history(), before);
    await client(session.access_token).logoutSession();
    await assert.rejects(client(session.access_token).getSession(), { status: 401 });
    await assert.rejects(client().refreshSession({ body: { refresh_token: session.refresh_token } }), { status: 401 });
    assert.ok(!logs.join('\n').includes(password) && !logs.join('\n').includes(session.access_token));
  } finally {
    globalThis.fetch = originalFetch;
    if (app) await app.close();
    // All rows belong to the outer disposable native-suite database fixture.
    const database = (await db.query('select current_database() as name')).rows[0].name;
    await db.query('grant connect on database "' + database + '" to ' + writers.join(','));
    await db.end();
  }
});
