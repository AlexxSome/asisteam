import { readFileSync } from 'node:fs';
try {
  if (!process.env.DATABASE_URL_FILE || process.env.DATABASE_URL) throw new Error();
  process.env.DATABASE_URL = readFileSync(process.env.DATABASE_URL_FILE, 'utf8').trim();
  await import('../dist/main.js');
} catch {
  console.error(JSON.stringify({ level: 'error', event: 'secret_configuration_invalid' }));
  process.exitCode = 1;
}
