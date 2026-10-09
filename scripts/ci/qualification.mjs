import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Consume only sanitized runner reports; never copy raw browser/provider data.
const checkoutCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceCommit = process.env.SOURCE_COMMIT ?? checkoutCommit;
const expectedFaults = new Set(['portability-injected-failure', 'staging-deploy']);
const suites = ['checks', 'backend', 'staging', 'extended'];
const report = { sourceCommit, checkoutCommit, date: new Date().toISOString(), node: process.version, environment: process.env.GITHUB_ACTIONS ? 'github-actions-synthetic' : 'local-synthetic', technicalStatus: 'FAIL', acceptance: 'NO-GO', suites: [], blockers: ['agreed-representative-load-and-source-destination-http-baseline', 'external-test-provider-receipts', 'human-screen-reader-native-zoom-axe-incomplete-and-one-handed-attendance', 'operational-acceptance-MIG22'] };
for (const suite of suites) {
  let status = 'FAIL', tests = 0, omitted = 0;
  try {
    const result = JSON.parse(readFileSync(`.ci-results/${suite}.json`, 'utf8'));
    const commit = result.sourceCommit ?? result.commit;
    const allPassed = Array.isArray(result.checks) && result.checks.length > 0 && result.checks.every(check => check.status === 'PASS' || (check.status === 'FAIL' && check.expected === true && expectedFaults.has(check.check)));
    const mandatory = { checks: 'api-client-contract', backend: 'product-integrations', staging: 'staging-owned-cleanup', extended: 'playwright-nest-domain-responsive-axe' }[suite];
    const completed = result.checks?.find(check => check.check === mandatory);
    if (allPassed && commit === sourceCommit && completed?.status === 'PASS') status = 'PASS';
    for (const check of result.checks ?? []) {
      tests += Number.isInteger(check.tests) ? check.tests : 0;
      omitted += Number.isInteger(check.omitted) ? check.omitted : 0;
      if (check.check !== 'web-unit' && check.omitted > 0) status = 'FAIL';
    }
    if (['backend', 'extended'].includes(suite) && !(completed?.tests > 0 && completed.omitted === 0)) status = 'FAIL';
  } catch { /* Missing/stale evidence remains FAIL, never an implicit PASS. */ }
  report.suites.push({ suite, status, tests, omitted });
}
try {
  const destination = JSON.parse(readFileSync('.ci-results/independent-postgres.json', 'utf8'));
  const load = destination.qualification;
  const cells = new Set(load?.rows?.map(row => `${row.operation}/${row.transport}/${row.concurrency}`));
  if (destination.sourceCommit === checkoutCommit && load?.status === 'PASS' && load.fixture?.activeAthletes === 500 && load.fixture?.newAttendanceRecords === 5000 && cells.size === 8 && load.rows?.length === 8 && load.rows.every(row => ['report','stats'].includes(row.operation) && ['canonical-sql','nest-http'].includes(row.transport) && [1,4].includes(row.concurrency) && row.requests === 24 && row.errors === 0 && Number.isFinite(row.p95Ms) && row.p95Ms > 0 && row.p95Ms <= 500 && Number.isFinite(row.workerP95Ms) && row.workerP95Ms >= 0 && row.workerP95Ms < 2000)) {
    report.load = { status: 'PASS', activeAthletes: 500, attendanceRecords: 5000, cells: 8, requests: 192, maxP95Ms: Math.max(...load.rows.map(row => row.p95Ms)) };
  } else report.load = { status: 'FAIL' };
} catch { report.load = { status: 'FAIL' }; }
if (report.suites.every(suite => suite.status === 'PASS') && report.load.status === 'PASS') report.technicalStatus = 'PASS';
mkdirSync('.ci-results', { recursive: true });
writeFileSync('.ci-results/qualification.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
if (report.technicalStatus !== 'PASS') process.exitCode = 1;
