import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { check } from '../../scripts/ci/run.mjs';

export const project = 'asisteam-staging-synthetic';
export const composeArgs = ['compose', '-p', project, '-f', 'deploy/staging/compose.yml'];
function validate() {
  for (const name of ['STAGING_SECRETS_DIR', 'STAGING_STATE_DIR']) {
    const value = process.env[name];
    if (!value || !isAbsolute(value) || resolve(value).startsWith(resolve('.') + '/')) throw new Error('External staging directory required');
  }
}
function immutable(image) {
  if (!/^(?:sha256:[a-f0-9]{64}|[a-z0-9./:_-]+@sha256:[a-f0-9]{64})$/.test(image ?? '')) throw new Error('Immutable image required');
  return image;
}
export async function current() {
  validate();
  try { return immutable(readFileSync(`${process.env.STAGING_STATE_DIR}/current`, 'utf8').trim()); } catch { return null; }
}
export async function deploy(image) {
  validate(); immutable(image);
  const previous = await current();
  try {
    await check('staging-deploy', 'docker', [...composeArgs, 'up', '-d', '--wait', '--wait-timeout', '90'], { env: { API_IMAGE: image } });
    const response = await fetch(`http://127.0.0.1:${process.env.STAGING_PORT ?? '30467'}/ready`);
    if (response.status !== 200 || (await response.json()).status !== 'ready') throw new Error();
    mkdirSync(process.env.STAGING_STATE_DIR, { recursive: true, mode: 0o700 });
    if (previous && previous !== image) writeFileSync(`${process.env.STAGING_STATE_DIR}/previous`, previous, { mode: 0o600 });
    writeFileSync(`${process.env.STAGING_STATE_DIR}/current`, image, { mode: 0o600 });
    console.log(JSON.stringify({ event: 'staging_release_ready' }));
  } catch (error) {
    if (previous) {
      await check('staging-automatic-rollback', 'docker', [...composeArgs, 'up', '-d', '--wait', '--wait-timeout', '90'], { env: { API_IMAGE: previous } });
    }
    throw new Error('Staging release failed', { cause: error });
  }
}
export async function rollback() {
  validate();
  const previous = immutable(readFileSync(`${process.env.STAGING_STATE_DIR}/previous`, 'utf8').trim());
  await deploy(previous);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { if (process.argv[2] === 'rollback') await rollback(); else await deploy(process.argv[2]); }
  catch { console.error(JSON.stringify({ event: 'staging_release_failed' })); process.exitCode = 1; }
}
