import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import pg from 'pg';
import {createApplication} from '../dist/application.js';
import {loadFixtureConfig as loadConfig,fixtureConnection} from './fixture-config.mjs';
import { SafeLogger } from '../dist/logger.js';
import { authFixture } from './auth-fixture.mjs';
import { ApiClient } from '../../../packages/api-client/dist/index.js';
import { createWorker } from '../../worker/dist/application.js';
import { AnnouncementWorker } from '../../worker/dist/announcements.js';
import { WorkerStore } from '../../worker/dist/store.js';
import { loadConfig as workerConfig } from '../../worker/dist/config.js';

test('MIG-15 Nest HTTP/SQL and two Expo workers: roles, opt-in, retries, tokens, leases and handoff', { skip: process.env.API_RLS_TEST !== '1' }, async () => {
  const db = new pg.Client({ connectionString: fixtureConnection() }); await db.connect();
  await db.query("select pg_advisory_lock(hashtextextended('mig159-integration',0))");
  // Fail safely before altering any unrelated queue: all provider calls must belong to this test.
  assert.equal((await db.query("select count(*)::int n from app_private.announcement_push_deliveries where status in ('PENDING','AWAITING_RECEIPT')")).rows[0].n, 0);
  const roles = (await db.query("select rolname,rolcanlogin,rolpassword from pg_authid where rolname in ('asisteam_api','asisteam_jobs')")).rows;
  const executor = (await db.query('select * from app_private.announcement_executor')).rows[0];
  assert.equal((await db.query("select to_regnamespace('cron') as schema")).rows[0].schema,null);
  const ledger = (await db.query("select * from public.job_runs where job_name='send-announcement-push' and run_date=app_private.chile_today()")).rows[0];
  const password = randomUUID(), profiles = [], auth = [], groups = [randomUUID(),randomUUID()], apps = [], logs = [], requests = [];
  let app, fixture, provider, mode = 'ok';
  const nativeFetch = globalThis.fetch;
  try {
    await db.query("update app_private.announcement_executor set mode='DRAINING',draining_since=now(),activated_at=null");
    for (const role of roles) await db.query("alter role " + role.rolname + " login password '" + password + "'");
    fixture = await authFixture();
    for (let i=0;i<7;i++) {
      const id = randomUUID(), session = randomUUID(); auth.push(id);
      await db.query("with subject as (insert into app_private.auth_subjects(id,email,native_owned) values($1,$2,true) returning id) insert into public.users(auth_user_id,email,full_name,birthdate,account_status) select id,$2,($3::jsonb->>'full_name'),($3::jsonb->>'birthdate')::date,'ACTIVE' from subject",[id,'mig159-'+id+'@example.test',JSON.stringify({full_name:'Persona sintética',birthdate:'1990-01-01'})]);
      const profile = (await db.query('select id from public.users where auth_user_id=$1',[id])).rows[0].id; profiles.push(profile);
      await db.query("insert into app_private.auth_families(id,subject_id,created_at,expires_at) values($1,$2,now(),now()+interval '1 hour')",[session,id]);
      if(i!==6) await db.query("insert into public.account_consents(user_id,terms_version,channel) values($1,'2026-09-21','IN_APP')",[profile]);
      auth[i] = {id, session};
    }
    for (const [i,id] of groups.entries()) {
      await db.query('insert into public.groups(id,name,sport,invite_code,created_by) values($1,$2,$3,$4,$5)',[id,'Club sintético MIG15','Tenis',randomUUID().replaceAll('-','').slice(0,8),profiles[i===0?0:4]]);
      await db.query('insert into app_private.billing_legacy_groups(group_id) values($1)',[id]);
    }
    for (const [i,g,role,status] of [[0,0,'ADMIN','ACTIVE'],[0,0,'ATHLETE','ACTIVE'],[1,0,'ATHLETE','ACTIVE'],[2,0,'GUARDIAN','ACTIVE'],[3,0,'COACH','ACTIVE'],[4,1,'ADMIN','ACTIVE'],[5,0,'ATHLETE','PENDING'],[6,0,'ADMIN','ACTIVE']])
      await db.query('insert into public.memberships(user_id,group_id,role,status) values($1,$2,$3,$4)',[profiles[i],groups[g],role,status]);
    app = await createApplication(loadConfig({DATABASE_URL:fixtureConnection('asisteam_api',password),}),new SafeLogger(line=>logs.push(line))); await app.listen(0,'127.0.0.1');
    const origin = await app.getUrl(), tokens = await Promise.all(auth.map(item=>fixture.token(item.id,item.session)));
    const clients = tokens.map(token=>new ApiClient({origin,accessToken:async()=>token,timeoutMs:15000})), params = {groupId:groups[0]}, token = `ExpoPushToken[${randomUUID().replaceAll('-','')}]`;
    const publish = id=>clients[0].publishAnnouncement({params,body:{request_id:id,title:'Título privado sintético',body:'Cuerpo privado sintético'}});
    assert.equal((await fetch(origin+'/api/v1/groups/'+groups[0]+'/announcements')).status,401);
    for(const i of [4,5])await assert.rejects(clients[i].getAnnouncements({params}),{status:404});
    await assert.rejects(clients[6].getAnnouncements({params}),{status:403});
    for(const i of [1,2,3])await assert.rejects(clients[i].publishAnnouncement({params,body:{request_id:randomUUID(),title:'Aviso',body:'Texto'}}),{status:403});
    for(const i of [0,1,2,3])assert.deepEqual(await clients[i].getAnnouncementPush(),{enabled:false,hasDevices:false});
    const registered = await clients[1].registerAnnouncementToken({body:{token,platform:'ANDROID'}}); assert.ok(registered.id);
    await assert.rejects(clients[2].registerAnnouncementToken({body:{token,platform:'IOS'}}), error=>error.status===409&&error.error.code==='push_token_unavailable');
    assert.deepEqual(await clients[2].getAnnouncementPush(),{enabled:false,hasDevices:false});
    const noOptIn = randomUUID(); await publish(noOptIn);
    assert.equal((await db.query('select count(*)::int n from app_private.announcement_push_deliveries where announcement_id=$1',[noOptIn])).rows[0].n,0);
    await clients[1].setAnnouncementPush({body:{enabled:true}});
    const id = randomUUID(); await Promise.all([publish(id),publish(id)]);
    assert.equal((await db.query('select count(*)::int n from app_private.announcement_push_deliveries where announcement_id=$1',[id])).rows[0].n,1);
    for(const i of [0,1,2,3]) {
      const wall = await clients[i].getAnnouncements({params}); assert.equal(wall.announcements.length,2);
      assert.ok(!/created_by|user_id|token|email|phone|birthdate/.test(JSON.stringify(wall)));
      assert.equal(wall.hasDevices,i===1); assert.equal(wall.pushEnabled,i===1);
    }
    await assert.rejects(clients[0].publishAnnouncement({params,body:{request_id:id,title:'Cambio',body:'Distinto'}}),{status:409});
    const raw = (await db.query('select updated_at::text from public.group_announcements where id=$1',[id])).rows[0].updated_at;
    const version = (await clients[0].getAnnouncements({params})).announcements.find(item=>item.id===id).updated_at;
    assert.equal((await db.query('select $1::timestamptz=$2::timestamptz as equal',[version,raw])).rows[0].equal,true);
    await clients[0].updateAnnouncement({params:{...params,announcementId:id},body:{title:'Editado privado',body:'Texto privado',updated_at:version}});
    await assert.rejects(clients[0].updateAnnouncement({params:{...params,announcementId:id},body:{title:'Obsoleto',body:'Texto',updated_at:version}}),{status:409});
    // Reject client actor/content extras on the wire, not just in SDK parsing.
    assert.equal((await fetch(origin+'/api/v1/me/announcement-push',{method:'PATCH',headers:{authorization:'Bearer '+tokens[1],'content-type':'application/json'},body:JSON.stringify({enabled:true,user_id:profiles[2]})})).status,400);
    assert.equal((await fetch(origin+'/api/v1/groups/'+groups[0]+'/announcements?page=1&actor=x',{headers:{authorization:'Bearer '+tokens[0]}})).status,400);
    provider = createServer(async(request,response)=>{ let body='';for await(const chunk of request)body+=chunk;requests.push({url:request.url,body}); response.setHeader('content-type','application/json');
      if(mode==='fail'){response.writeHead(503).end('{}');return;}
      if(request.url.endsWith('getReceipts')){const ids=JSON.parse(body).ids;response.end(JSON.stringify({data:mode==='missing'?{}:Object.fromEntries(ids.map(id=>[id,{status:'ok'}]))}));return;}
      response.end(JSON.stringify({data:mode==='invalid'?{status:'error',details:{error:'DeviceNotRegistered'}}:{status:'ok',id:randomUUID()}}));
    });await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
    globalThis.fetch=(url,options)=>String(url).startsWith('https://exp.host/--/api/v2/push/')?nativeFetch('http://127.0.0.1:'+provider.address().port+'/'+String(url).split('/').at(-1),options):nativeFetch(url,options);
    const connection=fixtureConnection('asisteam_jobs',password);
    for(let n=0;n<2;n++)apps.push(await createWorker(workerConfig({DATABASE_URL:connection}),new SafeLogger(line=>logs.push(line))));
    await Promise.all(apps.map(instance=>instance.get(AnnouncementWorker).tick()));assert.equal(requests.length,0);
    assert.equal((await db.query("select mode from app_private.announcement_executor")).rows[0].mode,'DRAINING');
    assert.equal((await apps[0].get(WorkerStore).call('pushClaim',[false])).length,0);
    assert.equal((await apps[1].get(WorkerStore).call('pushClaim',[true])).length,0);
    const control=new pg.Client({connectionString:connection});await control.connect();
    try{await assert.rejects(control.query("update app_private.announcement_executor set mode='WORKER'"),{code:'42501'})}finally{await control.end()}
    await db.query("update app_private.announcement_executor set mode='WORKER',draining_since=null,activated_at=now()");
    assert.equal((await db.query("select mode from app_private.announcement_executor")).rows[0].mode,'WORKER');
    await assert.rejects(db.query('select public.claim_announcement_push(false)'),{code:'55000'});
    // Two simultaneous workers accept once and receipts never resend the message.
    await Promise.all(apps.map(instance=>instance.get(AnnouncementWorker).tick()));assert.equal(requests.length,1);
    assert.ok(!requests[0].body.includes('privado')); assert.equal(JSON.parse(requests[0].body).to,token);
    await Promise.all(apps.map(instance=>instance.get(AnnouncementWorker).tick()));assert.equal(requests.length,1);
    mode='missing';await db.query('update app_private.announcement_push_deliveries set next_attempt_at=now() where announcement_id=$1',[id]);await apps[0].get(AnnouncementWorker).tick();assert.equal(requests.length,2);
    assert.equal((await db.query('select status from app_private.announcement_push_deliveries where announcement_id=$1',[id])).rows[0].status,'AWAITING_RECEIPT');
    mode='ok';await db.query('update app_private.announcement_push_deliveries set next_attempt_at=now() where announcement_id=$1',[id]);await apps[1].get(AnnouncementWorker).tick();assert.equal(requests.length,3);
    assert.equal((await db.query('select status from app_private.announcement_push_deliveries where announcement_id=$1',[id])).rows[0].status,'DELIVERED');
    const retry=randomUUID();await publish(retry);mode='fail';await apps[0].get(AnnouncementWorker).tick();
    let delivery=(await db.query('select * from app_private.announcement_push_deliveries where announcement_id=$1',[retry])).rows[0];assert.equal(delivery.status,'PENDING');assert.equal(delivery.attempts,1);assert.equal((await db.query('select next_attempt_at>now() as delayed from app_private.announcement_push_deliveries where id=$1',[delivery.id])).rows[0].delayed,true);
    await apps[0].get(AnnouncementWorker).tick();assert.equal(requests.length,4);
    mode='ok';await db.query('update app_private.announcement_push_deliveries set next_attempt_at=now() where announcement_id=$1',[retry]);
    // Crash after reservation (before external HTTP): lease expiry and stale ACK fence.
    const child=spawn(process.execPath,['--input-type=module','-e',"import pg from 'pg';const c=new pg.Client({connectionString:process.env.PUSH_FIXTURE_DB});await c.connect();const r=await c.query('select * from app_private.worker_claim_announcement_push(false)');process.exit(r.rows.length===1?19:2);"],{cwd:new URL('..',import.meta.url),env:{...process.env,PUSH_FIXTURE_DB:connection},stdio:'ignore'});
    assert.equal(await new Promise(resolve=>child.once('exit',resolve)),19);
    const claimed=(await db.query('select id as delivery_id,claim_token from app_private.announcement_push_deliveries where announcement_id=$1',[retry])).rows[0];assert.ok(claimed);
    assert.equal((await apps[1].get(WorkerStore).call('pushClaim',[false])).length,0);
    await db.query("update app_private.announcement_push_deliveries set claimed_until=now()-interval '1 second' where id=$1",[claimed.delivery_id]);
    await assert.rejects(apps[0].get(WorkerStore).call('pushComplete',[claimed.delivery_id,claimed.claim_token,'accepted','stale']),{code:'55000'});
    await apps[1].get(AnnouncementWorker).tick();assert.equal(requests.length,5);
    const out=randomUUID();await publish(out);await clients[1].setAnnouncementPush({body:{enabled:false}});await apps[0].get(AnnouncementWorker).tick();assert.equal(requests.length,5);
    assert.equal((await db.query('select status from app_private.announcement_push_deliveries where announcement_id=$1',[out])).rows[0].status,'CANCELLED');
    await clients[1].setAnnouncementPush({body:{enabled:true}});const invalid=randomUUID();await publish(invalid);mode='invalid';await apps[0].get(AnnouncementWorker).tick();assert.equal((await clients[1].getAnnouncementPush()).hasDevices,false);
    await clients[1].unregisterAnnouncementToken({body:{token}});await clients[2].registerAnnouncementToken({body:{token,platform:'IOS'}});assert.equal((await clients[1].getAnnouncementPush()).hasDevices,false);assert.equal((await clients[2].getAnnouncementPush()).hasDevices,true);
    const latest=(await clients[0].getAnnouncements({params})).announcements.find(item=>item.id===id);await clients[0].deleteAnnouncement({params:{...params,announcementId:id},body:{updated_at:latest.updated_at}});
    assert.ok(!(await clients[1].getAnnouncements({params})).announcements.some(item=>item.id===id));
    const runtime = new pg.Client({connectionString:connection});await runtime.connect();try {
      for(const sql of ['select token from public.push_tokens','select * from app_private.announcement_push_deliveries',"update app_private.announcement_executor set mode='DRAINING'",'select * from app_private.canonical_claim_announcement_push(false)'])await assert.rejects(runtime.query(sql),{code:'42501'});
    }finally{await runtime.end();}
    assert.ok(!logs.join().includes(token));assert.ok(!logs.join().includes('privado'));assert.ok(!logs.join().includes('@example.test'));assert.ok(!logs.join().includes(password));
  } catch(error) { console.error('MIG159 fixture failure', error?.code ?? error?.name); throw error; } finally {
    globalThis.fetch=nativeFetch;for(const instance of apps)await instance.close();if(app)await app.close();if(fixture)await fixture.close();if(provider)await new Promise(resolve=>provider.close(resolve));
    await db.query("set session_replication_role='replica'");
    try {
    await db.query('delete from app_private.announcement_push_deliveries where user_id=any($1::uuid[])',[profiles]);
    await db.query('delete from public.group_announcements where group_id=any($1::uuid[])',[groups]);
    await db.query('delete from public.push_tokens where user_id=any($1::uuid[])',[profiles]);await db.query('delete from public.announcement_push_preferences where user_id=any($1::uuid[])',[profiles]);
    await db.query('delete from public.memberships where group_id=any($1::uuid[])',[groups]);await db.query('delete from app_private.billing_legacy_groups where group_id=any($1::uuid[])',[groups]);await db.query('delete from public.groups where id=any($1::uuid[])',[groups]);
    await db.query('delete from public.account_consents where user_id=any($1::uuid[])',[profiles]);await db.query('delete from public.users where id=any($1::uuid[])',[profiles]);await db.query('delete from app_private.auth_families where subject_id=any($1::uuid[])',[auth.map(item=>item.id??item)]);await db.query('delete from app_private.auth_subjects where id=any($1::uuid[])',[auth.map(item=>item.id??item)]);
    await db.query('update app_private.announcement_executor set mode=$1,draining_since=$2,activated_at=$3',[executor.mode,executor.draining_since,executor.activated_at]);
    await db.query("delete from public.job_runs where job_name='send-announcement-push' and run_date=app_private.chile_today()");if(ledger)await db.query('insert into public.job_runs select * from jsonb_populate_record(null::public.job_runs,$1::jsonb)',[JSON.stringify(ledger)]);
    for(const role of roles)await db.query('alter role '+role.rolname+' '+(role.rolcanlogin?'login':'nologin')+' password '+(role.rolpassword===null?'null':"'"+role.rolpassword.replaceAll("'","''")+"'"));
    await db.query("select pg_advisory_unlock(hashtextextended('mig159-integration',0))");} finally { await db.query("set session_replication_role='origin'"); await db.end(); }
  }
});
