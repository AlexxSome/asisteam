// Operator tooling for the owned dev209 installation. Plaintext stays in memory.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync, existsSync, chmodSync, openSync, closeSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { command, sql, normalizeDump } from '../../packages/db/scripts/local.mjs';
import { nativeBrowserDatabase } from '../../apps/api/test/native-browser-database.mjs';
import { storageFixture } from '../../apps/api/test/storage-fixture.mjs';

process.chdir(new URL('../../', import.meta.url).pathname);
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const pg = require('pg');
const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const dir = resolve('.qa/issue-209'), backups = resolve(dir, 'backups');
const sha = data => createHash('sha256').update(data).digest('hex');
const namePattern = /^dev209-[0-9]{13}-[a-f0-9-]{36}\.aesgcm$/;
const secret = JSON.parse(readFileSync(resolve(dir, 'secrets.json')));
mkdirSync(backups, { recursive: true, mode: 0o700 }); chmodSync(backups, 0o700);
const keyPath = resolve(dir, 'backup.key');
if (!existsSync(keyPath)) {
  assert.equal(readdirSync(backups).filter(name => namePattern.test(name)).length, 0, 'No regenerar una clave perdida');
  writeFileSync(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 });
}
chmodSync(keyPath, 0o600);
const key = readFileSync(keyPath), ownerId = sha(key);
assert.equal(key.length, 32);
const output = value => console.log(JSON.stringify(value));
const save = (name, value) => writeFileSync(resolve(dir, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
function decrypt(bytes) {
  assert.equal(bytes.subarray(0, 8).toString(), 'DEV209V1');
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(8, 20));
  decipher.setAAD(Buffer.from('asisteam-dev209-backup-v1'));
  decipher.setAuthTag(bytes.subarray(20, 36));
  const payload = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(36)), decipher.final()]).toString());
  assert.equal(payload.ownerId, ownerId); assert.equal(payload.environment, 'dev209-local-persistent');
  return payload;
}
async function ownedSource() {
  const data = JSON.parse(await command('docker', ['inspect', 'asisteam-dev209-postgres', 'asisteam-dev209-storage']));
  for (const item of data) assert.equal(item.Config.Labels['asisteam.development.issue'], '209');
}
function storage() {
  return new S3Client({ region: 'us-east-1', endpoint: 'http://127.0.0.1:9049', forcePathStyle: true, credentials: { accessKeyId: secret.s3key, secretAccessKey: secret.s3secret } });
}
async function inventory(client) {
  const result = []; let ContinuationToken;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: 'dev209-avatars', ContinuationToken }));
    for (const item of page.Contents ?? []) result.push({ key: item.Key, etag: item.ETag, bytes: item.Size });
    ContinuationToken = page.NextContinuationToken;
  } while (ContinuationToken);
  return result.sort((a, b) => a.key.localeCompare(b.key));
}
async function backup() {
  await ownedSource();
  const lock = openSync(resolve(dir, 'backup-run.lock'), 'wx', 0o600); closeSync(lock);
  const s3 = storage(), start = performance.now();
  const db = new pg.Client({ connectionString: `postgresql://postgres:${secret.owner}@127.0.0.1:5449/asisteam_dev209` });
  try {
    await db.connect();
    await db.query('begin isolation level repeatable read read only');
    const snapshot = (await db.query('select pg_export_snapshot() as id')).rows[0].id;
    const ledger = (await db.query('select name,sha256 from db_migrations.ledger order by name')).rows;
    const before = await inventory(s3), objects = [];
    const dump = normalizeDump(await command('docker', ['exec', 'asisteam-dev209-postgres', 'pg_dump', '-U', 'postgres', '-d', 'asisteam_dev209', '--no-owner', '--snapshot=' + snapshot, '-n', 'public', '-n', 'app_private', '-n', 'db_migrations']));
    for (const item of before) {
      const found = await s3.send(new GetObjectCommand({ Bucket: 'dev209-avatars', Key: item.key, IfMatch: item.etag }));
      const bytes = Buffer.from(await found.Body.transformToByteArray());
      assert.equal(bytes.length, item.bytes);
      objects.push({ key: item.key, body: bytes.toString('base64'), sha256: sha(bytes), contentType: found.ContentType });
    }
    assert.deepEqual(await inventory(s3), before, 'Objetos cambiaron durante el backup');
    await db.query('commit');
    const createdAt = new Date().toISOString();
    const payload = { schema: 1, ownerId, environment: 'dev209-local-persistent', createdAt, ledger, dump, dumpHash: sha(dump), objects };
    const plain = Buffer.from(JSON.stringify(payload)); assert.ok(plain.length <= 64_000_000, 'Backup local excede límite');
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from('asisteam-dev209-backup-v1'));
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const bytes = Buffer.concat([Buffer.from('DEV209V1'), iv, cipher.getAuthTag(), encrypted]);
    const filename = `dev209-${Date.now()}-${randomUUID()}.aesgcm`;
    writeFileSync(resolve(backups, filename), bytes, { mode: 0o600, flag: 'wx' });
    assert.equal(decrypt(bytes).dumpHash, payload.dumpHash);
    let removed = 0;
    for (const name of readdirSync(backups).filter(name => namePattern.test(name))) {
      const path = resolve(backups, name); assert.ok(statSync(path).isFile());
      const previous = decrypt(readFileSync(path));
      if (Date.now() - Date.parse(previous.createdAt) > 30 * 86400_000) { unlinkSync(path); removed++; }
    }
    const result = { status: 'PASS', check: 'dev209-encrypted-backup', environment: payload.environment, createdAt, file: filename, archiveSha256: sha(bytes), dumpSha256: payload.dumpHash, objects: objects.length, bytes: bytes.length, seconds: Number(((performance.now() - start) / 1000).toFixed(2)), retentionDays: 30, expiredOwnedArchivesRemoved: removed, sustainedRpo: 'PENDING' };
    save('backup.json', result); output(result); return filename;
  } finally { await db.end(); s3.destroy(); unlinkSync(resolve(dir, 'backup-run.lock')); }
}
async function restoreCheck(filename) {
  assert.match(filename, namePattern); assert.equal(basename(filename), filename);
  const started = performance.now(), bytes = readFileSync(resolve(backups, filename));
  const payload = decrypt(bytes); assert.equal(sha(payload.dump), payload.dumpHash);
  const damaged = Buffer.from(bytes); damaged[damaged.length - 1] ^= 1;
  assert.throws(() => decrypt(damaged));
  // Both helpers own disposable fixtures; no restore touches the persistent source.
  const fixture = await nativeBrowserDatabase(); let s3;
  try {
    await sql(fixture.name, 'postgres', 'create database dev209_restored template template0; grant create on database dev209_restored to asisteam_migrator;');
    await sql(fixture.name, 'dev209_restored', 'drop schema public;create schema extensions authorization asisteam_migrator;create extension pgcrypto with schema extensions;set role asisteam_migrator;' + payload.dump);
    const restored = normalizeDump(await command('docker', ['exec', fixture.name, 'pg_dump', '-U', 'postgres', '-d', 'dev209_restored', '--no-owner', '-n', 'public', '-n', 'app_private', '-n', 'db_migrations']));
    assert.equal(sha(restored), payload.dumpHash);
    s3 = await storageFixture();
    for (const object of payload.objects) {
      const body = Buffer.from(object.body, 'base64'); assert.equal(sha(body), object.sha256);
      await s3.storage.client.send(new PutObjectCommand({ Bucket: s3.storage.bucket, Key: object.key, Body: body, ContentType: object.contentType }));
      const recovered = await s3.storage.client.send(new GetObjectCommand({ Bucket: s3.storage.bucket, Key: object.key }));
      assert.equal(sha(Buffer.from(await recovered.Body.transformToByteArray())), object.sha256);
    }
    const seconds = Number(((performance.now() - started) / 1000).toFixed(2)); assert.ok(seconds < 3600);
    const result = { check: 'dev209-isolated-restore', status: 'PASS', date: new Date().toISOString(), environment: payload.environment, archiveSha256: sha(bytes), fullLogicalDumpReconciled: true, migrationLedger: payload.ledger, objectsReconciled: payload.objects.length, corruptedCiphertextRejected: true, seconds, approvedRtoSeconds: 3600, approvedRpoSeconds: 900, sustainedRpo: 'PENDING', pitr: 'PENDING-on-persistent-destination', sourceReplaced: false };
    save('restore.json', result); output(result);
  } finally { s3?.stop(); await fixture.cleanup(); }
}
async function schedule(until) {
  const end = Date.parse(until); assert.ok(Number.isFinite(end) && end > Date.now() && end - Date.now() < 24 * 3600_000);
  const path = resolve(dir, 'backup-schedule.lock'), lock = openSync(path, 'wx', 0o600); writeFileSync(lock, String(process.pid)); closeSync(lock);
  let stopped = false, timer, wake;
  const stop = () => { stopped = true; clearTimeout(timer); wake?.(); };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop);
  save('backup-schedule.json', { environment: 'dev209-local-persistent', startedAt: new Date().toISOString(), until: new Date(end).toISOString(), intervalSeconds: 900, retentionDays: 30, awakeOnly: true, sustainedRpo: 'PENDING' });
  try {
    while (!stopped && Date.now() < end) {
      const next = Math.min(Date.now() + 900_000, end);
      try { await backup(); } catch { output({ check: 'dev209-scheduled-backup', status: 'FAIL', date: new Date().toISOString() }); }
      if (!stopped && Date.now() < end) await new Promise(resolveDelay => { wake = resolveDelay; timer = setTimeout(resolveDelay, Math.max(0, next - Date.now())); });
    }
  } finally { unlinkSync(path); output({ check: 'dev209-backup-window-ended', date: new Date().toISOString() }); }
}
try {
  if (process.argv[2] === 'backup') await backup();
  else if (process.argv[2] === 'restore-check') await restoreCheck(process.argv[3] ?? '');
  else if (process.argv[2] === 'schedule-until') await schedule(process.argv[3] ?? '');
  else throw new Error('Usar backup | restore-check ARCHIVO | schedule-until ISO');
} catch { output({ check: 'dev209-backup-operation', status: 'FAIL', diagnostic: 'Diagnóstico privado omitido' }); process.exitCode = 1; }
