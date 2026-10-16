// Isolated, persistent development only. Never resets a database or deletes a volume.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { command, quote } from '../../packages/db/scripts/local.mjs';
import { migrate } from '../../packages/db/scripts/migrate.mjs';

const root = resolve(new URL('../../', import.meta.url).pathname);
process.chdir(root);
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const pg = require('pg');
const directory = resolve('.qa/issue-209');
const label = 'asisteam.development.issue=209';
const resources = { postgres: 'asisteam-dev209-postgres', storage: 'asisteam-dev209-storage' };
const volumes = { postgres: 'asisteam-dev209-postgres-data', storage: 'asisteam-dev209-storage-data' };
const ports = { postgres: 5449, storage: 9049, api: 3049, web: 3149 };
const roles = ['asisteam_migrator', 'asisteam_api', 'asisteam_auth', 'asisteam_jobs', 'asisteam_invitation', 'asisteam_billing'];
const sha = value => createHash('sha256').update(value).digest('hex');
const docker = (...args) => command('docker', args);
const privateWrite = (name, value) => { writeFileSync(resolve(directory, name), value, { mode: 0o600 }); chmodSync(resolve(directory, name), 0o600); };
const report = (check, fields = {}) => console.log(JSON.stringify({ check, ...fields }));
async function inspect(kind, name) {
  // A failed inspect can also mean Docker is unavailable. Confirm the daemon first.
  await docker('info', '--format', '{{.ServerVersion}}');
  try { return JSON.parse(await docker(kind, 'inspect', name))[0]; } catch { return null; }
}
async function owned(kind, name) {
  const item = await inspect(kind, name);
  if (item) assert.equal((item.Config?.Labels ?? item.Labels)?.['asisteam.development.issue'], '209', 'Recurso ajeno: no se modifica');
  return item;
}
async function secrets() {
  mkdirSync(directory, { recursive: true, mode: 0o700 }); chmodSync(directory, 0o700);
  const path = resolve(directory, 'secrets.json');
  if (!existsSync(path)) {
    for (const name of Object.values(resources)) assert.equal(await inspect('container', name), null, 'Faltan secretos de una instalación existente');
    for (const name of Object.values(volumes)) assert.equal(await inspect('volume', name), null, 'Faltan secretos de un volumen existente');
    const token = () => randomBytes(32).toString('hex');
    privateWrite('secrets.json', JSON.stringify({ owner: token(), passwords: Object.fromEntries(roles.map(role => [role, token()])), auth: token(), proxy: token(), s3key: token(), s3secret: token() }));
  }
  chmodSync(path, 0o600);
  return JSON.parse(readFileSync(path, 'utf8'));
}
const databaseUrl = (secret, role = 'postgres') => `postgresql://${role}:${role === 'postgres' ? secret.owner : secret.passwords[role]}@127.0.0.1:${ports.postgres}/asisteam_dev209`;
async function connect(secret, role = 'postgres') {
  const client = new pg.Client({ connectionString: databaseUrl(secret, role), connectionTimeoutMillis: 3000 });
  await client.connect(); return client;
}
async function ready(run) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await run(); return; } catch { if (attempt === 99) throw new Error('Servicio local no disponible'); await new Promise(resolve => setTimeout(resolve, 200)); }
  }
}
async function up(secret) {
  await docker('build', '-f', 'packages/db/Dockerfile.test', '-t', 'asisteam-dev209-postgres:17', '.');
  await docker('build', '-f', 'scripts/migration/storage/Dockerfile.fixture', '-t', 'asisteam-dev209-storage:local', '.');
  privateWrite('postgres.env', `POSTGRES_PASSWORD=${secret.owner}\nPOSTGRES_DB=asisteam_dev209\n`);
  privateWrite('storage.env', `MINIO_ROOT_USER=${secret.s3key}\nMINIO_ROOT_PASSWORD=${secret.s3secret}\n`);
  for (const [service, name] of Object.entries(resources)) {
    const volume = await owned('volume', volumes[service]);
    if (!volume) await docker('volume', 'create', '--label', label, volumes[service]);
    const current = await owned('container', name);
    if (current) {
      const binding = current.HostConfig.PortBindings[(service === 'postgres' ? '5432' : '9000') + '/tcp'];
      assert.deepEqual(binding, [{ HostIp: '127.0.0.1', HostPort: String(ports[service]) }]);
      assert.ok(current.Mounts.some(mount => mount.Name === volumes[service]));
      await docker('start', name);
    } else {
      await docker('run', '-d', '--name', name, '--label', label, '--restart', 'unless-stopped', '--memory', service === 'postgres' ? '1g' : '512m', '--cpus', '2',
        '--env-file', resolve(directory, service + '.env'), '-p', `127.0.0.1:${ports[service]}:${service === 'postgres' ? 5432 : 9000}`,
        '-v', `${volumes[service]}:${service === 'postgres' ? '/var/lib/postgresql/data' : '/data'}`,
        `asisteam-dev209-${service}:${service === 'postgres' ? '17' : 'local'}`, ...(service === 'storage' ? ['server', '/data'] : []));
    }
  }
  await ready(async () => { const client = await connect(secret); await client.end(); });
  const owner = await connect(secret);
  try {
    const bootstrap = (await owner.query("select exists(select 1 from pg_roles where rolname='asisteam_migrator') as installed")).rows[0].installed;
    if (!bootstrap) {
      await owner.query('begin');
      try {
        await owner.query(readFileSync('packages/db/bootstrap.sql', 'utf8'));
        for (const role of roles) await owner.query('alter role ' + role + ' login password ' + quote(secret.passwords[role]));
        await owner.query('commit');
      } catch (error) { await owner.query('rollback'); throw error; }
    }
  } finally { await owner.end(); }
  const migrator = await connect(secret, 'asisteam_migrator');
  try { await migrate(migrator); } finally { await migrator.end(); }
  await ready(async () => assert.ok((await fetch(`http://127.0.0.1:${ports.storage}/minio/health/ready`)).ok));
  const { S3Client, HeadBucketCommand, CreateBucketCommand } = require('@aws-sdk/client-s3');
  const s3 = new S3Client({ region: 'us-east-1', endpoint: `http://127.0.0.1:${ports.storage}`, forcePathStyle: true, credentials: { accessKeyId: secret.s3key, secretAccessKey: secret.s3secret } });
  try {
    try { await s3.send(new HeadBucketCommand({ Bucket: 'dev209-avatars' })); }
    catch (error) { if (error.$metadata?.httpStatusCode !== 404) throw error; await s3.send(new CreateBucketCommand({ Bucket: 'dev209-avatars' })); }
  } finally { s3.destroy(); }
  report('development-up', { status: 'PASS', environment: 'dev209-local-persistent', ports });
}
function apiEnvironment(secret) {
  return { NODE_ENV: 'development', HOST: '127.0.0.1', PORT: String(ports.api), DATABASE_URL: databaseUrl(secret, 'asisteam_api'),
    NATIVE_AUTH_DATABASE_URL: databaseUrl(secret, 'asisteam_auth'), NATIVE_AUTH_SECRET: secret.auth, NATIVE_AUTH_PROXY_SECRET: secret.proxy,
    NATIVE_AUTH_ISSUER: `http://127.0.0.1:${ports.api}`, NATIVE_AUTH_WEB_URL: `http://127.0.0.1:${ports.web}`, WEB_AUTH_ENABLED: '1', WEB_TRUSTED_PROXY_IPS: '127.0.0.1',
    INVITATION_DATABASE_URL: databaseUrl(secret, 'asisteam_invitation'), INVITATION_PROXY_SECRET: secret.proxy, INVITATION_WEB_URL: `http://127.0.0.1:${ports.web}`,
    BILLING_DATABASE_URL: databaseUrl(secret, 'asisteam_billing'), PG_POOL_MAX: '2', S3_ENDPOINT: `http://127.0.0.1:${ports.storage}`, S3_LOCAL_POLICY_ONLY: '1',
    S3_AVATAR_BUCKET: 'dev209-avatars', S3_REGION: 'us-east-1', S3_ACCESS_KEY_ID: secret.s3key, S3_SECRET_ACCESS_KEY: secret.s3secret };
}
async function verify(secret) {
  const checks = [];
  for (const [service, name] of Object.entries(resources)) {
    const container = await owned('container', name);
    assert.ok(container?.State.Running);
    assert.equal(container.NetworkSettings.Ports[(service === 'postgres' ? '5432' : '9000') + '/tcp'][0].HostIp, '127.0.0.1');
    await owned('volume', volumes[service]);
  }
  const owner = await connect(secret);
  try {
    assert.equal((await owner.query("select current_setting('server_version_num')::int/10000 as major")).rows[0].major, 17);
    const rows = (await owner.query("select rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole from pg_roles where rolname=any($1)", [roles])).rows;
    assert.equal(rows.length, roles.length);
    for (const row of rows) assert.ok(!row.rolsuper && !row.rolbypassrls && !row.rolcreatedb && !row.rolcreaterole);
    const ledger = (await owner.query('select name,sha256 from db_migrations.ledger order by name')).rows;
    for (const row of ledger) assert.equal(row.sha256, sha(readFileSync('packages/db/migrations/' + row.name)));
    checks.push({ check: 'postgres17-roles-ledger', status: 'PASS', ledger });
  } finally { await owner.end(); }
  for (const role of roles.filter(role => role !== 'asisteam_migrator')) {
    const client = await connect(secret, role);
    try {
      const privileges = (await client.query("select not has_schema_privilege(current_user,'public','CREATE') and not exists(select 1 from pg_class where relnamespace in ('public'::regnamespace,'app_private'::regnamespace) and relowner=(select oid from pg_roles where rolname=current_user)) as safe")).rows[0];
      assert.ok(privileges.safe);
      await assert.rejects(client.query('create table public.dev209_forbidden(id int)'), { code: '42501' });
      checks.push({ check: role + '-connect-and-deny-ddl', status: 'PASS' });
    } finally { await client.end(); }
  }
  const unauthenticated = await fetch(`http://127.0.0.1:${ports.storage}/dev209-avatars/private`);
  assert.equal(unauthenticated.status, 403);
  checks.push({ check: 'storage-anonymous-denied', status: 'PASS' });
  const result = { date: new Date().toISOString(), environment: 'dev209-local-persistent', status: 'PASS', checks, providers: 'not-configured', production: 'NO-GO' };
  privateWrite('verification.json', JSON.stringify(result, null, 2) + '\n');
  report('development-verify', result);
}
async function serve(secret) {
  // Exclusive foreground supervisor; another invocation cannot create a second Worker.
  const lock = resolve(directory, 'serve.lock');
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, 'utf8'));
    assert.ok(Number.isSafeInteger(pid) && pid > 1);
    try { process.kill(pid, 0); throw new Error('Ya existe un supervisor local'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; unlinkSync(lock); }
  }
  const fd = openSync(lock, 'wx', 0o600); writeFileSync(fd, String(process.pid)); closeSync(fd);
  const children = [];
  let stopping = false;
  const stop = () => { if (stopping) return; stopping = true; for (const child of children) child.kill('SIGTERM'); };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop);
  try {
    const base = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR };
    const start = (name, entry, env) => {
      const output = openSync(resolve(directory, name + '.log'), 'a', 0o600);
      const child = spawn(process.execPath, [resolve(entry)], { cwd: root, env: { ...base, ...env }, stdio: ['ignore', output, output] }); closeSync(output);
      const failed = () => {
        if (!stopping) { process.exitCode = 1; report('development-service-stopped', { service: name, status: 'FAIL' }); stop(); }
      };
      child.once('error', failed); child.once('exit', failed); children.push(child);
    };
    start('api', 'apps/api/dist/main.js', apiEnvironment(secret));
    await ready(async () => assert.equal((await fetch(`http://127.0.0.1:${ports.api}/ready`)).status, 200));
    start('worker', 'apps/worker/dist/main.js', { DATABASE_URL: databaseUrl(secret, 'asisteam_jobs'), POLL_MS: '1000' });
    start('web', 'apps/web/scripts/static-server.mjs', { HOST: '127.0.0.1', PORT: String(ports.web), ASISTEAM_STATIC_DIR: resolve('apps/web/dist'), ASISTEAM_VITE_API_TARGET: `http://127.0.0.1:${ports.api}` });
    // Node fetch marks requests as CORS; the gateway intentionally serves its SPA
    // shell only to browser navigations. Probe the real public HTML document.
    await ready(async () => assert.equal((await fetch(`http://127.0.0.1:${ports.web}/legal/2026-09-21`)).status, 200));
    report('development-serving', { status: 'PASS', origin: `http://127.0.0.1:${ports.web}`, externalProviders: 'disabled' });
    await Promise.all(children.map(child => new Promise(resolveExit => { if (child.exitCode !== null) resolveExit(); else child.once('exit', resolveExit); })));
  } finally {
    stop();
    const deadline = setTimeout(() => { for (const child of children) if (child.exitCode === null) child.kill('SIGKILL'); }, 10000);
    await Promise.all(children.map(child => new Promise(resolveExit => { if (child.exitCode !== null || child.signalCode !== null) resolveExit(); else child.once('exit', resolveExit); })));
    clearTimeout(deadline);
    unlinkSync(lock);
  }
}
async function main() {
  assert.equal(process.versions.node.split('.')[0], '24');
  assert.ok(['up', 'verify', 'serve', 'stop'].includes(process.argv[2]), 'Usar up | verify | serve | stop');
  const secret = await secrets();
  if (process.argv[2] === 'up') await up(secret);
  if (process.argv[2] === 'verify') await verify(secret);
  if (process.argv[2] === 'serve') await serve(secret);
  if (process.argv[2] === 'stop') {
    assert.ok(!existsSync(resolve(directory, 'serve.lock')), 'Detener primero serve con Ctrl+C');
    for (const name of Object.values(resources)) { const item = await owned('container', name); if (item?.State.Running) await docker('stop', name); }
    report('development-stopped', { status: 'PASS', data: 'preserved' });
  }
}
main().catch(() => { report('development-stack', { status: 'FAIL', diagnostic: 'Consultar configuración privada local; no se publican secretos ni errores de dependencias' }); process.exitCode = 1; });
