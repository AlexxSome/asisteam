import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

test('MIG23 evidence: omissions, stale/missing reports and slow load cannot certify PASS', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mig23-evidence-'));
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim();
  const script = new URL('./qualification.mjs', import.meta.url);
  const mandatory = { checks: ['api-client-contract', 'vite-static-infrastructure', 'vite-bundle-baseline'], backend: ['product-integrations'], staging: ['staging-owned-cleanup', 'vite-container-rollback-identity', 'vite-container-owned-cleanup'], extended: ['playwright-nest-domain-responsive-axe', 'playwright-vite-static-parity', 'playwright-transport-faults'] };
  const load = p95Ms => ({ status: 'PASS', fixture: { activeAthletes: 500, newAttendanceRecords: 5000 }, rows: ['report','stats'].flatMap(operation => ['canonical-sql','nest-http'].flatMap(transport => [1,4].map(concurrency => ({ operation, transport, concurrency, requests: 24, errors: 0, p95Ms, workerP95Ms: 3 })))) });
  const write = (name, value) => writeFileSync(join(dir, '.ci-results', name + '.json'), JSON.stringify(value));
  const fixtures = () => {
    for (const [name, checks] of Object.entries(mandatory)) write(name, { sourceCommit, checks: checks.map(check => ({ check, status: 'PASS', tests: 1, omitted: 0 })) });
    write('independent-postgres', { sourceCommit, qualification: load(100) });
    write('vite-bundle', { sourceCommit, measurementStatus: 'PASS', budgetStatus: 'PENDING_AGREEMENT', initialGzipBytes: 199118, deltaInitialGzipBytes: 0, routes: Array.from({ length: 38 }, () => ({})) });
  };
  const run = () => {
    const child = spawnSync(process.execPath, [script.pathname], { cwd: dir, env: { ...process.env, SOURCE_COMMIT: sourceCommit, GIT_DIR: gitDir }, encoding: 'utf8' });
    const report = JSON.parse(readFileSync(join(dir, '.ci-results/qualification.json'), 'utf8'));
    assert.equal(report.acceptance, 'NO-GO');
    assert.equal(child.status, report.technicalStatus === 'PASS' ? 0 : 1);
    return report;
  };
  try {
    mkdirSync(join(dir, '.ci-results')); fixtures();
    const initial = run();
    assert.equal(initial.technicalStatus, 'PASS');
    assert.ok(initial.blockers.includes('frontend-bundle-budget-agreement-WEB09'));
    for (const corrupt of [
      () => rmSync(join(dir, '.ci-results/backend.json')),
      () => write('backend', { sourceCommit: 'stale', checks: [{ check: mandatory.backend[0], status: 'PASS', tests: 81, omitted: 0 }] }),
      () => write('extended', { sourceCommit, checks: mandatory.extended.map(check => ({ check, status: 'PASS', tests: 40, omitted: 1 })) }),
      () => write('extended', { sourceCommit, checks: [{ check: mandatory.extended[0], status: 'PASS', tests: 47, omitted: 0 }] }),
      () => write('checks', { sourceCommit, checks: [...mandatory.checks.map(check => ({ check, status: 'PASS', tests: 1, omitted: 0 })), {check:'web-unit',status:'PASS',tests:422,omitted:1}] }),
      () => write('independent-postgres', { sourceCommit, qualification: load(501) }),
      () => write('independent-postgres', { sourceCommit, qualification: load(null) }),
      () => rmSync(join(dir, '.ci-results/vite-bundle.json')),
    ]) { fixtures(); corrupt(); assert.equal(run().technicalStatus, 'FAIL'); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
