import { check, suite } from './run.mjs';
import { withEdge } from './edge.mjs';
await suite('extended', async () => {
  await check('supabase-local-start', 'pnpm', ['exec', 'supabase', 'start']);
  await check('chromium-install', 'pnpm', ['--filter', '@asisteam/web', 'exec', 'playwright', 'install', '--with-deps', 'chromium']);
  await check('nest-domain-build', 'pnpm', ['exec', 'turbo', 'run', 'build', '--filter', '@asisteam/api', '--filter', '@asisteam/api-client']);
  await withEdge(async secret => {
    await check('playwright-responsive-axe', 'pnpm', ['--filter', '@asisteam/web', 'test:e2e:full', '--reporter=json'], { env: { INVITATION_PROXY_SECRET: secret, RUN_INVITATION_E2E: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: '.ci-playwright.json' }, report: 'apps/web/.ci-playwright.json', playwright: true, requireAll: true });
    await check('playwright-transport-faults', 'pnpm', ['--filter', '@asisteam/web', 'test:e2e:faults', '--reporter=json'], { env: { PLAYWRIGHT_JSON_OUTPUT_NAME: '.ci-faults.json' }, report: 'apps/web/.ci-faults.json', playwright: true, requireAll: true });
  });
  await check('playwright-nest-invitations', 'pnpm', ['--filter', '@asisteam/web', 'test:e2e:full', '--grep', 'MIG-09', '--reporter=json'], { env: { ASISTEAM_QA_NEST: '1', ASISTEAM_QA_INVITATIONS: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: '.ci-nest-invitations.json' }, report: 'apps/web/.ci-nest-invitations.json', playwright: true, requireAll: true });
  await check('private-storage-fixture-build', 'docker', ['build', '-f', 'scripts/migration/storage/Dockerfile.fixture', '-t', 'asisteam-storage-fixture:161', '.']);
  await check('playwright-nest-storage', 'pnpm', ['--filter', '@asisteam/web', 'test:e2e:full', '--grep', 'MIG-17', '--reporter=json'], { env: { ASISTEAM_QA_NEST: '1', ASISTEAM_QA_STORAGE: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: '.ci-nest-storage.json' }, report: 'apps/web/.ci-nest-storage.json', playwright: true, requireAll: true });
  await check('playwright-nest-qr', 'pnpm', ['--filter', '@asisteam/web', 'test:e2e:full', '--grep', 'MIG-16', '--reporter=json'], { env: { ASISTEAM_QA_NEST: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: '.ci-nest-qr.json' }, report: 'apps/web/.ci-nest-qr.json', playwright: true, requireAll: true });
  await check('playwright-nest-billing', 'pnpm', ['--filter', '@asisteam/web', 'test:e2e:full', '--grep', 'MIG-14', '--reporter=json'], { env: { ASISTEAM_QA_NEST: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: '.ci-nest-billing.json' }, report: 'apps/web/.ci-nest-billing.json', playwright: true, requireAll: true });
  await check('playwright-nest-groups-profile', 'pnpm', ['--filter', '@asisteam/web', 'test:e2e:full', '--grep', 'MIG-07|rol .*:|cambio de grupo|restricciones reales', '--reporter=json'], { env: { ASISTEAM_QA_NEST: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: '.ci-nest-playwright.json' }, report: 'apps/web/.ci-nest-playwright.json', playwright: true, requireAll: true });
});
