import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { check, verify } from './run.mjs';
import { project } from '../../deploy/staging/release.mjs';

// Runs only inside the owned synthetic staging suite; no external rollout.
export async function rehearseFrontend() {
  const sourceCommit = process.env.SOURCE_COMMIT ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const name = 'asisteam-static-ci-' + randomBytes(4).toString('hex');
  const firstTag = name + ':first', secondTag = name + ':second';
  let running = false;
  const start = async image => {
    if (running) { await check('vite-container-replace', 'docker', ['rm', '-f', name]); running = false; }
    await check('vite-container-start', 'docker', ['run', '-d', '--name', name, '--network', project + '_gateway', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '-e', 'ASISTEAM_VITE_API_TARGET=http://api:3001', '-p', '127.0.0.1::3130', image]);
    running = true;
    const port = (await check('vite-container-port', 'docker', ['inspect', name, '--format', '{{(index (index .NetworkSettings.Ports "3130/tcp") 0).HostPort}}'])).trim();
    const origin = 'http://127.0.0.1:' + port;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(origin + '/legal/2026-09-21')).ok) { ready = true; break; } } catch { /* Only this disposable container is starting. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Frontend sintético no disponible');
    const html = await fetch(origin + '/login', { headers: { Accept: 'text/html' } });
    // Node fetch marks requests cors; the shell gate is validated by browser matrix.
    verify('vite-container-non-navigation', () => assert.equal(html.status, 404));
    const legal = await fetch(origin + '/legal/2026-09-21');
    verify('vite-container-legal-and-csp', () => { assert.equal(legal.status, 200); assert.match(legal.headers.get('content-security-policy'), /script-src 'self'/); });
    const error = await fetch(origin + '/api/v1/not-found');
    const body = await error.text();
    verify('vite-container-same-origin-nest-error', () => { assert.equal(error.status, 404); assert.equal(error.headers.get('cache-control'), 'private, no-store'); assert.ok(body.startsWith('{')); });
    const runtime = await check('vite-container-runtime', 'docker', ['exec', name, 'node', '--input-type=module', '-e', "import{existsSync,readFileSync}from'node:fs';const r=JSON.parse(readFileSync('/app/dist/release.json','utf8'));if(existsSync('/app/node_modules')||!r.files.length||r.sessionProtocol!=='nest-opaque-v1')process.exit(1);console.log(JSON.stringify({sourceCommit:r.sourceCommit,artifactHash:r.artifactHash}));"]);
    verify('vite-container-provenance', () => { const report = JSON.parse(runtime); assert.equal(report.sourceCommit, sourceCommit); assert.match(report.artifactHash, /^[a-f0-9]{64}$/); });
  };
  try {
    await check('vite-container-build', 'docker', ['build', '-f', 'apps/web/Dockerfile', '--build-arg', 'SOURCE_COMMIT=' + sourceCommit, '-t', firstTag, '.']);
    const first = (await check('vite-image-id', 'docker', ['image', 'inspect', firstTag, '--format', '{{.Id}}'])).trim();
    await start(first);
    await check('vite-second-artifact-build', 'docker', ['build', '-f', 'apps/web/Dockerfile', '--build-arg', 'SOURCE_COMMIT=' + sourceCommit, '--label', 'asisteam.ci.fixture=second', '-t', secondTag, '.']);
    const second = (await check('vite-second-image-id', 'docker', ['image', 'inspect', secondTag, '--format', '{{.Id}}'])).trim();
    verify('vite-distinct-container-artifacts', () => assert.notEqual(first, second));
    await start(second);
    await start(first);
    const restored = (await check('vite-restored-image', 'docker', ['inspect', name, '--format', '{{.Image}}'])).trim();
    verify('vite-container-rollback-identity', () => assert.equal(restored, first));
  } finally {
    if (running) await check('vite-container-owned-cleanup', 'docker', ['rm', '-f', name]);
  }
}
