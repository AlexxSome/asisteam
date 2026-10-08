import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import pg from 'pg';
import { createApplication } from '../dist/application.js';
import { loadConfig } from '../dist/config.js';
import { SafeLogger } from '../dist/logger.js';
import { authFixture } from './auth-fixture.mjs';
import { ApiClient } from '../../../packages/api-client/dist/index.js';
import { attendanceMetrics } from '../../../packages/core/dist/index.js';

const enabled = process.env.API_RLS_TEST === '1';
const source = readFileSync(new URL('../../../supabase/tests/report_metrics.test.sql', import.meta.url), 'utf8');
const cases = JSON.parse(source.match(/jsonb_to_recordset\(\$cases\$([\s\S]*?)\$cases\$/)[1]);
const p95 = samples => samples.toSorted((a,b)=>a-b)[Math.ceil(samples.length * .95)-1];
test('MIG-12 HTTP/SQL: canonical metrics, Chile periods, role/toggle projections, pagination and p95 baseline', { skip: !enabled }, async () => {
  const admin = new pg.Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await admin.connect();
  const auth=Array.from({length:6},()=>randomUUID()), sessions=auth.map(()=>randomUUID()), profiles=[], managed=[];
  const groups=[randomUUID(),randomUUID()], password=randomUUID(), logs=[];
  const previous=(await admin.query("select rolcanlogin,rolpassword from pg_authid where rolname='asisteam_api'")).rows[0];
  const type='b2c3d4e5-0001-4b3c-8d4e-111111111111', otherType='b2c3d4e5-0003-4b3c-8d4e-333333333333';
  let app, fixture;
  try {
    fixture=await authFixture();
    await admin.query("alter role asisteam_api login password '"+password+"'");
    for(const [i,id] of auth.entries()) {
      await admin.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,'mig156-'+id+'@example.test',JSON.stringify({full_name:'Persona sintética',birthdate:'1990-01-01'})]);
      profiles.push((await admin.query('select id from public.users where auth_user_id=$1',[id])).rows[0].id);
      await admin.query("insert into auth.sessions(id,user_id,created_at,not_after) values($1,$2,now(),now()+interval '1 hour')",[sessions[i],id]);
      if(i!==5)await admin.query("insert into public.account_consents(user_id,terms_version,channel) values($1,'2026-09-21','IN_APP')",[profiles[i]]);
    }
    for(const [i,id] of groups.entries())await admin.query("insert into public.groups(id,name,sport,invite_code,created_by,created_at) values($1,'Club sintético','Tenis',$2,$3,'2026-01-01')",[id,randomUUID().replaceAll('-','').slice(0,8),profiles[i===0?0:3]]);
    for(const id of groups)await admin.query('insert into app_private.billing_legacy_groups(group_id) values($1)',[id]);
    for(const [i,g,role] of [[0,0,'ADMIN'],[0,0,'ATHLETE'],[1,0,'ATHLETE'],[2,0,'COACH'],[3,1,'ADMIN'],[1,1,'ATHLETE'],[4,0,'GUARDIAN'],[5,0,'ADMIN']])await admin.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,$3,'ACTIVE','2026-01-01')",[profiles[i],groups[g],role]);
    const ward=randomUUID(), guardianship=randomUUID();managed.push(ward);
    await admin.query("insert into public.users(id,full_name,birthdate,account_status) values($1,'Pupilo sintético','2012-01-01','MANAGED')",[ward]);
    await admin.query("insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship,status) values($1,$2,$3,'PARENT','ACTIVE')",[guardianship,profiles[4],ward]);
    await admin.query("insert into public.consents(guardianship_id,consent_type,terms_version) values($1,'DATA_PROCESSING_MINOR','1.0')",[guardianship]);
    const backupGuardianship=randomUUID();
    await admin.query("insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship,status) values($1,$2,$3,'Tutor','ACTIVE')",[backupGuardianship,profiles[0],ward]);
    await admin.query("insert into public.consents(guardianship_id,consent_type,terms_version) values($1,'DATA_PROCESSING_MINOR','1.0')",[backupGuardianship]);
    await admin.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,'ATHLETE','ACTIVE','2026-01-01')",[ward,groups[0]]);
    const wardMember=(await admin.query("select id from public.memberships where user_id=$1 and group_id=$2 and role='ATHLETE'",[ward,groups[0]])).rows[0].id;
    const ownMember=(await admin.query("select id from public.memberships where user_id=$1 and group_id=$2 and role='ATHLETE'",[profiles[1],groups[0]])).rows[0].id;
    await admin.query("update public.memberships set joined_at='2026-02-01' where id=$1",[ownMember]);
    const caseMembers=[];
    for(const [i,c] of cases.entries()) {
      let member=ownMember;
      if(i!==1) {
        const user=randomUUID();managed.push(user);
        await admin.query("insert into public.users(id,full_name,birthdate,account_status) values($1,$2,'1990-01-01','MANAGED')",[user,'Métrica sintética '+String(i).padStart(2,'0')]);
        member=(await admin.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,'ATHLETE','ACTIVE','2026-01-01') returning id",[user,groups[0]])).rows[0].id;
      }
      caseMembers.push(member);
      let n=0;
      for(const [status,count] of [['PRESENT',c.present],['LATE',c.late],['ABSENT',c.absent],['EXCUSED',c.excused]]) {
        for(let j=0;j<count;j++) {
          const id=randomUUID();
          await admin.query("insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values($1,$2,$3,'Actividad sintética',$4::timestamptz,$4::timestamptz+interval '1 hour',$5)",[id,groups[0],type,'2026-03-'+String(1+(n++%20)).padStart(2,'0')+'T12:00:00Z',profiles[0]]);
          await admin.query('insert into public.attendance_records(activity_id,membership_id,status,note,recorded_by) values($1,$2,$3,$4,$5)',[id,member,status,'Nota privada sintética',profiles[0]]);
          if(i===1)await admin.query('insert into public.attendance_records(activity_id,membership_id,status,note,recorded_by) values($1,$2,$3,$4,$5)',[id,wardMember,status,'Nota del pupilo',profiles[0]]);
        }
      }
    }
    // Existing records before joined_at and in the future never affect metrics.
    for(const starts of ['2026-01-15T12:00:00Z','2099-03-01T12:00:00Z']) {
      const id=randomUUID();await admin.query("insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values($1,$2,$3,'Fuera del universo',$4::timestamptz,$4::timestamptz+interval '1 hour',$5)",[id,groups[0],type,starts,profiles[0]]);
      await admin.query("insert into public.attendance_records(activity_id,membership_id,status,recorded_by) values($1,$2,'ABSENT',$3)",[id,ownMember,profiles[0]]);
    }
    // Chile boundary and an unrecorded past activity are independent fixtures.
    for(const [starts,status] of [['2026-04-01T02:59:59Z','PRESENT'],['2026-04-01T03:00:00Z','ABSENT'],['2026-03-25T12:00:00Z',null]]) {
      const id=randomUUID();await admin.query("insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values($1,$2,$3,'Límite Chile',$4::timestamptz,$4::timestamptz+interval '1 hour',$5)",[id,groups[0],otherType,starts,profiles[0]]);
      if(status)await admin.query('insert into public.attendance_records(activity_id,membership_id,status,recorded_by) values($1,$2,$3,$4)',[id,ownMember,status,profiles[0]]);
    }
    const added=(await admin.query("insert into public.users(full_name,birthdate,account_status) select 'Nombre repetido sintético','1990-01-01','MANAGED' from generate_series(1,489) returning id")).rows.map(row=>row.id);managed.push(...added);
    await admin.query("insert into public.memberships(user_id,group_id,role,status,joined_at) select unnest($1::uuid[]),$2,'ATHLETE','ACTIVE','2026-01-01'",[added,groups[0]]);
    const nonactive=[];
    for(const status of ['PENDING','INACTIVE']) {
      const user=randomUUID();managed.push(user);await admin.query("insert into public.users(id,full_name,birthdate,account_status) values($1,'Fuera de nómina','1990-01-01','MANAGED')",[user]);
      nonactive.push((await admin.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,'ATHLETE',$3,'2026-01-01') returning id",[user,groups[0],status])).rows[0].id);
    }
    app=await createApplication(loadConfig({DATABASE_URL:'postgresql://asisteam_api:'+password+'@127.0.0.1:54322/postgres',SUPABASE_AUTH_URL:fixture.issuer,SUPABASE_AUTH_PUBLIC_KEY:'sb_publishable_synthetic',PG_POOL_MAX:'2'}),new SafeLogger(line=>logs.push(line)));
    await app.listen(0,'127.0.0.1');
    const origin=await app.getUrl(),tokens=await Promise.all(auth.map((id,i)=>fixture.token(id,sessions[i]))),clients=tokens.map(token=>new ApiClient({origin,accessToken:async()=>token,timeoutMs:10000}));
    const params={groupId:groups[0]}, query={period:'month',from:'2026-03-01',activity_type_ids:type,page_size:100,sort:'name'};
    // Baseline is the same canonical SQL, under the legacy authenticated role.
    const baseline=async (i,statement,values)=>{
      await admin.query('begin');
      try {
        await admin.query('set local role authenticated');
        await admin.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:auth[i],role:'authenticated',session_id:sessions[i]})]);
        return (await admin.query(statement,values)).rows[0].result;
      } finally {await admin.query('rollback');}
    };
    const reportSql='select public.get_group_attendance_report($1,$2,$3::date,$4::date,$5::uuid[],$6,$7,$8,$9) as result';
    const values=[groups[0],'month','2026-03-01',null,[type],false,1,100,'name'];
    const report=await clients[0].getGroupAttendanceReport({params,query});
    assert.deepEqual(report,await baseline(0,reportSql,values));
    assert.equal(report.totals.athletes,500);assert.equal(report.by_athlete.length,100);
    const all=[];
    for(let page=1;page<=5;page++)all.push(...(await clients[0].getGroupAttendanceReport({params,query:{...query,page}})).by_athlete);
    assert.equal(new Set(all.map(row=>row.membership_id)).size,500);
    assert.deepEqual(all.filter(row=>row.full_name==='Nombre repetido sintético').map(row=>row.membership_id),all.filter(row=>row.full_name==='Nombre repetido sintético').map(row=>row.membership_id).toSorted());
    for(const [i,c] of cases.entries()) {
      const row=all.find(row=>row.membership_id===caseMembers[i]);
      assert.ok(row);
      for(const [key,value] of Object.entries(attendanceMetrics({present:c.present,late:c.late,absent:c.absent,excused:c.excused})))assert.equal(row[key],value,c.name+': '+key);
    }
    assert.ok(!all.some(row=>nonactive.includes(row.membership_id)));
    assert.equal((await clients[0].getGroupAttendanceReport({params,query:{...query,include_inactive:true}})).totals.athletes,501);
    const ownQuery={period:'month',from:'2026-03-01',activity_type_ids:type,page_size:3};
    const own=await clients[1].getMyAttendanceHistory({params,query:ownQuery});
    assert.equal(own.totals.attendance_pct,77.8);assert.equal(own.totals.convened,10);
    const ownSql='select public.get_my_attendance_history($1,$2,$3::date,$4::date,$5::uuid[],$6,$7) as result';
    assert.deepEqual(own,await baseline(1,ownSql,[groups[0],'month','2026-03-01',null,[type],1,3]));
    const second=await clients[1].getMyAttendanceHistory({params,query:{...ownQuery,page:2}});assert.equal(second.records.length,3);assert.deepEqual(second.totals,own.totals);assert.ok(!second.records.some(row=>own.records.some(first=>first.id===row.id)));
    for(const period of ['week','month','custom','season']) {
      const q={period,from:period==='season'?undefined:'2026-03-01',to:period==='custom'?'2026-03-31':undefined,activity_type_ids:type};
      const response=await clients[1].getMyAttendanceHistory({params,query:q});
      assert.deepEqual(response,await baseline(1,ownSql,[groups[0],period,q.from??null,q.to??null,[type],1,50]));
    }
    const boundary=await clients[1].getMyAttendanceHistory({params,query:{period:'custom',from:'2026-03-31',to:'2026-03-31',activity_type_ids:otherType}});
    assert.equal(boundary.totals.convened,1);assert.equal(boundary.totals.present,1);assert.equal(boundary.period.timezone,'America/Santiago');
    const season=await clients[1].getMyAttendanceHistory({params,query:{period:'season',activity_type_ids:type}});assert.equal(season.totals.convened,10);
    assert.equal((await clients[1].getMyAttendanceHistory({params:{groupId:groups[1]},query:{period:'season'}})).totals.attendance_pct,null);
    assert.equal((await clients[0].getMyAttendanceHistory({params,query:{period:'season'}})).totals.attendance_pct,null);
    const wardParams={...params,athleteUserId:ward};
    const wardHistory=await clients[4].getWardAttendanceHistory({params:wardParams,query:ownQuery});assert.equal(wardHistory.totals.attendance_pct,77.8);assert.ok(wardHistory.records.every(row=>row.note==='Nota del pupilo'));
    assert.deepEqual(wardHistory,await baseline(4,'select public.get_ward_attendance_history($1,$2,$3,$4::date,$5::date,$6::uuid[],$7,$8) as result',[groups[0],ward,'month','2026-03-01',null,[type],1,3]));
    for(const i of [1,4])await assert.rejects(clients[i].getGroupAttendanceReport({params,query}),{status:403});
    for(const operation of ['getGroupAttendanceReport','getGroupStats','getMyAttendanceHistory'])await assert.rejects(clients[3][operation]({params}),{status:404});
    await assert.rejects(clients[2].getMyAttendanceHistory({params}),{status:404});
    await assert.rejects(clients[1].getWardAttendanceHistory({params:wardParams}),{status:404});
    await assert.rejects(clients[4].getWardAttendanceHistory({params:{...params,athleteUserId:profiles[1]}}),{status:404});
    const coach=await clients[2].getGroupAttendanceReport({params,query});assert.deepEqual(coach,report);
    assert.ok(!/email|phone|birthdate|note|records|guardian/.test(JSON.stringify(coach)));
    for(const athletes of [false,true])for(const guardians of [false,true]) {
      await admin.query('update public.groups set settings=jsonb_build_object(\'athletes_can_view_group_stats\',$2::boolean,\'guardians_can_view_group_stats\',$3::boolean) where id=$1',[groups[0],athletes,guardians]);
      for(const [i,allowed] of [[1,athletes],[4,guardians]]) {
        if(!allowed)await assert.rejects(clients[i].getGroupStats({params}),error=>error.status===403&&error.error.code==='group_stats_disabled');
        else {
          const stats=await clients[i].getGroupStats({params,query:{page_size:100}});
          assert.deepEqual(stats,await baseline(i,'select public.get_group_stats($1,$2,$3) as result',[groups[0],1,100]));
          assert.ok(!/email|phone|birthdate|note|records|guardian/.test(JSON.stringify(stats)));
        }
        assert.deepEqual((await clients[i][i===1?'getMyAttendanceHistory':'getWardAttendanceHistory']({params:i===1?params:wardParams,query:ownQuery})).totals,own.totals);
      }
    }
    const path='/api/v1/groups/'+groups[0];
    const request=(suffix,token=tokens[0])=>fetch(origin+path+suffix,{headers:token?{authorization:'Bearer '+token}:{}});
    assert.equal((await request('/reports',null)).status,401);
    for(const suffix of ['/reports?page=1&page=2','/reports?actor='+profiles[3],'/reports?include_inactive=bad','/reports?page_size=101','/reports?activity_type_ids=bad','/reports?period=custom','/me/history?membership_id='+ownMember,'/stats?from=2026-01-01'])assert.equal((await request(suffix)).status,400);
    await assert.rejects(clients[0].getGroupAttendanceReport({params,query:{period:'season',activity_type_ids:randomUUID()}}),error=>error.status===400&&error.error.code==='invalid_report_activity_type');
    await assert.rejects(clients[5].getGroupAttendanceReport({params}),{status:403});
    const response=await request('/reports');assert.equal(response.headers.get('cache-control'),'no-store');
    // Read-only correction is visible immediately through both transports.
    const target=own.records.find(row=>row.status==='ABSENT')??(await clients[1].getMyAttendanceHistory({params,query:{...ownQuery,page_size:100}})).records.find(row=>row.status==='ABSENT');
    await admin.query("update public.attendance_records set status='EXCUSED' where id=$1",[target.id]);
    assert.equal((await clients[1].getMyAttendanceHistory({params,query:ownQuery})).totals.attendance_pct,87.5);
    await admin.query("update public.attendance_records set status='ABSENT' where id=$1",[target.id]);
    const sqlMs=[],httpMs=[];
    for(let n=0;n<20;n++) {
      let started=performance.now();const expected=await baseline(0,reportSql,values);sqlMs.push(performance.now()-started);
      started=performance.now();const actual=await clients[0].getGroupAttendanceReport({params,query});httpMs.push(performance.now()-started);assert.deepEqual(actual,expected);
    }
    if(process.env.API_REPORT_EVIDENCE==='1') {
      const dir=new URL('../../../.ci-results/',import.meta.url);mkdirSync(dir,{recursive:true});
      writeFileSync(new URL('reports-performance.json',dir),JSON.stringify({environment:'local-synthetic-postgresql17',fixture:{activeAthletes:500,metricCases:cases.length,pageSize:100},samples:20,baseline:'authenticated canonical SQL including BEGIN/ROLLBACK',sqlP95Ms:Number(p95(sqlMs).toFixed(2)),nestHttpP95Ms:Number(p95(httpMs).toFixed(2)),status:'PASS',cache:false},null,2)+'\n');
    }
    await admin.query("update public.guardianships set status='INACTIVE',deactivated_at=now() where id=$1",[guardianship]);await assert.rejects(clients[4].getWardAttendanceHistory({params:wardParams}),{status:404});
    await admin.query("update public.memberships set status='INACTIVE' where user_id=$1 and group_id=$2 and role='COACH'",[profiles[2],groups[0]]);await assert.rejects(clients[2].getGroupAttendanceReport({params}),{status:404});
    for(const token of tokens)assert.ok(!logs.join('\n').includes(token));assert.ok(!logs.join('\n').includes(password));assert.ok(!logs.join('\n').includes('Nota privada sintética'));
  } finally {
    if(app)await app.close();if(fixture)await fixture.close();
    await admin.query("set session_replication_role='replica'");
    try {
      await admin.query('delete from public.attendance_records where activity_id in(select id from public.activities where group_id=any($1::uuid[]))',[groups]);
      await admin.query('delete from public.activities where group_id=any($1::uuid[])',[groups]);
      await admin.query('delete from public.consents where guardianship_id in(select id from public.guardianships where athlete_user_id=any($1::uuid[]))',[managed]);
      await admin.query('delete from public.guardianships where athlete_user_id=any($1::uuid[])',[managed]);
      await admin.query('delete from public.memberships where group_id=any($1::uuid[])',[groups]);
      await admin.query('delete from app_private.billing_legacy_groups where group_id=any($1::uuid[])',[groups]);
      await admin.query('delete from public.groups where id=any($1::uuid[])',[groups]);
      await admin.query('delete from public.account_consents where user_id=any($1::uuid[])',[profiles]);
      await admin.query('delete from public.users where id=any($1::uuid[])',[[...profiles,...managed]]);
      await admin.query('delete from auth.sessions where user_id=any($1::uuid[])',[auth]);
      await admin.query('delete from auth.users where id=any($1::uuid[])',[auth]);
      const old=previous.rolpassword===null?'null':"'"+previous.rolpassword.replaceAll("'","''")+"'";
      await admin.query('alter role asisteam_api '+(previous.rolcanlogin?'login':'nologin')+' password '+old);
    } finally {await admin.query("set session_replication_role='origin'");await admin.end();}
  }
});
