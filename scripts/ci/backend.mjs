import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { check, suite, verify, evidence } from './run.mjs';
await suite('backend', async () => {
  await check('api-session-build', 'pnpm', ['exec', 'turbo', 'run', 'build', '--filter', '@asisteam/api']);
  await check('worker-build', 'pnpm', ['exec', 'turbo', 'run', 'build', '--filter', '@asisteam/worker']);
  await check('private-storage-fixture-build', 'docker', ['build', '-f', 'scripts/migration/storage/Dockerfile.fixture', '-t', 'asisteam-storage-fixture:161', '.']);
  await check('independent-postgres-api-worker-types-backup-pitr', 'node', ['apps/api/test/independent-postgres.integration.mjs']);
  // Every runner owns a disposable vanilla PostgreSQL fixture.
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
    'apps/api/test/web-auth.integration.mjs',
  ], { noSkip: true });
  await check('next-social-auth-browser', 'pnpm', ['--filter', '@asisteam/web', 'test:social-contract']);
  await check('portability-rehearsal', 'pnpm', ['migration:portability', '--', '--verified-report']);
  verify('portability-no-omissions', () => {
    const report = JSON.parse(readFileSync('.ci-results/portability.json', 'utf8'));
    assert.ok(report.checks.length >= 15 && report.checks.every(record => record.status === 'PASS'));
  });
  const faultStart = evidence.checks.length;
  await assert.rejects(check('portability-injected-failure', 'pnpm', ['migration:portability'], { env: { PORTABILITY_FAIL_AFTER: 'owned-native-fixture' } }));
  for (const record of evidence.checks.slice(faultStart)) if (record.status === 'FAIL') record.expected = true;
  verify('portability-cleanup-after-failure', () => {
    const report = JSON.parse(readFileSync('.ci-results/portability-fault.json', 'utf8'));
    assert.equal(report.checks.filter(record => record.status === 'FAIL').length, 1);
    assert.equal(report.checks.find(record => record.check === 'owned-native-fixture').status, 'FAIL');
    assert.equal(report.checks.find(record => record.check === 'owned-resource-cleanup').status, 'PASS');
  });
  await check('pgtap-all-domain', 'node', ['packages/db/scripts/test.mjs']);
  verify('sql-coverage-preserved', () => {
    const domain = JSON.parse(readFileSync('.ci-results/domain-sql.json', 'utf8'));
    const native = JSON.parse(readFileSync('.ci-results/independent-postgres.json', 'utf8'));
    assert.equal(domain.checks.length, 40);
    assert.equal(domain.totalCases, 1646);
    assert.ok(domain.checks.every(record => record.status === 'PASS'));
    assert.ok(native.pgtapCases >= 50);
  });
  await check('product-integrations', 'pnpm', ['--filter', '@asisteam/web', 'test:integration:modules', 'integration.test.ts', '--reporter=json', '--outputFile=.ci-integration.json'], { report: 'apps/web/.ci-integration.json', requireAll: true });

  verify('module-coverage-preserved', () => {
    const report = JSON.parse(readFileSync('apps/web/.ci-integration.json', 'utf8'));
    assert.equal(report.numTotalTests, 84);
    assert.equal(report.numPendingTests, 0);
    const browser = JSON.parse(readFileSync('.ci-results/native-auth-browser.json', 'utf8'));
    assert.equal(browser.status, 'PASS');
    assert.ok(Object.values(browser.logout).every(value => value === true));
  });
});
