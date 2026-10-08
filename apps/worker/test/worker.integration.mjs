import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { createWorker } from '../dist/application.js';
import { loadConfig } from '../dist/config.js';
import { MajorityWorker } from '../dist/worker.js';
import { WorkerStore } from '../dist/store.js';
import { SafeLogger } from '../../api/dist/logger.js';

test('two Nest workers, process crash, expired lease, failed HTTP provider and lost receipt', {skip:process.env.WORKER_TEST!=='1'},async()=>{
  const db=new pg.Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:54322/postgres'});await db.connect();
  await db.query("select pg_advisory_lock(hashtextextended('mig157-integration',0))");
  const snapshot={executor:(await db.query('select * from app_private.majority_executor')).rows[0],tasks:(await db.query('select * from app_private.majority_tasks')).rows,
    role:(await db.query("select rolcanlogin,rolpassword from pg_authid where rolname='asisteam_jobs'")).rows[0],cron:(await db.query("select schedule,command from cron.job where jobname='guardianship-majority'")).rows[0],
    job:(await db.query("select * from public.job_runs where run_date=app_private.chile_today() and job_name='guardianship-majority'")).rows[0]};
  const id=randomUUID(),secret=randomUUID(),logs=[],apps=[],requests=[], receipts=new Map();let fail=true;
  const nativeFetch=globalThis.fetch;
  const server=createServer(async(request,response)=>{let body='';for await(const chunk of request)body+=chunk;const key=request.headers['idempotency-key'];requests.push({key,body});if(fail){response.writeHead(503).end('{}');return;}if(receipts.has(key))assert.equal(receipts.get(key).body,body);else receipts.set(key,{body,id:randomUUID()});response.setHeader('content-type','application/json');response.end(JSON.stringify({id:receipts.get(key).id}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  globalThis.fetch=(url,options)=>{assert.equal(url,'https://api.resend.com/emails');return nativeFetch('http://127.0.0.1:'+server.address().port,options);};
  let blocked=[];
  try {
    blocked=(await db.query('update app_private.guardianship_majority_deliveries set blocked_at=now() where sent_at is null and blocked_at is null returning id')).rows.map(r=>r.id);
    await db.query("alter role asisteam_jobs login password '"+secret+"'");
    // Real role, real PostgreSQL; setup bypass is restricted to synthetic operator fixture.
    await db.query("update app_private.majority_executor set mode='LEGACY',draining_since=null,email_next_at=null");
    await db.query("select app_private.majority_handoff('DRAINING')");
    await assert.rejects(db.query("select app_private.majority_handoff('WORKER')"),{code:'55000'});
    await db.query("update app_private.majority_executor set draining_since=now()-interval '12 minutes'");
    await assert.rejects(db.query("select app_private.majority_handoff('WORKER')"),{code:'55000'});
    await db.query("select app_private.majority_handoff('WORKER',true)");
    await assert.rejects(db.query('select public.run_guardianship_majority()'),{code:'55000'});
    await db.query('delete from app_private.majority_tasks');
    await db.query("insert into app_private.majority_tasks(run_date) values(app_private.chile_today())");
    // A separate OS process claims and crashes before completion.
    const connection='postgresql://asisteam_jobs:'+secret+'@127.0.0.1:54322/postgres';
    const child=spawn(process.execPath,['--input-type=module','-e',"import pg from 'pg';const c=new pg.Client({connectionString:process.env.WORKER_FIXTURE_DB});await c.connect();const r=await c.query('select * from app_private.worker_claim_transition()');if(r.rows.length!==1)process.exit(2);process.exit(19);"],{cwd:new URL('..',import.meta.url),env:{...process.env,WORKER_FIXTURE_DB:connection},stdio:'ignore'});
    assert.equal(await new Promise(resolve=>child.once('exit',resolve)),19);
    const stale=(await db.query('select run_date::text,lease_token from app_private.majority_tasks')).rows[0];
    const runtime=new pg.Client({connectionString:connection});await runtime.connect();
    try {assert.equal((await runtime.query('select * from app_private.worker_claim_transition()')).rows.length,0);await assert.rejects(runtime.query('select email from public.users'),{code:'42501'});}finally{await runtime.end();}
    await db.query("update app_private.majority_tasks set lease_until=now()-interval '1 second'");
    // Prevent scanning unrelated synthetic fixture state: existing ledger is authoritative.
    await db.query("insert into public.job_runs(job_name,run_date,affected_count) values('guardianship-majority',app_private.chile_today(),0) on conflict do nothing");
    await db.query("insert into public.users(id,full_name,email,birthdate,account_status) values($1,'Worker synthetic','worker157-'||$1::uuid::text||'@example.test','1990-01-01','MANAGED')",[id]);
    await db.query("insert into app_private.guardianship_majority_deliveries(athlete_user_id,recipient_user_id,audience) values($1,$1,'ATHLETE')",[id]);
    const config=loadConfig({DATABASE_URL:connection,RESEND_API_KEY:'synthetic-provider-key',INVITATION_EMAIL_FROM:'fixture@example.test'});
    for(let n=0;n<2;n++)apps.push(await createWorker(config,new SafeLogger(line=>logs.push(line))));
    await Promise.all(apps.map(app=>app.get(MajorityWorker).tick()));
    assert.equal(requests.length,1);assert.equal((await db.query('select completed_at from app_private.majority_tasks')).rows[0].completed_at!==null,true);
    assert.equal((await db.query('select app_private.worker_complete_transition($1,$2) as ok',[stale.run_date,stale.lease_token])).rows[0].ok,false);
    assert.equal((await db.query('select sent_at from app_private.guardianship_majority_deliveries where athlete_user_id=$1',[id])).rows[0].sent_at,null);
    fail=false;await db.query('update app_private.majority_executor set email_next_at=null');await db.query('update app_private.guardianship_majority_deliveries set retry_at=now() where athlete_user_id=$1',[id]);
    const store=apps[0].get(WorkerStore),originalCall=store.call.bind(store);let lose=true;
    store.call=async(op,values)=>{if(op==='finish'&&lose){lose=false;throw new Error('synthetic crash after provider accepted');}return originalCall(op,values);};
    await apps[0].get(MajorityWorker).tick();assert.equal(receipts.size,1);
    await db.query("update public.users set email='changed157@example.test',full_name='Changed synthetic' where id=$1",[id]);
    await db.query('update app_private.majority_executor set email_next_at=null');await db.query("update app_private.guardianship_majority_deliveries set claimed_at=now()-interval '2 minutes' where athlete_user_id=$1",[id]);
    await apps[1].get(MajorityWorker).tick();assert.equal(receipts.size,1);assert.equal(requests.length,3);assert.ok(requests.every(r=>r.key===requests[0].key&&r.body===requests[0].body));
    assert.ok((await db.query('select sent_at from app_private.guardianship_majority_deliveries where athlete_user_id=$1',[id])).rows[0].sent_at);
    await Promise.all(apps.map(app=>app.get(MajorityWorker).tick()));assert.equal(requests.length,3);
    assert.ok(!logs.join().includes(secret));assert.ok(!logs.join().includes('@example.test'));
  } finally {
    for(const app of apps)await app.close();globalThis.fetch=nativeFetch;await new Promise(resolve=>server.close(resolve));
    await db.query('delete from app_private.guardianship_majority_deliveries where athlete_user_id=$1',[id]);await db.query('delete from public.users where id=$1',[id]);
    await db.query('update app_private.guardianship_majority_deliveries set blocked_at=null where id=any($1::uuid[])',[blocked]);
    await db.query('delete from app_private.majority_tasks');if(snapshot.tasks.length)await db.query('insert into app_private.majority_tasks select * from jsonb_populate_recordset(null::app_private.majority_tasks,$1::jsonb)',[JSON.stringify(snapshot.tasks)]);
    await db.query('update app_private.majority_executor set mode=$1,draining_since=$2,email_next_at=$3',[snapshot.executor.mode,snapshot.executor.draining_since,snapshot.executor.email_next_at]);
    if(snapshot.cron)await db.query("select cron.schedule('guardianship-majority',$1,$2)",[snapshot.cron.schedule,snapshot.cron.command]);
    if(!snapshot.job)await db.query("delete from public.job_runs where run_date=app_private.chile_today() and job_name='guardianship-majority'");
    const old=snapshot.role.rolpassword===null?'null':"'"+snapshot.role.rolpassword.replaceAll("'","''")+"'";await db.query('alter role asisteam_jobs '+(snapshot.role.rolcanlogin?'login':'nologin')+' password '+old);
    await db.query("select pg_advisory_unlock(hashtextextended('mig157-integration',0))");await db.end();
  }
});
