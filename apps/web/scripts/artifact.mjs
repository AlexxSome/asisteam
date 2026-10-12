import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
// Extract from the Router's literal route objects, never a second route registry.
export function routePaths(source) {
  const paths = new Set(['/']);
  const tree = ts.createSourceFile('router.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = node => {
    if (ts.isPropertyAssignment(node) && node.name.getText(tree) === 'path') {
      assert.ok(ts.isStringLiteral(node.initializer), 'El proxy requiere paths literales de Router');
      const value = node.initializer.text;
      if (value !== '*' && value !== '/') paths.add('/' + value.replace(/^\//, ''));
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return [...paths].sort();
}
export function measure(directory) {
  const vite = JSON.parse(readFileSync(join(directory, '.vite/manifest.json'), 'utf8'));
  const closure = (key, seen = new Set()) => {
    if (seen.has(key)) return seen;
    assert.ok(vite[key], 'Import ausente del manifiesto');
    seen.add(key);
    for (const dependency of vite[key].imports ?? []) closure(dependency, seen);
    return seen;
  };
  const bytes = keys => {
    const files = new Set([...keys].flatMap(key => [vite[key].file, ...(vite[key].css ?? [])]));
    return [...files].reduce((sum, file) => sum + gzipSync(readFileSync(join(directory, file))).length, 0);
  };
  const initial = new Set(Object.keys(vite).filter(key => vite[key].isEntry).flatMap(key => [...closure(key)]));
  return {
    initialGzipBytes: bytes(initial),
    routes: Object.keys(vite).filter(key => key.startsWith('src/routes/') && vite[key].isDynamicEntry)
      .map(key => ({ module: key, additionalGzipBytes: bytes(new Set([...closure(key)].filter(dependency => !initial.has(dependency)))) }))
      .sort((a, b) => a.module.localeCompare(b.module)),
  };
}
export function manifestFiles(directory) {
  const walk = prefix => readdirSync(join(directory, prefix), { withFileTypes: true }).flatMap(entry => {
    const path = prefix ? prefix + '/' + entry.name : entry.name;
    assert.ok(!entry.isSymbolicLink(), 'Symlinks no permitidos en artefacto');
    return entry.isDirectory() ? walk(path) : path === 'release.json' ? [] : [path];
  });
  return walk('').sort().map(path => {
    const data = readFileSync(join(directory, path));
    return { path, sha256: sha256(data), bytes: data.length };
  });
}
export function writeArtifact(directory, { sourceCommit, paths, performance } = {}) {
  const manifest = { schema: 1, sourceCommit, sessionProtocol: 'nest-opaque-v1', paths, performance, files: manifestFiles(directory) };
  manifest.artifactHash = sha256(JSON.stringify(manifest));
  writeFileSync(join(directory, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const sourceCommit = process.env.SOURCE_COMMIT ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const artifact = writeArtifact('dist', { sourceCommit, paths: routePaths(readFileSync('src/router.tsx', 'utf8')), performance: measure('dist') });
  console.log(JSON.stringify({ check: 'vite-static-manifest', status: 'PASS', sourceCommit, artifactHash: artifact.artifactHash, navigationPaths: artifact.paths.length, initialGzipBytes: artifact.performance.initialGzipBytes, lazyModules: artifact.performance.routes.length }));
}
