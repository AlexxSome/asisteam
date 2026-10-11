import { check, suite } from './run.mjs';
await suite('checks', async () => {
  await check('ci-runner-tests', 'node', ['--test', 'scripts/ci/run.test.mjs', 'scripts/ci/qualification.test.mjs'], { noSkip: true });
  await check('lint', 'pnpm', ['lint']);
  await check('http-contract-generation', 'pnpm', ['api:check']);
  await check('native-test-fixture-build', 'pnpm', ['exec', 'turbo', 'run', 'build', '--filter', '@asisteam/api', '--filter', '@asisteam/worker']);
  await check('typecheck', 'pnpm', ['typecheck']);
  await check('next-http-contract', 'pnpm', ['--filter', '@asisteam/web', 'test:api-contract']);
  await check('build', 'pnpm', ['build'], { env: { ASISTEAM_DATABASE_MODE: 'independent', NEXT_TELEMETRY_DISABLED: '1' } });
  await check('product-runtime-retirement', 'pnpm', ['ci:retirement']);
  await check('core-unit', 'pnpm', ['--filter', '@asisteam/core', 'exec', 'vitest', 'run', '--reporter=json', '--outputFile=.ci-unit.json'], { cwd: undefined, report: 'packages/core/.ci-unit.json', requireAll: true });
  await check('web-unit', 'pnpm', ['--filter', '@asisteam/web', 'exec', 'vitest', 'run', '--maxWorkers=2', '--testTimeout=10000', '--reporter=json', '--outputFile=.ci-unit.json'], { report: 'apps/web/.ci-unit.json' });
  await check('vite-unit', 'pnpm', ['--filter', '@asisteam/web-vite', 'exec', 'vitest', 'run', '--reporter=json', '--outputFile=.ci-unit.json'], { report: 'apps/web-vite/.ci-unit.json', requireAll: true });
  await check('worker-unit', 'pnpm', ['--filter', '@asisteam/worker', 'test'], { noSkip: true });
  await check('api-unit', 'pnpm', ['--filter', '@asisteam/api', 'test'], { noSkip: true });
  await check('api-client-contract', 'pnpm', ['--filter', '@asisteam/api-client', 'test'], { noSkip: true });
});
