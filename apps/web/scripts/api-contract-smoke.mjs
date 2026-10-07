import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { createApplication } from '../../api/dist/application.js';
import { loadConfig } from '../../api/dist/config.js';

// Ephemeral Next route: exercise the shipped server-only adapter without exposing a diagnostic route in the product.
const fixture = new URL('../src/app/api-contract-fixture/', import.meta.url);
const nextEnv = new URL('../next-env.d.ts', import.meta.url);
const previousEnv = readFileSync(nextEnv, 'utf8');
const app = await createApplication(loadConfig({ NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '0', DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/fixture' }), { log() {}, error() {}, warn() {}, debug() {}, verbose() {}, fatal() {}, event() {} });
let next;
let ownsFixture = false;
try {
  await app.listen(0, '127.0.0.1');
  mkdirSync(fixture);
  ownsFixture = true;
  writeFileSync(new URL('route.ts', fixture), 'import { createServerApiClient } from "@/lib/api/server";\nexport async function GET() { return Response.json(await createServerApiClient().health()); }\n', { flag: 'wx' });
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, NODE_ENV: 'development', ASISTEAM_API_ORIGIN: await app.getUrl(), NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-build-fixture', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  let result;
  const started = Date.now();
  while (Date.now() - started < 60000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api-contract-fixture`, { signal: AbortSignal.timeout(15000) });
      if (response.ok) { result = await response.json(); break; }
    } catch (error) { if (next.exitCode !== null) throw new Error('Next terminó antes del smoke.', { cause: error }); }
    await delay(250);
  }
  assert.deepEqual(result, { status: 'ok' });
  console.log('PASS: Next real → adaptador server-only → SDK generado → Nest /api/v1/health.');
} finally {
  if (next) {
    next.kill('SIGTERM');
    if (next.exitCode === null) await Promise.race([new Promise(resolve => next.once('exit', resolve)), delay(5000)]);
    if (next.exitCode === null) next.kill('SIGKILL');
  }
  if (ownsFixture) rmSync(fixture, { recursive: true, force: true });
  writeFileSync(nextEnv, previousEnv);
  await app.close();
}
