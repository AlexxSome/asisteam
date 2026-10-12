import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const hash = data => createHash('sha256').update(data).digest('hex');
export const securityHeaders = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
const types = { '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const versioned = path => /^assets\/[A-Za-z0-9_.-]+-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2|png|svg)$/.test(path);
function loadArtifact(directory) {
  const root = resolve(directory), manifest = JSON.parse(readFileSync(join(root, 'release.json'), 'utf8'));
  const { artifactHash, ...content } = manifest;
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.sessionProtocol, 'nest-opaque-v1');
  assert.equal(hash(JSON.stringify(content)), artifactHash, 'Manifiesto alterado');
  const files = new Map();
  for (const file of manifest.files) {
    assert.ok(!file.path.startsWith('/') && !file.path.split('/').some(segment => segment === '..'));
    const bytes = readFileSync(join(root, file.path));
    assert.equal(hash(bytes), file.sha256, 'Artefacto alterado');
    assert.equal(bytes.length, file.bytes);
    files.set(file.path, { bytes, gzip: gzipSync(bytes), etag: '"' + file.sha256 + '"' });
  }
  assert.ok(files.has('index.html'));
  const routes = manifest.paths.map(path => new RegExp('^' + path.split('/').map(segment => segment.startsWith(':') ? '[^/.]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/') + '/?$'));
  return { root, files, routes, manifest };
}
export function staticServer({ directory, target, previous = [], https = false, selectDirectory } = {}) {
  const upstream = new URL(target);
  assert.ok(['http:', 'https:'].includes(upstream.protocol) && !upstream.username && !upstream.password && upstream.pathname === '/' && !upstream.search && !upstream.hash, 'Destino Nest inválido');
  const artifacts = new Map([directory, ...previous].map(dir => [resolve(dir), loadArtifact(dir)]));
  const immutableFiles = new Map();
  for (const artifact of artifacts.values()) for (const [path, file] of artifact.files) if (versioned(path)) {
    assert.ok(!immutableFiles.has(path) || immutableFiles.get(path) === file.etag, 'Asset inmutable reutilizado con otros bytes');
    immutableFiles.set(path, file.etag);
  }
  const active = () => {
    const root = resolve(selectDirectory?.() ?? directory);
    assert.ok(artifacts.has(root), 'Release no validada');
    return artifacts.get(root);
  };
  const server = createServer((req, res) => {
    for (const [name, value] of Object.entries(securityHeaders)) res.setHeader(name, value);
    if (https) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex,nofollow');
    const end = (status, message) => { res.statusCode = status; res.setHeader('Content-Type', 'text/plain; charset=utf-8'); res.end(req.method === 'HEAD' ? undefined : message); };
    try {
      // Inspect raw path before URL normalization to reject traversal/encoded separators.
      const raw = (req.url ?? '').split('?')[0];
      if (!raw.startsWith('/') || raw.startsWith('//') || /%(?:2f|5c|00|2e)|\\|\/\.{1,2}(?:\/|$)/i.test(raw)) return end(400, 'Ruta inválida');
      const path = decodeURIComponent(raw);
      const api = /^\/(?:api|web-api)(?:\/|$)/.test(path);
      const callback = path === '/auth/callback' || /^\/auth\/callback\/(?:google|apple)\/?$/.test(path);
      const avatar = /^\/profile\/avatar\/[^/]+\/[^/]+$/.test(path);
      if (api || callback || avatar) {
        const headers = { ...req.headers };
        for (const name of Object.keys(headers))
          if (name.startsWith('x-asisteam-') || name.startsWith('x-forwarded-') || name.startsWith('x-invitation-') || ['forwarded', 'connection', 'proxy-authorization', 'proxy-connection', 'upgrade'].includes(name) || (name === 'authorization' && !path.startsWith('/api/v1/'))) delete headers[name];
        headers.host = req.headers.host;
        headers['x-forwarded-for'] = req.socket.remoteAddress ?? '127.0.0.1';
        const proxy = (upstream.protocol === 'https:' ? httpsRequest : httpRequest)(new URL(req.url, upstream), { method: req.method, headers }, response => {
          res.statusCode = response.statusCode ?? 502;
          for (const [name, value] of Object.entries(response.headers))
            if (value !== undefined && !['connection', 'transfer-encoding', 'cache-control', 'x-robots-tag', 'strict-transport-security', ...Object.keys(securityHeaders).map(key => key.toLowerCase())].includes(name)) res.setHeader(name, value);
          response.on('error', () => res.destroy());
          response.pipe(res);
        });
        proxy.setTimeout(30000, () => proxy.destroy());
        proxy.on('error', () => { if (!res.headersSent) end(502, 'No pudimos conectar con el servicio.'); else res.destroy(); });
        req.on('aborted', () => proxy.destroy());
        res.on('close', () => { if (!res.writableFinished) proxy.destroy(); });
        req.pipe(proxy);
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return end(405, 'Método no permitido'); }
      const artifact = active();
      let file, name;
      if (path === '/legal/2026-09-21' || path === '/legal/2026-09-21/') {
        name = 'legal/2026-09-21/index.html'; file = artifact.files.get(name);
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        res.removeHeader('X-Robots-Tag');
      } else if (versioned(path.slice(1))) {
        name = path.slice(1);
        file = artifact.files.get(name) ?? [...artifacts.values()].map(release => release.files.get(name)).find(Boolean);
        if (file) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else if (path === '/favicon.ico' && artifact.files.has('favicon.ico')) {
        name = 'favicon.ico'; file = artifact.files.get(name);
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      } else if (artifact.routes.some(route => route.test(path)) && /(?:^|,)\s*text\/html(?:\s*;[^,]*)?(?:,|$)/i.test(req.headers.accept ?? '') && (!req.headers['sec-fetch-mode'] || req.headers['sec-fetch-mode'] === 'navigate')) {
        name = 'index.html'; file = artifact.files.get(name);
      }
      if (!file) return end(404, 'Recurso no disponible');
      res.setHeader('Content-Type', types[name.slice(name.lastIndexOf('.'))] ?? 'application/octet-stream');
      const compressed = /(?:^|,)\s*gzip\s*(?:,|$)/i.test(req.headers['accept-encoding'] ?? '');
      const bytes = compressed ? file.gzip : file.bytes, etag = compressed ? file.etag.replace(/"$/, '-gzip"') : file.etag;
      res.setHeader('Vary', 'Accept-Encoding');
      if (compressed) res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('ETag', etag);
      if (req.headers['if-none-match'] === etag && !String(res.getHeader('Cache-Control')).includes('no-store')) { res.statusCode = 304; return res.end(); }
      res.setHeader('Content-Length', bytes.length);
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { end(400, 'Solicitud inválida'); }
  });
  server.headersTimeout = 10000;
  server.requestTimeout = 30000;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const server = staticServer({ directory: process.env.ASISTEAM_STATIC_DIR ?? 'dist', target: process.env.ASISTEAM_VITE_API_TARGET ?? 'http://127.0.0.1:3001', previous: (process.env.ASISTEAM_STATIC_PREVIOUS ?? '').split(',').filter(Boolean), https: process.env.ASISTEAM_STATIC_HTTPS === '1' });
    server.listen(Number(process.env.PORT ?? 3130), process.env.HOST ?? '127.0.0.1');
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
  } catch { console.error('No se pudo cargar el artefacto estático; diagnóstico sensible omitido.'); process.exitCode = 1; }
}
