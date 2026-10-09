import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {suite,verify} from './run.mjs';
const files=(root,predicate)=>readdirSync(root,{withFileTypes:true}).flatMap(entry=>{
 const path=join(root,entry.name);return entry.isDirectory()?files(path,predicate):predicate(path)?[path]:[];
});
const sdk=/(?:@supabase\/(?:ssr|supabase-js)|node_modules\/(?:\.pnpm\/)?@?supabase(?:\+|\/))/;
const providerHttp=/(?:\/functions\/v1(?:\/|["'])|\/rest\/v1(?:\/|["'])|\/auth\/v1(?:\/|["']))/;
const productSource=path=>/\.(?:ts|tsx|mjs)$/.test(path)&&!path.includes('.test.');
await suite('retirement',async()=>{
 verify('product-dependencies-without-supabase',()=>{
  for(const root of ['apps/web','apps/api','apps/worker']){
   const manifest=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));
   assert.ok(!Object.keys(manifest.dependencies??{}).some(name=>name.startsWith('@supabase/')),root);
  }
 });
 verify('product-source-without-sdk-provider-http-or-fixtures',()=>{
  for(const root of ['apps/web/src','apps/api/src','apps/worker/src','packages/api-client/src'])for(const path of files(root,productSource)){
   const content=readFileSync(path,'utf8');assert.ok(!sdk.test(content)&&!providerHttp.test(content),path);
   if(root==='apps/web/src') assert.ok(!/\.rpc\(|(?:supabase|client)\.from\(|process\.env\.(?:NEXT_PUBLIC_SUPABASE|ASISTEAM_API_SUPABASE)/.test(content),path);
   assert.ok(!/(?:from\s*['"][^'"]*(?:@legacy|test\/legacy|legacy-application)|import\s*\(['"][^'"]*(?:@legacy|test\/legacy|legacy-application))/.test(content),path);
  }
 });
 verify('compiled-product-artifacts-required',()=>{
  for(const path of ['apps/web/.next/BUILD_ID','apps/api/dist/auth.js','apps/worker/dist/main.js'])assert.ok(existsSync(path),path);
 });
 verify('next-traces-without-sdk-or-origin-harness',()=>{
  const traces=files('apps/web/.next/server',path=>path.endsWith('.nft.json'));assert.ok(traces.length>=39);
  for(const path of traces)for(const file of JSON.parse(readFileSync(path,'utf8')).files){assert.ok(!sdk.test(file),path);assert.ok(!/(?:\/test\/legacy\/|\/test\/legacy-src\/|legacy-application)/.test(file),path)}
 });
 verify('production-routes-without-synthetic-fixtures',()=>{
  const routes=JSON.parse(readFileSync('apps/web/.next/app-path-routes-manifest.json','utf8'));
  assert.ok(!Object.values(routes).some(path=>/fixture/.test(path)));
 });
 verify('server-browser-api-worker-bundles-without-provider-client',()=>{
  for(const root of ['apps/web/.next/server','apps/web/.next/static','apps/api/dist','apps/worker/dist'])for(const path of files(root,path=>path.endsWith('.js'))){
   const content=readFileSync(path,'utf8');assert.ok(!sdk.test(content)&&!providerHttp.test(content),path);
  }
 });
});
