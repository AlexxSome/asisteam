import {spawn} from 'node:child_process';
import {writeFileSync,appendFileSync} from 'node:fs';
import {nativeBrowserDatabase} from './native-browser-database.mjs';
const local=process.env.LOCAL_DIAGNOSTICS==='1',file='/tmp/issue168-native-suite-diagnostic.log';
let fixture;
try{
 fixture=await nativeBrowserDatabase();
 if(local)writeFileSync(file,'',{mode:0o600});
 const child=spawn(process.execPath,['--test','--test-concurrency=1','--test-timeout=60000','--test-reporter=tap',...process.argv.slice(2)],{env:{...process.env,API_RLS_TEST:'1',WORKER_TEST:'1',TEST_DATABASE_URL:fixture.url,INDEPENDENT_PG_TEST_URL:fixture.url},stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
 let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output+=chunk;if(local)appendFileSync(file,chunk)});
 const timer=setTimeout(()=>{try{process.kill(process.platform==='win32'?child.pid:-child.pid,'SIGKILL')}catch{/* child completed */}},240000);
 const code=await new Promise(resolve=>{child.once('error',()=>resolve(1));child.once('exit',resolve)});clearTimeout(timer);
 if(code===0)process.stdout.write(output);else throw new Error('native_tests_failed');
}catch{console.error('native_suite FAIL');process.exitCode=1}finally{await fixture?.cleanup()}
