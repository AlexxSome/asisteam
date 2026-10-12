import http from 'node:http';
import { spawn } from 'node:child_process';
import { staticServer } from '../../scripts/static-server.mjs';
import { flowGroup, localConfig, prepareFlowGroup } from './local-fixtures.mjs';

// Dedicated QA proxy/process: no changes to Postgres, RLS or the human's server.
const source=spawn(process.execPath,['e2e/regression/server.mjs'],{env:{...process.env,ASISTEAM_QA_STORAGE:'0',QA_WEB_ORIGIN:'http://127.0.0.1:3130'},stdio:['ignore','pipe','pipe']});
let ready=false;source.stdout.on('data',chunk=>{ready||=chunk.toString().includes('fixtures locales listos')});source.stderr.on('data',()=>{});
const deadline=Date.now()+180000;while(!ready&&Date.now()<deadline&&source.exitCode===null)await new Promise(resolve=>setTimeout(resolve,100));
if(!ready){source.kill('SIGTERM');throw new Error('native_fault_fixture_unavailable')}
const config = localConfig();
prepareFlowGroup();
let mode = 'normal';
const proxy = http.createServer((req, res) => {
  const url = new URL(req.url, config.API_ORIGIN);
  if (url.pathname === '/__qa/fault' && req.method === 'POST' && !req.headers.origin) {
    const next = url.searchParams.get('mode');
    if (!['normal', 'slow', 'error'].includes(next)) { res.writeHead(400).end(); return; }
    mode = next; res.writeHead(204).end(); return;
  }
  const affected = url.pathname === '/web-api/v1/groups/'+flowGroup+'/activities';
  if (affected && mode === 'error') {
    res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: 'QA_UNAVAILABLE', message: 'Fallo de transporte sintético' })); return;
  }
  const forward = () => {
    const upstream = http.request(url, { method: req.method, headers: { ...req.headers, host: req.headers.host } }, response => {
      res.writeHead(response.statusCode, response.headers); response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
  };
  if (affected && mode === 'slow') setTimeout(forward, 3000); else forward();
});
await new Promise(resolve => proxy.listen(54330, '127.0.0.1', resolve));
const gateway=staticServer({directory:'dist',target:'http://127.0.0.1:54330'});
await new Promise(resolve=>gateway.listen(3130,'127.0.0.1',resolve));
console.log('Servidor de fallos QA listo.');
for (const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{
 await new Promise(resolve=>gateway.close(resolve));proxy.close();source.kill(signal);
 await new Promise(resolve=>source.exitCode!==null?resolve():source.once('exit',resolve));process.exit(0);
});
