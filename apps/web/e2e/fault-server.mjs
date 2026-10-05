import http from 'node:http';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { flowGroup, localConfig, prepareFlowGroup } from './local-fixtures.mjs';

// Dedicated QA proxy/process: no changes to Postgres, RLS or the human's server.
const config = localConfig();
prepareFlowGroup();
let mode = 'normal';
const proxy = http.createServer((req, res) => {
  const url = new URL(req.url, config.API_URL);
  if (url.pathname === '/__qa/fault' && req.method === 'POST' && !req.headers.origin) {
    const next = url.searchParams.get('mode');
    if (!['normal', 'slow', 'error'].includes(next)) { res.writeHead(400).end(); return; }
    mode = next; res.writeHead(204).end(); return;
  }
  const affected = url.pathname === '/rest/v1/v_group_activities' && url.search.includes(flowGroup);
  if (affected && mode === 'error') {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: 'QA_UNAVAILABLE', message: 'Fallo de transporte sintético' })); return;
  }
  const forward = () => {
    const upstream = http.request(url, { method: req.method, headers: { ...req.headers, host: new URL(config.API_URL).host } }, response => {
      res.writeHead(response.statusCode, response.headers); response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
  };
  if (affected && mode === 'slow') setTimeout(forward, 3000); else forward();
});
await new Promise(resolve => proxy.listen(54330, '127.0.0.1', resolve));
rmSync('.next/qa-fault-app', { recursive: true, force: true });
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', '3130'], {
  env: { ...process.env, ASISTEAM_QA: 'faults', ASISTEAM_SITE_URL: 'http://127.0.0.1:3130',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54330', NEXT_PUBLIC_SUPABASE_ANON_KEY: config.ANON_KEY,
    NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
// Do not forward request payloads, stack traces or URLs to test reports.
child.stdout.on('data', chunk => { if (chunk.toString().includes('Ready in')) console.log('Servidor de fallos QA listo.'); });
child.stderr.on('data', () => {});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { child.kill(signal); proxy.close(); });
child.on('exit', code => { proxy.close(); process.exit(code ?? 1); });
