import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { check, suite, verify, evidence } from './run.mjs';
import { withEdge } from './edge.mjs';
await suite('backend', async () => {
  await check('supabase-local-start', 'pnpm', ['exec', 'supabase', 'start']);
  await check('database-migrations', 'pnpm', ['exec', 'supabase', 'migration', 'up', '--local']);
  await check('api-session-build', 'pnpm', ['exec', 'turbo', 'run', 'build', '--filter', '@asisteam/api']);
  await check('api-session-rls-http', 'pnpm', ['--filter', '@asisteam/api', 'exec', 'node', '--test', '--test-reporter=tap', 'test/session-rls.integration.mjs'], { env: { API_RLS_TEST: '1' }, noSkip: true });
  await check('portability-rehearsal', 'pnpm', ['migration:portability']);
  verify('portability-no-omissions', () => {
    const report = JSON.parse(readFileSync('.ci-results/portability.json', 'utf8'));
    assert.ok(report.checks.length >= 15 && report.checks.every(record => record.status === 'PASS'));
  });
  const faultStart = evidence.checks.length;
  await assert.rejects(check('portability-injected-failure', 'pnpm', ['migration:portability'], { env: { PORTABILITY_FAIL_AFTER: 'local-storage-export' } }));
  for (const record of evidence.checks.slice(faultStart)) if (record.status === 'FAIL') record.expected = true;
  verify('portability-cleanup-after-failure', () => {
    const report = JSON.parse(readFileSync('.ci-results/portability-fault.json', 'utf8'));
    assert.equal(report.checks.filter(record => record.status === 'FAIL').length, 1);
    assert.equal(report.checks.find(record => record.check === 'local-storage-export').status, 'FAIL');
    assert.equal(report.checks.find(record => record.check === 'owned-resource-cleanup').status, 'PASS');
  });
  const generated = await check('database-types-generation', 'pnpm', ['exec', 'supabase', 'gen', 'types', 'typescript', '--local']);
  verify('database-types-match', () => assert.equal(generated.trim(), readFileSync('packages/db/src/database.types.ts', 'utf8').trim()));
  await check('pgtap-all', 'pnpm', ['exec', 'supabase', 'test', 'db']);
  await withEdge(secret => check('product-integrations', 'pnpm', ['--filter', '@asisteam/web', 'test:integration:modules', '--reporter=json', '--outputFile=.ci-integration.json'], { env: { INVITATION_PROXY_SECRET: secret }, report: 'apps/web/.ci-integration.json', requireAll: true }));
});
