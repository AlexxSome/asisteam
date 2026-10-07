import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { check } from './run.mjs';

test('capture failure diagnostics without emitting credentials or arguments', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import {check} from './scripts/ci/run.mjs';try{await check('fixture',process.execPath,['-e',\"console.error('synthetic-private-value');process.exit(1)\"])}catch{process.exitCode=1}"], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.ok(!result.stdout.includes('synthetic-private-value'));
  assert.ok(!result.stderr.includes('synthetic-private-value'));
  assert.match(result.stdout, /"status":"FAIL"/);
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
