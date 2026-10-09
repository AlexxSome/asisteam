import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TokenVerifier } from './legacy-application.mjs';
import { loadConfig } from './legacy-application.mjs';
import { isVerifiedIdentity } from '../dist/identity.js';
import { projectGroupDetail } from '../dist/authorization.js';
import { createApplication } from './legacy-application.mjs';
import { SafeLogger } from '../dist/logger.js';
import { authFixture } from './auth-fixture.mjs';

const database = 'postgresql://fixture:synthetic@127.0.0.1:1/test';
test('signature, issuer, audience, expiry, session and online user verification fail closed', async () => {
  const fixture = await authFixture();
  try {
    const verifier = new TokenVerifier(loadConfig({ DATABASE_URL: database, SUPABASE_AUTH_URL: fixture.issuer, SUPABASE_AUTH_PUBLIC_KEY: 'sb_publishable_synthetic', AUTH_TIMEOUT_MS: '1000' }));
    for (const alg of ['ES256', 'HS256']) {
      const identity = await verifier.verify('Bearer ' + await fixture.token(undefined, undefined, {}, alg));
      assert.equal(isVerifiedIdentity(identity), true);
      assert.equal(Object.hasOwn(identity, 'role'), false);
      assert.equal(Object.hasOwn(identity, 'group_id'), false);
      assert.equal(Object.isFrozen(identity), true);
    }
    assert.equal(isVerifiedIdentity({ authUserId: 'forged', sessionId: 'forged', expiresAt: 9999999999 }), false);
    for (const overrides of [{ iss: 'https://attacker.invalid/auth/v1' }, { aud: 'service_role' }, { exp: 1 }, { sub: 'bad-uuid' }, { session_id: 'bad-uuid' }, { iat: 9999999999 }, { nbf: 9999999999 }]) {
      await assert.rejects(verifier.verify('Bearer ' + await fixture.token(undefined, undefined, overrides)), error => error.getStatus() === 401);
    }
    const token = await fixture.token();
    const pieces = token.split('.');
    pieces[1] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(pieces[1], 'base64url')), sub: '55000000-0000-4000-8000-000000000001' })).toString('base64url');
    await assert.rejects(verifier.verify('Bearer ' + pieces.join('.')), error => error.getStatus() === 401);
    for (const header of [undefined, 'Basic abc', 'Bearer bad', 'Bearer ' + token + ', Bearer ' + token]) await assert.rejects(verifier.verify(header), error => error.getStatus() === 401);
    fixture.mismatch(true);
    await assert.rejects(verifier.verify('Bearer ' + token), error => error.getStatus() === 401);
    fixture.mismatch(false); fixture.unavailable(true);
    await assert.rejects(verifier.verify('Bearer ' + token), error => error.getStatus() === 503);
  } finally { await fixture.close(); }
});
test('member projection discards privileged fields; multirol ADMIN preserves permission union', () => {
  const row = { id: '55000000-0000-4000-8000-000000000001', name: 'Fixture', sport: null, logo_url: null, description: null, can_view_group_stats: false, invite_code: 'FIXT0001', settings: { athletes_can_view_group_stats: false, guardians_can_view_group_stats: false }, settings_updated_at: null, settings_updated_by_name: null, email: 'synthetic@example.test', phone: 'private', birthdate: '1990-01-01', note: 'private' };
  for (const role of ['ATHLETE','GUARDIAN','COACH']) {
    const dto = projectGroupDetail(row, [role]);
    assert.equal(dto.access, 'member');
    for (const field of ['invite_code', 'settings', 'email', 'phone', 'birthdate', 'note']) assert.equal(Object.hasOwn(dto, field), false);
  }
  assert.equal(projectGroupDetail(row, ['ADMIN','ATHLETE','COACH']).access, 'admin');
});
test('unconfigured auth HTTP denies session while probes remain available; logs contain no credentials', async () => {
  const logs = [];
  const app = await createApplication(loadConfig({ DATABASE_URL: database }), new SafeLogger(line => logs.push(line)));
  await app.listen(0, '127.0.0.1');
  try {
    assert.equal((await fetch(await app.getUrl() + '/api/v1/auth/session', { headers: { authorization: 'Bearer synthetic.invalid.token' } })).status, 401);
    assert.equal((await fetch(await app.getUrl() + '/health')).status, 200);
    assert.ok(!logs.join('\n').includes('synthetic.invalid.token'));
  } finally { await app.close(); }
});

test('configuration rejects privileged API keys, partial auth config and insecure remote issuer',()=>{
  const key=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.synthetic';
  for(const extra of [{SUPABASE_AUTH_URL:'not-a-url',SUPABASE_AUTH_PUBLIC_KEY:'sb_publishable_synthetic'},{SUPABASE_AUTH_URL:'https://fixture.invalid/auth/v1'},{SUPABASE_AUTH_URL:'http://fixture.invalid/auth/v1',SUPABASE_AUTH_PUBLIC_KEY:'sb_publishable_synthetic'},{SUPABASE_AUTH_URL:'https://fixture.invalid/auth/v1',SUPABASE_AUTH_PUBLIC_KEY:key}]) assert.throws(()=>loadConfig({DATABASE_URL:database,...extra}));
});
