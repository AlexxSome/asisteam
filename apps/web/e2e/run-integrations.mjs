import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {nativeBrowserDatabase} from '../../api/test/native-browser-database.mjs';
const modules=['ACCOUNT_CONSENT','GROUP','GUARDIANSHIP','ACTIVITY_TYPE','WEEKLY_ACTIVITY','HISTORY','REPORT','MEMBER_MANAGEMENT','MANAGED_MEMBER','MEMBERSHIP_REVIEW','WARD_HISTORY','SEND_INVITATION','INVITATION','CHECKIN','ANNOUNCEMENT','BILLING'];
const flags=Object.fromEntries(modules.map(name=>['RUN_'+name+'_INTEGRATION','1']));
flags.RUN_NATIVE_RECOVERY_INTEGRATION='1';
const args=process.argv.slice(2);
const hasSelector=args.some((arg,index)=>!arg.startsWith('-')&&!(args[index-1]?.startsWith('-')&&!args[index-1].includes('=')));
if(!hasSelector)args.unshift('integration.test.ts');
const fixture=await nativeBrowserDatabase();
try {
 const child=spawn(process.execPath,['node_modules/vitest/vitest.mjs','run',...args,'--maxWorkers=1'],{env:{...process.env,...flags,TEST_DATABASE_URL:fixture.url,NATIVE_TEST_CONTAINER:fixture.name,NATIVE_TEST_OPERATOR:randomBytes(32).toString('hex'),INVITATION_PROXY_SECRET:randomBytes(32).toString('hex')},stdio:'inherit'});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
 const code=await new Promise(resolve=>child.on('exit',code=>resolve(code??1)));process.exitCode=code;
}finally{await fixture.cleanup()}
