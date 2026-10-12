import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {suite,verify} from './run.mjs';
const files=(root,predicate)=>readdirSync(root,{withFileTypes:true}).flatMap(entry=>{
 const path=join(root,entry.name);return entry.isDirectory()?files(path,predicate):predicate(path)?[path]:[];
});
const sdk=/(?:@supabase\/(?:ssr|supabase-js)|node_modules\/(?:\.pnpm\/)?@?supabase(?:\+|\/))/;
const providerHttp=/(?:\/functions\/v1(?:\/|["'])|\/rest\/v1(?:\/|["'])|\/auth\/v1(?:\/|["']))/;
const nextImport=/(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*["'](?:next(?:\/[^"']*)?|server-only)["']|\bimport\s*["'](?:next(?:\/[^"']*)?|server-only)["']/;
const productSource=path=>/\.(?:ts|tsx|mjs|js)$/.test(path)&&!path.includes('.test.');
const reportName=process.env.CI_RETIREMENT_REPORT_NAME??'retirement';
if(!/^[a-z-]+$/.test(reportName))throw new Error('invalid_report_name');
await suite(reportName,async()=>{
 verify('product-dependencies-without-retired-frameworks',()=>{
  for(const root of ['.','apps/web','apps/api','apps/worker','packages/core','packages/api-client','packages/db']){
   const manifest=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
   assert.ok(!Object.keys({...manifest.dependencies,...manifest.devDependencies}).some(name=>['supabase','next','server-only'].includes(name)||name.startsWith('@supabase/')),root);
   assert.ok(!Object.values(manifest.scripts??{}).some(command=>/(?:^|\s)next\s+(?:dev|build|start|typegen)|node_modules\/next\//.test(command)),root);
  }
  assert.ok(!/(?:supabase(?:-js|\/ssr|:|@|\+)|^\s+(?:next|server-only)(?:@[^:]+)?:)/m.test(readFileSync('pnpm-lock.yaml','utf8')));
  for(const path of ['package.json','pnpm-workspace.yaml','turbo.json','apps/web/package.json','apps/web/Dockerfile','apps/web/vite.config.ts','apps/web/tsconfig.json','apps/web/tsconfig.build.json','apps/web/.env.example','deploy/staging/compose.yaml','.github/workflows/ci.yml','.github/workflows/extended.yml']){
   if(existsSync(path))assert.ok(!/(?:@asisteam\/web-vite|apps\/web-vite)/.test(readFileSync(path,'utf8')),path);
  }
  for(const path of ['supabase','apps/api/test/legacy-src','apps/api/test/legacy-application.mjs','apps/web-vite','apps/web/next.config.ts','apps/web/next-env.d.ts','apps/web/src/middleware.ts','apps/web/src/app/layout.tsx','apps/web/.next'])assert.ok(!existsSync(path),path);
 });
 verify('product-source-without-sdk-provider-http-or-fixtures',()=>{
  for(const root of ['apps/web/src','apps/api/src','apps/worker/src','packages/api-client/src'])for(const path of files(root,productSource)){
   const content=readFileSync(path,'utf8');assert.ok(!sdk.test(content)&&!providerHttp.test(content)&&!nextImport.test(content),path);
   if(root==='apps/web/src') assert.ok(!/\.rpc\(|(?:supabase|client)\.from\(|process\.env\.(?:NEXT_PUBLIC_|ASISTEAM_API_SUPABASE)|["']use server["']/.test(content),path);
   assert.ok(!/(?:from\s*['"][^'"]*(?:@legacy|test\/legacy|legacy-application)|import\s*\(['"][^'"]*(?:@legacy|test\/legacy|legacy-application))/.test(content),path);
  }
 });
 verify('active-tests-tooling-without-next-runtime-or-mocks',()=>{
  for(const root of ['apps/web/src','apps/web/e2e','apps/web/test','apps/web/scripts','scripts/ci','scripts/migration'])for(const path of files(root,path=>/\.(?:ts|tsx|mjs|js)$/.test(path))){
   const content=readFileSync(path,'utf8');assert.ok((path==='scripts/ci/probe.mjs'||!sdk.test(content))&&!providerHttp.test(content)&&!nextImport.test(content),path);
   if(path!=='scripts/ci/retirement.mjs')assert.ok(!/node_modules\/next\/dist|(?:vi|jest)\.mock\(["'](?:next\/|server-only)|["']supabase["'].*(?:start|db)|SUPABASE_|@asisteam\/web-vite|apps\/web-vite/i.test(content),path);
  }
 });
 verify('compiled-product-artifacts-required',()=>{
  for(const path of ['apps/web/dist/release.json','apps/api/dist/auth.js','apps/worker/dist/main.js'])assert.ok(existsSync(path),path);
  const artifact=JSON.parse(readFileSync('apps/web/dist/release.json','utf8'));
  assert.equal(artifact.sessionProtocol,'nest-opaque-v1');assert.equal(artifact.paths.length,40);
  assert.ok(!artifact.paths.some(path=>/fixture/.test(path)));
  assert.match(artifact.artifactHash,/^[a-f0-9]{64}$/);
 });
 verify('browser-module-closure-without-server-framework',()=>{
  const modules=JSON.parse(readFileSync('apps/web/dist/browser-modules.json','utf8'));
  assert.ok(modules.length>0);
  for(const path of modules)assert.ok(!sdk.test(path)&&!/node_modules\/(?:\.pnpm\/)?(?:next(?:@|\/)|server-only)|apps\/web-vite|\/test\//.test(path),path);
 });
 verify('browser-api-worker-bundles-without-retired-provider-client',()=>{
  for(const root of ['apps/web/dist/assets','apps/api/dist','apps/worker/dist'])for(const path of files(root,path=>path.endsWith('.js'))){
   const content=readFileSync(path,'utf8');assert.ok(!sdk.test(content)&&!providerHttp.test(content),path);
  }
 });
});
