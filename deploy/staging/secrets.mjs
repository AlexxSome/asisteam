import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
const dir = process.argv[2];
if (!dir || !isAbsolute(dir) || resolve(dir).startsWith(resolve('.') + '/')) throw new Error('Usar directorio absoluto externo al repositorio');
mkdirSync(dir, { recursive: true, mode: 0o700 });
for (const role of ['bootstrap', 'runtime', 'migrator']) {
  const password = randomBytes(24).toString('hex');
  writeFileSync(`${dir}/${role}_password`, password, { mode: 0o444, flag: 'wx' });
  if (role !== 'bootstrap') writeFileSync(`${dir}/${role}_url`, `postgresql://asisteam_${role}:${password}@postgres:5432/asisteam_staging`, { mode: 0o444, flag: 'wx' });
}
console.log('Secretos sintéticos creados fuera del repositorio');
