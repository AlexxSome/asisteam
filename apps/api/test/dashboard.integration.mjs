import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {createApplication} from '../dist/application.js';
import {loadFixtureConfig,fixtureConnection} from './fixture-config.mjs';
import {authFixture} from './auth-fixture.mjs';
import {SafeLogger} from '../dist/logger.js';
import {ApiClient} from '../../../packages/api-client/dist/index.js';

test('UI-03 HTTP/SQL: full totals, bounded role DTO, stable activity, no push access or cached reports', {skip:process.env.API_RLS_TEST!=='1'},async()=>{
 const db=new pg.Client({connectionString:fixtureConnection()}),identities=Array.from({length:6},()=>randomUUID()),sessions=identities.map(()=>randomUUID()),profiles=[],groups=[randomUUID(),randomUUID()],logs=[];
 let app,auth;
 try {
  await db.connect();auth=await authFixture();
  for(const [i,id] of identities.entries()){
   await db.query('insert into app_private.auth_subjects(id,email,native_owned) values($1,$2,true)',[id,'dashboard-'+id+'@example.test']);
   profiles.push((await db.query("insert into public.users(auth_user_id,email,full_name,birthdate,account_status) values($1,$2,'Persona sintética','1990-01-01','ACTIVE') returning id",[id,'dashboard-'+id+'@example.test'])).rows[0].id);
   await db.query("insert into app_private.auth_families(id,subject_id,expires_at) values($1,$2,now()+interval '1 hour')",[sessions[i],id]);
   if(i!==4)await db.query("insert into public.account_consents(user_id,terms_version,channel) values($1,'2026-09-21','IN_APP')",[profiles[i]]);
  }
  for(const [i,id] of groups.entries()){
   await db.query("insert into public.groups(id,name,invite_code,created_by) values($1,'Dashboard sintético',$2,$3)",[id,randomUUID().replaceAll('-','').slice(0,8),profiles[i===0?0:3]]);
   await db.query('insert into app_private.billing_legacy_groups(group_id) values($1)',[id]);
  }
  for(const [i,g,role] of [[0,0,'ADMIN'],[1,0,'ATHLETE'],[2,0,'COACH'],[3,1,'ADMIN'],[4,0,'ADMIN'],[5,0,'GUARDIAN']])await db.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,$3,'ACTIVE',now()-interval '100 days')",[profiles[i],groups[g],role]);
  const users=(await db.query("insert into public.users(full_name,birthdate,account_status) select 'Nombre repetido','1990-01-01','MANAGED' from generate_series(1,104) returning id")).rows.map(row=>row.id);
  await db.query("insert into public.memberships(user_id,group_id,role,status,joined_at) select unnest($1::uuid[]),$2,'ATHLETE','ACTIVE',now()-interval '100 days'",[users,groups[0]]);
  const pending=(await db.query("insert into public.users(full_name,birthdate,account_status) select 'Pendiente','1990-01-01','MANAGED' from generate_series(1,51) returning id")).rows.map(row=>row.id);
  await db.query("insert into public.memberships(user_id,group_id,role,status) select unnest($1::uuid[]),$2,'ATHLETE','PENDING'",[pending,groups[0]]);
  const ward=randomUUID(),guardianship=randomUUID();
  await db.query("insert into public.users(id,full_name,birthdate,account_status) values($1,'Pupilo UI05',(app_private.chile_today()-interval '12 years')::date,'MANAGED')",[ward]);
  await db.query("insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship) values($1,$2,$3,'PARENT')",[guardianship,profiles[5],ward]);
  await db.query("insert into public.consents(guardianship_id,consent_type,terms_version) values($1,'DATA_PROCESSING_MINOR','1.0')",[guardianship]);
  await db.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,'ATHLETE','ACTIVE',now()-interval '100 days')",[ward,groups[0]]);
  const activity=randomUUID(),future=randomUUID();
  for(const [id,offset] of [[activity,'-1 hour'],[future,'10 minutes']])await db.query("insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values($1,$2,'b2c3d4e5-0001-4b3c-8d4e-111111111111','Actividad sintética',now()+$3::interval,now()+interval '2 hours',$4)",[id,groups[0],offset,profiles[0]]);
  const memberships=(await db.query("select id from public.memberships where group_id=$1 and user_id=any($2::uuid[]) order by id limit 6",[groups[0],users])).rows.map(row=>row.id);
  for(const id of memberships)await db.query("insert into public.attendance_records(activity_id,membership_id,status,note,recorded_by) values($1,$2,'PRESENT','Nota privada sintética',$3)",[activity,id,profiles[0]]);
  app=await createApplication(loadFixtureConfig({DATABASE_URL:fixtureConnection('asisteam_api')}),new SafeLogger(line=>logs.push(line)));
  await app.listen(0,'127.0.0.1');const origin=await app.getUrl(),tokens=await Promise.all(identities.map((id,i)=>auth.token(id,sessions[i]))),clients=tokens.map(token=>new ApiClient({origin,accessToken:async()=>token,timeoutMs:10000})),params={groupId:groups[0]};
  const before=await clients[0].getGroupDashboard({params});
  assert.equal(before.indicators.active_athletes,106);assert.equal(before.pending,51);assert.equal(before.context.records.data.length,4);assert.equal(before.context.records.total,6);
  assert.equal(before.selected_activity_id,activity);assert.equal(before.latest_announcement,null);
  assert.equal((await clients[0].getGroupDashboard({params,query:{records_page:2}})).context.records.data.length,2);
  assert.equal((await clients[0].getGroupDashboard({params,query:{records_page:1000000}})).context.records.total,6);
  const coach=await clients[2].getGroupDashboard({params});assert.equal(coach.context.records,null);assert.equal(coach.pending,null);assert.ok(!/Nota privada|"note"|"email"|"phone"|"birthdate"/.test(JSON.stringify(coach)));
  const athlete=await clients[1].getGroupDashboard({params});assert.equal(athlete.indicators,null);assert.equal(athlete.context,null);assert.equal(athlete.personal.monthly.attendance_pct,null);
  await db.query("update public.groups set settings=jsonb_build_object('athletes_can_view_group_stats',true,'guardians_can_view_group_stats',false) where id=$1",[groups[0]]);
  assert.equal((await clients[1].getGroupDashboard({params})).indicators.active_athletes,106);
  const guardian=await clients[5].getGroupDashboard({params});
  assert.equal(guardian.wards.total,1);assert.equal(guardian.wards.data[0].athlete_user_id,ward);assert.equal(guardian.indicators,null);
  assert.equal(guardian.pending,null);assert.equal(guardian.context,null);assert.ok(!/Nota privada|"email"|"phone"|"birthdate"/.test(JSON.stringify(guardian)));
  // ATHLETE+GUARDIAN retains both canonical sources with independent toggles.
  const athleteLink=randomUUID();
  await db.query("insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship) values($1,$2,$3,'PARENT')",[athleteLink,profiles[1],ward]);
  await db.query("insert into public.consents(guardianship_id,consent_type,terms_version) values($1,'DATA_PROCESSING_MINOR','1.0')",[athleteLink]);
  await db.query("insert into public.memberships(user_id,group_id,role,status) values($1,$2,'GUARDIAN','ACTIVE') on conflict(user_id,group_id,role) do update set status='ACTIVE'",[profiles[1],groups[0]]);
  await db.query("update public.groups set settings=jsonb_build_object('athletes_can_view_group_stats',false,'guardians_can_view_group_stats',false) where id=$1",[groups[0]]);
  const multi=await clients[1].getGroupDashboard({params});assert.ok(multi.personal);assert.equal(multi.wards.total,1);assert.equal(multi.indicators,null);assert.equal(multi.context,null);assert.equal(multi.pending,null);
  await db.query("update public.guardianships set status='INACTIVE',deactivated_at=now() where id=$1",[guardianship]);
  assert.equal((await clients[5].getGroupDashboard({params})).wards.total,0);
  assert.equal((await clients[1].getGroupDashboard({params})).wards.total,1);
  const fallbackLink=randomUUID();
  await db.query("insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship) values($1,$2,$3,'PARENT')",[fallbackLink,profiles[0],ward]);
  await db.query("insert into public.consents(guardianship_id,consent_type,terms_version) values($1,'DATA_PROCESSING_MINOR','1.0')",[fallbackLink]);
  await db.query("update public.guardianships set status='INACTIVE',deactivated_at=now() where id=$1",[athleteLink]);
  const revoked=await clients[1].getGroupDashboard({params});assert.ok(revoked.personal);assert.equal(revoked.wards.total,0);
  const prep=await clients[0].getGroupDashboard({params,query:{activity_id:future}});assert.equal(prep.context.phase,'preparation');assert.equal(prep.context.counts.attendance_pct,null);assert.equal(prep.context.records.total,0);
  await assert.rejects(clients[3].getGroupDashboard({params}),{status:404});await assert.rejects(clients[4].getGroupDashboard({params}),{status:403});
  await assert.rejects(clients[0].getGroupDashboard({params,query:{activity_id:randomUUID()}}),{status:404});
  const path='/api/v1/groups/'+groups[0]+'/dashboard';
  assert.equal((await fetch(origin+path)).status,401);
  for(const q of ['?actor='+profiles[0],'?records_page=0','?wards_page=bad','?day_page=1&day_page=2'])assert.equal((await fetch(origin+path+q,{headers:{authorization:'Bearer '+tokens[0]}})).status,400);
  // Existing announcement SQL supports one bounded latest row, without push state.
  const published=await clients[0].publishAnnouncement({params,body:{title:'Aviso real sintético',body:'Contenido sintético',request_id:randomUUID()}});
  const latest=(await clients[0].getGroupDashboard({params})).latest_announcement;assert.equal(latest.id,published.id);
  assert.deepEqual(Object.keys(latest).sort(),['body','created_at','id','title','updated_at']);
  await db.query("update public.attendance_records set status='ABSENT' where activity_id=$1 and membership_id=$2",[activity,memberships[0]]);
  assert.equal((await clients[0].getGroupDashboard({params})).indicators.monthly.attendance_pct,83.3);
  assert.equal((await fetch(origin+path,{headers:{authorization:'Bearer '+tokens[0]}})).headers.get('cache-control'),'no-store');
  // UI-04: real Nest/SQL transport retains primary data on secondary faults.
  const announcementDefinition=(await db.query("select pg_get_functiondef('public.list_group_announcements(uuid,integer)'::regprocedure) as definition")).rows[0].definition;
  const dashboardDefinition=(await db.query("select pg_get_functiondef('public.get_group_dashboard(uuid,uuid,integer,integer,integer)'::regprocedure) as definition")).rows[0].definition;
  try {
   await db.query(`CREATE OR REPLACE FUNCTION public.list_group_announcements(p_group_id uuid,p_page integer DEFAULT 1)
    RETURNS TABLE(id uuid,group_id uuid,title text,body text,created_at timestamptz,updated_at timestamptz,total_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'synthetic_secondary_fault'; END $$;`);
   const partial=await clients[0].getGroupDashboard({params});
   assert.deepEqual(partial.secondary_errors,['latest_announcement']);assert.equal(partial.latest_announcement,null);
   assert.equal(partial.selected_activity_id,activity);assert.equal(partial.context.records.total,6);assert.equal(partial.pending,51);
   assert.equal(partial.indicators.monthly.attendance_pct,83.3);
   const pendingFault=dashboardDefinition.replace("SELECT count(*) INTO v_pending FROM public.memberships WHERE group_id=p_group_id AND role='ATHLETE' AND status='PENDING';","SELECT 1/0 INTO v_pending;");
   assert.notEqual(pendingFault,dashboardDefinition);await db.query(pendingFault);
   const failedPending=await clients[0].getGroupDashboard({params});
   assert.ok(failedPending.secondary_errors.includes('pending'));assert.equal(failedPending.pending,null);assert.equal(failedPending.context.records.total,6);
   assert.ok(!(await clients[2].getGroupDashboard({params})).secondary_errors.includes('pending'));
  } finally { await db.query(announcementDefinition);await db.query(dashboardDefinition); }
  const recovered=await clients[0].getGroupDashboard({params});assert.deepEqual(recovered.secondary_errors,[]);assert.equal(recovered.latest_announcement.id,published.id);assert.equal(recovered.pending,51);
  await db.query("update public.memberships set status='INACTIVE' where group_id=$1 and user_id=$2 and role='COACH'",[groups[0],profiles[2]]);
  await assert.rejects(clients[2].getGroupDashboard({params}),{status:404});
  for(const token of tokens)assert.ok(!logs.join('\n').includes(token));assert.ok(!logs.join('\n').includes('Nota privada sintética'));
 }finally{await app?.close();await auth?.close();await db.end();}
});
