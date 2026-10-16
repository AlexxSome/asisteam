// Synthetic account setup and repeatable Auth/RLS/persistence probes for dev209 only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {command} from '../../packages/db/scripts/local.mjs';
process.chdir(new URL('../../',import.meta.url).pathname);
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const pg=require('pg'),argon2=require('argon2');
const dir=new URL('../../.qa/issue-209/',import.meta.url),secret=JSON.parse(readFileSync(new URL('secrets.json',dir)));
const client=new pg.Client({connectionString:`postgresql://postgres:${secret.owner}@127.0.0.1:5449/asisteam_dev209`});
for(const item of JSON.parse(await command('docker',['inspect','asisteam-dev209-postgres','asisteam-dev209-storage'])))assert.equal(item.Config.Labels['asisteam.development.issue'],'209');
await client.connect();
const records={date:new Date().toISOString(),environment:'dev209-local-persistent',checks:[]};
const pass=check=>records.checks.push({check,status:'PASS'});
const privateSave=(name,data)=>writeFileSync(new URL(name,dir),JSON.stringify(data,null,2)+'\n',{mode:0o600});
let accounts;
try{accounts=JSON.parse(readFileSync(new URL('accounts.json',dir)))}catch{
 accounts=[];
 for(const kind of ['admin','outsider']){
  const subject=randomUUID(),user=randomUUID(),email=`dev209-${kind}@synthetic.example.test`,password=randomBytes(24).toString('hex');
  const hash=await argon2.hash(password,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
  await client.query('insert into app_private.auth_subjects(id,email,native_owned) values($1,$2,true)',[subject,email]);
  await client.query('insert into app_private.auth_credentials(subject_id,password_hash) values($1,$2)',[subject,hash]);
  await client.query("insert into public.users(id,auth_user_id,email,full_name,birthdate,account_status) values($1,$2,$3,$4,'1990-01-01','ACTIVE')",[user,subject,email,`Persona sintética ${kind} DEV209`]);
  await client.query("insert into public.account_consents(user_id,terms_version,channel) values($1,'2026-09-21','IN_APP')",[user]);
  accounts.push({kind,subject,user,email,password});
 }
 privateSave('accounts.json',accounts);
}
const origin='http://127.0.0.1:3049/api/v1';
async function post(path,body,token){const r=await fetch(origin+path,{method:'POST',headers:{'content-type':'application/json','x-asisteam-auth-proxy':secret.proxy,'x-asisteam-client-ip':'dev209-smoke-'+randomUUID(),...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});return{status:r.status,body:await r.json()}}
try{
 const a=await post('/auth/login',{email:accounts[0].email,password:accounts[0].password});assert.equal(a.status,200);pass('native-login');
 const b=await post('/auth/login',{email:accounts[1].email,password:accounts[1].password});assert.equal(b.status,200);
 let state;try{state=JSON.parse(readFileSync(new URL('marker.json',dir)))}catch{state={}}
 if(!state.groupA){const r=await post('/groups',{name:'Club sintético A DEV209',sport:'Fútbol',description:'Ensayo local aislado',logo_url:''},a.body.access_token);assert.equal(r.status,201);state.groupA=r.body.group_id;const q=await post('/groups',{name:'Club sintético B DEV209',sport:'Tenis',description:'Otro tenant sintético',logo_url:''},b.body.access_token);assert.equal(q.status,201);state.groupB=q.body.group_id;privateSave('marker.json',state)}
 const visible=await fetch(origin+'/groups/'+state.groupA,{headers:{authorization:'Bearer '+a.body.access_token}});assert.equal(visible.status,200);pass('native-authorized-tenant');
 const denied=await fetch(origin+'/groups/'+state.groupB,{headers:{authorization:'Bearer '+a.body.access_token}});assert.equal(denied.status,404);pass('cross-tenant-404');
 const refresh=await post('/auth/refresh',{refresh_token:a.body.refresh_token});assert.equal(refresh.status,200);pass('refresh-rotation');
 const logout=await post('/auth/logout',{},refresh.body.access_token);assert.equal(logout.status,200);pass('logout');
 assert.equal((await fetch(origin+'/auth/session',{headers:{authorization:'Bearer '+refresh.body.access_token}})).status,401);pass('revoked-session-denied');
 assert.equal((await post('/auth/refresh',{refresh_token:refresh.body.refresh_token})).status,401);pass('revoked-refresh-denied');
 const count=(await client.query('select count(*)::int as n from public.groups where id=any($1)',[[state.groupA,state.groupB]])).rows[0].n;assert.equal(count,2);pass('persistent-group-marker');
 const {S3Client,PutObjectCommand,GetObjectCommand}=require('@aws-sdk/client-s3');
 const s3=new S3Client({region:'us-east-1',endpoint:'http://127.0.0.1:9049',forcePathStyle:true,credentials:{accessKeyId:secret.s3key,secretAccessKey:secret.s3secret}});
 try{if(!state.object){state.object=randomBytes(32).toString('hex');await s3.send(new PutObjectCommand({Bucket:'dev209-avatars',Key:'acceptance/installation-marker',Body:state.object}));privateSave('marker.json',state)}const found=await s3.send(new GetObjectCommand({Bucket:'dev209-avatars',Key:'acceptance/installation-marker'}));assert.equal(await found.Body.transformToString(),state.object);pass('persistent-private-object-marker');assert.equal((await fetch('http://127.0.0.1:9049/dev209-avatars/acceptance/installation-marker')).status,403);pass('existing-private-object-anonymous-denied')}finally{s3.destroy()}
 records.markerHash=createHash('sha256').update(JSON.stringify(state)).digest('hex');records.status='PASS';privateSave('smoke.json',records);console.log(JSON.stringify(records));
}catch(error){privateSave('smoke-private-error.json',{message:error.message,stack:error.stack});console.log(JSON.stringify({status:'FAIL',completed:records.checks}));process.exitCode=1}finally{await client.end()}
