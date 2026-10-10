import { writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ListObjectsV2Command } from '../../../apps/api/node_modules/@aws-sdk/client-s3/dist-cjs/index.js';
import { AvatarStorage, AVATAR_KEY, sha256 } from '../../../apps/api/dist/storage.js';
import { loadConfig } from '../../../apps/api/dist/config.js';
import pg from '../../../apps/api/node_modules/pg/lib/index.js';

export function avatarReference(reference) {
  const key = typeof reference === 'string' && reference.startsWith('/profile/avatar/')
    ? reference.slice('/profile/avatar/'.length) : '';
  if (!AVATAR_KEY.test(key)) throw new Error('unsupported_avatar_reference');
  return key;
}
async function inventory(storage, scope) {
  const keys = new Set();
  let continuation;
  do {
    const page = await storage.client.send(new ListObjectsV2Command({ Bucket: storage.bucket, ContinuationToken: continuation }));
    for (const object of page.Contents ?? []) {
      if (!scope || scope.includes(object.Key.split('/')[0])) keys.add(object.Key);
    }
    continuation = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuation);
  return keys;
}
/** Operator-only immutable private S3 copy, including post-snapshot deltas. */
export async function reconcile({ database, source, storage, direction = 'forward', scope, manifestPath }) {
  if (!['forward', 'reverse'].includes(direction)) throw new Error('invalid_direction');
  const [from, to] = direction === 'forward' ? [source, storage] : [storage, source];
  await from.assertPrivate();
  await to.assertPrivate();
  const ownScope = scope?.length ? scope : null;
  const profiles = (await database.query('select id,auth_user_id,avatar_url from public.users where ($1::uuid[] is null or auth_user_id=any($1))', [ownScope])).rows;
  const owners = new Map(profiles.filter(row => row.auth_user_id).map(row => [row.auth_user_id, row.id]));
  const references = profiles.filter(row => row.avatar_url).map(row => ({ ...row, key: avatarReference(row.avatar_url) }));
  for (const row of references) if (row.key.split('/')[0] !== row.auth_user_id) throw new Error('avatar_owner_mismatch');
  const keys = await inventory(from, ownScope);
  for (const key of keys) if (!AVATAR_KEY.test(key) || !owners.has(key.split('/')[0])) throw new Error('avatar_owner_missing');
  for (const row of references) if (!keys.has(row.key)) throw new Error('active_avatar_missing');
  const objects = [];
  for (const key of [...keys].sort()) {
    const original = await from.read(key);
    let copy;
    try { copy = await to.read(key); }
    catch (error) { if (!['NotFound', 'NoSuchKey'].includes(error?.name)) throw error; }
    // Never overwrite a conflicting object or remove an ambiguous prior copy.
    if (!copy) { await to.put(key, original.bytes, original.type); copy = await to.read(key); }
    if (sha256(copy.bytes) !== sha256(original.bytes) || copy.type !== original.type) throw new Error('checksum_mismatch');
    for (const bucket of [from, to]) {
      const anonymous = new URL(await bucket.signedRead(key)); anonymous.search = '';
      const response = await fetch(anonymous, { redirect: 'error', signal: AbortSignal.timeout(5000) });
      await response.body?.cancel();
      if (response.ok) throw new Error('bucket_public');
    }
    objects.push({ key, owner_profile_id: owners.get(key.split('/')[0]), owner_auth_id: key.split('/')[0], bytes: original.bytes.length, type: original.type, sha256: sha256(original.bytes) });
  }
  // A repeated final delta is mandatory when uploads or references changed.
  const current = await inventory(from, ownScope);
  if (current.size !== keys.size || [...current].some(key => !keys.has(key))) throw new Error('avatar_delta_conflict');
  const latest = (await database.query('select id,auth_user_id,avatar_url from public.users where ($1::uuid[] is null or auth_user_id=any($1))', [ownScope])).rows;
  if (JSON.stringify(latest.map(row => [row.id, row.avatar_url]).sort()) !== JSON.stringify(profiles.map(row => [row.id, row.avatar_url]).sort())) throw new Error('avatar_delta_conflict');
  if (manifestPath) {
    const path = resolve(manifestPath);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    if (((await stat(dirname(path))).mode & 0o077) !== 0) throw new Error('manifest_directory_not_private');
    await writeFile(path, JSON.stringify({ version: 2, direction, objects }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  }
  return { direction, objects: objects.length, bytes: objects.reduce((n, row) => n + row.bytes, 0), references: references.length, checksums: true };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let database, source, storage;
  try {
    if (process.env.STORAGE_MIGRATION_ACK !== 'frozen-synthetic-or-approved-cutover') throw new Error('cutover_not_acknowledged');
    if (!process.env.STORAGE_MANIFEST_PATH) throw new Error('missing_configuration');
    const config = loadConfig({ ...process.env, DATABASE_URL: process.env.STORAGE_MIGRATION_DATABASE_URL });
    database = new pg.Client({ connectionString: config.DATABASE_URL }); await database.connect();
    // A subject role must fail rather than silently copy an RLS-filtered subset.
    await database.query('set row_security=off');
    storage = new AvatarStorage(config);
    source = new AvatarStorage(loadConfig({ ...config, S3_ENDPOINT: process.env.STORAGE_SOURCE_S3_ENDPOINT, S3_AVATAR_BUCKET: process.env.STORAGE_SOURCE_S3_BUCKET, S3_REGION: process.env.STORAGE_SOURCE_S3_REGION, S3_ACCESS_KEY_ID: process.env.STORAGE_SOURCE_S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY: process.env.STORAGE_SOURCE_S3_SECRET_ACCESS_KEY }));
    console.log(JSON.stringify({ status: 'PASS', ...await reconcile({ database, source, storage, direction: process.env.STORAGE_MIGRATION_DIRECTION ?? 'forward', manifestPath: process.env.STORAGE_MANIFEST_PATH }) }));
  } catch { console.error(JSON.stringify({ status: 'FAIL', check: 'storage-reconciliation' })); process.exitCode = 1; }
  finally { source?.client?.destroy(); storage?.client?.destroy(); await database?.end(); }
}
