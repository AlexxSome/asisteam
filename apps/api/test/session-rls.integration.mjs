import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {createApplication} from '../dist/application.js';
import {loadFixtureConfig as loadConfig,fixtureConnection} from './fixture-config.mjs';
import { Database } from '../dist/database.js';
import { TokenVerifier } from '../dist/auth.js';
import { requireMembership, projectGroupDetail } from '../dist/authorization.js';
import { SafeLogger } from '../dist/logger.js';
import { authFixture } from './auth-fixture.mjs';

const enabled = process.env.API_RLS_TEST === '1';
test('Nest HTTP, runtime role, V1–V6/COACH/multirol, revocation and reused pool connection', { skip: !enabled }, async () => {
  const admin = new pg.Client({ connectionString: fixtureConnection() });
  await admin.connect();
  const fixture = await authFixture();
  const auth = Array.from({ length: 7 }, () => randomUUID());
  const sessions = auth.map(() => randomUUID());
  const groups = [randomUUID(), randomUUID()];
  const activity = randomUUID();
  let app;
  let profiles = [];
  const memberships = Array.from({ length: 5 }, () => randomUUID());
  const password = randomUUID();
  const previous = (await admin.query("select rolcanlogin, rolpassword from pg_authid where rolname='asisteam_api'")).rows[0];
  try {
    await admin.query('alter role asisteam_api login password ' + "'" + password + "'");
    for (const [i, id] of auth.entries()) {
      await admin.query("with subject as (insert into app_private.auth_subjects(id,email,native_owned) values($1,$2,true) returning id) insert into public.users(auth_user_id,email,full_name,birthdate,account_status) select id,$2,($3::jsonb->>'full_name'),($3::jsonb->>'birthdate')::date,'ACTIVE' from subject", [id, 'api149-' + id + '@example.test', JSON.stringify({ full_name: 'Persona sintética ' + i, birthdate: i === 3 ? '2014-01-01' : '1990-01-01' })]);
      await admin.query('insert into app_private.auth_families(id,subject_id,created_at,expires_at) values($1,$2,now(),now()+interval \'1 hour\')', [sessions[i],id]);
      profiles.push((await admin.query('select id from public.users where auth_user_id=$1', [id])).rows[0].id);
    }
    for (const [i, id] of groups.entries()) {
      await admin.query('insert into public.groups(id,name,invite_code,created_by) values($1,$2,$3,$4)', [id, 'Grupo sintético ' + i, randomUUID().replaceAll('-','').slice(0,8), profiles[i === 0 ? 0 : 5]]);
      await admin.query('insert into app_private.billing_legacy_groups(group_id) values($1)',[id]);
    }
    // Guardian + minor consent precede ATHLETE ACTIVE (R1).
    const guardianship = (await admin.query("insert into public.guardianships(guardian_user_id,athlete_user_id,relationship) values($1,$2,'Apoderado') returning id",[profiles[2],profiles[3]])).rows[0].id;
    await admin.query("insert into public.consents(guardianship_id,consent_type,terms_version) values($1,'DATA_PROCESSING_MINOR','synthetic')",[guardianship]);
    const specs = [[0,0,'ADMIN','ACTIVE'],[1,0,'ATHLETE','ACTIVE'],[3,0,'ATHLETE','ACTIVE'],[4,0,'COACH','ACTIVE'],[5,1,'ADMIN','ACTIVE']];
    for (const [i, spec] of specs.entries()) await admin.query("insert into public.memberships(id,user_id,group_id,role,status,joined_at) values($1,$2,$3,$4,$5,now()-interval '30 days')", [memberships[i],profiles[spec[0]],groups[spec[1]],spec[2],spec[3]]);
    await admin.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,'COACH','ACTIVE',now())",[profiles[0],groups[0]]);
    await admin.query("insert into public.memberships(user_id,group_id,role,status) values($1,$2,'ATHLETE','PENDING')",[profiles[6],groups[0]]);
    await admin.query("insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values($1,$2,'b2c3d4e5-0001-4b3c-8d4e-111111111111','Actividad sintética',now()-interval '1 day',now()-interval '23 hours',$3)",[activity,groups[0],profiles[0]]);
    for (const mid of [memberships[1],memberships[2]]) await admin.query("insert into public.attendance_records(activity_id,membership_id,status,note,recorded_by) values($1,$2,'ABSENT','Nota sintética privada',$3)",[activity,mid,profiles[0]]);
    const logs = [];
    app = await createApplication(loadConfig({ DATABASE_URL: fixtureConnection('asisteam_api',password),  PG_POOL_MAX: '1' }),new SafeLogger(line=>logs.push(line)));
    const db = app.get(Database), verifier = app.get(TokenVerifier);
    const express = app.getHttpAdapter().getInstance();
    // Temporary fixture endpoints only; no product domain handler is published.
    express.get('/_fixture/groups/:id/:mode',async (request,response) => {
      try {
        const identity = await verifier.verify(request.headers.authorization);
        const result = await db.authenticated(identity,async tx => {
          const roles = await requireMembership(tx,request.params.id,request.params.mode === 'admin' ? ['ADMIN'] : undefined);
          if (request.params.mode === 'stats') return (await tx.query('select public.get_group_stats($1) as data',[request.params.id])).rows[0].data;
          if (request.params.mode === 'operate') return (await tx.query('select public.record_attendance_bulk($1,$2::jsonb) as data',[activity,JSON.stringify([{ membership_id: memberships[1], status: 'LATE' }])])).rows[0].data;
          const row = (await tx.query('select id,name,sport,logo_url,description,invite_code,settings,settings_updated_at,settings_updated_by_name,can_view_group_stats from public.v_group_detail where id=$1',[request.params.id])).rows[0];
          return projectGroupDetail(row,roles);
        });
        response.json(result);
      } catch(error) { response.status(error.getStatus?.() ?? (Number(error.code?.slice(2)) || 500)).json({error:{code:'fixture_denied'}}); }
    });
    await app.listen(0,'127.0.0.1');
    const base = await app.getUrl();
    const tokens = await Promise.all(auth.map((id,i)=>fixture.token(id,sessions[i])));
    const identity = async i => verifier.verify('Bearer '+tokens[i]);
    const request = (i,path) => fetch(base+path,{headers:{authorization:'Bearer '+tokens[i], 'x-actor': auth[5], 'x-role':'ADMIN'}});
    for (let i=0;i<6;i++) {
      const response = await request(i,'/api/v1/auth/session?actor='+auth[5]+'&group_id='+groups[1]);
      assert.equal(response.status,200);assert.deepEqual(await response.json(),{user_id:profiles[i]});
    }
    // One backend pid alternates tenants/actors, successful commit and rollback.
    const pids = new Set();
    for (const i of [0,5,1,4,2,0]) await db.authenticated(await identity(i),async tx => {
      const row = (await tx.query('select pg_backend_pid() as pid, app_private.actor_subject_id() as auth_id, public.auth_user_id() as profile_id')).rows[0];
      pids.add(row.pid);assert.equal(row.auth_id,auth[i]);assert.equal(row.profile_id,profiles[i]);
      const visible = (await tx.query('select id from public.v_my_groups')).rows.map(r=>r.id);assert.deepEqual(visible,[groups[i===5?1:0]]);
    });
    assert.equal(pids.size,1);
    const wrongRole = new Database(loadConfig({ DATABASE_URL: fixtureConnection(), }),new SafeLogger(()=>{}));
    try { assert.equal(await wrongRole.ready(),false);await assert.rejects(wrongRole.authenticated(await identity(0),async()=>true),error=>error.getStatus()===503); }finally{await wrongRole.onApplicationShutdown();}
    const originalName=(await admin.query('select full_name from public.users where id=$1',[profiles[0]])).rows[0].full_name;
    await admin.query("update app_private.auth_families set expires_at=now()+interval '300 milliseconds' where id=$1",[sessions[0]]);
    await assert.rejects(db.authenticated(await identity(0),async tx=>{
      await tx.query('update public.users set full_name=$1 where id=$2',['Cambio sintético',profiles[0]]);
      await tx.query('select pg_sleep(0.4)');
    }),error=>error.getStatus()===401);
    assert.equal((await admin.query('select full_name from public.users where id=$1',[profiles[0]])).rows[0].full_name,originalName);
    await admin.query("update app_private.auth_families set expires_at=now()+interval '1 hour' where id=$1",[sessions[0]]);
    const concurrent = new Database(loadConfig({ DATABASE_URL: fixtureConnection('asisteam_api',password), PG_POOL_MAX: '2' }),new SafeLogger(()=>{}));
    let entered=0,release;
    const barrier=new Promise(resolve=>{release=resolve;});
    try { await Promise.all([0,1].map(async()=>concurrent.authenticated(await identity(0),async tx=>{
      if(++entered===2)release();await barrier;
      // Existing RPCs may take FOR UPDATE on actor; resolving a session must
      // not pre-lock the profile FOR SHARE and deadlock both lock upgrades.
      await tx.query('select id from public.users where id=$1 for update',[profiles[0]]);
    }))); }finally{await concurrent.onApplicationShutdown();}
    await assert.rejects(db.pool.query('set role asisteam_member'),error=>error.code==='42501');
    await assert.rejects(db.pool.query('set role asisteam_migrator'),error=>['42501','42704'].includes(error.code));
    const after = (await db.pool.query('select app_private.actor_subject_id() as id, public.auth_user_id() as profile, current_setting(\'request.jwt.claims\',true) as claims')).rows[0];
    assert.equal(after.id,null);assert.equal(after.profile,null);assert.ok(!after.claims);
    let stale;
    await db.authenticated(await identity(0),async tx=>{stale=tx;});
    await assert.rejects(stale.query('select 1'));
    await assert.rejects(db.authenticated(await identity(0),async ()=>{throw new Error('synthetic rollback');}));
    assert.equal((await db.pool.query('select app_private.actor_subject_id() as id')).rows[0].id,null);
    await assert.rejects(db.authenticated({authUserId:auth[0],sessionId:sessions[0],expiresAt:9999999999},async()=>true),error=>error.getStatus()===401);
    for (const i of [1,2,4]) {
      const response = await request(i,'/_fixture/groups/'+groups[0]+'/read');assert.equal(response.status,200);
      const dto=await response.json();assert.equal(dto.access,'member');assert.ok(!JSON.stringify(dto).match(/email|phone|birthdate|invite_code|settings|note/));
      assert.equal((await request(i,'/_fixture/groups/'+groups[1]+'/read')).status,404);
      assert.equal((await request(i,'/_fixture/groups/'+groups[0]+'/admin')).status,403);
    }
    assert.equal((await request(6,'/_fixture/groups/'+groups[0]+'/read')).status,404);
    const multi=await request(0,'/_fixture/groups/'+groups[0]+'/admin');assert.equal(multi.status,200);assert.equal((await multi.json()).access,'admin');
    for (const i of [1,2]) assert.equal((await request(i,'/_fixture/groups/'+groups[0]+'/stats')).status,403);
    for (const i of [0,4]) assert.equal((await request(i,'/_fixture/groups/'+groups[0]+'/stats')).status,200);
    // V1/V2 own/ward notes survive toggles off; V5 excludes third-party rows.
    await db.authenticated(await identity(1),async tx=>{assert.equal((await tx.query('select count(*)::int as n from public.v_attendance_own')).rows[0].n,1);assert.equal((await tx.query('select count(*)::int as n from public.users where id=$1',[profiles[3]])).rows[0].n,0);});
    await db.authenticated(await identity(2),async tx=>{assert.equal((await tx.query('select public.is_guardian_of($1) as allowed',[profiles[3]])).rows[0].allowed,true);assert.equal((await tx.query('select count(*)::int as n from public.v_ward_attendance_history')).rows[0].n,1);});
    await admin.query("update public.groups set settings=jsonb_build_object('athletes_can_view_group_stats',true,'guardians_can_view_group_stats',false) where id=$1",[groups[0]]);
    const stats=await request(1,'/_fixture/groups/'+groups[0]+'/stats');assert.equal(stats.status,200);assert.ok(!JSON.stringify(await stats.json()).match(/email|phone|birthdate|note|guardianship/));
    assert.equal((await request(2,'/_fixture/groups/'+groups[0]+'/stats')).status,403);
    const operate=await request(4,'/_fixture/groups/'+groups[0]+'/operate');assert.equal(operate.status,200);assert.equal((await operate.json()).records[0].note,null);
    for (const sql of ['select public.record_attendance_bulk($1,$2::jsonb)','select public.clear_attendance_record($1,$2)']) await assert.rejects(db.authenticated(await identity(4),tx=>tx.query(sql,sql.includes('bulk')?[activity,JSON.stringify([{membership_id:memberships[1],status:'PRESENT',note:null}])]:[activity,memberships[1]])),error=>error.code==='PT403');
    assert.equal((await admin.query('select note from public.attendance_records where activity_id=$1 and membership_id=$2',[activity,memberships[1]])).rows[0].note,'Nota sintética privada');
    await admin.query("set session_replication_role='replica'");
    await admin.query("update public.users set birthdate='1990-01-01' where id=$1",[profiles[3]]);
    await admin.query("set session_replication_role='origin'");
    await db.authenticated(await identity(2),async tx=>{assert.equal((await tx.query('select public.is_guardian_of($1) as allowed',[profiles[3]])).rows[0].allowed,false);assert.equal((await tx.query('select count(*)::int as n from public.v_ward_attendance_history')).rows[0].n,0);});
    await admin.query('delete from app_private.auth_families where id=$1',[sessions[1]]);
    assert.equal((await request(1,'/api/v1/auth/session')).status,401);
    await admin.query('update app_private.auth_families set expires_at=now()-interval \'1 second\' where id=$1',[sessions[4]]);
    assert.equal((await request(4,'/api/v1/auth/session')).status,401);
    await admin.query("update public.users set auth_user_id=null, account_status='MANAGED' where id=$1",[profiles[6]]);
    assert.equal((await request(6,'/api/v1/auth/session')).status,401);
    for(const token of tokens) assert.ok(!logs.join('\n').includes(token));
    assert.ok(!logs.join('\n').includes(password));
  } finally {
    if(app)await app.close();await fixture.close();
    // Synthetic fixture only; rollback-like cleanup cannot touch other groups.
    await admin.query("set session_replication_role='replica'");
    try {
      await admin.query('delete from public.attendance_records where activity_id=$1',[activity]);
      await admin.query('delete from public.activities where id=$1',[activity]);
      await admin.query('delete from public.consents where guardianship_id in (select id from public.guardianships where guardian_user_id=any($1::uuid[]))',[profiles]);
      await admin.query('delete from public.guardianships where guardian_user_id=any($1::uuid[])',[profiles]);
      await admin.query('delete from public.memberships where group_id=any($1::uuid[])',[groups]);
      await admin.query('delete from app_private.billing_legacy_groups where group_id=any($1::uuid[])',[groups]);
      await admin.query('delete from public.groups where id=any($1::uuid[])',[groups]);
      await admin.query('delete from public.account_consents where user_id=any($1::uuid[])',[profiles]);
      await admin.query('delete from public.users where id=any($1::uuid[])',[profiles]);
      await admin.query('delete from app_private.auth_families where subject_id=any($1::uuid[])',[auth]);
      await admin.query('delete from app_private.auth_subjects where id=any($1::uuid[])',[auth]);
      const oldPassword = previous.rolpassword === null ? 'null' : "'" + previous.rolpassword.replaceAll("'","''") + "'";
      await admin.query('alter role asisteam_api '+(previous.rolcanlogin?'login':'nologin')+' password '+oldPassword);
    }finally{await admin.query("set session_replication_role='origin'");await admin.end();}
  }
});


test('native signup signature/session: issued token accepted, altered token and logout rejected',{skip:!enabled},async()=>{
 const db=new pg.Client({connectionString:fixtureConnection()});await db.connect();
 const password='Synthetic-native-'+randomUUID(),email='session-'+randomUUID()+'@example.test',rolePassword=new URL(fixtureConnection()).password,realFetch=globalThis.fetch;
 let app;
 try{
  globalThis.fetch=async(url,options)=>String(url).startsWith('https://api.pwnedpasswords.com/range/')?new Response('A'.repeat(35)+':0'):realFetch(url,options);
  app=await createApplication(loadConfig({DATABASE_URL:fixtureConnection('asisteam_api',rolePassword)}),new SafeLogger(()=>{}));await app.listen(0,'127.0.0.1');
  const {ApiClient}=await import('../../../packages/api-client/dist/index.js'),{fixtureSecret}=await import('./fixture-config.mjs');
  const anonymous=new ApiClient({origin:await app.getUrl(),nativeAuth:true,authProxy:{secret:fixtureSecret,clientIp:randomUUID()}});
  await anonymous.registerPassword({body:{email,password,full_name:'Persona sintética nativa',birthdate:'1990-01-01',terms_accepted:true,terms_version:'2026-09-21'}});
  const session=await anonymous.loginPassword({body:{email,password}});assert.ok(typeof session.access_token==='string');
  const subject=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url')).sub,profile=(await db.query('select id from public.users where auth_user_id=$1',[subject])).rows[0].id;
  const url=await app.getUrl()+'/api/v1/auth/session',request=token=>realFetch(url,{headers:{authorization:'Bearer '+token}});
  const response=await request(session.access_token);assert.equal(response.status,200);assert.deepEqual(await response.json(),{user_id:profile});
  const parts=session.access_token.split('.');parts[1]=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(parts[1],'base64url')),sub:randomUUID()})).toString('base64url');assert.equal((await request(parts.join('.'))).status,401);
  await new ApiClient({origin:await app.getUrl(),accessToken:async()=>session.access_token}).logoutSession();assert.equal((await request(session.access_token)).status,401);
 }finally{globalThis.fetch=realFetch;if(app)await app.close();await db.end()}
});
