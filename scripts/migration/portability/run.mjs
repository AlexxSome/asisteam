// Portability now qualifies the actual native stack. Historical source exports
// are recorded in dated evidence; this command never opens a provider project.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {nativeBrowserDatabase} from '../../../apps/api/test/native-browser-database.mjs';
import {command} from '../../../packages/db/scripts/local.mjs';
const fault=process.env.PORTABILITY_FAIL_AFTER;
const report={kind:'native-destination-qualification',date:new Date().toISOString(),checks:[]};
let fixture;
try {
 if(fault){
  assert.equal(fault,'owned-native-fixture');
  fixture=await nativeBrowserDatabase();
  // Inject only after a real migrated resource exists. Finally must remove it.
  report.checks.push({check:'owned-native-fixture',status:'FAIL',expected:true});
  throw new Error('injected_fault');
 }
 if(!process.argv.includes('--verified-report'))await command(process.execPath,['apps/api/test/independent-postgres.integration.mjs']);
 const native=JSON.parse(await readFile('.ci-results/independent-postgres.json','utf8'));
 assert.equal(native.sourceCommit,(await command('git',['rev-parse','HEAD'])).trim());
 assert.ok(Date.now()-Date.parse(native.date)<30*60*1000,'fresh_native_qualification_required');
 assert.ok(native.checks.length>=15&&native.checks.every(record=>record.status==='PASS'));
 assert.ok(native.reconciledTables>=40&&native.pgtapCases>=50);
 assert.ok(Object.values(native.pitr).every(Boolean));
 report.sourceCommit=native.sourceCommit;
 report.checks=native.checks;
 report.reconciledTables=native.reconciledTables;
 report.pitr=native.pitr;
 report.pending=native.pending;
}catch(error){
 if(!fault)report.checks.push({check:'native-qualification-evidence',status:'FAIL'});
 console.error('portability FAIL');process.exitCode=1;
}finally{
 if(fixture){
  try{
   const name=fixture.name;await fixture.cleanup();
   await assert.rejects(command('docker',['inspect',name]));
   report.checks.push({check:'owned-resource-cleanup',status:'PASS'});
  }catch{report.checks.push({check:'owned-resource-cleanup',status:'FAIL'});process.exitCode=1;}
 }
 await mkdir('.ci-results',{recursive:true});
 await writeFile(fault?'.ci-results/portability-fault.json':'.ci-results/portability.json',JSON.stringify(report,null,2)+'\n');
}
