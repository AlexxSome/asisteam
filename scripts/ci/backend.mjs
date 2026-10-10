import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { check, suite, verify, evidence } from './run.mjs';
import { withEdge } from './edge.mjs';
await suite('backend', async () => {
  await check('supabase-local-start', 'pnpm', ['exec', 'supabase', 'start']);
  await check('database-migrations', 'pnpm', ['exec', 'supabase', 'migration', 'up', '--local']);
  await check('api-session-build', 'pnpm', ['exec', 'turbo', 'run', 'build', '--filter', '@asisteam/api']);
  await check('worker-build', 'pnpm', ['exec', 'turbo', 'run', 'build', '--filter', '@asisteam/worker']);
  await check('private-storage-fixture-build', 'docker', ['build', '-f', 'scripts/migration/storage/Dockerfile.fixture', '-t', 'asisteam-storage-fixture:161', '.']);
  await check('independent-postgres-api-worker-types-backup-pitr', 'node', ['apps/api/test/independent-postgres.integration.mjs']);
  // Native HTTP/SQL suites own an independent disposable PostgreSQL.
  // Origin SQL and module assertions below remain mandatory until their
  // complete native replacements are implemented and reviewed.
  await check('native-api-worker-all-integrations', 'node', [
    'apps/api/test/native-suite.mjs',
    'apps/api/test/auth-cutover.integration.mjs',
    'apps/api/test/activities.integration.mjs',
    'apps/api/test/announcements.integration.mjs',
    'apps/api/test/attendance.integration.mjs',
    'apps/api/test/billing.integration.mjs',
    'apps/api/test/groups-profile.integration.mjs',
    'apps/api/test/invitations.integration.mjs',
    'apps/api/test/members-consents.integration.mjs',
    'apps/api/test/native-auth.integration.mjs',
    'apps/api/test/qr.integration.mjs',
    'apps/api/test/reports.integration.mjs',
    'apps/api/test/session-rls.integration.mjs',
    'apps/api/test/social-auth.integration.mjs',
    'apps/api/test/storage.integration.mjs',
    'apps/worker/test/worker.integration.mjs',
  ], { noSkip: true });
  await check('next-social-auth-browser', 'pnpm', ['--filter', '@asisteam/web', 'test:social-contract']);
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
  const pgtap = await check('pgtap-all', 'pnpm', ['exec', 'supabase', 'test', 'db']);
  verify('sql-coverage-preserved', () => {
    const count = /Tests=(\d+)/.exec(pgtap)?.[1];
    const native = JSON.parse(readFileSync('.ci-results/independent-postgres.json', 'utf8'));
    // Only the unchanged 27 metric assertions moved to independent Postgres;
    // its additional 23 native checks cannot replace missing origin cases.
    assert.ok(Number(count) >= 1646 && native.pgtapCases >= 50, 'Original SQL coverage must remain exercised');
  });
  await withEdge(secret => check('origin-sql-integrations', 'pnpm', ['--filter', '@asisteam/web', 'test:integration:modules', '--reporter=json', '--outputFile=.ci-integration.json'], { env: { INVITATION_PROXY_SECRET: secret }, report: 'apps/web/.ci-integration.json', requireAll: true }));

  verify('module-coverage-preserved', () => {
    const report = JSON.parse(readFileSync('apps/web/.ci-integration.json', 'utf8'));
    assert.equal(report.numTotalTests, 80);
    assert.equal(report.numPendingTests, 0);
    const browser = JSON.parse(readFileSync('.ci-results/native-auth-browser.json', 'utf8'));
    assert.equal(browser.status, 'PASS');
    assert.ok(Object.values(browser.logout).every(value => value === true));
  });
});
