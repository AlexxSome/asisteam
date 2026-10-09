import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import ts from 'typescript';
const source = new URL('./', import.meta.url), output = new URL('../.ci-legacy/', import.meta.url);
mkdirSync(output, {recursive:true});
for (const name of ['config','auth','database','invitations','native-auth']) {
  const src = readFileSync(new URL(name+'.ts', source), 'utf8');
  const compiled = ts.transpileModule(src, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,experimentalDecorators:true,emitDecoratorMetadata:true}}).outputText;
  writeFileSync(new URL(name+'.js', output), compiled);
}
