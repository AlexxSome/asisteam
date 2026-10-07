import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pg from 'pg';
// Operative infrastructure only. Product SQL/RLS stays in Supabase until MIG-15.
let client;
try {
  client = new pg.Client({ connectionString: readFileSync('/run/secrets/migrator_url', 'utf8').trim(), statement_timeout: 10000 });
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(147)');
  await client.query('CREATE TABLE IF NOT EXISTS staging_runtime.migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const version of readdirSync('/migrations').filter(name => /^\d{3}_[a-z_]+\.sql$/.test(name)).sort()) {
    const sql = readFileSync(`/migrations/${version}`, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const applied = await client.query('SELECT checksum FROM staging_runtime.migrations WHERE version=$1', [version]);
    if (applied.rows.length) { if (applied.rows[0].checksum !== checksum) throw new Error(); continue; }
    await client.query(sql);
    await client.query('INSERT INTO staging_runtime.migrations(version, checksum) VALUES ($1, $2)', [version, checksum]);
  }
  await client.query('COMMIT');
  console.log(JSON.stringify({ event: 'staging_migrations_applied' }));
} catch {
  if (client) await client.query('ROLLBACK').catch(() => {});
  console.error(JSON.stringify({ event: 'staging_migrations_failed' }));
  process.exitCode = 1;
} finally { if (client) await client.end(); }
