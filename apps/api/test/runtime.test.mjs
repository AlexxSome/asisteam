import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { createApplication } from '../dist/application.js';
import { loadConfig, ConfigurationError } from '../dist/config.js';
import { Database } from '../dist/database.js';
import { SafeLogger } from '../dist/logger.js';
import { apiErrorResponseSchema, groupSettingsSchema } from '@asisteam/core/runtime';

const fixture = { DATABASE_URL: 'postgresql://fixture:synthetic-secret@127.0.0.1:1/test', PORT: '0', PG_CONNECT_TIMEOUT_MS: '100', HTTP_TIMEOUT_MS: '200' };
test('configuration errors reveal names only, never values', () => {
  assert.throws(() => loadConfig({ ...fixture, DATABASE_URL: 'private-password', PORT: 'PII@example.invalid' }), (error) => {
    assert.ok(error instanceof ConfigurationError);
    assert.deepEqual(error.fields.sort(), ['DATABASE_URL', 'PORT']);
    assert.ok(!JSON.stringify(error).includes('private-password'));
    assert.ok(!JSON.stringify(error).includes('PII@example.invalid'));
    return true;
  });
  assert.throws(() => loadConfig({ ...fixture, DATABASE_URL: 'https://example.invalid/test' }), ConfigurationError);
  assert.throws(() => loadConfig({ ...fixture, PG_POOL_MAX: '1000' }), ConfigurationError);
});
test('compiled core supplies unchanged Zod validation', () => {
  assert.equal(groupSettingsSchema.safeParse({ athletes_can_view_group_stats: false, guardians_can_view_group_stats: false }).success, true);
  assert.equal(groupSettingsSchema.safeParse({ athletes_can_view_group_stats: false, guardians_can_view_group_stats: false, email: 'third-party@example.invalid' }).success, false);
});
test('HTTP probes, request IDs, timeouts and errors never expose PII or exceptions', async () => {
  const lines = [];
  const logger = new SafeLogger((line) => lines.push(line));
  const config = loadConfig(fixture);
  const app = await createApplication(config, logger);
  const express = app.getHttpAdapter().getInstance();
  express.get('/slow', (_request, response) => { /* fixture intentionally never completes */ });
  await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  try {
    const health = await fetch(base + '/health', { headers: { 'x-request-id': 'secret-token@example.invalid' } });
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    assert.match(health.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.equal(health.headers.has('x-powered-by'), false);
    const unavailable = await fetch(base + '/ready');
    assert.equal(unavailable.status, 503);
    assert.equal(apiErrorResponseSchema.parse(await unavailable.json()).error.code, 'service_unavailable');
    const database = app.get(Database);
    database.ready = async () => true;
    assert.equal((await fetch(base + '/ready')).status, 200);
    database.ready = async () => { throw new Error('SELECT secret_password FROM users PII@example.invalid'); };
    const failed = await fetch(base + '/ready');
    assert.equal(failed.status, 500);
    assert.deepEqual(await failed.json(), { error: { code: 'internal_error', message: 'No pudimos procesar la solicitud.', details: {} } });
    const missing = await fetch(base + '/missing?token=synthetic-secret');
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'resource_not_found');
    const malformed = await fetch(base + '/health', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":"PII@example.invalid",' });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, 'invalid_request');
    const oversized = await fetch(base + '/health', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: 'x'.repeat(70000) }) });
    assert.equal(oversized.status, 413);
    const slow = await fetch(base + '/slow');
    assert.equal(slow.status, 504);
    assert.equal((await slow.json()).error.code, 'request_timeout');
    const logs = lines.join('\n');
    for (const value of ['PII@example.invalid', 'secret-token', 'synthetic-secret', 'secret_password', '/missing', 'SELECT']) assert.ok(!logs.includes(value), value);
    assert.ok(lines.every((line) => JSON.parse(line).event));
  } finally { await app.close(); }
});

test('compiled entrypoint exits safely for invalid configuration', () => {
  const child = spawnSync(process.execPath, ['dist/main.js'], { env: { ...process.env, DATABASE_URL: 'credential@example.invalid private-password' }, encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 1);
  assert.equal(child.stderr, '');
  const records = child.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(records.at(-1).event, 'configuration_invalid');
  assert.deepEqual(records.at(-1).fields, ['DATABASE_URL']);
  assert.ok(!child.stdout.includes('private-password'));
  assert.ok(!child.stdout.includes('credential@example.invalid'));
});
