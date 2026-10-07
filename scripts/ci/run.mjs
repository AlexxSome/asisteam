import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const evidence = { commit: process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(), date: new Date().toISOString(), node: process.version, environment: process.env.GITHUB_ACTIONS ? 'github-actions-synthetic' : 'local-synthetic', checks: [] };
export function save(name) {
  mkdirSync('.ci-results', { recursive: true });
  writeFileSync(`.ci-results/${name}.json`, JSON.stringify(evidence, null, 2) + '\n');
}
// Keep diagnostics in memory. CI artifacts/logs contain only this allowlist.
export async function check(label, command, args = [], options = {}) {
  const started = performance.now();
  const child = spawn(command, args, { cwd: options.cwd, env: { ...process.env, ...options.env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let stdout = '';
  child.stdout.on('data', chunk => { if (stdout.length + chunk.length < 32_000_000) stdout += chunk; });
  let truncated = false;
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
    if (output.length + chunk.length < 32_000_000) output += chunk; else truncated = true;
  });
  const code = await new Promise(resolveExit => { child.once('error', () => resolveExit(-1)); child.once('exit', resolveExit); });
  let status = code === 0 && !truncated ? 'PASS' : 'FAIL';
  const record = { check: label, status, seconds: Number(((performance.now() - started) / 1000).toFixed(2)) };
  if (options.report) {
    try {
      const report = JSON.parse(readFileSync(resolve(options.cwd ?? '.', options.report), 'utf8'));
      record.tests = options.playwright ? report.stats.expected : report.numPassedTests;
      record.omitted = options.playwright ? report.stats.skipped : (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0);
      if (options.requireAll && (record.omitted !== 0 || record.tests < 1 || (options.playwright ? report.stats.unexpected : report.numFailedTests) !== 0)) status = 'FAIL';
    } catch { status = 'FAIL'; }
  }
  if (options.noSkip && /# skipped [1-9]|# tests 0/.test(output)) status = 'FAIL';
  record.status = status;
  evidence.checks.push(record);
  console.log(JSON.stringify(record));
  if (status !== 'PASS') { const error = new Error(`Check fallido: ${label}; diagnóstico retenido sin publicar valores sensibles.`); error.diagnostic = output; throw error; }
  return stdout;
}
export async function suite(name, run) {
  try { await run(); } catch (error) {
    // Error messages from dependencies must never be forwarded to CI logs.
    console.error(JSON.stringify({ suite: name, status: 'FAIL', event: 'check_failed' }));
    process.exitCode = 1;
  } finally { save(name); }
}
