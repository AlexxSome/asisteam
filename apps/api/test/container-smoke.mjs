import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const prefix = ['compose', '-p', 'asisteam-issue146', '-f', 'apps/api/compose.smoke.yml'];
const compose = (...args) => execFileSync('docker', [...prefix, ...args], { encoding: 'utf8' });
const base = 'http://127.0.0.1:30466';
async function expectProbe(path, status) {
  const deadline = Date.now() + 20000;
  do {
    try {
      const response = await fetch(base + path, { signal: AbortSignal.timeout(2000) });
      if (response.status === status) return await response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.fail(`${path} did not reach ${status}`);
}
assert.deepEqual(await expectProbe('/health', 200), { status: 'ok' });
assert.deepEqual(await expectProbe('/ready', 200), { status: 'ready' });
compose('exec', '-T', 'api', 'node', '--input-type=module', '-e', `
  import { createRequire } from 'node:module';
  import { existsSync } from 'node:fs';
  import { apiErrorResponseSchema } from '@asisteam/core/runtime';
  if (existsSync('/app/src') || existsSync('/app/node_modules/@asisteam/core/src')) process.exit(1);
  const require = createRequire(import.meta.url);
  for (const dependency of ['typescript', 'esbuild', 'vitest', '@nestjs/cli']) {
    try { require.resolve(dependency); process.exit(1); } catch {}
  }
  apiErrorResponseSchema.parse({error:{code:'smoke',message:'Prueba',details:{}}});
`);
assert.equal(compose('exec', '-T', 'api', 'id', '-u').trim(), '1000');
compose('stop', 'postgres');
const unavailable = await expectProbe('/ready', 503);
assert.equal(unavailable.error.code, 'service_unavailable');
assert.deepEqual(unavailable.error.details, {});
await expectProbe('/health', 200);
compose('start', 'postgres');
await expectProbe('/ready', 200);
compose('stop', 'api');
const container = compose('ps', '-a', '-q', 'api').trim();
assert.equal(execFileSync('docker', ['inspect', '--format', '{{.State.ExitCode}}', container], { encoding: 'utf8' }).trim(), '0');
const logs = compose('logs', '--no-log-prefix', 'api');
assert.ok(logs.includes('runtime_stopped'));
for (const forbidden of ['synthetic-only', 'postgresql://', 'SELECT 1']) assert.ok(!logs.includes(forbidden));
compose('start', 'api');
await expectProbe('/ready', 200);
console.log('PASS container: compiled core, non-root, production dependencies, ready 200→503→200, liveness, SIGTERM exit 0, safe logs');
