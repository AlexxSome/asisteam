import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createApplication } from '../dist/application.js';
import { loadConfig } from '../dist/config.js';
import { SafeLogger } from '../dist/logger.js';
import { authFixture } from './auth-fixture.mjs';
import { ApiClient } from '../../../packages/api-client/dist/index.js';

const enabled = process.env.API_RLS_TEST === '1';
test('MIG-10 HTTP/PostgreSQL: activities, series/history, DST, limits, types and tenant/role isolation', { skip: !enabled }, async () => {
  const admin = new pg.Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await admin.connect();
  let app, fixture, holder;
  const auth = Array.from({length:4},()=>randomUUID()), sessions=auth.map(()=>randomUUID()), profiles=[];
  const groups=[randomUUID(),randomUUID()], password=randomUUID(), logs=[];
  const previous=(await admin.query("select rolcanlogin,rolpassword from pg_authid where rolname='asisteam_api'")).rows[0];
  const systemType='b2c3d4e5-0001-4b3c-8d4e-111111111111';
  try {
    fixture=await authFixture();
    await admin.query("alter role asisteam_api login password '"+password+"'");
    for(const [i,id] of auth.entries()) {
      await admin.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,'mig154-'+id+'@example.test',JSON.stringify({full_name:'Persona sintética',birthdate:'1990-01-01'})]);
      profiles.push((await admin.query('select id from public.users where auth_user_id=$1',[id])).rows[0].id);
      await admin.query("insert into auth.sessions(id,user_id,created_at,not_after) values($1,$2,now(),now()+interval '1 hour')",[sessions[i],id]);
      await admin.query("insert into public.account_consents(user_id,terms_version,channel) values($1,'2026-09-21','IN_APP')",[profiles[i]]);
    }
    for(const [i,id] of groups.entries())await admin.query('insert into public.groups(id,name,sport,invite_code,created_by) values($1,$2,$3,$4,$5)',[id,'Club sintético','Tenis',randomUUID().replaceAll('-','').slice(0,8),profiles[i===0?0:3]]);
    for(const id of groups)await admin.query('insert into app_private.billing_legacy_groups(group_id) values($1)',[id]);
    for(const [i,g,role] of [[0,0,'ADMIN'],[0,0,'ATHLETE'],[1,0,'ATHLETE'],[2,0,'COACH'],[3,1,'ADMIN']])await admin.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,$3,'ACTIVE',now()-interval '1 day')",[profiles[i],groups[g],role]);
    app=await createApplication(loadConfig({DATABASE_URL:'postgresql://asisteam_api:'+password+'@127.0.0.1:54322/postgres',SUPABASE_AUTH_URL:fixture.issuer,SUPABASE_AUTH_PUBLIC_KEY:'sb_publishable_synthetic',PG_POOL_MAX:'2'}),new SafeLogger(line=>logs.push(line)));
    await app.listen(0,'127.0.0.1');
    const origin=await app.getUrl(),tokens=await Promise.all(auth.map((id,i)=>fixture.token(id,sessions[i]))),clients=tokens.map(token=>new ApiClient({origin,accessToken:async()=>token,timeoutMs:10000}));
    const params={groupId:groups[0]}, query={group_ids:groups[0]}, body={title:'Actividad sintética',activity_type_id:systemType,description:'',location:'Cancha sintética',...(await admin.query("select to_char((app_private.chile_today()+14),'YYYY-MM-DD') as day,to_char((app_private.chile_today()+16),'YYYY-MM-DD') as until")).rows[0]};
    const day=body.day,until=body.until;delete body.day;delete body.until;
    const times=(await admin.query("select ($1::date+time '18:30') at time zone 'America/Santiago' as start,($1::date+time '20:00') at time zone 'America/Santiago' as finish",[day])).rows[0];
    body.starts_at=times.start.toISOString();body.ends_at=times.finish.toISOString();
    const request=(path,method='GET',payload,token=tokens[0])=>fetch(origin+path,{method,headers:{authorization:'Bearer '+token,...(payload?{'content-type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
    assert.equal((await fetch(origin+'/api/v1/me/activities?group_ids='+groups[0])).status,401);
    for(const i of [1,2,3])await assert.rejects(clients[i].createActivity({params,body}),{status:i===3?404:403});
    for(const i of [1,2])assert.equal((await clients[i].listActivityTypes({params})).data.length,4);
    const type=await clients[0].createActivityType({params,body:{name:'Tipo sintético',color:'#123456'}});
    await assert.rejects(clients[0].createActivityType({params,body:{name:'Tipo sintético',color:'#234567'}}),error=>error.status===409&&error.error.code==='activity_type_name_exists');
    for(const id of ['b2c3d4e5-0001-4b3c-8d4e-111111111111','b2c3d4e5-0002-4b3c-8d4e-222222222222','b2c3d4e5-0003-4b3c-8d4e-333333333333','b2c3d4e5-0004-4b3c-8d4e-444444444444'])await assert.rejects(clients[0].updateActivityType({params:{...params,typeId:id},body:{name:'Sistema alterado',color:'#123456',is_active:false}}),{status:404});
    await clients[0].updateActivityType({params:{...params,typeId:type.id},body:{name:'Tipo sintético',color:'#345678',is_active:false}});
    assert.equal((await clients[0].listActivityTypes({params})).data.length,4);
    assert.equal((await clients[0].listActivityTypes({params,query:{include_inactive:true}})).data.length,5);
    await assert.rejects(clients[0].createActivity({params,body:{...body,activity_type_id:type.id}}),error=>error.status===422&&error.error.code==='invalid_activity_type');
    const foreignType=await clients[3].createActivityType({params:{groupId:groups[1]},body:{name:'Tipo ajeno',color:'#123456'}});
    await assert.rejects(clients[0].createActivity({params,body:{...body,activity_type_id:foreignType.id}}),{status:422});
    await assert.rejects(clients[0].updateActivityType({params:{...params,typeId:foreignType.id},body:{name:'Cambio ajeno',color:'#123456',is_active:true}}),{status:404});
    const single=await clients[0].createActivity({params,body});
    assert.equal((await clients[1].getActivity({params:{...params,activityId:single.activityId}})).starts_at,body.starts_at);
    await assert.rejects(clients[3].getActivity({params:{...params,activityId:single.activityId}}),{status:404});
    const recurrence_rule={freq:'WEEKLY',by_weekday:['MO','TU','WE','TH','FR','SA','SU'],until};
    const root=(await clients[0].createActivity({params,body:{...body,title:'Serie sintética',recurrence_rule}})).activityId;
    let rows=(await admin.query('select id,starts_at,ends_at from public.activities where id=$1 or recurrence_source_id=$1 order by starts_at',[root])).rows;assert.equal(rows.length,3);
    const membership=(await admin.query("select id from public.memberships where group_id=$1 and user_id=$2 and role='ATHLETE'",[groups[0],profiles[0]])).rows[0].id;
    // A real attendance writer holds the series lock. The HTTP edit must wait,
    // then re-evaluate attendance after the concurrent transaction commits.
    holder=new pg.Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:54322/postgres'});await holder.connect();
    await holder.query('begin');await holder.query('set local role authenticated');await holder.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:auth[0],role:'authenticated'})]);
    await holder.query('select public.record_attendance_bulk($1,$2::jsonb)',[root,JSON.stringify([{membership_id:membership,status:'PRESENT'}])]);
    const pending=clients[0].updateActivity({params:{...params,activityId:root},body:{...body,title:'Serie editada',scope:'series'}});
    try {
      const deadline=Date.now()+5000;let waiting=false;
      while(Date.now()<deadline){waiting=(await admin.query("select exists(select 1 from pg_stat_activity where application_name='asisteam-api' and wait_event_type='Lock' and query like '%update_activity%') as waiting")).rows[0].waiting;if(waiting)break;await new Promise(resolve=>setTimeout(resolve,20));}
      assert.equal(waiting,true);await holder.query('commit');assert.equal((await pending).affected,2);
    } finally {await holder.query('rollback');await pending;await holder.end();holder=undefined;}
    rows=(await admin.query('select id,title from public.activities where id=$1 or recurrence_source_id=$1 order by starts_at',[root])).rows;
    assert.deepEqual(rows.map(row=>row.title),['Serie sintética','Serie editada','Serie editada']);
    await assert.rejects(clients[0].deleteActivity({params:{...params,activityId:root},body:{scope:'single',confirm_attendance:false}}),error=>error.status===409&&error.error.code==='attendance_confirmation_required');
    assert.equal((await clients[0].deleteActivity({params:{...params,activityId:root},body:{scope:'series',confirm_attendance:true}})).affected,2);
    assert.equal((await admin.query('select count(*)::int n from public.attendance_records where activity_id=$1',[root])).rows[0].n,1);
    const home=await clients[0].getHomeActivities({query});assert.ok(home.next);assert.ok(home.now);
    assert.ok((await clients[0].listActivities({query})).activities.some(row=>row.id===root));
    assert.ok((await clients[0].listGroupActivities({params})).activities.some(row=>row.id===root));
    assert.equal((await clients[0].listActivities({query:{...query,page:1000000}})).activities.length,0);
    // Chile daylight switch changes UTC while preserving each occurrence's local time.
    const dstBody={...body,starts_at:'2026-09-05T22:30:00Z',ends_at:'2026-09-06T00:00:00Z',recurrence_rule:{...recurrence_rule,until:'2026-09-07'}};
    const dst=(await clients[0].createActivity({params,body:dstBody})).activityId;
    const dstRows=(await admin.query("select starts_at, to_char(starts_at at time zone 'America/Santiago','HH24:MI') local from public.activities where id=$1 or recurrence_source_id=$1 order by starts_at",[dst])).rows;
    assert.deepEqual(dstRows.map(row=>row.local),['18:30','18:30','18:30']);assert.equal((dstRows[1].starts_at-dstRows[0].starts_at)/3600000,23);
    assert.ok((await clients[0].listActivities({query:{...query,period:'past'}})).activities.some(row=>row.id===dst));
    const count=async()=>(await admin.query('select count(*)::int n from public.activities where group_id=$1',[groups[0]])).rows[0].n;
    const before=await count();
    for(const invalid of [{...body,actor:profiles[3]},{...body,recurrence_rule:{...recurrence_rule,until:'2099-01-01'}},{...body,recurrence_rule:{...recurrence_rule,until:(await admin.query("select to_char($1::date+181,'YYYY-MM-DD') until",[day])).rows[0].until}}])assert.equal((await request('/api/v1/groups/'+groups[0]+'/activities','POST',invalid)).status,400);
    // Midnight exists on the first day but the next occurrence enters a DST gap;
    // SQL rejects the full materialization (no partial series is committed).
    const gap=await request('/api/v1/groups/'+groups[0]+'/activities','POST',{...body,starts_at:'2026-09-05T04:30:00Z',ends_at:'2026-09-05T06:00:00Z',recurrence_rule:{...recurrence_rule,until:'2026-09-06'}});
    assert.equal(gap.status,422);assert.equal((await gap.json()).error.code,'invalid_local_datetime');assert.equal(await count(),before);
    assert.equal((await request('/api/v1/me/activities?group_ids='+groups[0]+'&page=1&page=2')).status,400);
    assert.equal((await request('/api/v1/me/activities?group_ids='+groups.join(','))).status,404);
    const payload=JSON.stringify(await clients[1].listActivities({query}));assert.ok(!/email|phone|birthdate|note|created_by|marked_by/.test(payload));
    await admin.query("update public.memberships set status='PENDING' where user_id=$1 and group_id=$2",[profiles[1],groups[0]]);
    await assert.rejects(clients[1].listActivities({query}),{status:404});
    for(const token of tokens)assert.ok(!logs.join('\n').includes(token));assert.ok(!logs.join('\n').includes(password));
  } finally {
    if(holder){await holder.query('rollback');await holder.end();}
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
      await admin.query('delete from public.users where id=any($1::uuid[])',[profiles]);
      await admin.query('delete from auth.sessions where user_id=any($1::uuid[])',[auth]);
      await admin.query('delete from auth.users where id=any($1::uuid[])',[auth]);
      const old=previous.rolpassword===null?'null':"'"+previous.rolpassword.replaceAll("'","''")+"'";
      await admin.query('alter role asisteam_api '+(previous.rolcanlogin?'login':'nologin')+' password '+old);
    } finally {await admin.query("set session_replication_role='origin'");await admin.end();}
  }
});
