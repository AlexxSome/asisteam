import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {createApplication} from '../dist/application.js';
import {loadFixtureConfig as loadConfig,fixtureConnection} from './fixture-config.mjs';
import { SafeLogger } from '../dist/logger.js';
import { authFixture } from './auth-fixture.mjs';
import { ApiClient } from '../../../packages/api-client/dist/index.js';

test('MIG-16 QR HTTP/SQL: legacy compatibility, roles, signature/expiry/window, own identity and retries/concurrency', { skip: process.env.API_RLS_TEST !== '1' }, async () => {
 const admin=new pg.Client({connectionString:fixtureConnection()});await admin.connect();
 const previous=(await admin.query("select rolcanlogin,rolpassword from pg_authid where rolname='asisteam_api'")).rows[0];
 const auth=Array.from({length:11},()=>randomUUID()),sessions=auth.map(()=>randomUUID()),profiles=[],groups=[randomUUID(),randomUUID()],activities=Array.from({length:5},()=>randomUUID()),logs=[],sensitive=[];
 const password=randomUUID();let app,fixture;
 const settings={opens_before_minutes:15,closes_after_minutes:60,late_after_minutes:10};
 try {
  fixture=await authFixture();await admin.query("alter role asisteam_api login password '"+password+"'");
  for(const [i,id] of auth.entries()){
   await admin.query("with subject as (insert into app_private.auth_subjects(id,email,native_owned) values($1,$2,true) returning id) insert into public.users(auth_user_id,email,full_name,birthdate,account_status) select id,$2,($3::jsonb->>'full_name'),($3::jsonb->>'birthdate')::date,'ACTIVE' from subject",[id,'mig160-'+id+'@example.test',JSON.stringify({full_name:'Persona sintética QR',birthdate:'1990-01-01'})]);
   profiles.push((await admin.query('select id from public.users where auth_user_id=$1',[id])).rows[0].id);
   await admin.query("insert into app_private.auth_families(id,subject_id,created_at,expires_at) values($1,$2,now(),now()+interval '1 hour')",[sessions[i],id]);
   if(i!==10)await admin.query("insert into public.account_consents(user_id,terms_version,channel) values($1,'2026-09-21','IN_APP')",[profiles[i]]);
  }
  for(const [i,id]of groups.entries()){
   await admin.query('insert into public.groups(id,name,invite_code,created_by) values($1,$2,$3,$4)',[id,'Equipo QR sintético',randomUUID().replaceAll('-','').slice(0,8),profiles[i===0?0:4]]);
   await admin.query('insert into app_private.billing_legacy_groups(group_id) values($1)',[id]);
  }
  const memberships=[];
  for(const [i,g,role,status]of [[0,0,'ADMIN','ACTIVE'],[1,0,'ATHLETE','ACTIVE'],[2,0,'COACH','ACTIVE'],[3,0,'GUARDIAN','ACTIVE'],[4,1,'ADMIN','ACTIVE'],[4,1,'ATHLETE','ACTIVE'],[5,0,'ATHLETE','PENDING'],[6,0,'ATHLETE','INACTIVE'],[7,0,'ATHLETE','INVITED'],[8,0,'ADMIN','ACTIVE'],[8,0,'ATHLETE','ACTIVE'],[9,0,'ATHLETE','ACTIVE'],[10,0,'ATHLETE','ACTIVE']]){
   const row=(await admin.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,$3,$4,now()-interval '1 day') returning id",[profiles[i],groups[g],role,status])).rows[0];if(role==='ATHLETE')memberships[i]=row.id;
  }
  for(const [i,id]of activities.entries())await admin.query("insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values($1,$2,'b2c3d4e5-0001-4b3c-8d4e-111111111111','Entrenamiento QR sintético',now()+($3||' minutes')::interval,now()+($3||' minutes')::interval+interval '1 hour',$4)",[id,groups[i===4?1:0],[0,-11,20,-61,0][i],profiles[i===4?4:0]]);
  app=await createApplication(loadConfig({DATABASE_URL:fixtureConnection('asisteam_api',password),PG_POOL_MAX:'4',PG_STATEMENT_TIMEOUT_MS:'10000',HTTP_TIMEOUT_MS:'15000'}),new SafeLogger(line=>logs.push(line)));await app.listen(0,'127.0.0.1');
  const origin=await app.getUrl(),tokens=await Promise.all(auth.map((id,i)=>fixture.token(id,sessions[i]))),clients=tokens.map(token=>new ApiClient({origin,accessToken:async()=>token,timeoutMs:20000}));sensitive.push(...tokens,password);
  const request=(path,method='POST',body,token=tokens[0])=>fetch(origin+path,{method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const params={groupId:groups[0]},issueParams={activityId:activities[0]},body=token=>({activity_id:activities[0],token});
  assert.equal((await request('/api/v1/me/check-in','POST',body('0'.repeat(64)),null)).status,401);
  assert.deepEqual(await clients[0].getQrSettings({params}),settings);assert.deepEqual(await clients[0].setQrSettings({params,body:settings}),settings);
  for(const i of [1,2,3,5,6,7])for(const operation of [()=>clients[i].getQrSettings({params}),()=>clients[i].setQrSettings({params,body:settings}),()=>clients[i].issueCheckinQr({params:issueParams})])await assert.rejects(operation(),error=>error.status===([5,6,7].includes(i)?404:403));
  for(const i of [4])await assert.rejects(clients[i].getQrSettings({params}),{status:404});
  for(const activityId of [activities[2],activities[3]])await assert.rejects(clients[0].issueCheckinQr({params:{activityId}}),error=>error.status===422&&error.error.code==='checkin_window_closed');
  const badSettings=await request('/api/v1/groups/'+groups[0]+'/check-in-settings','PUT',{...settings,late_after_minutes:61});assert.equal(badSettings.status,400);
  assert.equal((await request('/api/v1/me/check-in','POST',{...body('0'.repeat(64)),user_id:profiles[1]})).status,400);
  // Issue with the old authenticated RPC before changing transport. No key copy
  // or rotation: the same database/key/token bucket is used by both adapters.
  const legacy=async(i,query,values)=>{await admin.query('BEGIN');try{await admin.query('set local role asisteam_api');await admin.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:auth[i],role:'authenticated',auth_provider:'nest'})]);const result=(await admin.query(query,values)).rows[0].result;await admin.query('COMMIT');return result;}catch(error){await admin.query('ROLLBACK');throw error;}};
  let qr=await legacy(0,'select public.issue_activity_checkin_qr($1) as result',[activities[0]]);sensitive.push(qr.token);
  if(Date.parse(qr.expires_at)-Date.now()<5000){await new Promise(resolve=>setTimeout(resolve,Math.max(1,Date.parse(qr.expires_at)-Date.now()+50)));qr=await legacy(0,'select public.issue_activity_checkin_qr($1) as result',[activities[0]]);sensitive.push(qr.token);}
  assert.ok(Date.parse(qr.expires_at)>Date.parse(qr.server_time)&&Date.parse(qr.expires_at)-Date.parse(qr.server_time)<=60000);
  const expired=(await admin.query("select app_private.qr_checkin_token(activity_id,secret,clock_timestamp()-interval '60 seconds') as token from app_private.qr_checkin_keys where activity_id=$1",[activities[0]])).rows[0].token;sensitive.push(expired);
  await assert.rejects(clients[1].selfCheckin({body:body(expired)}),error=>error.status===422&&error.error.code==='checkin_qr_expired');
  const future=(await admin.query("select app_private.qr_checkin_token(activity_id,secret,clock_timestamp()+interval '60 seconds') as token from app_private.qr_checkin_keys where activity_id=$1",[activities[0]])).rows[0].token;sensitive.push(future);
  await assert.rejects(clients[1].selfCheckin({body:body(future)}),{status:422});
  qr=await clients[0].issueCheckinQr({params:issueParams});sensitive.push(qr.token);
  for(const i of [0,2,3,4,5,6,7])await assert.rejects(clients[i].selfCheckin({body:body(qr.token)}),error=>error.status===404&&error.error.code==='checkin_not_available');
  await assert.rejects(clients[10].selfCheckin({body:body(qr.token)}),{status:403});
  const other=await clients[4].issueCheckinQr({params:{activityId:activities[4]}});sensitive.push(other.token);await assert.rejects(clients[1].selfCheckin({body:body(other.token)}),{status:422});
  const manipulated=qr.token[0]==='a'?'b'+qr.token.slice(1):'a'+qr.token.slice(1);await assert.rejects(clients[1].selfCheckin({body:body(manipulated)}),{status:422});
  // Refresh legacy immediately before redemption to avoid a bucket boundary.
  qr=await legacy(0,'select public.issue_activity_checkin_qr($1) as result',[activities[0]]);sensitive.push(qr.token);
  const first=await clients[1].selfCheckin({body:body(qr.token)});assert.equal(first.created,true);assert.equal(first.status,'PRESENT');
  assert.deepEqual(Object.keys(first).sort(),['activity_id','group_id','activity_title','status','recorded_at','created'].sort());
  const stored=async activityId=>(await admin.query('select id,status,note,recorded_by,recorded_at from public.attendance_records where activity_id=$1 and membership_id=$2',[activityId,memberships[1]])).rows[0];
  const original=await stored(activities[0]);assert.ok(original.recorded_by===profiles[1]);
  qr=await clients[0].issueCheckinQr({params:issueParams});sensitive.push(qr.token);
  const retry=await legacy(1,'select public.self_checkin($1,$2) as result',[activities[0],qr.token]);assert.equal(retry.created,false);assert.deepEqual(await stored(activities[0]),original);
  const multi=await clients[8].selfCheckin({body:body(qr.token)});assert.equal(multi.created,true);
  // Concurrent self-checkin and ADMIN manual attendance use the same activity lock.
  const concurrent=await Promise.all([...Array.from({length:8},()=>clients[9].selfCheckin({body:body(qr.token)})),clients[0].saveAttendance({params:{groupId:groups[0],activityId:activities[0]},body:{records:[{membership_id:memberships[9],status:'EXCUSED',note:'Nota privada sintética'}]}})]);
  assert.equal(concurrent.slice(0,8).filter(result=>result.created).length<=1,true);
  assert.equal((await admin.query('select count(*)::int n from public.attendance_records where activity_id=$1 and membership_id=$2',[activities[0],memberships[9]])).rows[0].n,1);
  const manual=(await admin.query('select id,status,note,recorded_by,recorded_at from public.attendance_records where activity_id=$1 and membership_id=$2',[activities[0],memberships[9]])).rows[0];assert.equal(manual.status,'EXCUSED');
  qr=await clients[0].issueCheckinQr({params:issueParams});sensitive.push(qr.token);const unchanged=await clients[9].selfCheckin({body:body(qr.token)});assert.equal(unchanged.status,'EXCUSED');assert.equal(unchanged.created,false);assert.ok(!Object.hasOwn(unchanged,'note'));
  assert.deepEqual((await admin.query('select id,status,note,recorded_by,recorded_at from public.attendance_records where id=$1',[manual.id])).rows[0],manual);
  const late=await clients[0].issueCheckinQr({params:{activityId:activities[1]}});sensitive.push(late.token);assert.equal((await clients[1].selfCheckin({body:{activity_id:activities[1],token:late.token}})).status,'LATE');
  await admin.query("update public.activities set starts_at=now()-interval '61 minutes' where id=$1",[activities[0]]);qr={token:(await admin.query('select app_private.qr_checkin_token(activity_id,secret,clock_timestamp()) as token from app_private.qr_checkin_keys where activity_id=$1',[activities[0]])).rows[0].token};sensitive.push(qr.token);
  await assert.rejects(clients[1].selfCheckin({body:body(qr.token)}),error=>error.status===422&&error.error.code==='checkin_window_closed');
  await admin.query("update public.memberships set status='INACTIVE' where id=$1",[memberships[1]]);await assert.rejects(clients[1].selfCheckin({body:body(qr.token)}),{status:404});
  await admin.query('delete from app_private.auth_families where id=$1',[sessions[8]]);await assert.rejects(clients[8].selfCheckin({body:body(qr.token)}),{status:401});
  assert.ok(!(await admin.query("select has_table_privilege('asisteam_api','app_private.qr_checkin_keys','SELECT') as readable")).rows[0].readable);
  for(const secret of sensitive)assert.ok(!logs.join('\n').includes(secret),'Logs redactados');assert.ok(!logs.join('\n').includes('Nota privada sintética'));
 } finally {
  if(app)await app.close();if(fixture)await fixture.close();
  await admin.query("set session_replication_role='replica'");
  try {
   for(const table of ['qr_checkin_keys','qr_checkin_settings'])await admin.query('delete from app_private.'+table+' where '+(table==='qr_checkin_keys'?'activity_id=any($1::uuid[])':'group_id=any($1::uuid[])'),[table==='qr_checkin_keys'?activities:groups]);
   await admin.query('delete from public.attendance_records where activity_id=any($1::uuid[])',[activities]);await admin.query('delete from public.activities where id=any($1::uuid[])',[activities]);await admin.query('delete from public.memberships where group_id=any($1::uuid[])',[groups]);await admin.query('delete from app_private.billing_legacy_groups where group_id=any($1::uuid[])',[groups]);await admin.query('delete from public.groups where id=any($1::uuid[])',[groups]);
   await admin.query('delete from public.account_consents where user_id=any($1::uuid[])',[profiles]);await admin.query('delete from public.users where id=any($1::uuid[])',[profiles]);await admin.query('delete from app_private.auth_families where subject_id=any($1::uuid[])',[auth]);await admin.query('delete from app_private.auth_subjects where id=any($1::uuid[])',[auth]);
   const old=previous.rolpassword===null?'null':"'"+previous.rolpassword.replaceAll("'","''")+"'";await admin.query('alter role asisteam_api '+(previous.rolcanlogin?'login':'nologin')+' password '+old);
  } finally {await admin.query("set session_replication_role='origin'");await admin.end();}
 }
});
