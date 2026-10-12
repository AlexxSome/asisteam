import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { measure } from './artifact.mjs';

const baseline = JSON.parse(readFileSync('../../docs/web-migration/issue-221/bundle-baseline.json', 'utf8'));
const artifact = JSON.parse(readFileSync('dist/release.json', 'utf8'));
const budget = JSON.parse(readFileSync('bundle-budget.json', 'utf8'));
const current = measure('dist');
assert.deepEqual(current, artifact.performance, 'Peso de manifiesto diferente al artefacto');
const routes = current.routes.map(row => {
  const previous = baseline.performance.routes.find(item => item.module === row.module);
  assert.ok(previous, 'Módulo sin baseline explícito');
  return { ...row, baselineGzipBytes: previous.additionalGzipBytes, deltaGzipBytes: row.additionalGzipBytes - previous.additionalGzipBytes };
});
assert.equal(routes.length, baseline.performance.routes.length, 'Matriz de módulos divergente');
const approved = typeof budget.approval === 'string' && budget.approval.length > 0;
if (approved) {
  assert.ok(Number.isSafeInteger(budget.maxInitialGzipBytes) && budget.maxInitialGzipBytes > 0);
  assert.ok(Number.isSafeInteger(budget.maxAdditionalRouteGzipBytes) && budget.maxAdditionalRouteGzipBytes > 0);
  assert.ok(current.initialGzipBytes <= budget.maxInitialGzipBytes, 'Carga inicial supera presupuesto');
  assert.ok(routes.every(row => row.additionalGzipBytes <= budget.maxAdditionalRouteGzipBytes), 'Módulo lazy supera presupuesto');
} else assert.ok(budget.maxInitialGzipBytes === null && budget.maxAdditionalRouteGzipBytes === null, 'Umbral sin aprobación');
const report = { sourceCommit: artifact.sourceCommit, baselineCommit: baseline.sourceCommit, measurementStatus: 'PASS', budgetStatus: approved ? 'PASS' : 'PENDING_AGREEMENT', approval: budget.approval, initialGzipBytes: current.initialGzipBytes, baselineInitialGzipBytes: baseline.performance.initialGzipBytes, deltaInitialGzipBytes: current.initialGzipBytes - baseline.performance.initialGzipBytes, routes };
mkdirSync('../../.ci-results', { recursive: true });
writeFileSync('../../.ci-results/vite-bundle.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ check: 'vite-bundle-baseline', sourceCommit: report.sourceCommit, status: report.measurementStatus, budgetStatus: report.budgetStatus, initialGzipBytes: report.initialGzipBytes, deltaInitialGzipBytes: report.deltaInitialGzipBytes, measuredModules: routes.length, maxAdditionalRouteGzipBytes: Math.max(...routes.map(row => row.additionalGzipBytes)) }));
