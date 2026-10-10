import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,rm,chmod,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import pg from 'pg';
import {createApplication} from '../dist/application.js';
import {loadConfig} from '../dist/config.js';
import {SafeLogger} from '../dist/logger.js';
import {WorkerStore} from '../../worker/dist/store.js';
import {BillingStore} from '../dist/billing.js';
import {ApiClient} from '../../../packages/api-client/dist/index.js';
import {attendanceMetrics} from '../../../packages/core/dist/index.js';
import {migrate} from '../../../packages/db/scripts/migrate.mjs';
import {persistenceTypes} from '../../../packages/db/scripts/types.mjs';
import {command,sql,normalizeDump,quote} from '../../../packages/db/scripts/local.mjs';
import {rehearseCutover} from './cutover-rehearsal.mjs';
import {qualifyDestination} from './destination-qualification.mjs';
const root=new URL('../../../packages/db/',import.meta.url),name='asisteam-db165-'+randomUUID().replaceAll('-','');
const password=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex'),dir=await mkdtemp(join(tmpdir(),'asisteam-db165-'));
await chmod(dir,0o700);
const recovery=name+'-recovery',report={sourceCommit:(await command('git',['rev-parse','HEAD'])).trim(),environment:process.env.GITHUB_ACTIONS?'github-actions-synthetic':'local-synthetic',date:new Date().toISOString(),checks:[],pending:['managed-provider-provisioning','production-volume-and-connection-budget','external-backup-encryption-retention-and-RPO-RTO','production-cutover-166-168']};
let created=false,recoveryCreated=false,app,owner,worker,billing,deploy,runtimeConfig;const logs=[];
const digest=value=>createHash('sha256').update(value).digest('hex');
async function check(name,fn){const start=performance.now();try{const result=await fn();report.checks.push({check:name,status:'PASS',seconds:Number(((performance.now()-start)/1000).toFixed(3))});console.log(JSON.stringify(report.checks.at(-1)));return result;}catch(error){report.checks.push({check:name,status:'FAIL',code:/^[A-Za-z0-9_]+$/.test(error.code??'')?error.code:undefined,position:error.position,sqlLine:error.sqlLine,object:error.message?.match(/permission denied for (?:schema|table|function) [a-z_0-9]+/)?.[0],httpStatus:error.status,location:error.stack?.match(/independent-postgres\.integration\.mjs:\d+:\d+/)?.[0],category:['TypeError','AssertionError','Error'].includes(error.name)?error.name:undefined,seconds:Number(((performance.now()-start)/1000).toFixed(3))});throw new Error(name,{cause:error});}}
async function connect(port,role='postgres',database='postgres'){const client=new pg.Client({host:'127.0.0.1',port,user:role,password,database});await client.connect();return client;}
try {
 await check('vanilla-postgres17-with-pgtap-fixture',()=>command('docker',['build','-f','packages/db/Dockerfile.test','-t','asisteam-db165-test','.']));
 const port=await check('isolated-destination-and-wal-archiving',async()=>{
  await command('docker',['run','-d','--name',name,'-p','127.0.0.1::5432','-e','POSTGRES_PASSWORD='+password,'asisteam-db165-test','postgres','-c','max_connections=40','-c','archive_mode=on','-c','archive_command=cp %p /var/lib/postgresql/wal/%f']);created=true;
  for(let n=0;n<100;n++){try{await command('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);break;}catch{if(n===99)throw new Error('ready');await new Promise(resolve=>setTimeout(resolve,100));}}
  await command('docker',['exec','-u','postgres',name,'mkdir','-p','/var/lib/postgresql/wal']);
  const inspect=JSON.parse(await command('docker',['inspect',name]))[0];assert.equal(inspect.NetworkSettings.Ports['5432/tcp'][0].HostIp,'127.0.0.1');return Number(inspect.NetworkSettings.Ports['5432/tcp'][0].HostPort);
 });
 owner=await connect(port);
 report.targetPostgres=(await owner.query('show server_version')).rows[0].server_version;
 report.targetImage=(await command('docker',['image','inspect','asisteam-db165-test','--format','{{.Id}}'])).trim();
 await check('clean-baseline-with-deploy-role-and-ledger',async()=>{
  await owner.query(await readFile(new URL('bootstrap.sql',root),'utf8'));
  for(const role of ['asisteam_migrator','asisteam_api','asisteam_jobs','asisteam_auth','asisteam_invitation','asisteam_billing'])await owner.query('alter role '+role+' login password '+quote(password));
  deploy=await connect(port,'asisteam_migrator');await migrate(deploy);await migrate(deploy);
  assert.equal((await owner.query('select count(*)::int as n from db_migrations.ledger')).rows[0].n,1);
 });
 await check('pgtap-destination-policies-and-invariants',async()=>{
  const output=await sql(name,'postgres',await readFile(new URL('tests/independent.sql',root),'utf8'));assert.doesNotMatch(output,/not ok|Looks like you failed/);assert.match(output,/1\.\.23/);
  const legacy=await readFile(new URL('../../../packages/db/tests/report_metrics.test.sql',import.meta.url),'utf8'),cases=JSON.parse(await readFile(new URL('fixtures/attendance-cases.json',root),'utf8'));
  assert.deepEqual(cases,JSON.parse(legacy.match(/jsonb_to_recordset\(\$cases\$([\s\S]*?)\$cases\$/)[1]));
  const canonical=await sql(name,'postgres','set search_path=public,extensions;'+legacy);assert.doesNotMatch(canonical,/not ok|Looks like you failed/);
  for(const {name:_name,...expected} of cases){assert.deepEqual(attendanceMetrics(expected),expected);const actual=(await owner.query('select * from app_private.attendance_metrics($1,$2,$3,$4)',[expected.present,expected.late,expected.absent,expected.excused])).rows[0];assert.equal(actual.attendance_pct===null?null:Number(actual.attendance_pct),expected.attendance_pct);}
  report.pgtapCases=50;report.canonicalMetricCases=cases.length;
 });
 await check('persistence-types-and-migration-hashes-independent',async()=>{
  const actualCatalog=(await owner.query(await readFile(new URL('scripts/catalog.sql',root),'utf8'))).rows[0].jsonb_build_object,expectedCatalog=JSON.parse(await readFile(new URL('source-catalog.json',root),'utf8'));report.catalogDifferences=Object.keys(expectedCatalog).filter(key=>JSON.stringify(actualCatalog[key])!==JSON.stringify(expectedCatalog[key]));if(report.catalogDifferences.length){await mkdir('.ci-results',{recursive:true});await writeFile('.ci-results/catalog-difference.json',JSON.stringify(Object.fromEntries(report.catalogDifferences.map(key=>[key,{actual:actualCatalog[key],expected:expectedCatalog[key]}])),null,2));}assert.deepEqual(actualCatalog,expectedCatalog);
  const output=await persistenceTypes(owner),path=new URL('src/persistence.types.ts',root);
  if(process.env.DB_GENERATE_TYPES==='1')await writeFile(path,output);else assert.equal(output,await readFile(path,'utf8'));
  assert.equal(digest(await readFile(new URL('migrations/0001_baseline.sql',root))),JSON.parse(await readFile(new URL('transformation.json',root),'utf8')).baselineSha256);
  const changed=new URL('changed/',new URL('file://'+dir+'/'));await mkdir(changed);await writeFile(new URL('0001_baseline.sql',changed),'-- tampered');await assert.rejects(migrate(deploy,changed),/migration_history_changed/);
  const missing=new URL('missing/',new URL('file://'+dir+'/'));await mkdir(missing);await assert.rejects(migrate(deploy,missing),/migration_history_missing/);
  await owner.query('create database denied');const denied=await connect(port,'asisteam_api');await assert.rejects(migrate(denied),/deployment_role_required/);await denied.end();
 });
 const ids=Object.fromEntries(['admin','athlete','guardian','coach'].map(k=>[k,{subject:randomUUID(),profile:randomUUID()}]));
 const managed=randomUUID(),passwordLogin='Synthetic165-'+randomUUID();let origin,sessions={},group,other;
 await check('native-identities-and-http-api-with-minimal-roles',async()=>{
  for(const [kind,id] of Object.entries(ids)){
   await owner.query('insert into app_private.auth_subjects(id,email,native_owned) values($1,$2,true)',[id.subject,kind+'@example.invalid']);
   await owner.query("insert into app_private.auth_credentials(subject_id,password_hash) values($1,extensions.crypt($2,extensions.gen_salt('bf',4)))",[id.subject,passwordLogin]);
   await owner.query("insert into public.users(id,auth_user_id,full_name,email,birthdate,account_status) values($1,$2,$3,$4,'1990-01-01','ACTIVE')",[id.profile,id.subject,'Fixture '+kind,kind+'@example.invalid']);
   await owner.query("select app_private.record_account_consent($1,'2026-09-21','EMAIL_SIGNUP')",[id.profile]);
   await owner.query("insert into app_private.auth_import_ledger(subject_id,profile_id,source_digest,recovery_required) values($1,$2,'synthetic-import-digest',false)",[id.subject,id.profile]);
  }
  const url=role=>'postgresql://'+role+':'+password+'@127.0.0.1:'+port+'/postgres';
  const config=loadConfig({NODE_ENV:'test',DATABASE_URL:url('asisteam_api'),NATIVE_AUTH_DATABASE_URL:url('asisteam_auth'),NATIVE_AUTH_SECRET:secret,NATIVE_AUTH_PROXY_SECRET:secret,NATIVE_AUTH_ISSUER:'https://auth.example.invalid',NATIVE_AUTH_WEB_URL:'http://127.0.0.1:3120',SUPABASE_AUTH_RETIRED:'1',INVITATION_DATABASE_URL:url('asisteam_invitation'),INVITATION_PROXY_SECRET:secret,BILLING_DATABASE_URL:url('asisteam_billing'),PG_POOL_MAX:'2'});
  runtimeConfig=config;
  app=await createApplication(config,new SafeLogger(line=>logs.push(line)));await app.listen(0,'127.0.0.1');origin=await app.getUrl();
  const api=token=>new ApiClient({origin,accessToken:async()=>token??null,nativeAuth:true,authProxy:{secret,clientIp:randomUUID()}});
  assert.equal((await fetch(origin+'/ready')).status,200);
  for(const kind of Object.keys(ids)){sessions[kind]=await api().loginPassword({body:{email:kind+'@example.invalid',password:passwordLogin}});assert.deepEqual(await api(sessions[kind].access_token).getSession(),{user_id:ids[kind].profile});}
  group=await api(sessions.admin.access_token).createGroup({body:{name:'Fixture MIG21',sport:'Tenis'}});other=await api(sessions.athlete.access_token).createGroup({body:{name:'Grupo ajeno',sport:'Tenis'}});
  worker=new WorkerStore({DATABASE_URL:url('asisteam_jobs')});billing=new BillingStore(config);
  assert.equal((await billing.rpc('lookup_billing_subscription',{p_subscription_id:randomUUID()})).error,null);
  assert.ok(!logs.join('\n').includes(passwordLogin));assert.ok(!logs.join('\n').includes(sessions.admin.access_token));
 });
 await check('canonical-history-minors-consents-metrics-and-rls',async()=>{
  await owner.query('insert into app_private.billing_legacy_groups(group_id) values($1)',[group.group_id]);
  await owner.query("insert into public.users(id,full_name,birthdate,account_status) values($1,'Menor sintético',(app_private.chile_today()-interval '12 years')::date,'MANAGED')",[managed]);
  await assert.rejects(owner.query("insert into public.memberships(user_id,group_id,role,status) values($1,$2,'ATHLETE','ACTIVE')",[managed,group.group_id]));
  const wardship=(await owner.query("insert into public.guardianships(guardian_user_id,athlete_user_id,relationship) values($1,$2,'Apoderado') returning id",[ids.guardian.profile,managed])).rows[0].id;
  await owner.query("insert into public.consents(guardianship_id,consent_type,terms_version,channel) values($1,'DATA_PROCESSING_MINOR','2026-09-21','IN_APP')",[wardship]);
  for(const [id,role] of [[managed,'ATHLETE'],[ids.athlete.profile,'ATHLETE'],[ids.coach.profile,'COACH']])await owner.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,$3,'ACTIVE',now()-interval '60 days')",[id,group.group_id,role]);
  const membership=(await owner.query("select id from public.memberships where user_id=$1 and group_id=$2 and role='ATHLETE'",[ids.athlete.profile,group.group_id])).rows[0].id;
  for(let n=0;n<10;n++){
   const activity=(await owner.query("insert into public.activities(group_id,activity_type_id,title,starts_at,ends_at,created_by) values($1,'b2c3d4e5-0001-4b3c-8d4e-111111111111','Fixture canónico',now()-interval '1 day',now()-interval '23 hours',$2) returning id",[group.group_id,ids.admin.profile])).rows[0].id;
   await owner.query('insert into public.attendance_records(activity_id,membership_id,status,recorded_by) values($1,$2,$3,$4)',[activity,membership,n<6?'PRESENT':n===6?'LATE':n<9?'ABSENT':'EXCUSED',ids.admin.profile]);
  }
  const api=kind=>new ApiClient({origin,accessToken:async()=>sessions[kind].access_token});
  const history=await api('athlete').getMyAttendanceHistory({params:{groupId:group.group_id}});assert.equal(history.records.length,10);assert.equal(history.totals.attendance_pct,77.8);
  await assert.rejects(api('admin').getGroup({params:{groupId:other.group_id}}),{status:404});
  assert.equal((await api('guardian').getWard({params:{athleteUserId:managed}})).athlete_user_id,managed);
  assert.equal((await api('guardian').getWardAttendanceHistory({params:{groupId:group.group_id,athleteUserId:managed}})).totals.attendance_pct,null);
  for(const kind of ['athlete','guardian'])await assert.rejects(api(kind).getGroupStats({params:{groupId:group.group_id}}),{status:403});
  await owner.query('update public.groups set settings=jsonb_build_object(\'athletes_can_view_group_stats\',true,\'guardians_can_view_group_stats\',true) where id=$1',[group.group_id]);
  for(const kind of ['athlete','guardian']){const stats=await api(kind).getGroupStats({params:{groupId:group.group_id}});assert.equal(stats.members.length,2);assert.ok(!/email|phone|birthdate|note|records|guardian/.test(JSON.stringify(stats)));}
  assert.equal((await owner.query('select count(*)::int as n from app_private.auth_credentials where subject_id=$1',[managed])).rows[0].n,0);
  const member=await connect(port,'asisteam_member').catch(()=>null);assert.equal(member,null); // NOLOGIN group has no credential.
  const runtime=await connect(port,'asisteam_api');await runtime.query('begin');await runtime.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:ids.athlete.subject,auth_provider:'nest',role:'authenticated'})]);
  assert.equal((await runtime.query('select count(*)::int as n from public.groups')).rows[0].n,2);
  await assert.rejects(runtime.query('select * from app_private.auth_credentials'));await runtime.query('rollback');await runtime.end();
  await assert.rejects(owner.query('delete from public.consents where guardianship_id=$1',[wardship]));
 });
 await check('worker-native-claims-and-durable-ledger',async()=>{
  await worker.call('metrics');const claimed=await worker.call('transition');if(claimed.length)await worker.call('complete',[claimed[0].run_date,claimed[0].lease_token]);await worker.call('pushClaim',[true]);await worker.call('pushMetrics');
 });
 await check('destination-security-parity-concurrent-load-500ms',async()=>{
  report.qualification=await qualifyDestination({owner,app,config:runtimeConfig,ids,sessions,group,worker,wardId:managed,evidence:report});
 });
 await check('next-chromium-native-auth-independent-database',async()=>{
  const output=await command(process.execPath,['apps/web/scripts/native-auth-smoke.mjs'],undefined,{INDEPENDENT_PG_TEST_URL:'postgresql://postgres:'+password+'@127.0.0.1:'+port+'/postgres'});
  assert.match(output,/PASS: Chromium/);
 });
 await check('pool-concurrency-and-connection-budget',async()=>{
  const pool=new pg.Pool({host:'127.0.0.1',port,user:'asisteam_api',password,database:'postgres',max:2,connectionTimeoutMillis:2000});const start=performance.now();
  try{await Promise.all(Array.from({length:12},()=>pool.query('select pg_sleep(0.025)')));assert.equal(pool.totalCount,2);report.connections={serverLimit:40,probeConcurrency:12,probePool:2,probeSeconds:Number(((performance.now()-start)/1000).toFixed(3)),apiPerReplica:2,authPerReplica:3,invitationPerReplica:3,billingPerReplica:3,workerPerReplica:2,reservedSuperuser:3};}finally{await pool.end();}
 });
 const snapshot=async database=>{
  const client=await connect(port,'postgres',database);try{const tables=(await client.query("select schemaname||'.'||tablename as name from pg_tables where schemaname in ('public','app_private','db_migrations') order by 1")).rows;const result=[];
   for(const {name} of tables){assert.match(name,/^(public|app_private|db_migrations)\.[a-z_0-9]+$/);result.push((await client.query("select count(*)::int as n,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),'')) as digest from "+name+' t')).rows[0]);}return result;
  }finally{await client.end();}
 };
 await check('cutover-abort-post-write-reconciliation-and-forward-recovery',async()=>{
  await app.close();app=undefined;await worker.onApplicationShutdown();worker=undefined;await billing.onApplicationShutdown();billing=undefined;
  await deploy.end();deploy=undefined;
  report.cutover=await rehearseCutover({owner,connect,port,config:runtimeConfig,ids,group,passwordLogin,command});
 });
 await check('logical-backup-restore-all-table-and-group-reconciliation',async()=>{
  const before=await snapshot('postgres'),catalog="select jsonb_agg(jsonb_build_array(n.nspname,c.relname,x.conname,pg_get_constraintdef(x.oid)) order by n.nspname,c.relname,x.conname) as data from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private')";
  const constraints=(await owner.query(catalog)).rows[0].data;
  const backup=normalizeDump(await command('docker',['exec',name,'pg_dump','-U','postgres','--no-owner','-n','public','-n','app_private','-n','db_migrations']));report.backupBytes=Buffer.byteLength(backup);
  await owner.query('create database restored template template0');await owner.query('grant create on database restored to asisteam_migrator');await sql(name,'restored','drop schema public;create schema extensions authorization asisteam_migrator;create extension pgcrypto with schema extensions;set role asisteam_migrator;'+backup);
  assert.deepEqual(await snapshot('restored'),before);report.reconciledTables=before.length;
  const restored=await connect(port,'postgres','restored');try{assert.deepEqual((await restored.query(catalog)).rows[0].data,constraints);assert.deepEqual((await restored.query('select group_id,count(*)::int as n from public.memberships group by group_id order by group_id')).rows,(await owner.query('select group_id,count(*)::int as n from public.memberships group by group_id order by group_id')).rows);}finally{await restored.end();}
  const configuration={...runtimeConfig};for(const key of ['DATABASE_URL','NATIVE_AUTH_DATABASE_URL','INVITATION_DATABASE_URL','BILLING_DATABASE_URL'])configuration[key]=configuration[key].replace('/postgres','/restored');
  app=await createApplication(configuration,new SafeLogger(line=>logs.push(line)));await app.listen(0,'127.0.0.1');const restoredOrigin=await app.getUrl();
  assert.equal((await fetch(restoredOrigin+'/ready')).status,200);const anonymous=new ApiClient({origin:restoredOrigin,accessToken:async()=>null,nativeAuth:true,authProxy:{secret,clientIp:randomUUID()}});
  const restoredSession=await anonymous.loginPassword({body:{email:'athlete@example.invalid',password:passwordLogin}}),restoredApi=new ApiClient({origin:restoredOrigin,accessToken:async()=>restoredSession.access_token});
  assert.equal((await restoredApi.getMyAttendanceHistory({params:{groupId:group.group_id}})).totals.attendance_pct,77.8);
  worker=new WorkerStore({DATABASE_URL:configuration.DATABASE_URL.replace('asisteam_api:','asisteam_jobs:')});await worker.call('metrics');await worker.onApplicationShutdown();worker=undefined;await app.close();app=undefined;
 });
 await check('physical-basebackup-and-point-in-time-recovery',async()=>{
  await owner.query('create table public.pitr_probe(id int primary key)');await owner.query('insert into public.pitr_probe values(1)');
  await command('docker',['exec',name,'pg_basebackup','-U','postgres','-D','/tmp/mig165-base','-X','stream','--checkpoint=fast']);
  await owner.query("select pg_create_restore_point('mig165_point')");await owner.query('insert into public.pitr_probe values(2)');
  const segment=(await owner.query("select pg_walfile_name(pg_switch_wal()) as name")).rows[0].name;assert.match(segment,/^[0-9A-F]{24}$/);
  for(let n=0;n<100;n++){try{await command('docker',['exec',name,'test','-s','/var/lib/postgresql/wal/'+segment]);break;}catch{if(n===99)throw new Error('archive');await new Promise(resolve=>setTimeout(resolve,100));}}
  await command('docker',['cp',name+':/tmp/mig165-base',join(dir,'base')]);await command('docker',['cp',name+':/var/lib/postgresql/wal',join(dir,'wal')]);
  // Docker cp assigns the target copies to root. The recovery postgres UID
  // must read the WAL directory; the host's enclosing temp dir stays 0700.
  await chmod(join(dir,'wal'),0o755);for(const file of await readdir(join(dir,'wal')))await chmod(join(dir,'wal',file),0o644);
  await writeFile(join(dir,'base','recovery.signal'),'');await writeFile(join(dir,'base','postgresql.auto.conf'),"restore_command = 'cp /wal/%f %p'\nrecovery_target_name = 'mig165_point'\nrecovery_target_action = 'promote'\n");
  await command('docker',['create','--name',recovery,'-e','POSTGRES_PASSWORD='+password,'asisteam-db165-test']);recoveryCreated=true;
  await command('docker',['cp',join(dir,'base')+'/.',recovery+':/var/lib/postgresql/data']);await command('docker',['cp',join(dir,'wal'),recovery+':/wal']);await command('docker',['start',recovery]);
  for(let n=0;n<150;n++){try{const result=(await sql(recovery,'postgres','select not pg_is_in_recovery();')).trim();if(result==='t')break;if(n===149)throw new Error('recovery');}catch{if(n===149)throw new Error('recovery');}await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal((await sql(recovery,'postgres','select string_agg(id::text,\',\' order by id) from public.pitr_probe;')).trim(),'1');
  report.pitr={basebackup:true,archivedWal:true,recoveredToNamedPoint:true,postPointWriteExcluded:true};
 });
}catch(error){console.error('independent_postgres FAIL '+error.message);process.exitCode=1;}
finally {
 const start=performance.now();let safe=true;
 for(const resource of [app,worker,billing,deploy,owner])if(resource)try{if(resource.close)await resource.close();else if(resource.onApplicationShutdown)await resource.onApplicationShutdown();else await resource.end();}catch{safe=false;}
 for(const [container,exists] of [[recovery,recoveryCreated],[name,created]])if(exists)try{await command('docker',['rm','-fv',container]);}catch{safe=false;}
 try{await rm(dir,{recursive:true,force:true});}catch{safe=false;}
 report.checks.push({check:'owned-resources-cleanup',status:safe?'PASS':'FAIL',seconds:Number(((performance.now()-start)/1000).toFixed(3))});if(!safe)process.exitCode=1;
 await mkdir('.ci-results',{recursive:true});await writeFile('.ci-results/independent-postgres.json',JSON.stringify(report,null,2)+'\n');
}
