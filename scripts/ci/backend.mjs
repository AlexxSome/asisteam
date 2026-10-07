import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { check, suite } from './run.mjs';
import { withEdge } from './edge.mjs';
await suite('backend', async () => {
  await check('supabase-local-start', 'pnpm', ['exec', 'supabase', 'start']);
  const generated = await check('database-types-generation', 'pnpm', ['exec', 'supabase', 'gen', 'types', 'typescript', '--local']);
  assert.equal(generated.trim(), readFileSync('packages/db/src/database.types.ts', 'utf8').trim());
  await check('pgtap-all', 'pnpm', ['exec', 'supabase', 'test', 'db']);
  await withEdge(secret => check('product-integrations', 'pnpm', ['--filter', '@asisteam/web', 'test:integration:modules', '--reporter=json', '--outputFile=.ci-integration.json'], { env: { INVITATION_PROXY_SECRET: secret }, report: 'apps/web/.ci-integration.json', requireAll: true }));
});
