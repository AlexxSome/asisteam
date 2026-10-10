// All domain pgTAP runs against an owned vanilla PostgreSQL17 fixture.
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {nativeBrowserDatabase} from '../../../apps/api/test/native-browser-database.mjs';
import {command} from './local.mjs';
const reportName=process.env.DOMAIN_SQL_REPORT_NAME??'domain-sql';
if(!/^[a-z-]+$/.test(reportName))throw new Error('invalid_report_name');
const fixture=await nativeBrowserDatabase();
const results=[];
try {
 const domain=new URL('../tests/domain/',import.meta.url);
 const requested=process.argv.slice(2);
 const files=requested.length?requested:(await readdir(domain)).filter(name=>name.endsWith('.sql')).map(name=>new URL(name,domain).pathname);
 for(const file of files){
  const content=await readFile(file,'utf8');
  const setup=await readFile(new URL('../fixtures/domain.sql',import.meta.url),'utf8');
  const script=content.replace('\\i packages/db/fixtures/domain.sql',()=>setup);
  let output;
  try{output=await command('docker',['exec','-i',fixture.name,'psql','-U','postgres','-d','postgres','-XAt','-v','ON_ERROR_STOP=1'],script)}
  catch(error){results.push({file,status:'FAIL',reason:String(error.diagnostic??error.message).replaceAll(fixture.password,'[redacted]').match(/ERROR:[^\n]*(?:\n[^\n]*)?/g)?.join('\n')??'sql_error'});continue}
  const cases=(output.match(/^(?:not )?ok \d+/gm)??[]).length;
  const failures=(output.match(/^not ok .*/gm)??[]);
  const plan=/^1\.\.(\d+)$/m.exec(output)?.[1];
  results.push({file,status:!failures.length&&cases>0&&Number(plan)===cases?'PASS':'FAIL',cases,failures});
  console.log(file.split('/').at(-1)+' '+results.at(-1).status+' '+cases);
 }
 await mkdir('.ci-results',{recursive:true});await writeFile(`.ci-results/${reportName}.json`,JSON.stringify({checks:results,totalCases:results.reduce((sum,r)=>sum+(r.cases??0),0)},null,2)+'\n');
 if(results.some(r=>r.status!=='PASS'))throw new Error('domain_sql_failed');
}finally{await fixture.cleanup()}
