import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { ApiClient, ApiClientError } from '../dist/index.js';
import { document, artifacts, staleArtifacts } from '../scripts/generate.mjs';

const id = '17000000-0000-4000-8000-000000000201';
const group = { id, name: 'Equipo sintético', sport: 'Fútbol', logo_url: null, roles: ['ATHLETE'] };
const page = { data: [group], pagination: { page: 1, page_size: 50, total: 1 } };
const response = (payload, status = 200, headers = {}) => new Response(JSON.stringify(payload), { status, headers });
const options = (fetch, extra = {}) => ({ origin: 'http://127.0.0.1:3001', accessToken: async () => 'synthetic-only', fetch, ...extra });

test('OpenAPI/generador son deterministas, con DTO estrictos y operaciones contract-only explícitas', async () => {
  const spec = document();
  assert.equal(spec.openapi, '3.0.3');
  assert.equal(spec.paths['/api/v1/groups'].post['x-implementation-status'], 'contract-only');
  assert.deepEqual(spec.paths['/api/v1/me'].get.security, [{ bearerAuth: [] }]);
  assert.equal(spec.components.schemas.OwnProfile.additionalProperties, false);
  assert.equal(spec.components.schemas.CreateGroup.properties.name.minLength, 3);
  assert.equal(spec.components.schemas.PageQuery.properties.page_size.maximum, 100);
  for (const status of [401, 403, 404, 409, 422, 429]) assert.ok(spec.paths['/api/v1/groups'].post.responses[status]);
  for (const [file, text] of Object.entries(await artifacts())) assert.equal(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), text);
});

test('CI rechaza schemas, tipos y SDK desactualizados', async () => {
  const expected = await artifacts();
  for (const changed of Object.keys(expected)) {
    assert.deepEqual(staleArtifacts(expected, file => expected[file] + (file === changed ? '\n// stale\n' : '')), [changed]);
  }
});

test('cliente generado usa parámetros, defaults, token de servidor y no-store sin cookies/redirects', async () => {
  let seen;
  const client = new ApiClient(options(async (url, init) => { seen = { url, init }; return response(page); }));
  assert.deepEqual(await client.listMyGroups(), page);
  assert.equal(seen.url.pathname, '/api/v1/me/groups');
  assert.equal(seen.url.search, '?page=1&page_size=50');
  assert.equal(seen.init.headers.authorization, 'Bearer synthetic-only');
  assert.equal(seen.init.cache, 'no-store');
  assert.equal(seen.init.credentials, 'omit');
  assert.equal(seen.init.redirect, 'error');
});

test('request Zod canónico impide actor/roles y paginación/IDs inválidos antes de ejecutar', async () => {
  let calls = 0;
  const client = new ApiClient(options(async () => { calls++; return response({ group_id: id }, 201); }));
  for (const body of [{ name: 'x', sport: 'Fútbol' }, { name: 'Equipo', sport: 'Fútbol', actor: id }, { name: 'Equipo', sport: 'Fútbol', roles: ['ADMIN'] }]) {
    await assert.rejects(client.createGroup({ body }), error => error instanceof ApiClientError && error.status === 400);
  }
  await assert.rejects(client.listMyGroups({ query: { page_size: 101 } }), { status: 400 });
  await assert.rejects(client.listMyGroups({ query: { page: '1' } }), { status: 400 });
  await assert.rejects(client.getGroup({ params: { groupId: '../other' } }), { status: 400 });
  assert.equal(calls, 0);
});

test('PII y campos de ADMIN en proyección de miembro, y ADMIN sin rol, fallan cerrados', async () => {
  const detail = { ...group, access: 'member', description: null, can_view_group_stats: false };
  for (const data of [{ ...detail, email: 'private-fixture' }, { ...detail, invite_code: 'CODE0001' }, { ...detail, settings: {} }, { ...detail, phone: 'private-fixture' }, { ...detail, birthdate: 'private-fixture' }]) {
    const client = new ApiClient(options(async () => response(data)));
    await assert.rejects(client.getGroup({ params: { groupId: id } }), { status: 502, error: { code: 'invalid_response', message: 'La respuesta del servicio no es válida.', details: {} } });
  }
  const admin = { ...detail, access: 'admin', invite_code: 'CODE0001', settings: { athletes_can_view_group_stats: false, guardians_can_view_group_stats: false }, settings_updated_at: null, settings_updated_by_name: null };
  await assert.rejects(new ApiClient(options(async () => response(admin))).getGroup({ params: { groupId: id } }), { status: 502 });
  assert.deepEqual(await new ApiClient(options(async () => response({ ...admin, roles: ['ADMIN', 'ATHLETE'] }))).getGroup({ params: { groupId: id } }), { ...admin, roles: ['ADMIN', 'ATHLETE'] });
});

for (const status of [401, 403, 404, 409, 422, 429]) test(`error HTTP ${status} conserva estado/código y descarta diagnósticos remotos`, async () => {
  const secret = 'private-fixture-sql-token-email';
  const client = new ApiClient(options(async () => response({ error: { code: status === 409 ? 'LAST_ADMIN' : 'domain_error', message: secret, details: { sql: secret } } }, status, { 'x-request-id': id })));
  await assert.rejects(client.getOwnProfile(), error => {
    assert.equal(error.status, status);
    assert.equal(error.error.code, status === 409 ? 'LAST_ADMIN' : 'domain_error');
    assert.equal(error.requestId, id);
    assert.ok(!JSON.stringify(error).includes(secret));
    assert.ok(!error.message.includes(secret));
    return true;
  });
});

test('sin sesión no ejecuta HTTP; fallo de red/HTML/status inesperado no filtra errores', async () => {
  let calls = 0;
  const noSession = new ApiClient(options(async () => { calls++; }, { accessToken: async () => null }));
  await assert.rejects(noSession.getOwnProfile(), { status: 401 });
  assert.equal(calls, 0);
  await assert.rejects(new ApiClient(options(async () => { throw new Error('private-fixture'); })).getOwnProfile(), { status: 503 });
  await assert.rejects(new ApiClient(options(async () => new Response('<private-fixture>', { status: 500 }))).getOwnProfile(), { status: 502 });
  await assert.rejects(new ApiClient(options(async () => response({ group_id: id }, 200))).createGroup({ body: { name: 'Equipo', sport: 'Fútbol' } }), { status: 502 });
});

test('timeout de write y de cuerpo abortan sin repetir petición', async () => {
  let calls = 0;
  let signal;
  const client = new ApiClient(options(async (_url, init) => { calls++; signal = init.signal; return new Promise(() => {}); }, { timeoutMs: 15 }));
  await assert.rejects(client.createGroup({ body: { name: 'Equipo', sport: 'Fútbol' } }), { status: 504 });
  assert.equal(calls, 1);
  assert.equal(signal.aborted, true);
  const body = new ApiClient(options(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } })), { timeoutMs: 15 }));
  await assert.rejects(body.health(), { status: 504 });
});

test('HTTP sintético completo: request/write único y lectura del mismo backing store', async t => {
  const groups = [];
  let writes = 0;
  const server = createServer(async (request, res) => {
    res.setHeader('content-type', 'application/json');
    if (request.headers.authorization !== 'Bearer synthetic-only') { res.writeHead(401); res.end(JSON.stringify({ error: { code: 'authentication_required', message: 'Inicia sesión', details: {} } })); return; }
    if (request.method === 'POST' && request.url === '/api/v1/groups') {
      let body = ''; for await (const chunk of request) body += chunk;
      const input = JSON.parse(body); writes++;
      groups.push({ ...group, name: input.name, sport: input.sport, roles: ['ADMIN'] });
      res.writeHead(201); res.end(JSON.stringify({ group_id: id }));
    } else res.end(JSON.stringify({ data: groups, pagination: { page: 1, page_size: 50, total: groups.length } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const client = new ApiClient({ origin: `http://127.0.0.1:${server.address().port}`, accessToken: async () => 'synthetic-only' });
  assert.deepEqual(await client.createGroup({ body: { name: 'Equipo creado', sport: 'Fútbol' } }), { group_id: id });
  assert.equal((await client.listMyGroups()).data[0].name, 'Equipo creado');
  assert.equal(writes, 1);
});

test('config inválida no filtra URLs/credenciales ni permite http remoto', () => {
  for (const origin of ['not-a-url', 'https://user:private-fixture@api.example', 'http://api.example', 'https://api.example/redirect', 'https://api.example?secret=private-fixture']) {
    assert.throws(() => new ApiClient({ origin }), error => error.status === 400 && !JSON.stringify(error).includes('private-fixture'));
  }
});
