import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TokenVerifier } from '../dist/auth.js';
import { loadFixtureConfig as loadConfig } from './fixture-config.mjs';
import { isVerifiedIdentity } from '../dist/identity.js';
import { projectGroupDetail } from '../dist/authorization.js';
import { createApplication } from '../dist/application.js';
import { SafeLogger } from '../dist/logger.js';
import { authFixture } from './auth-fixture.mjs';

const database = 'postgresql://fixture:synthetic@127.0.0.1:1/test';
test('native signature, issuer, audience, expiry and claims fail closed', async () => {
  const fixture = await authFixture();
  try {
    const verifier = new TokenVerifier(loadConfig({ DATABASE_URL: database, NATIVE_AUTH_ISSUER: fixture.issuer, NATIVE_AUTH_SECRET: fixture.secret }));
    for (const alg of ['HS256']) {
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
    const foreign = new TokenVerifier(loadConfig({ DATABASE_URL: database, NATIVE_AUTH_SECRET: '4'.repeat(64) }));
    await assert.rejects(foreign.verify('Bearer ' + token), error => error.getStatus() === 401);
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

test('production requires complete native configuration and rejects invalid issuer',()=>{
  for(const extra of [{NODE_ENV:'production'}, {NATIVE_AUTH_ISSUER:'not-a-url'}, {NATIVE_AUTH_SECRET:'short'}]) assert.throws(()=>loadConfig({DATABASE_URL:database,...extra}));
});
