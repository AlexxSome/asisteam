import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, suite, evidence } from './run.mjs';
await suite('controlled-failure', async () => {
  await check('probe-type-baseline', 'pnpm', ['exec', 'turbo', 'run', 'build', 'typecheck', '--filter', '@asisteam/api']);
  const dir = mkdtempSync(join(tmpdir(), 'asisteam-ci-probe-'));
  try {
    const probe = join(dir, 'authorization.test.sql');
    writeFileSync(probe, "BEGIN;\n\\i packages/db/fixtures/domain.sql\nSET search_path=public,extensions; SELECT plan(1); SELECT ok(false, 'Controlled authorization gate failure'); SELECT * FROM finish(); ROLLBACK;\n");
    await assert.rejects(check('controlled-pgtap-failure', 'node', ['packages/db/scripts/test.mjs', probe], { env: { DOMAIN_SQL_REPORT_NAME: 'domain-sql-controlled' } }), error => /authorization.test.sql FAIL 1/.test(error.diagnostic));
    const file = 'apps/api/src/ci-controlled-failure.ts';
    writeFileSync(file, "export const controlledTypeFailure: string = 147;\n");
    try { await assert.rejects(check('controlled-type-failure', 'pnpm', ['--filter', '@asisteam/api', 'typecheck']), error => /ci-controlled-failure.ts.*TS2322/.test(error.diagnostic)); }
    finally { rmSync(file); }
    const retiredClientProbe = 'apps/web/src/ci-controlled-retirement.ts';
    writeFileSync(retiredClientProbe, "import { createClient } from '@supabase/supabase-js'; export const forbiddenClient = createClient;\n");
    try {
      await assert.rejects(check('controlled-runtime-retirement-failure', 'pnpm', ['ci:retirement'], { env: { CI_RETIREMENT_REPORT_NAME: 'retirement-controlled' } }));
      const report = JSON.parse(readFileSync('.ci-results/retirement-controlled.json', 'utf8'));
      assert.equal(report.checks.find(record => record.check === 'product-source-without-sdk-provider-http-or-fixtures')?.status, 'FAIL');
    } finally { rmSync(retiredClientProbe); }
    // Expected FAIL stays explicit; the probe itself passes only after observing it.
    assert.equal(evidence.checks.filter(check => check.status === 'FAIL').length, 3);
    for (const record of evidence.checks) if (record.status === 'FAIL') record.expected = true;
    evidence.checks.push({ check: 'controlled-failure-detected', status: 'PASS' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
