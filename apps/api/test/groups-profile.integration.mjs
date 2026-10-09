import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createApplication } from './legacy-application.mjs';
import { loadConfig } from './legacy-application.mjs';
import { SafeLogger } from '../dist/logger.js';
import { authFixture } from './auth-fixture.mjs';
import { ApiClient } from '../../../packages/api-client/dist/index.js';

const enabled = process.env.API_RLS_TEST === '1';
test('MIG-07 real PostgreSQL/HTTP: four roles, multirol, tenant isolation, consent, groups, profile, age review and code quota', { skip: !enabled }, async () => {
  const admin = new pg.Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
  await admin.connect();
  const fixture = await authFixture();
  const auth = Array.from({ length: 7 }, () => randomUUID()), sessions = auth.map(() => randomUUID());
  const groupIds = [randomUUID(),randomUUID()], profiles = [];
  const rolePassword = randomUUID();
  const previous = (await admin.query("select rolcanlogin,rolpassword from pg_authid where rolname='asisteam_api'")).rows[0];
  let app, guardianship;
  const created = [];
  const logs = [];
  try {
    await admin.query("alter role asisteam_api login password '"+rolePassword+"'");
    for (const [i,id] of auth.entries()) {
      await admin.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [id,'mig151-'+id+'@example.test',JSON.stringify({ full_name:'Persona sintética '+i,birthdate:i===3?'2014-01-01':'1990-01-01' })]);
      profiles.push((await admin.query('select id from public.users where auth_user_id=$1',[id])).rows[0].id);
      await admin.query("insert into auth.sessions(id,user_id,created_at,not_after) values($1,$2,now(),now()+interval '1 hour')",[sessions[i],id]);
      if(i!==6)await admin.query("insert into public.account_consents(user_id,terms_version,channel) values($1,'2026-09-21','IN_APP')",[profiles[i]]);
    }
    for(const [i,id] of groupIds.entries()) {
      await admin.query('insert into public.groups(id,name,sport,invite_code,created_by) values($1,$2,$3,$4,$5)',[id,'Grupo sintético '+i,'Tenis',randomUUID().replaceAll('-','').slice(0,8),profiles[i===0?0:5]]);
      await admin.query('insert into app_private.billing_legacy_groups(group_id) values($1)',[id]);
    }
    guardianship=(await admin.query("insert into public.guardianships(guardian_user_id,athlete_user_id,relationship) values($1,$2,'Apoderado') returning id",[profiles[2],profiles[3]])).rows[0].id;
    await admin.query("insert into public.consents(guardianship_id,consent_type,terms_version,allows_avatar) values($1,'DATA_PROCESSING_MINOR','synthetic',false)",[guardianship]);
    for (const [i,g,role] of [[0,0,'ADMIN'],[0,0,'ATHLETE'],[1,0,'ATHLETE'],[3,0,'ATHLETE'],[4,0,'COACH'],[5,1,'ADMIN']]) await admin.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,$3,'ACTIVE',now())",[profiles[i],groupIds[g],role]);
    app=await createApplication(loadConfig({ DATABASE_URL:'postgresql://asisteam_api:'+rolePassword+'@127.0.0.1:54322/postgres',SUPABASE_AUTH_URL:fixture.issuer,SUPABASE_AUTH_PUBLIC_KEY:'sb_publishable_synthetic',PG_POOL_MAX:'1' }),new SafeLogger(line=>logs.push(line)));
    await app.listen(0,'127.0.0.1');
    const origin=await app.getUrl(),tokens=await Promise.all(auth.map((id,i)=>fixture.token(id,sessions[i])));
    const clients=tokens.map(token=>new ApiClient({origin,accessToken:async()=>token}));
    const params={groupId:groupIds[0]}, foreign={groupId:groupIds[1]};
    const request=(i,path,method='GET',body)=>fetch(origin+path,{method,headers:{authorization:'Bearer '+tokens[i],...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    assert.equal((await fetch(origin+'/api/v1/me')).status,401);
    await assert.rejects(clients[6].getOwnProfile(),{status:403,error:{code:'account_consent_required',message:'No tienes permiso para realizar esta acción.',details:{}}});
    await admin.query("insert into public.account_consents(user_id,terms_version,channel) values($1,'2026-09-21','IN_APP')",[profiles[6]]);
    for(const i of [0,1,2,3,4,5]) {
      const own=await clients[i].getOwnProfile();assert.equal(own.id,profiles[i]);assert.equal(own.email,'mig151-'+auth[i]+'@example.test');
      const list=await clients[i].listMyGroups();assert.equal(list.pagination.total,1);assert.equal(list.data[0].id,groupIds[i===5?1:0]);
    }
    assert.deepEqual((await clients[0].getGroup({params})).roles.sort(),['ADMIN','ATHLETE']);
    for(const i of [1,2,3,4]) {
      const detail=await clients[i].getGroup({params});assert.equal(detail.access,'member');
      assert.ok(!JSON.stringify(detail).match(/email|phone|birthdate|invite_code|settings|note|guardianship/));
      await assert.rejects(clients[i].getGroup({params:foreign}),{status:404});
      await assert.rejects(clients[i].updateGroup({params,body:{name:'Cambio prohibido',sport:'Tenis'}}),{status:403});
      await assert.rejects(clients[i].updateGroupSettings({params,body:{athletes_can_view_group_stats:true}}),{status:403});
      await assert.rejects(clients[i].rotateInviteCode({params}),{status:403});
    }
    await assert.rejects(clients[6].getGroup({params}),{status:404});
    await assert.rejects(clients[0].updateGroup({params:foreign,body:{name:'Cambio ajeno',sport:'Tenis'}}),{status:404});
    const before=await clients[0].getGroup({params});assert.deepEqual(before.settings,{athletes_can_view_group_stats:false,guardians_can_view_group_stats:false});
    await clients[0].updateGroup({params,body:{name:'Club editado',sport:'Natación',description:'Perfil del grupo'}});
    assert.equal((await clients[0].getGroup({params})).name,'Club editado');
    await clients[0].updateGroupSettings({params,body:{athletes_can_view_group_stats:true}});
    assert.equal((await clients[1].getGroup({params})).can_view_group_stats,true);
    assert.equal((await clients[2].getGroup({params})).can_view_group_stats,false);
    await clients[0].updateGroupSettings({params,body:{guardians_can_view_group_stats:true}});
    assert.deepEqual((await clients[0].getGroup({params})).settings,{athletes_can_view_group_stats:true,guardians_can_view_group_stats:true});
    const rotated=await clients[0].rotateInviteCode({params});assert.notEqual(rotated.code,before.invite_code);
    const valid=await clients[0].createGroup({body:{name:'Grupo creado',sport:'Tenis'}});created.push(valid.group_id);
    assert.equal((await clients[0].getGroup({params:{groupId:valid.group_id}})).access,'admin');
    const page=await clients[0].listMyGroups({query:{page:3,page_size:1}});assert.equal(page.pagination.total,2);assert.deepEqual(page.data,[]);
    for(const [path,method,body] of [['/api/v1/groups','POST',{name:'Equipo',sport:'Tenis',actor:profiles[5]}],['/api/v1/me','PATCH',{full_name:'Nombre',phone:null,birthdate:'1990-01-01',role:'ADMIN'}],['/api/v1/groups/'+groupIds[0]+'/settings','PATCH',{athletes_can_view_group_stats:true,other:true}]]) assert.equal((await request(0,path,method,body)).status,400);
    assert.equal((await request(0,'/api/v1/me/groups?page_size=101')).status,400);
    assert.equal((await request(0,'/api/v1/me/groups?page=1&page=2')).status,400);
    assert.equal((await request(0,'/api/v1/me/groups?actor='+profiles[5])).status,400);
    // PostgreSQL triggers reject changes to minor without consent and retain the profile.
    const athleteBefore=await clients[1].getOwnProfile();
    await assert.rejects(clients[1].updateOwnProfile({body:{full_name:'Cambio rechazado',phone:null,birthdate:'2014-01-01'}}),error=>error.status===422&&error.error.code==='minor_requires_guardian_consent');
    assert.deepEqual(await clients[1].getOwnProfile(),athleteBefore);
    await assert.rejects(clients[1].updateOwnProfile({body:{full_name:'Fecha requerida',phone:null,birthdate:null}}),error=>error.status===422&&error.error.code==='athlete_birthdate_required');
    const saved=await clients[1].updateOwnProfile({body:{full_name:'Nombre actualizado',phone:'+56912345678',birthdate:'1990-01-01'}});
    assert.equal(saved.profile.full_name,'Nombre actualizado');assert.equal(saved.birthdate_change_pending,false);
    // A rejected code consumes exactly one attempt, without creating membership.
    for(let i=0;i<10;i++)await assert.rejects(clients[6].joinByCode({body:{code:'ZZZZZZZZ'}}),error=>error.status===400&&error.error.code==='invalid_invite_code');
    assert.equal((await admin.query('select cardinality(attempts) as n from app_private.join_code_attempts where user_id=$1',[profiles[6]])).rows[0].n,10);
    assert.equal((await admin.query('select count(*)::int as n from public.memberships where user_id=$1',[profiles[6]])).rows[0].n,0);
    await assert.rejects(clients[6].joinByCode({body:{code:rotated.code}}),error=>error.status===429&&error.error.code==='join_rate_limited');
    await admin.query('delete from app_private.join_code_attempts where user_id=$1',[profiles[6]]);
    const joined=await clients[6].joinByCode({body:{code:rotated.code}});assert.equal(joined.membership.status,'ACTIVE');assert.equal(joined.membership.group_id,groupIds[0]);
    await assert.rejects(clients[6].joinByCode({body:{code:rotated.code}}),error=>error.status===409&&error.error.code==='membership_already_exists');
    // New group has no paid capacity; preserve billing limit instead of inventing slots.
    await assert.rejects(clients[0].joinAsAthlete({params:{groupId:valid.group_id}}),error=>error.status===422&&error.error.code==='subscription_athlete_limit');
    await admin.query('insert into app_private.billing_legacy_groups(group_id) values($1)',[valid.group_id]);
    await clients[0].joinAsAthlete({params:{groupId:valid.group_id}});
    assert.ok((await clients[0].getGroup({params:{groupId:valid.group_id}})).roles.includes('ATHLETE'));
    // Minor joins another group by code and remains pending despite existing guardian consent.
    const foreignCode=(await clients[5].getGroup({params:foreign})).invite_code;
    assert.equal((await clients[3].joinByCode({body:{code:foreignCode}})).membership.status,'PENDING');
    await assert.rejects(clients[3].getGroup({params:foreign}),{status:404});
    const initialContext=await clients[3].getProfileContext();assert.equal(initialContext.avatar_allowed,false);
    await assert.rejects(clients[1].setAvatarPermission({params:{guardianshipId:guardianship},body:{allow:true}}),{status:404});
    await clients[2].setAvatarPermission({params:{guardianshipId:guardianship},body:{allow:true}});
    assert.equal((await clients[3].getProfileContext()).avatar_allowed,true);
    await clients[2].setAvatarPermission({params:{guardianshipId:guardianship},body:{allow:false}});
    assert.equal((await clients[3].getProfileContext()).avatar_allowed,false);
    assert.equal((await admin.query('select count(*)::int as n from public.consents where guardianship_id=$1',[guardianship])).rows[0].n,3);
    const age=await clients[3].updateOwnProfile({body:{full_name:'Nombre menor guardado',phone:null,birthdate:'1990-01-01'}});
    assert.equal(age.birthdate_change_pending,true);assert.equal(age.profile.birthdate,'2014-01-01');assert.equal(age.profile.full_name,'Nombre menor guardado');
    const pending=(await clients[3].getProfileContext()).birthdate_request;assert.equal(pending.status,'PENDING');
    const reviews=await clients[0].listBirthdateReviews();assert.ok(reviews.data.some(row=>row.request_id===pending.id&&row.group_id===groupIds[0]));
    assert.deepEqual((await clients[1].listBirthdateReviews()).data,[]);
    await assert.rejects(clients[3].reviewBirthdate({params:{requestId:pending.id},body:{group_id:groupIds[0],approve:true}}),{status:404});
    assert.equal((await clients[0].reviewBirthdate({params:{requestId:pending.id},body:{group_id:groupIds[0],approve:true}})).status,'PENDING');
    assert.equal((await clients[3].getOwnProfile()).birthdate,'2014-01-01');
    assert.equal((await clients[5].reviewBirthdate({params:{requestId:pending.id},body:{group_id:groupIds[1],approve:true}})).status,'APPLIED');
    assert.equal((await clients[3].getOwnProfile()).birthdate,'1990-01-01');
    assert.deepEqual((await clients[2].getProfileContext()).avatar_permissions,[]);
    assert.equal((await admin.query('select status from public.guardianships where id=$1',[guardianship])).rows[0].status,'INACTIVE');
    await admin.query("update public.memberships set status='INACTIVE' where user_id=$1 and group_id=$2 and role='COACH'",[profiles[4],groupIds[0]]);
    await assert.rejects(clients[4].getGroup({params}),{status:404});
    for(const token of tokens)assert.ok(!logs.join('\n').includes(token));assert.ok(!logs.join('\n').includes(rolePassword));
    assert.ok(!logs.join('\n').includes('Nombre actualizado'));
  } finally {
    if(app)await app.close();await fixture.close();
    const ownedGroups=[...groupIds,...created];
    await admin.query("set session_replication_role='replica'");
    try {
      await admin.query('delete from public.birthdate_change_approvals where request_id in (select id from public.birthdate_change_requests where user_id=any($1::uuid[]))',[profiles]);
      await admin.query('delete from public.birthdate_change_requests where user_id=any($1::uuid[])',[profiles]);
      await admin.query('delete from public.consents where guardianship_id=$1',[guardianship??randomUUID()]);
      await admin.query('delete from public.guardianships where guardian_user_id=any($1::uuid[])',[profiles]);
      await admin.query('delete from public.memberships where group_id=any($1::uuid[])',[ownedGroups]);
      await admin.query('delete from app_private.billing_legacy_groups where group_id=any($1::uuid[])',[ownedGroups]);
      await admin.query('delete from public.groups where id=any($1::uuid[])',[ownedGroups]);
      await admin.query('delete from app_private.join_code_attempts where user_id=any($1::uuid[])',[profiles]);
      await admin.query('delete from public.account_consents where user_id=any($1::uuid[])',[profiles]);
      await admin.query('delete from public.users where id=any($1::uuid[])',[profiles]);
      await admin.query('delete from auth.sessions where user_id=any($1::uuid[])',[auth]);
      await admin.query('delete from auth.users where id=any($1::uuid[])',[auth]);
      const oldPassword=previous.rolpassword===null?'null':"'"+previous.rolpassword.replaceAll("'","''")+"'";
      await admin.query('alter role asisteam_api '+(previous.rolcanlogin?'login':'nologin')+' password '+oldPassword);
    } finally { await admin.query("set session_replication_role='origin'");await admin.end(); }
  }
});

test('MIG-07 GoTrue/PostgREST→Nest same database: rollback transport preserves group/profile writes without duplication', { skip: !enabled }, async () => {
  const { execFileSync } = await import('node:child_process');
  const config=JSON.parse(execFileSync('pnpm',['-w','exec','supabase','status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
  assert.equal(config.API_URL,'http://127.0.0.1:54321');
  const admin=new pg.Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:54322/postgres'});await admin.connect();
  const password=randomUUID(),email='mig151-parity-'+randomUUID()+'@example.test',runtimePassword=randomUUID();
  const previous=(await admin.query("select rolcanlogin,rolpassword from pg_authid where rolname='asisteam_api'")).rows[0];
  let app,authId,profileId,groupId;
  try {
    await admin.query("alter role asisteam_api login password '"+runtimePassword+"'");
    const signup=await fetch(config.API_URL+'/auth/v1/signup',{method:'POST',headers:{apikey:config.ANON_KEY,'content-type':'application/json'},body:JSON.stringify({email,password,data:{full_name:'Persona sintética paridad',birthdate:'1990-01-01',account_terms:{accepted:true,version:'2026-09-21'}}})});
    assert.equal(signup.status,200);const session=await signup.json();authId=session.user.id;assert.ok(session.access_token);
    profileId=(await admin.query('select id from public.users where auth_user_id=$1',[authId])).rows[0].id;
    app=await createApplication(loadConfig({DATABASE_URL:'postgresql://asisteam_api:'+runtimePassword+'@127.0.0.1:54322/postgres',SUPABASE_AUTH_URL:config.API_URL+'/auth/v1',SUPABASE_AUTH_PUBLIC_KEY:config.ANON_KEY}),new SafeLogger(()=>{}));await app.listen(0,'127.0.0.1');
    const client=new ApiClient({origin:await app.getUrl(),accessToken:async()=>session.access_token});
    const rest=(path,method='GET',body)=>fetch(config.API_URL+'/rest/v1/'+path,{method,headers:{apikey:config.ANON_KEY,authorization:'Bearer '+session.access_token,'content-type':'application/json',prefer:'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const created=await rest('rpc/create_group','POST',{p_name:'Grupo vía Supabase',p_sport:'Tenis'});assert.equal(created.status,200);groupId=await created.json();
    const params={groupId};assert.equal((await client.getGroup({params})).name,'Grupo vía Supabase');
    await client.updateGroup({params,body:{name:'Grupo vía Nest',sport:'Tenis'}});
    const read=await rest('v_group_detail?id=eq.'+groupId+'&select=id,name');assert.equal(read.status,200);assert.deepEqual(await read.json(),[{id:groupId,name:'Grupo vía Nest'}]);
    const reverted=await rest('groups?id=eq.'+groupId+'&select=id','PATCH',{name:'Grupo tras rollback'});assert.equal(reverted.status,200);assert.equal((await client.getGroup({params})).name,'Grupo tras rollback');
    assert.equal((await admin.query('select count(*)::int as n from public.groups where created_by=$1',[profileId])).rows[0].n,1);
    await client.updateOwnProfile({body:{full_name:'Nombre desde Nest',phone:null,birthdate:'1990-01-01'}});
    const update=await rest('users?id=eq.'+profileId+'&select=id,full_name','PATCH',{full_name:'Nombre tras rollback'});assert.equal(update.status,200);
    assert.equal((await client.getOwnProfile()).full_name,'Nombre tras rollback');
    assert.equal((await admin.query('select count(*)::int as n from public.users where auth_user_id=$1',[authId])).rows[0].n,1);
    const logout=await fetch(config.API_URL+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:config.ANON_KEY,authorization:'Bearer '+session.access_token}});assert.equal(logout.status,204);
    await assert.rejects(client.getOwnProfile(),{status:401});
  } finally {
    if(app)await app.close();await admin.query("set session_replication_role='replica'");
    try {
      if(groupId){await admin.query('delete from public.memberships where group_id=$1',[groupId]);await admin.query('delete from public.groups where id=$1',[groupId]);}
      if(profileId){await admin.query('delete from public.account_consents where user_id=$1',[profileId]);await admin.query('delete from public.users where id=$1',[profileId]);}
      if(authId){await admin.query('delete from auth.refresh_tokens where user_id=$1',[authId]);await admin.query('delete from auth.sessions where user_id=$1',[authId]);await admin.query('delete from auth.identities where user_id=$1',[authId]);await admin.query('delete from auth.users where id=$1',[authId]);}
      const old=previous.rolpassword===null?'null':"'"+previous.rolpassword.replaceAll("'","''")+"'";
      await admin.query('alter role asisteam_api '+(previous.rolcanlogin?'login':'nologin')+' password '+old);
    } finally {await admin.query("set session_replication_role='origin'");await admin.end();}
  }
});
