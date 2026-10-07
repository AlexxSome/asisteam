import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApplication } from '../dist/application.js';
import { loadConfig } from '../dist/config.js';
import { errorBody } from '../dist/errors.js';

// Test dependency only; API runtime never depends on the web SDK.
const { ApiClient } = await import(new URL('../../../packages/api-client/dist/index.js', import.meta.url));
test('cliente compilado consume Nest real versionado y conserva sondas operativas', async t => {
  const app = await createApplication(loadConfig({ NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '0', DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/fixture', PG_CONNECT_TIMEOUT_MS: '100' }), { log() {}, error() {}, warn() {}, debug() {}, verbose() {}, fatal() {}, event() {} });
  await app.listen(0, '127.0.0.1');
  t.after(() => app.close());
  const origin = await app.getUrl();
  const client = new ApiClient({ origin });
  assert.deepEqual(await client.health(), { status: 'ok' });
  assert.deepEqual(await (await fetch(`${origin}/health`)).json(), { status: 'ok' });
  await assert.rejects(client.ready(), { status: 503, error: { code: 'service_unavailable', message: 'El servicio no está disponible. Vuelve a intentarlo.', details: {} } });
  const absent = await fetch(`${origin}/api/v1/me`);
  assert.equal(absent.status, 404); // Specification does not advertise a domain handler as delivered.
  assert.equal(absent.headers.get('cache-control'), 'no-store');
});
test('filtro Nest normaliza 409 y 422 sin excepción ni SQL', () => {
  assert.equal(errorBody(409).error.code, 'state_conflict');
  assert.equal(errorBody(422).error.code, 'business_rule_violation');
});
