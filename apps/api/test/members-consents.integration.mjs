import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createApplication } from '../dist/application.js';
import { loadConfig } from '../dist/config.js';
import { SafeLogger } from '../dist/logger.js';
import { authFixture } from './auth-fixture.mjs';
import { ApiClient } from '../../../packages/api-client/dist/index.js';

test('MIG-08 real HTTP/PostgreSQL: R1, consent, MANAGED, roles, V5/V6, history and concurrency', { skip: process.env.API_RLS_TEST !== '1' }, async () => {
  const admin = new pg.Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await admin.connect();
  const fixture = await authFixture(), run = randomUUID(), auth = Array.from({length:7},()=>randomUUID()), sessions = auth.map(()=>randomUUID()), profiles = [], groups = [], guardianships = [];
  const runtimePassword = randomUUID(), logs = [];
  const previous = (await admin.query("select rolcanlogin,rolpassword from pg_authid where rolname='asisteam_api'")).rows[0];
  let app;
  const email = kind => 'mig152-'+run+'-'+kind+'@example.test';
  async function group(owner=profiles[0]) {
    const id=randomUUID();groups.push(id);
    await admin.query('insert into public.groups(id,name,sport,invite_code,created_by) values($1,$2,$3,$4,$5)',[id,'Club sintético MIG08','Tenis',randomUUID().replaceAll('-','').slice(0,8),owner]);
    await admin.query('insert into app_private.billing_legacy_groups(group_id) values($1)',[id]);
    await admin.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,'ADMIN','ACTIVE',now())",[owner,id]);
    return id;
  }
  async function pending(target,minor=false) {
    const id=randomUUID();profiles.push(id);
    await admin.query("insert into public.users(id,full_name,email,birthdate,account_status) values($1,$2,$3,$4,'MANAGED')",[id,'Pendiente sintético',email(id),minor?'2014-01-01':'1990-01-01']);
    const membership=(await admin.query("insert into public.memberships(user_id,group_id,role,status) values($1,$2,'ATHLETE','PENDING') returning id",[id,target])).rows[0].id;
    return { id, membership };
  }
  async function link(athlete,consent=true) {
    const id=(await admin.query("insert into public.guardianships(guardian_user_id,athlete_user_id,relationship) values($1,$2,'Tutor') returning id",[profiles[2],athlete])).rows[0].id;guardianships.push(id);
    if(consent)await admin.query("insert into public.consents(guardianship_id,consent_type,terms_version,channel) values($1,'DATA_PROCESSING_MINOR','synthetic','IN_APP')",[id]);
    return id;
  }
  try {
    await admin.query("alter role asisteam_api login password '"+runtimePassword+"'");
    for(const [i,id] of auth.entries()) {
      await admin.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,email(i),JSON.stringify({full_name:'Persona sintética '+i,birthdate:i===3?'2014-01-01':'1990-01-01'})]);
      profiles.push((await admin.query('select id from public.users where auth_user_id=$1',[id])).rows[0].id);
      await admin.query("insert into auth.sessions(id,user_id,created_at,not_after) values($1,$2,now(),now()+interval '1 hour')",[sessions[i],id]);
      if(i!==6)await admin.query("insert into public.account_consents(user_id,terms_version,channel) values($1,'2026-09-21','IN_APP')",[profiles[i]]);
    }
    const g=await group(),foreign=await group(profiles[5]);
    for(const [i,role,status] of [[0,'ATHLETE','ACTIVE'],[1,'ATHLETE','ACTIVE'],[3,'ATHLETE','PENDING'],[4,'COACH','ACTIVE']])await admin.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,$3,$4,case when $4='ACTIVE' then now() else null end)",[profiles[i],g,role,status]);
    app=await createApplication(loadConfig({DATABASE_URL:'postgresql://asisteam_api:'+runtimePassword+'@127.0.0.1:54322/postgres',SUPABASE_AUTH_URL:fixture.issuer,SUPABASE_AUTH_PUBLIC_KEY:'sb_publishable_synthetic',PG_POOL_MAX:'6',PG_STATEMENT_TIMEOUT_MS:'10000'}),new SafeLogger(line=>logs.push(line)));
    await app.listen(0,'127.0.0.1');const origin=await app.getUrl(),tokens=await Promise.all(auth.map((id,i)=>fixture.token(id,sessions[i]))),clients=tokens.map(token=>new ApiClient({origin,accessToken:async()=>token,timeoutMs:15000}));
    const raw=(i,path,body,method='POST')=>fetch(origin+path,{method,headers:{authorization:'Bearer '+tokens[i],'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const params={groupId:g};
    assert.equal((await fetch(origin+'/api/v1/account-consents/current')).status,401);
    assert.deepEqual(await clients[6].getCurrentAccountConsent(),{accepted:false});
    await assert.rejects(clients[6].listMembershipOnboarding(),{status:403});
    assert.equal((await raw(6,'/api/v1/account-consents',{terms_accepted:true,terms_version:'old'})).status,400);
    const acceptance={body:{terms_accepted:true,terms_version:'2026-09-21'}};
    await clients[6].acceptAccountTerms(acceptance);await clients[6].acceptAccountTerms(acceptance);
    assert.equal((await clients[6].getCurrentAccountConsent()).accepted,true);
    assert.equal((await admin.query('select count(*)::int as n from public.account_consents where user_id=$1',[profiles[6]])).rows[0].n,1);
    for(const i of [1,4]) {
      await assert.rejects(clients[i].listGroupMembers({params}),{status:403});
      await assert.rejects(clients[i].createManagedMember({params,body:{full_name:'Intento prohibido',email:'',birthdate:'1990-01-01'}}),{status:403});
      await assert.rejects(clients[i].listGuardianshipAthletes({params}),{status:403});
    }
    for(const i of [3,5,6])await assert.rejects(clients[i].listGroupMembers({params}),{status:404});
    const ownPending=await clients[3].listMembershipOnboarding({query:{membership_id:undefined,athlete_user_id:undefined}});assert.equal(ownPending.data.length,1);
    assert.equal(ownPending.data[0].athlete_user_id,profiles[3]);assert.ok(!JSON.stringify(ownPending).match(/email|phone|birthdate|note/));
    const pendingId=ownPending.data[0].membership_id,mp={groupId:g,membershipId:pendingId};
    await assert.rejects(clients[0].approveMembership({params:mp}),error=>error.status===422&&error.error.code==='minor_requires_guardian');
    assert.equal((await admin.query('select count(*)::int as n from public.v_attendance_roster where membership_id=$1',[pendingId])).rows[0].n,0);
    const linked=await clients[0].createGuardianship({params,body:{athlete_user_id:profiles[3],full_name:'Tutor existente',email:email(2),relationship:'Tutor'}});guardianships.push(linked.guardianship_id);
    assert.equal((await admin.query("select status from public.memberships where user_id=$1 and group_id=$2 and role='GUARDIAN'",[profiles[2],g])).rows[0].status,'ACTIVE');
    await assert.rejects(clients[0].approveMembership({params:mp}),error=>error.status===422&&error.error.code==='minor_requires_guardian_consent');
    await assert.rejects(clients[1].consentMembershipData({params:{membershipId:pendingId},body:{accepted:true}}),{status:404});
    const consent=await clients[2].consentMembershipData({params:{membershipId:pendingId},body:{accepted:true}});assert.equal(consent.status,'PENDING');
    const progress=await clients[2].listMembershipOnboarding({query:{group_id:g,as_guardian:true}});assert.equal(progress.data[0].guardian_ready,true);assert.ok(!JSON.stringify(progress).match(/email|phone|birthdate|note/));
    const guardianId=(await admin.query("select id from public.memberships where user_id=$1 and group_id=$2 and role='GUARDIAN'",[profiles[2],g])).rows[0].id;
    await assert.rejects(clients[0].deactivateMembership({params:{groupId:g,membershipId:guardianId}}),error=>error.status===422&&error.error.code==='guardian_has_active_wards');
    const decisions=await Promise.allSettled([clients[0].approveMembership({params:mp}),clients[0].rejectMembership({params:mp})]);assert.equal(decisions.filter(x=>x.status==='fulfilled').length,1);assert.equal(decisions.find(x=>x.status==='rejected').reason.status,409);
    const status=(await admin.query('select status from public.memberships where id=$1',[pendingId])).rows[0].status;
    if(status==='INACTIVE')await clients[0].reactivateMembership({params:mp});
    const ward=await clients[2].getWard({params:{athleteUserId:profiles[3]}});assert.equal(ward.age,12);assert.equal(ward.groups[0].group_id,g);assert.ok(!JSON.stringify(ward).match(/email|phone|birthdate|note/));
    assert.equal((await clients[2].listMyWards({query:{group_id:g}})).data.length,1);
    await assert.rejects(clients[1].getWard({params:{athleteUserId:profiles[3]}}),{status:404});
    const since=(await admin.query('select joined_at from public.memberships where id=$1',[pendingId])).rows[0].joined_at.toISOString();
    await clients[0].deactivateMembership({params:mp});
    await admin.query('update public.consents set revoked_at=now() where guardianship_id=$1',[linked.guardianship_id]);
    await assert.rejects(clients[2].getWard({params:{athleteUserId:profiles[3]}}),{status:404});
    await assert.rejects(clients[0].reactivateMembership({params:mp}),error=>error.status===422&&error.error.code==='minor_requires_guardian_consent');
    await admin.query("insert into public.consents(guardianship_id,consent_type,terms_version,channel) values($1,'DATA_PROCESSING_MINOR','synthetic','IN_APP')",[linked.guardianship_id]);
    // Concurrent revocation/reactivation cannot leave an ACTIVE minor without current consent.
    await Promise.allSettled([clients[0].reactivateMembership({params:mp}),admin.query('update public.consents set revoked_at=now() where guardianship_id=$1 and revoked_at is null',[linked.guardianship_id])]);
    assert.equal((await admin.query("select count(*)::int as n from public.memberships m where m.id=$1 and m.status='ACTIVE' and not exists(select 1 from public.guardianships gs join public.consents c on c.guardianship_id=gs.id where gs.athlete_user_id=m.user_id and gs.status='ACTIVE' and c.consent_type='DATA_PROCESSING_MINOR' and c.revoked_at is null)",[pendingId])).rows[0].n,0);
    if((await admin.query('select status from public.memberships where id=$1',[pendingId])).rows[0].status!=='ACTIVE') {
      await admin.query("insert into public.consents(guardianship_id,consent_type,terms_version,channel) values($1,'DATA_PROCESSING_MINOR','synthetic','IN_APP')",[linked.guardianship_id]);
      await clients[0].reactivateMembership({params:mp});
    }
    assert.equal((await admin.query('select joined_at from public.memberships where id=$1',[pendingId])).rows[0].joined_at.toISOString(),since);
    assert.equal((await admin.query('select count(*)::int as n from public.consents where guardianship_id=$1',[linked.guardianship_id])).rows[0].n>=2,true);
    const managed=await clients[0].createManagedMember({params,body:{full_name:'Alta menor MIG08',email:'',birthdate:'2014-01-01',guardian:{full_name:'Tutor existente',email:email(2),relationship:'Tutor',authorized:true}}});assert.equal(managed.membership_status,'PENDING');
    const managedUser=(await admin.query('select user_id from public.memberships where id=$1',[managed.membership_id])).rows[0].user_id;profiles.push(managedUser);
    const managedProfile=(await admin.query('select account_status,auth_user_id from public.users where id=$1',[managedUser])).rows[0];assert.equal(managedProfile.account_status,'MANAGED');assert.equal(managedProfile.auth_user_id,null);
    const managedParams={groupId:g,membershipId:managed.membership_id};
    await assert.rejects(clients[0].approveMembership({params:managedParams}),{status:422});
    const ratifications=await Promise.all([clients[2].consentMembershipData({params:{membershipId:managed.membership_id},body:{accepted:true}}),clients[2].consentMembershipData({params:{membershipId:managed.membership_id},body:{accepted:true}})]);assert.ok(ratifications.every(r=>r.status==='ACTIVE'));
    assert.equal((await admin.query('select count(*)::int as n from public.consents c join public.guardianships gs on gs.id=c.guardianship_id where gs.athlete_user_id=$1',[managedUser])).rows[0].n,1);
    const edited=await clients[0].updateManagedMember({params:managedParams,body:{full_name:'Menor editado',email:'',phone:null,birthdate:'1990-01-01'}});assert.equal(edited.status,'BIRTHDATE_PENDING');
    await assert.rejects(clients[0].updateManagedMember({params:mp,body:{full_name:'Perfil propio',email:email(3),phone:null,birthdate:'2014-01-01'}}),{status:403});
    const adult=await clients[0].createManagedMember({params,body:{full_name:'Alta adulto MIG08',email:'',birthdate:'1990-01-01'}});assert.equal(adult.membership_status,'ACTIVE');
    profiles.push((await admin.query('select user_id from public.memberships where id=$1',[adult.membership_id])).rows[0].user_id);
    const adultParams={groupId:g,membershipId:adult.membership_id};await clients[0].assignMemberCoach({params:adultParams});await clients[0].assignMemberCoach({params:adultParams});
    const roster=await clients[0].listGroupMembers({params,query:{search:'Alta adulto MIG08'}});assert.equal(roster.data.length,2);assert.deepEqual(roster.data.map(r=>r.role).sort(),['ATHLETE','COACH']);assert.ok(roster.data.every(r=>r.person_roles.length===2));
    assert.equal((await clients[0].listGroupMembers({params,query:{page:100}})).total,(await clients[0].listGroupMembers({params})).total);
    assert.equal((await clients[0].listGroupMembers({params,query:{search:'%'}})).total,0);
    assert.equal((await clients[0].getPendingSummary({params})).total,(await admin.query("select count(*)::int as n from public.memberships where group_id=$1 and role='ATHLETE' and status='PENDING'",[g])).rows[0].n);
    const last=(await admin.query("select id from public.memberships where group_id=$1 and role='ADMIN'",[g])).rows[0].id;
    await assert.rejects(clients[0].deactivateMembership({params:{groupId:g,membershipId:last}}),error=>error.status===409&&error.error.code==='LAST_ADMIN');
    for(const [path,body] of [[`/api/v1/groups/${g}/memberships/${adult.membership_id}/coach`,{actor:profiles[5]}],[`/api/v1/groups/${g}/managed-members`,{full_name:'Datos',birthdate:'1990-01-01',email:'',role:'ADMIN'}],[`/api/v1/memberships/${pendingId}/data-consents`,{accepted:false}]])assert.equal((await raw(0,path,body)).status,400);
    for(const query of ['actor='+profiles[5],'page=1&page=2','page=0','status=OTHER'])assert.equal((await raw(0,`/api/v1/groups/${g}/memberships?${query}`,undefined,'GET')).status,400);
    await assert.rejects(clients[0].deactivateMembership({params:{groupId:foreign,membershipId:adult.membership_id}}),{status:404});
    // Two HTTP approvals compete for the last operational slot under the real runtime role.
    const capacityGroup=await group(),candidates=await Promise.all([pending(capacityGroup),pending(capacityGroup)]);
    const fillers=(await admin.query("insert into public.users(full_name,email,birthdate,account_status) select 'Cupo sintético',$1||n||'@example.test','1990-01-01','MANAGED' from generate_series(1,498) n returning id",['mig152-'+run+'-fill-'])).rows.map(r=>r.id);profiles.push(...fillers);
    await admin.query("insert into public.memberships(user_id,group_id,role,status,joined_at) select unnest($1::uuid[]),$2,'ATHLETE','ACTIVE',now()",[fillers,capacityGroup]);
    const capacity=await Promise.allSettled(candidates.map(c=>clients[0].approveMembership({params:{groupId:capacityGroup,membershipId:c.membership}})));assert.equal(capacity.filter(x=>x.status==='fulfilled').length,1);assert.equal(capacity.find(x=>x.status==='rejected').reason.error.code,'group_member_limit');
    assert.equal((await admin.query("select count(*)::int as n from public.memberships where group_id=$1 and status='ACTIVE'",[capacityGroup])).rows[0].n,500);
    // Two groups cannot take the same guardian from 29 to 31 active/pending groups.
    const guardianGroups=(await admin.query("select count(distinct group_id)::int as n from public.memberships where user_id=$1 and status in ('ACTIVE','PENDING')",[profiles[2]])).rows[0].n;
    for(let n=guardianGroups;n<29;n++)await group(profiles[2]);
    const targets=[];
    for(let n=0;n<2;n++){const target=await group(),child=await pending(target,true);await link(child.id);targets.push({groupId:target,membershipId:child.membership});}
    const limit=await Promise.allSettled(targets.map(params=>clients[0].approveMembership({params})));
    assert.equal(limit.filter(x=>x.status==='fulfilled').length,1);assert.equal(limit.find(x=>x.status==='rejected').reason.error.code,'guardian_group_limit');
    assert.equal((await admin.query("select count(distinct group_id)::int as n from public.memberships where user_id=$1 and status in ('ACTIVE','PENDING')",[profiles[2]])).rows[0].n,30);
    // Age correction immediately removes visibility even before the majority worker.
    await admin.query("update public.memberships set status='INACTIVE' where user_id=$1 and role='ATHLETE'",[profiles[3]]);
    await admin.query("update public.users set birthdate='1990-01-01' where id=$1",[profiles[3]]);
    await assert.rejects(clients[2].getWard({params:{athleteUserId:profiles[3]}}),{status:404});
    await admin.query("update public.users set account_status='MANAGED',auth_user_id=null where id=$1",[profiles[6]]);
    await assert.rejects(clients[6].getCurrentAccountConsent(),{status:401});
    assert.ok(!logs.join('\n').includes(runtimePassword));for(const token of tokens)assert.ok(!logs.join('\n').includes(token));assert.ok(!logs.join('\n').includes('Menor editado'));
  } finally {
    if(app)await app.close();await fixture.close();
    const allProfiles=(await admin.query('select id from public.users where id=any($1::uuid[]) or id in (select user_id from public.memberships where group_id=any($2::uuid[]))',[profiles,groups])).rows.map(r=>r.id);
    await admin.query("set session_replication_role='replica'");
    try {
      await admin.query('delete from public.birthdate_change_approvals where request_id in (select id from public.birthdate_change_requests where user_id=any($1::uuid[]))',[allProfiles]);
      await admin.query('delete from public.birthdate_change_requests where user_id=any($1::uuid[])',[allProfiles]);
      await admin.query('delete from app_private.managed_member_enrollments where membership_id in (select id from public.memberships where group_id=any($1::uuid[]))',[groups]);
      await admin.query('delete from public.consents where guardianship_id in (select id from public.guardianships where athlete_user_id=any($1::uuid[]) or guardian_user_id=any($1::uuid[]))',[allProfiles]);
      await admin.query('delete from public.guardianships where athlete_user_id=any($1::uuid[]) or guardian_user_id=any($1::uuid[])',[allProfiles]);
      await admin.query('delete from public.memberships where group_id=any($1::uuid[])',[groups]);await admin.query('delete from app_private.billing_legacy_groups where group_id=any($1::uuid[])',[groups]);await admin.query('delete from public.groups where id=any($1::uuid[])',[groups]);
      await admin.query('delete from public.account_consents where user_id=any($1::uuid[])',[allProfiles]);await admin.query('delete from public.users where id=any($1::uuid[])',[allProfiles]);
      await admin.query('delete from auth.sessions where user_id=any($1::uuid[])',[auth]);await admin.query('delete from auth.users where id=any($1::uuid[])',[auth]);
      const old=previous.rolpassword===null?'null':"'"+previous.rolpassword.replaceAll("'","''")+"'";await admin.query('alter role asisteam_api '+(previous.rolcanlogin?'login':'nologin')+' password '+old);
    } finally {await admin.query("set session_replication_role='origin'");await admin.end();}
  }
});
