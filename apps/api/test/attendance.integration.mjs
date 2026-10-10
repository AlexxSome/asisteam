import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {createApplication} from '../dist/application.js';
import {loadFixtureConfig as loadConfig,fixtureConnection} from './fixture-config.mjs';
import { SafeLogger } from '../dist/logger.js';
import { authFixture } from './auth-fixture.mjs';
import { ApiClient } from '../../../packages/api-client/dist/index.js';

const enabled = process.env.API_RLS_TEST === '1';
test('MIG-11 HTTP/PostgreSQL: batches0/1/500/501, rollback/concurrency, ADMIN/COACH and tenant privacy', { skip: !enabled }, async () => {
  const admin = new pg.Client({ connectionString: fixtureConnection() });
  await admin.connect();
  let app, fixture;
  const auth = Array.from({length:6},()=>randomUUID()), sessions=auth.map(()=>randomUUID()), profiles=[];
  const groups=[randomUUID(),randomUUID()], password=randomUUID(), logs=[], managed=[];
  const previous=(await admin.query("select rolcanlogin,rolpassword from pg_authid where rolname='asisteam_api'")).rows[0];
  const systemType='b2c3d4e5-0001-4b3c-8d4e-111111111111';
  try {
    fixture=await authFixture();
    await admin.query("alter role asisteam_api login password '"+password+"'");
    for(const [i,id] of auth.entries()) {
      await admin.query("with subject as (insert into app_private.auth_subjects(id,email,native_owned) values($1,$2,true) returning id) insert into public.users(auth_user_id,email,full_name,birthdate,account_status) select id,$2,($3::jsonb->>'full_name'),($3::jsonb->>'birthdate')::date,'ACTIVE' from subject",[id,'mig155-'+id+'@example.test',JSON.stringify({full_name:'Persona sintética',birthdate:'1990-01-01'})]);
      profiles.push((await admin.query('select id from public.users where auth_user_id=$1',[id])).rows[0].id);
      await admin.query("insert into app_private.auth_families(id,subject_id,created_at,expires_at) values($1,$2,now(),now()+interval '1 hour')",[sessions[i],id]);
      if(i!==4)await admin.query("insert into public.account_consents(user_id,terms_version,channel) values($1,'2026-09-21','IN_APP')",[profiles[i]]);
    }
    for(const [i,id] of groups.entries())await admin.query('insert into public.groups(id,name,sport,invite_code,created_by) values($1,$2,$3,$4,$5)',[id,'Club sintético','Tenis',randomUUID().replaceAll('-','').slice(0,8),profiles[i===0?0:3]]);
    for(const id of groups)await admin.query('insert into app_private.billing_legacy_groups(group_id) values($1)',[id]);
    for(const [i,g,role] of [[0,0,'ADMIN'],[1,0,'ATHLETE'],[2,0,'COACH'],[3,1,'ADMIN'],[3,1,'ATHLETE'],[4,0,'ADMIN'],[5,0,'GUARDIAN']])await admin.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,$3,'ACTIVE',now()-interval '1 day')",[profiles[i],groups[g],role]);
    app=await createApplication(loadConfig({DATABASE_URL:fixtureConnection('asisteam_api',password),PG_POOL_MAX:'2'}),new SafeLogger(line=>logs.push(line)));
    await app.listen(0,'127.0.0.1');
    const origin=await app.getUrl(),tokens=await Promise.all(auth.map((id,i)=>fixture.token(id,sessions[i]))),clients=tokens.map(token=>new ApiClient({origin,accessToken:async()=>token,timeoutMs:10000}));
    const activities=[randomUUID(),randomUUID(),randomUUID()];
    for(const [i,id] of activities.entries())await admin.query("insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values($1,$2,$3,'Asistencia sintética',now()-interval '1 hour',now(),$4)",[id,groups[i===2?1:0],systemType,profiles[i===2?3:0]]);
    for(let i=0;i<501;i++) {
      const id=randomUUID();managed.push(id);
      await admin.query("insert into public.users(id,full_name,birthdate,account_status) values($1,$2,'1990-01-01','MANAGED')",[id,'Deportista sintético '+String(i).padStart(3,'0')]);
      await admin.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,'ATHLETE',$3,now()-interval '1 day')",[id,groups[0],i<499?'ACTIVE':i===499?'PENDING':'INACTIVE']);
    }
    const members=(await admin.query("select id from public.memberships where group_id=$1 and role='ATHLETE' and status='ACTIVE' order by id",[groups[0]])).rows.map(row=>row.id);
    assert.equal(members.length,500);
    const params={groupId:groups[0],activityId:activities[0]}, memberParams={...params,membershipId:members[0]}, path='/api/v1/groups/'+groups[0]+'/activities/'+activities[0]+'/attendance';
    const request=(method='GET',payload,token=tokens[0],url=path)=>fetch(origin+url,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(payload?{'content-type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
    assert.equal((await request('GET',undefined,null)).status,401);
    for(const i of [1,3,5])await assert.rejects(clients[i].getAttendanceRoster({params}),{status:i===3?404:403});
    for(const i of [0,2]) {
      const roster=[];for(let page=1;;page++){const result=await clients[i].getAttendanceRoster({params,query:{page}});roster.push(...result.roster);assert.equal(result.canEditNotes,i===0);if(!result.hasNext)break;}
      assert.equal(roster.length,500);assert.ok(roster.every(row=>row.status===null&&row.note===null));
      assert.ok(!/email|phone|birthdate|recorded_by/.test(JSON.stringify(roster)));
    }
    const one={membership_id:members[0],status:'ABSENT',note:'Nota reservada sintética'};
    assert.deepEqual((await clients[0].saveAttendance({params,body:{records:[one]}})).records,[one]);
    // COACH receives no note; state-only correction retains ADMIN's note in SQL.
    const coachRoster=[];for(let page=1;;page++){const result=await clients[2].getAttendanceRoster({params,query:{page}});coachRoster.push(...result.roster);if(!result.hasNext)break;}
    assert.equal(coachRoster.find(row=>row.membership_id===members[0]).note,null);
    assert.equal((await clients[2].updateAttendance({params:memberParams,body:{status:'LATE'}})).records[0].note,null);
    assert.equal((await admin.query('select note from public.attendance_records where activity_id=$1 and membership_id=$2',[activities[0],members[0]])).rows[0].note,one.note);
    for(const note of [null,'Nota prohibida']) {
      await assert.rejects(clients[2].updateAttendance({params:memberParams,body:{note}}),error=>error.status===403&&error.error.code==='attendance_notes_admin_required');
      await assert.rejects(clients[2].saveAttendance({params,body:{records:[{...one,note}]}}),{status:403});
    }
    await assert.rejects(clients[2].clearAttendance({params:memberParams}),error=>error.status===403&&error.error.code==='attendance_clear_admin_required');
    await clients[0].updateAttendance({params:memberParams,body:{note:'Nota corregida'}});
    assert.equal((await admin.query('select status from public.attendance_records where activity_id=$1 and membership_id=$2',[activities[0],members[0]])).rows[0].status,'LATE');
    const count=async activityId=>(await admin.query('select count(*)::int n from public.attendance_records where activity_id=$1',[activityId])).rows[0].n;
    // Invalid batches never modify an existing record or create partial ones.
    const invalidMembers=(await admin.query("select id from public.memberships where group_id=$1 and (role<>'ATHLETE' or status<>'ACTIVE')",[groups[0]])).rows.map(row=>row.id);
    invalidMembers.push((await admin.query("select id from public.memberships where group_id=$1 and role='ATHLETE'",[groups[1]])).rows[0].id,randomUUID());
    for(const membership_id of invalidMembers)await assert.rejects(clients[0].saveAttendance({params,body:{records:[{membership_id:members[1],status:'PRESENT'},{membership_id,status:'PRESENT'}]}}),error=>error.status===422&&error.error.code==='membership_not_athlete_in_group');
    assert.equal(await count(activities[0]),1);
    for(const records of [[],Array.from({length:501},()=>one),[one,{...one,membership_id:one.membership_id.toUpperCase()}]])assert.equal((await request('PUT',{records})).status,400);
    assert.equal((await request('PUT',{records:[one],actor:profiles[3]})).status,400);
    assert.equal((await request('PATCH',{},tokens[0],path+'/'+members[0])).status,400);
    assert.equal((await request('GET',undefined,tokens[0],path+'?page=1&page=2')).status,400);
    const wrong={groupId:groups[0],activityId:activities[2]};
    for(const operation of [()=>clients[0].getAttendanceRoster({params:wrong}),()=>clients[0].saveAttendance({params:wrong,body:{records:[one]}}),()=>clients[0].clearAttendance({params:{...wrong,membershipId:members[0]}})])await assert.rejects(operation(),{status:404});
    assert.equal(await count(activities[2]),0);
    //500 maximal Unicode notes prove the HTTP parser can carry a valid batch.
    const records=members.map(membership_id=>({membership_id,status:'PRESENT',note:'界'.repeat(500)}));
    assert.equal((await clients[0].saveAttendance({params:{...params,activityId:activities[1]},body:{records}})).records.length,500);
    assert.equal(await count(activities[1]),500);
    assert.equal((await clients[0].saveAttendance({params,body:{records:members.map(membership_id=>({membership_id,status:'PRESENT'})),only_unmarked:true}})).records.length,500);
    assert.equal(await count(activities[0]),500);
    assert.equal((await clients[0].getAttendanceRoster({params})).roster.length,100);
    assert.equal((await admin.query('select status,note from public.attendance_records where activity_id=$1 and membership_id=$2',[activities[0],members[0]])).rows[0].status,'LATE');
    // Concurrent retries serialize through the canonical activity lock.
    await Promise.all(Array.from({length:8},(_,i)=>clients[i%2===0?0:2].saveAttendance({params,body:{records:[{membership_id:members[0],status:i%2===0?'ABSENT':'PRESENT'}]}})));
    assert.equal(await count(activities[0]),500);
    assert.equal((await admin.query('select count(*)::int n from public.attendance_records where activity_id=$1 and membership_id=$2',[activities[0],members[0]])).rows[0].n,1);
    await clients[0].clearAttendance({params:memberParams});await clients[0].clearAttendance({params:memberParams});
    assert.equal(await count(activities[0]),499);
    await assert.rejects(clients[0].updateAttendance({params:memberParams,body:{status:'PRESENT'}}),{status:404});
    // The prior committed500 batch remains after a later rejected batch.
    assert.equal(await count(activities[1]),500);
    await admin.query("update public.memberships set status='INACTIVE' where user_id=$1 and group_id=$2",[profiles[2],groups[0]]);
    await assert.rejects(clients[2].getAttendanceRoster({params}),{status:404});
    await assert.rejects(clients[4].saveAttendance({params,body:{records:[one]}}),{status:403});
    for(const token of tokens)assert.ok(!logs.join('\n').includes(token));assert.ok(!logs.join('\n').includes(password));assert.ok(!logs.join('\n').includes(one.note));
  } finally {
    if(app)await app.close();if(fixture)await fixture.close();
    await admin.query("set session_replication_role='replica'");
    try {
      await admin.query('delete from public.attendance_records where activity_id in(select id from public.activities where group_id=any($1::uuid[]))',[groups]);
      await admin.query('delete from public.activities where group_id=any($1::uuid[])',[groups]);
      await admin.query('delete from public.activity_types where group_id=any($1::uuid[])',[groups]);
      await admin.query('delete from public.memberships where group_id=any($1::uuid[])',[groups]);
      await admin.query('delete from app_private.billing_legacy_groups where group_id=any($1::uuid[])',[groups]);
      await admin.query('delete from public.groups where id=any($1::uuid[])',[groups]);
      await admin.query('delete from public.account_consents where user_id=any($1::uuid[])',[profiles]);
      await admin.query('delete from public.users where id=any($1::uuid[])',[[...profiles,...managed]]);
      await admin.query('delete from app_private.auth_families where subject_id=any($1::uuid[])',[auth]);
      await admin.query('delete from app_private.auth_subjects where id=any($1::uuid[])',[auth]);
      const old=previous.rolpassword===null?'null':"'"+previous.rolpassword.replaceAll("'","''")+"'";
      await admin.query('alter role asisteam_api '+(previous.rolcanlogin?'login':'nologin')+' password '+old);
    } finally {await admin.query("set session_replication_role='origin'");await admin.end();}
  }
});
