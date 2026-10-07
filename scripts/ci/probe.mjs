import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, suite, evidence } from './run.mjs';
await suite('controlled-failure', async () => {
  await check('probe-type-baseline', 'pnpm', ['exec', 'turbo', 'run', 'build', 'typecheck', '--filter', '@asisteam/api']);
  const dir = mkdtempSync(join(tmpdir(), 'asisteam-ci-probe-'));
  try {
    const probe = join(dir, 'authorization.test.sql');
    writeFileSync(probe, "BEGIN; SELECT plan(1); SELECT ok(false, 'Controlled authorization gate failure'); SELECT * FROM finish(); ROLLBACK;\n");
    await assert.rejects(check('controlled-pgtap-failure', 'pnpm', ['exec', 'supabase', 'test', 'db', probe]), error => /Failed test 1/.test(error.diagnostic));
    const file = 'apps/api/src/ci-controlled-failure.ts';
    writeFileSync(file, "export const controlledTypeFailure: string = 147;\n");
    try { await assert.rejects(check('controlled-type-failure', 'pnpm', ['--filter', '@asisteam/api', 'typecheck']), error => /ci-controlled-failure.ts.*TS2322/.test(error.diagnostic)); }
    finally { rmSync(file); }
    // Expected FAIL stays explicit; the probe itself passes only after observing it.
    assert.equal(evidence.checks.filter(check => check.status === 'FAIL').length, 2);
    evidence.checks.push({ check: 'controlled-failure-detected', status: 'PASS' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
