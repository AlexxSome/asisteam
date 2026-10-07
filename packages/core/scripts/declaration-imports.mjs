import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// tsc's bundler resolution preserves relative TS/extensionless paths in declarations.
// Runtime consumers use NodeNext: expose declarations with matching .js specifiers.
async function rewrite(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await rewrite(path);
    else if (entry.name.endsWith('.d.ts')) {
      const source = await readFile(path, 'utf8');
      await writeFile(path, source.replace(/(from\s+["'])(\.[^"']+)(["'])/g, (_match, prefix, specifier, suffix) =>
        prefix + (specifier.endsWith('.js') ? specifier : specifier.replace(/\.ts$/, '') + '.js') + suffix));
    }
  }
}
await rewrite(fileURLToPath(new URL('../dist', import.meta.url)));
