import { check, suite } from './run.mjs';
import { withEdge } from './edge.mjs';
await suite('extended', async () => {
  await check('supabase-local-start', 'pnpm', ['exec', 'supabase', 'start']);
  await check('chromium-install', 'pnpm', ['--filter', '@asisteam/web', 'exec', 'playwright', 'install', '--with-deps', 'chromium']);
  await withEdge(async secret => {
    await check('playwright-responsive-axe', 'pnpm', ['--filter', '@asisteam/web', 'test:e2e:full', '--reporter=json'], { env: { INVITATION_PROXY_SECRET: secret, RUN_INVITATION_E2E: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: '.ci-playwright.json' }, report: 'apps/web/.ci-playwright.json', playwright: true, requireAll: true });
    await check('playwright-transport-faults', 'pnpm', ['--filter', '@asisteam/web', 'test:e2e:faults', '--reporter=json'], { env: { PLAYWRIGHT_JSON_OUTPUT_NAME: '.ci-faults.json' }, report: 'apps/web/.ci-faults.json', playwright: true, requireAll: true });
  });
});
