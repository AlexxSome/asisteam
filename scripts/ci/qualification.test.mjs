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
  const mandatory = { checks: 'api-client-contract', backend: 'product-integrations', staging: 'staging-owned-cleanup', extended: 'playwright-nest-domain-responsive-axe' };
  const load = p95Ms => ({ status: 'PASS', fixture: { activeAthletes: 500, newAttendanceRecords: 5000 }, rows: ['report','stats'].flatMap(operation => ['canonical-sql','nest-http'].flatMap(transport => [1,4].map(concurrency => ({ operation, transport, concurrency, requests: 24, errors: 0, p95Ms, workerP95Ms: 3 })))) });
  const write = (name, value) => writeFileSync(join(dir, '.ci-results', name + '.json'), JSON.stringify(value));
  const fixtures = () => {
    for (const [name, check] of Object.entries(mandatory)) write(name, { sourceCommit, checks: [{ check, status: 'PASS', tests: 1, omitted: 0 }] });
    write('independent-postgres', { sourceCommit, qualification: load(100) });
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
    assert.equal(run().technicalStatus, 'PASS');
    for (const corrupt of [
      () => rmSync(join(dir, '.ci-results/backend.json')),
      () => write('backend', { sourceCommit: 'stale', checks: [{ check: mandatory.backend, status: 'PASS', tests: 81, omitted: 0 }] }),
      () => write('extended', { sourceCommit, checks: [{ check: mandatory.extended, status: 'PASS', tests: 40, omitted: 1 }] }),
      () => write('independent-postgres', { sourceCommit, qualification: load(501) }),
      () => write('independent-postgres', { sourceCommit, qualification: load(null) }),
    ]) { fixtures(); corrupt(); assert.equal(run().technicalStatus, 'FAIL'); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
