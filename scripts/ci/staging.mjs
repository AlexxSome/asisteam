import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, suite } from './run.mjs';
import { deploy, rollback, current, composeArgs } from '../../deploy/staging/release.mjs';

await suite('staging', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'asisteam-staging-ci-'));
  process.env.STAGING_SECRETS_DIR = join(dir, 'secrets');
  process.env.STAGING_STATE_DIR = join(dir, 'state');
  let image;
  try {
    await check('synthetic-external-secrets', 'node', ['deploy/staging/secrets.mjs', process.env.STAGING_SECRETS_DIR]);
    await check('api-container-build', 'docker', ['build', '-f', 'apps/api/Dockerfile', '-t', 'asisteam-ci:current', '.']);
    image = (await check('api-image-id', 'docker', ['image', 'inspect', 'asisteam-ci:current', '--format', '{{.Id}}'])).trim();
    await deploy(image);
    const roles = await check('staging-role-separation', 'docker', [...composeArgs, 'exec', '-T', 'postgres', 'psql', '-U', 'staging_bootstrap', '-d', 'asisteam_staging', '-At', '-c', "SELECT count(*) FROM pg_roles WHERE rolname IN ('asisteam_runtime','asisteam_migrator') AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb; SELECT has_schema_privilege('asisteam_runtime','staging_runtime','CREATE'); SELECT count(*) FROM staging_runtime.migrations;"] , { env: { API_IMAGE: image } });
    assert.equal(roles.trim(), '2\nf\n1');
    // Second immutable artifact exercises restoration without rewinding data.
    await check('second-artifact-build', 'docker', ['build', '-f', 'apps/api/Dockerfile', '--label', 'asisteam.ci.fixture=second', '-t', 'asisteam-ci:second', '.']);
    const second = (await check('second-image-id', 'docker', ['image', 'inspect', 'asisteam-ci:second', '--format', '{{.Id}}'])).trim();
    assert.notEqual(image, second);
    await deploy(second);
    await rollback();
    assert.equal(await current(), image);
    const container = (await check('rollback-container-id', 'docker', [...composeArgs, 'ps', '-q', 'api'], { env: { API_IMAGE: image } })).trim();
    const restoredImage = (await check('rollback-artifact-identity', 'docker', ['inspect', container, '--format', '{{.Image}}'])).trim();
    assert.equal(restoredImage, image);
    const logs = await check('staging-log-privacy', 'docker', [...composeArgs, 'logs', '--no-color', 'api'], { env: { API_IMAGE: image } });
    for (const role of ['bootstrap', 'runtime', 'migrator']) assert.ok(!logs.includes(readFileSync(`${process.env.STAGING_SECRETS_DIR}/${role}_password`, 'utf8')));
    assert.ok(!/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(logs));
    // Connect from within the isolated network using the actual runtime role.
    await check('api-real-postgres-integration', 'docker', [...composeArgs, 'run', '--rm', '--no-deps', '-v', `${process.cwd()}/apps/api/test:/app/test:ro`, 'api', 'node', '--input-type=module', '-e', "import {readFileSync} from 'node:fs';process.env.API_TEST_DATABASE_URL=readFileSync('/run/secrets/runtime_url','utf8').trim();await import('./test/postgres.integration.mjs');"], { env: { API_IMAGE: image }, noSkip: true });
  } finally {
    if (image) await check('staging-owned-cleanup', 'docker', [...composeArgs, 'down', '-v'], { env: { API_IMAGE: image } });
    rmSync(dir, { recursive: true, force: true });
  }
});
