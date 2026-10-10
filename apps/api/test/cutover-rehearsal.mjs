import assert from 'node:assert/strict';
import {randomUUID,createHmac,createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {createApplication} from '../dist/application.js';
import {SafeLogger} from '../dist/logger.js';
import {WorkerStore} from '../../worker/dist/store.js';
import {ApiClient} from '../../../packages/api-client/dist/index.js';
import {ListObjectsV2Command} from '@aws-sdk/client-s3';
import {storageFixture} from './storage-fixture.mjs';
import {migrate} from '../../../packages/db/scripts/migrate.mjs';
import {writers,snapshotFrozen,restoreFrozen,deltaSummary} from '../../../packages/db/scripts/cutover.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const quote=value=>'"'+value.replaceAll('"','""')+'"';

export async function rehearseCutover({owner,connect,port,config,ids,group,passwordLogin,command}) {
 const result={sourceCommit:(await command('git',['rev-parse','HEAD'])).trim(),environment:process.env.GITHUB_ACTIONS?'github-actions-synthetic':'local-synthetic',checks:[],pending:['production-volume','named-operators-and-approved-RPO-RTO','MP-sandbox-contract-URL-and-retry','managed-provider-maintenance-controls']};
 let app,firstStorage,secondStorage,destination,recovered;const jobStores=[],logs=[],realFetch=globalThis.fetch;
 let activeOrigin,remote,invoiceIds=['166001'],modified=Date.now();
 const secret='synthetic-mig22-webhook',newPassword='After166-'+randomUUID(),newEmail='after166-'+randomUUID()+'@example.invalid';
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6rGQAAAAASUVORK5CYII=','base64');
 const timed=async(name,fn)=>{const start=performance.now();try{await fn();result.checks.push({check:name,status:'PASS',seconds:Number(((performance.now()-start)/1000).toFixed(3))});console.log(JSON.stringify(result.checks.at(-1)));}catch(error){result.checks.push({check:name,status:'FAIL',location:error.stack?.match(/cutover-rehearsal\.mjs:\d+:\d+/)?.[0],httpStatus:error.status,freeze:error.freeze,phase:error.cutoverPhase,field:error.message?.match(/column "?([a-z_0-9.]+)"? does not exist/)?.[1],reason:/^[a-z][a-z_]+$/.test(error.message??'')?error.message:undefined,code:/^[A-Z0-9_]+$/.test(error.code??'')?error.code:undefined,seconds:Number(((performance.now()-start)/1000).toFixed(3))});throw error;}};
 const freeze=async client=>{
  const db=(await client.query('select current_database() as name')).rows[0].name;
  await client.query('revoke connect on database '+quote(db)+' from public,'+writers.join(','));
  await client.query('select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and usename=any($2::text[]) and pid<>pg_backend_pid()',[db,writers]);
  // Termination is asynchronous; do not snapshot until every writer has exited.
  for(let attempt=0;attempt<20;attempt++){if((await client.query('select count(*)::int as n from pg_stat_activity where datname=$1 and usename=any($2::text[]) and pid<>pg_backend_pid()',[db,writers])).rows[0].n===0)break;await new Promise(resolve=>setTimeout(resolve,50));}
 };
 const open=async(client,roles=writers.filter(role=>role!=='asisteam_migrator'))=>{
  const db=(await client.query('select current_database() as name')).rows[0].name;
  await client.query('grant connect on database '+quote(db)+' to '+roles.join(','));
 };
 const empty=async database=>{
  await owner.query('create database '+quote(database)+' template template0');
  await owner.query('grant create,connect on database '+quote(database)+' to asisteam_migrator');
  const client=await connect(port,'postgres',database);
  try {
  await client.query('alter schema public owner to asisteam_migrator');
  await client.query('revoke create on schema public from public');
  await client.query('create schema extensions authorization asisteam_migrator;create extension pgcrypto with schema extensions');
  const deploy=await connect(port,'asisteam_migrator',database);try{await migrate(deploy);}finally{await deploy.end();}
  await client.query(fixtureClock);await freeze(client);return client;
  }catch(error){await client.end();throw error;}
 };
 const runtime=database=>{
  const configured={...config,...secondStorage.config,MERCADOPAGO_ACCESS_TOKEN:'synthetic-token',MERCADOPAGO_WEBHOOK_SECRET:secret,MERCADOPAGO_COLLECTOR_ID:'123',BILLING_WEB_URL:'https://web.example.invalid',BILLING_WEBHOOK_URL:'https://new.example.invalid/api/v1/billing/mercadopago-webhook',HTTP_TIMEOUT_MS:60000};
  for(const key of ['DATABASE_URL','NATIVE_AUTH_DATABASE_URL','INVITATION_DATABASE_URL','BILLING_DATABASE_URL']){const url=new URL(configured[key]);url.pathname='/'+database;configured[key]=url.href;}
  return configured;
 };
 const start=async database=>{app=await createApplication(runtime(database),new SafeLogger(line=>logs.push(line)));await app.listen(0,'127.0.0.1');activeOrigin=await app.getUrl();};
 const stop=async()=>{if(app){await app.close();app=undefined;}for(const store of jobStores.splice(0))await store.onApplicationShutdown();};
 const anonymous=()=>new ApiClient({origin:activeOrigin,nativeAuth:true,accessToken:async()=>null,authProxy:{secret:config.NATIVE_AUTH_PROXY_SECRET,clientIp:randomUUID()},timeoutMs:60000});
 const client=token=>new ApiClient({origin:activeOrigin,nativeAuth:true,accessToken:async()=>token,timeoutMs:60000});
 const signed=(id='166001')=>{
  const ts=String(Date.now()),requestId='synthetic166',signature=createHmac('sha256',secret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex');
  return new Request('https://new.example.invalid/api/v1/billing/mercadopago-webhook?data.id='+id,{method:'POST',headers:{'x-signature':`ts=${ts},v1=${signature}`,'x-request-id':requestId},body:JSON.stringify({type:'subscription_authorized_payment',data:{id}})});
 };
  const deliverWebhook=async request=>{
   const headers=new Headers(request.headers);headers.set('content-type','application/json');
   try{return await realFetch(activeOrigin+'/api/v1/billing/mercadopago-webhook'+new URL(request.url).search,{method:'POST',headers,body:await request.text(),redirect:'error'});}
  catch{return new Response(null,{status:503});}
 };
 const copyObjects=async(database,from,to)=>{
  const objects=[];let continuation;
  const profiles=(await database.query('select id,auth_user_id,avatar_url from public.users')).rows;
  const owners=new Set(profiles.map(profile=>profile.auth_user_id));
  do{const page=await from.client.send(new ListObjectsV2Command({Bucket:from.bucket,ContinuationToken:continuation}));
   for(const object of page.Contents??[]){assert.ok(owners.has(object.Key.split('/')[0]));const data=await from.read(object.Key);let existing;
    try{existing=await to.read(object.Key);}catch(error){if(!['NotFound','NoSuchKey'].includes(error.name))throw error;}
    if(!existing)await to.put(object.Key,data.bytes,data.type);
    const actual=await to.read(object.Key);assert.equal(sha(actual.bytes),sha(data.bytes));assert.equal(actual.type,data.type);
    objects.push({key:object.Key,bytes:data.bytes.length,sha256:sha(data.bytes)});
   }
   continuation=page.IsTruncated?page.NextContinuationToken:undefined;
  }while(continuation);
  for(const profile of profiles.filter(profile=>profile.avatar_url))assert.ok(objects.some(object=>profile.avatar_url==='/profile/avatar/'+object.key));
  return objects;
 };
 // Fix business time only in isolated fixture databases, avoiding a flaky
 // 00:00–00:30 Chile gate. Recovery timing uses the real monotonic clock.
 const fixtureClock="create or replace function app_private.worker_now() returns timestamptz language sql stable set search_path='' as $$ select ((statement_timestamp() at time zone 'America/Santiago')::date + time '12:00') at time zone 'America/Santiago' $$";
 try {
  await owner.query(fixtureClock);const preparation=new WorkerStore({DATABASE_URL:config.DATABASE_URL.replace('asisteam_api:','asisteam_jobs:')});
  try{const tasks=await preparation.call('transition');for(const task of tasks)await preparation.call('complete',[task.run_date,task.lease_token]);}finally{await preparation.onApplicationShutdown();}
  result.syntheticJobClock='Chile-noon';
  // Compile the shared fixture in its dedicated CI build gate, before this
  // rehearsal. Cold Go compilation can exceed the DB helper's 120s limit.
  await command('docker',['image','inspect','asisteam-storage-fixture:161']);
  firstStorage=await storageFixture();secondStorage=await storageFixture();
  const initialKey=ids.admin.subject+'/'+randomUUID()+'.png';await firstStorage.storage.put(initialKey,png,'image/png');
  await owner.query('update public.users set avatar_url=$1 where id=$2',['/profile/avatar/'+initialKey,ids.admin.profile]);
  globalThis.fetch=async(input,options)=>{
   const url=new URL(String(input));
   if(url.origin==='https://api.pwnedpasswords.com')return new Response('0'.repeat(35)+':0');
   if(url.origin!=='https://api.mercadopago.com')return realFetch(input,options);
   assert.equal(options.redirect,'error');
   if(url.pathname==='/preapproval'&&options.method==='POST'){const body=JSON.parse(options.body);remote={id:'mig166-'+randomUUID(),external_reference:body.external_reference,collector_id:'123',status:'pending',last_modified:new Date(modified).toISOString(),auto_recurring:body.auto_recurring,init_point:'https://www.mercadopago.cl/subscriptions/checkout?preapproval_id=synthetic'};return Response.json(remote);}
   if(url.pathname.startsWith('/preapproval/'))return Response.json(remote);
   if(url.pathname==='/authorized_payments/search')return Response.json({paging:{total:0},results:[]});
   if(url.pathname.startsWith('/authorized_payments/')){const id=url.pathname.split('/').at(-1);assert.ok(invoiceIds.includes(id));return Response.json({id,preapproval_id:remote.id,transaction_amount:4990,currency_id:'CLP',debit_date:new Date(modified).toISOString(),last_modified:new Date(modified).toISOString(),status:'scheduled',payment:{id:'pay'+id}});}
   if(url.pathname.startsWith('/v1/payments/'))return Response.json({id:url.pathname.split('/').at(-1),collector_id:'123',transaction_amount:4990,currency_id:'CLP',status:'approved',date_approved:new Date(modified).toISOString(),date_last_updated:new Date(modified).toISOString()});
   throw new Error('unexpected_provider_resource');
  };
  let before;
  await timed('freeze-every-db-writer-and-abort-before-first-write',async()=>{
   const held=await connect(port,'asisteam_api');held.on('error',()=>{});await held.query('begin');
   await freeze(owner);await assert.rejects(held.query('select 1'));await held.end().catch(()=>{});
   for(const role of writers)await assert.rejects(connect(port,role));
   before=await snapshotFrozen(owner);destination=await empty('cutover_destination');
   await restoreFrozen(destination,before);assert.deepEqual(await snapshotFrozen(destination),before);
   // The failed route is never opened. Re-admit only origin; read-only probe
   // demonstrates safe abort without creating even a new session family.
   await open(owner);const probe=await connect(port,'asisteam_api');await probe.query('select 1');await probe.end();await freeze(owner);
   assert.deepEqual(await snapshotFrozen(owner),before);
   result.singleWriterAtAbort=true;
  });
  let adminToken,activity,membership,recordId,objectsBefore;
  await timed('snapshot-maintenance-cutover-and-destination-writes',async()=>{
   objectsBefore=await copyObjects(destination,firstStorage.storage,secondStorage.storage);
   await open(destination);await start('cutover_destination');
   const session=await anonymous().loginPassword({body:{email:'admin@example.invalid',password:passwordLogin}});adminToken=session.access_token;
   await client(adminToken).changePassword({body:{current_password:passwordLogin,password:newPassword}});
   const fresh=await anonymous().loginPassword({body:{email:'admin@example.invalid',password:newPassword}});adminToken=fresh.access_token;
   await assert.rejects(anonymous().loginPassword({body:{email:'admin@example.invalid',password:passwordLogin}}),{status:401});
   await anonymous().registerPassword({body:{full_name:'Cuenta posterior sintética',email:newEmail,birthdate:'1990-01-01',password:newPassword,terms_accepted:true,terms_version:'2026-09-21'}});
   const newSession=await anonymous().loginPassword({body:{email:newEmail,password:newPassword}});assert.ok((await client(newSession.access_token).getSession()).user_id);
   // Consent change uses the existing GUARDIAN RPC through the HTTP contract.
   const guardian=await anonymous().loginPassword({body:{email:'guardian@example.invalid',password:passwordLogin}});
   const wardship=(await destination.query('select id from public.guardianships where guardian_user_id=$1',[ids.guardian.profile])).rows[0].id;
   await client(guardian.access_token).setAvatarPermission({params:{guardianshipId:wardship},body:{allow:true}});
   await client(adminToken).uploadAvatar({body:{type:'image/png',content_base64:png.toString('base64')}});
   const row=(await destination.query("select r.id,r.activity_id,r.membership_id from public.attendance_records r join public.memberships m on m.id=r.membership_id where m.user_id=$1 order by r.id limit 1",[ids.athlete.profile])).rows[0];
   ({activity_id:activity,membership_id:membership,id:recordId}=row);
   await client(adminToken).saveAttendance({params:{groupId:group.group_id,activityId:activity},body:{records:[{membership_id:membership,status:'LATE',note:'Cambio posterior sintético'}]}});
   await client(adminToken).manageSubscription({body:{action:'checkout',group_id:group.group_id,plan_code:'TEAM',payer_email:'synthetic@example.invalid'}});
   remote={...remote,status:'authorized',last_modified:new Date(++modified).toISOString()};
   assert.equal((await deliverWebhook(signed())).status,200);
   assert.equal((await destination.query("select count(*)::int as n from public.subscription_invoices where status='PAID'")).rows[0].n,1);
  });
  await timed('single-job-executor-concurrent-replicas-and-persist-before-ack',async()=>{
   const jobConfig={DATABASE_URL:runtime('cutover_destination').DATABASE_URL.replace('asisteam_api:','asisteam_jobs:')};
   for(let n=0;n<2;n++)jobStores.push(new WorkerStore(jobConfig));
   await destination.query("insert into app_private.majority_tasks(run_date) values (app_private.chile_today()-1) on conflict do nothing");
   const claims=(await Promise.all(jobStores.map(store=>store.call('transition')))).flat();assert.equal(claims.length,1);
   // Leave the in-flight lease in the snapshot; resumption must not reclaim it.
   result.activeJobLeasePreserved=true;
   invoiceIds.push('166002');modified++;
   await destination.query('revoke connect on database cutover_destination from asisteam_billing');
   await destination.query("select pg_terminate_backend(pid) from pg_stat_activity where datname='cutover_destination' and usename='asisteam_billing'");
   assert.equal((await deliverWebhook(signed('166002'))).status,503);
   assert.equal((await destination.query("select count(*)::int as n from public.subscription_invoices where provider_invoice_id='166002'")).rows[0].n,0);
   result.failedEventAck=503;
  });
  let after;
  const recoveryStart=performance.now();
  await timed('post-write-failure-freeze-and-complete-delta-reconciliation',async()=>{
   await stop();await freeze(destination);after=await snapshotFrozen(destination);
   assert.notDeepEqual(after,before);result.changedTables=deltaSummary(before,after);
   assert.ok(result.changedTables.some(row=>row.table==='app_private.auth_credentials'));
   assert.ok(result.changedTables.some(row=>row.table==='public.account_consents'));
   assert.ok(result.changedTables.some(row=>row.table==='public.consents'));
   assert.ok(result.changedTables.some(row=>row.table==='public.attendance_records'));
   assert.ok(result.changedTables.some(row=>row.table==='public.subscription_invoices'));
   assert.equal((await deliverWebhook(signed('166002'))).status,503);
   recovered=await empty('cutover_recovery');
   const corrupt=structuredClone(after);corrupt.tables[0].sha256='0'.repeat(64);await assert.rejects(restoreFrozen(recovered,corrupt),/snapshot_checksum_changed/);
   const pristine=await snapshotFrozen(recovered);
   const orphan=structuredClone(after),members=orphan.tables.find(table=>table.name==='public.memberships');
   const broken=JSON.parse(members.rows[0]);broken.group_id=randomUUID();members.rows[0]=JSON.stringify(broken);members.sha256=sha(members.rows.join('\n'));
   await assert.rejects(restoreFrozen(recovered,orphan),/foreign_key_reconciliation_failed/);assert.deepEqual(await snapshotFrozen(recovered),pristine);
   const noConsent=structuredClone(after),consents=noConsent.tables.find(table=>table.name==='public.consents');consents.rows=[];consents.sha256=sha('');
   await assert.rejects(restoreFrozen(recovered,noConsent),/domain_reconciliation_failed/);assert.deepEqual(await snapshotFrozen(recovered),pristine);
   result.rejectedCorruptSnapshot=true;result.foreignKeyAndMinorFailureAtomic=true;
   const imported=await restoreFrozen(recovered,after);result.reconciledTables=imported.tables;result.reconciledForeignKeys=imported.foreignKeys;
   assert.deepEqual(await snapshotFrozen(recovered),after);
   const objects=await copyObjects(recovered,secondStorage.storage,firstStorage.storage);assert.equal(objects.length,objectsBefore.length+1);result.reconciledObjects=objects.length;
   // Keep the current private S3 as authority for forward recovery, including
   // post-cut orphan objects. The alternate copy proves every byte is retained.
   await assert.rejects(restoreFrozen(recovered,before),/target_has_business_history/);
   assert.deepEqual(await snapshotFrozen(owner),before);
   for(const database of ['postgres','cutover_destination'])for(const role of writers)await assert.rejects(connect(port,role,database));
  });
  await timed('forward-recovery-login-history-consent-files-provider-retry-and-jobs',async()=>{
   await open(recovered);await start('cutover_recovery');
   const session=await anonymous().loginPassword({body:{email:'admin@example.invalid',password:newPassword}});
   assert.equal((await client(session.access_token).getSession()).user_id,ids.admin.profile);
   await assert.rejects(anonymous().loginPassword({body:{email:'admin@example.invalid',password:passwordLogin}}),{status:401});
   const created=await anonymous().loginPassword({body:{email:newEmail,password:newPassword}});assert.ok((await client(created.access_token).getSession()).user_id);
   const saved=(await recovered.query('select id,status,note from public.attendance_records where activity_id=$1 and membership_id=$2',[activity,membership])).rows[0];assert.equal(saved.id,recordId);assert.equal(saved.status,'LATE');assert.equal(saved.note,'Cambio posterior sintético');
   const key=(await recovered.query('select avatar_url from public.users where id=$1',[ids.admin.profile])).rows[0].avatar_url.slice('/profile/avatar/'.length);
   const avatar=await client(session.access_token).getAvatar({params:{ownerId:key.split('/')[0],fileName:key.split('/')[1]}});assert.equal(sha(Buffer.from(avatar.content_base64,'base64')),sha(png));
   assert.equal((await deliverWebhook(signed('166002'))).status,200);assert.equal((await deliverWebhook(signed('166002'))).status,200);
   assert.equal((await recovered.query("select count(*)::int as n from public.subscription_invoices where status='PAID'")).rows[0].n,2);
   const store=new WorkerStore({DATABASE_URL:runtime('cutover_recovery').DATABASE_URL.replace('asisteam_api:','asisteam_jobs:')});jobStores.push(store);
   assert.equal((await store.call('transition')).length,0);
   // Expiry permits exactly one successor on the same authority, never origin.
   await recovered.query("update app_private.majority_tasks set lease_until=app_private.worker_now()-interval '1 minute' where completed_at is null");
   const reclaimed=await store.call('transition');assert.equal(reclaimed.length,1);
   assert.equal((await store.call('complete',[reclaimed[0].run_date,reclaimed[0].lease_token]))[0].completed,true);
   assert.equal((await store.call('transition')).length,0);
   result.providerReplayInvoices=2;result.rpoCommittedWrites=0;result.recoverySeconds=Number(((performance.now()-recoveryStart)/1000).toFixed(3));
   assert.ok(result.recoverySeconds<60,'synthetic_recovery_budget_exceeded');result.syntheticBudgetSeconds=60;
  });
  assert.ok(!logs.join('\n').includes(newPassword));assert.ok(!logs.join('\n').includes(newEmail));
  return result;
 }finally {
  globalThis.fetch=realFetch;await stop();await destination?.end();await recovered?.end();
  for(const fixture of [firstStorage,secondStorage])if(fixture){fixture.storage.client.destroy();fixture.stop();}
  await mkdir('.ci-results',{recursive:true});await writeFile('.ci-results/cutover.json',JSON.stringify(result,null,2)+'\n');
 }
}
