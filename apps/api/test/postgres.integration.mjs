import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApplication } from '../dist/application.js';
import { loadConfig } from '../dist/config.js';
import { SafeLogger } from '../dist/logger.js';
import { Database } from '../dist/database.js';

const databaseUrl = process.env.API_TEST_DATABASE_URL;
test('real PostgreSQL readiness and SIGTERM shutdown of compiled process', { skip: !databaseUrl }, async () => {
  const config = loadConfig({ DATABASE_URL: databaseUrl, PORT: '0', PG_STATEMENT_TIMEOUT_MS: '100' });
  const app = await createApplication(config, new SafeLogger(() => {}));
  await app.listen(0, '127.0.0.1');
  try {
    assert.equal((await fetch(await app.getUrl() + '/ready')).status, 200);
    const started = performance.now();
    await assert.rejects(app.get(Database).pool.query('SELECT pg_sleep(2)'));
    assert.ok(performance.now() - started < 1500, 'statement/query timeout is bounded');
    assert.equal((await fetch(await app.getUrl() + '/ready')).status, 200);
  }
  finally { await app.close(); }
  const child = spawn(process.execPath, ['dist/main.js'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl, PORT: '0', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let errors = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { errors += chunk; });
  const exit = once(child, 'exit');
  try {
    const deadline = Date.now() + 10000;
    while (!output.includes('runtime_started') && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
    assert.ok(output.includes('runtime_started'), output + errors);
    child.kill('SIGTERM');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 10000);
    const [code, signal] = await exit;
    clearTimeout(timeout);
    assert.equal(code, 0);
    assert.equal(signal, null);
    assert.ok(output.includes('runtime_stopped'));
    assert.equal(errors, '');
    assert.ok(!output.includes(databaseUrl));
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
});
