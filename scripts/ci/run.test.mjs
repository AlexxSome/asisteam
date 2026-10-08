import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { check } from './run.mjs';

test('capture failure diagnostics without emitting credentials or arguments', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import {check} from './scripts/ci/run.mjs';try{await check('fixture',process.execPath,['-e',\"console.error('synthetic-private-value');process.exit(1)\"])}catch{process.exitCode=1}"], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.ok(!result.stdout.includes('synthetic-private-value'));
  assert.ok(!result.stderr.includes('synthetic-private-value'));
  assert.match(result.stdout, /"status":"FAIL"/);
});
test('failure locations expose only existing repository files and numeric positions', () => {
  const diagnostic = `synthetic-private-value at file://${resolve('apps/api/test/reports.integration.mjs')}:123:45\n at /outside/scripts/private-secret.mjs:12:3\n at file://${resolve('scripts/../private-secret.mjs')}:12:3`;
  const script = `import {check} from './scripts/ci/run.mjs';try{await check('fixture',process.execPath,['-e',${JSON.stringify(`console.error(${JSON.stringify(diagnostic)});process.exit(1)`) }])}catch{process.exitCode=1}`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout.trim());
  assert.deepEqual(report.failureLocations, [{ file: 'apps/api/test/reports.integration.mjs', line: 123, column: 45 }]);
  assert.ok(!result.stdout.includes('synthetic-private-value'));
  assert.ok(!result.stdout.includes('private-secret'));
  assert.equal(result.stderr, '');
});
test('an omitted mandatory integration is rejected even with exit zero', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'asisteam-report-test-'));
  try {
    const report = join(dir, 'report.json');
    writeFileSync(report, JSON.stringify({ numPassedTests: 1, numPendingTests: 1, numTodoTests: 0, numFailedTests: 0 }));
    await assert.rejects(check('omitted-fixture', process.execPath, ['-e', ''], { report, requireAll: true }));
    await assert.rejects(check('node-skipped-fixture', process.execPath, ['-e', "console.log('# skipped 1')"], { noSkip: true }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
