import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, request } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { staticServer } from './static-server.mjs';
import { writeArtifact, routePaths } from './artifact.mjs';

test('WEB09: navigation allowlist, real errors, proxy privacy, hashes and retained releases', async () => {
  const root = mkdtempSync(join(tmpdir(), 'asisteam-static-'));
  let current, captured;
  const fixture = (version, asset) => {
    const dir = join(root, version);
    mkdirSync(join(dir, 'assets'), { recursive: true });
    mkdirSync(join(dir, 'legal/2026-09-21'), { recursive: true });
    writeFileSync(join(dir, 'index.html'), '<html lang="es"><title>' + version + '</title></html>');
    writeFileSync(join(dir, 'legal/2026-09-21/index.html'), '<html lang="es">Legal</html>');
    writeFileSync(join(dir, 'assets', asset), 'console.log("' + version + '")');
    writeArtifact(dir, { sourceCommit: 'synthetic', paths: ['/', '/login', '/groups/:groupId', '/invitations/:token'] });
    return dir;
  };
  const first = fixture('first', 'main-aaaaaaaa.js'), second = fixture('second', 'main-bbbbbbbb.js');
  current = second;
  const api = createServer((req, res) => {
    captured = req.headers;
    if (req.url.startsWith('/auth/callback')) { res.statusCode = 303; res.setHeader('Location', '/login'); res.setHeader('Set-Cookie', 'synthetic=1; HttpOnly; SameSite=Lax'); return res.end(); }
    res.statusCode = req.url.includes('missing') ? 404 : 401;
    res.setHeader('Content-Type', req.url.startsWith('/profile/avatar') ? 'image/png' : 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(JSON.stringify({ error: { code: 'not_visible', message: 'No disponible' } }));
  });
  const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let server;
  try {
    await listen(api);
    server = staticServer({ directory: second, previous: [first], selectDirectory: () => current, target: 'http://127.0.0.1:' + api.address().port });
    await listen(server);
    const origin = 'http://127.0.0.1:' + server.address().port;
    const get = (path, options = {}) => new Promise((resolve, reject) => {
      const call = request(origin + path, options, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve(new Response([204, 304].includes(response.statusCode) || options.method === 'HEAD' ? null : Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })));
      });
      call.on('error', reject); call.end();
    });
    for (const path of ['/', '/login', '/groups/a?period=month', '/invitations/synthetic-token']) {
      const response = await get(path, { headers: { accept: 'text/html', 'sec-fetch-mode': 'navigate' } });
      assert.equal(response.status, 200); assert.match(await response.text(), /second/);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
    }
    for (const path of ['/missing', '/assets/missing-abcdefgh.js', '/browser-modules.json', '/release.json', '/.vite/manifest.json', '/src/main.tsx', '/groups/a.js', '/auth/callback/fake', '/login.json']) {
      const response = await get(path, { headers: { accept: 'text/html' } });
      assert.equal(response.status, 404); assert.doesNotMatch(await response.text(), /<html/);
    }
    assert.equal((await get('/login', { headers: { accept: 'application/json' } })).status, 404);
    assert.equal((await get('/login', { headers: { accept: 'text/html', 'sec-fetch-mode': 'cors' } })).status, 404);
    assert.equal((await get('/login', { method: 'POST' })).status, 405);
    const old = await get('/assets/main-aaaaaaaa.js'), fresh = await get('/assets/main-bbbbbbbb.js');
    assert.match(await old.text(), /first/); assert.match(await fresh.text(), /second/);
    assert.match(old.headers.get('cache-control'), /immutable/);
    assert.equal((await get('/assets/main-aaaaaaaa.js', { headers: { 'if-none-match': old.headers.get('etag') } })).status, 304);
    const compressed = await get('/assets/main-aaaaaaaa.js', { headers: { 'accept-encoding': 'gzip', 'if-none-match': old.headers.get('etag') } });
    assert.equal(compressed.status, 200);
    assert.equal(compressed.headers.get('content-encoding'), 'gzip');
    assert.notEqual(compressed.headers.get('etag'), old.headers.get('etag'));
    assert.match(gunzipSync(Buffer.from(await compressed.arrayBuffer())).toString(), /first/);
    assert.equal((await get('/assets/main-aaaaaaaa.js', { headers: { 'accept-encoding': 'gzip', 'if-none-match': compressed.headers.get('etag') } })).status, 304);
    assert.equal((await get('/assets/main-aaaaaaaa.js', { method: 'HEAD' })).status, 200);
    current = first;
    assert.match(await (await get('/login', { headers: { accept: 'text/html' } })).text(), /first/);
    const legal = await get('/legal/2026-09-21');
    assert.equal(legal.status, 200); assert.match(legal.headers.get('cache-control'), /must-revalidate/);
    assert.equal(legal.headers.get('set-cookie'), null);
    for (const path of ['/web-api/v1/missing', '/api/v1/missing', '/profile/avatar/owner/file.png']) {
      const response = await get(path, { headers: { accept: 'text/html', authorization: 'Bearer synthetic', 'x-forwarded-for': 'spoof', 'x-asisteam-actor': 'spoof', 'x-invitation-proxy-secret': 'spoof' } });
      assert.ok([401, 404].includes(response.status)); assert.doesNotMatch(await response.text(), /<html/);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(captured['x-asisteam-actor'], undefined); assert.equal(captured['x-invitation-proxy-secret'], undefined);
      assert.notEqual(captured['x-forwarded-for'], 'spoof');
      assert.equal(captured.authorization, path.startsWith('/api/') ? 'Bearer synthetic' : undefined);
    }
    const callback = await get('/auth/callback/google?code=synthetic-private-code');
    assert.equal(callback.status, 303); assert.equal(callback.headers.get('location'), '/login');
    assert.match(callback.headers.get('set-cookie'), /HttpOnly/);
    const bad = await new Promise(resolve => { const req = request(origin, { path: '/%2e%2e/private' }, res => { resolve(res.statusCode); res.resume(); }); req.end(); });
    assert.equal(bad, 400);
    const conflict = fixture('conflict', 'main-aaaaaaaa.js');
    assert.throws(() => staticServer({ directory: first, previous: [conflict], target: origin }), /Asset inmutable reutilizado/);
    writeFileSync(join(second, 'assets/main-bbbbbbbb.js'), 'altered');
    assert.throws(() => staticServer({ directory: second, target: origin }), /Artefacto alterado/);
    assert.deepEqual(routePaths('export const routes=[{path:"/",children:[{path:"login"},{path:"groups/:groupId"},{path:"*"}]}]'), ['/', '/groups/:groupId', '/login']);
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => api.close(resolve));
    rmSync(root, { recursive: true, force: true });
  }
});
