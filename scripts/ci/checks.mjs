import { check, suite } from './run.mjs';
await suite('checks', async () => {
  await check('ci-runner-tests', 'node', ['--test', 'scripts/ci/run.test.mjs'], { noSkip: true });
  await check('lint', 'pnpm', ['lint']);
  await check('typecheck', 'pnpm', ['typecheck']);
  await check('build', 'pnpm', ['build'], { env: { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-build-fixture', NEXT_TELEMETRY_DISABLED: '1' } });
  await check('core-unit', 'pnpm', ['--filter', '@asisteam/core', 'exec', 'vitest', 'run', '--reporter=json', '--outputFile=.ci-unit.json'], { cwd: undefined, report: 'packages/core/.ci-unit.json', requireAll: true });
  await check('web-unit', 'pnpm', ['--filter', '@asisteam/web', 'exec', 'vitest', 'run', '--maxWorkers=2', '--reporter=json', '--outputFile=.ci-unit.json'], { report: 'apps/web/.ci-unit.json' });
  await check('api-unit', 'pnpm', ['--filter', '@asisteam/api', 'test'], { noSkip: true });
});
