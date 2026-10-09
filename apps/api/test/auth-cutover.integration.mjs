import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createApplication} from './legacy-application.mjs';
import {loadConfig} from './legacy-application.mjs';
import {SafeLogger} from '../dist/logger.js';
import {ApiClient} from '../../../packages/api-client/dist/index.js';
const execute=promisify(execFile),hash=value=>createHash('sha256').update(value).digest('hex');
test('MIG-20 isolated database: import, freeze, single writer, retired RLS and forward recovery',{skip:process.env.API_RLS_TEST!=='1',timeout:120000},async()=>{
 const name='mig164_'+randomUUID().replaceAll('-',''),secret=randomBytes(32).toString('hex'),rolePassword=randomUUID();
 const root=new pg.Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:54322/postgres'});
 const db=new pg.Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:54322/'+name});
 let created=false,connected=false,app,previous=[];const logs=[],mail=[],originalFetch=globalThis.fetch;
 const password='Synthetic-cutover-'+randomUUID(),email=k=>'mig164-'+k+'@example.test';
 const subjects=Object.fromEntries(['legacy','late','social','unsupported','banned','previous-native'].map(k=>[k,randomUUID()]));
 const registration=k=>({email:email(k),password,full_name:'Perfil sintético MIG20',birthdate:'1990-01-01',terms_accepted:true,terms_version:'2026-09-21'});
 try{
  await root.connect();
  const schema=(await execute('docker',['exec','supabase_db_asisteam','pg_dump','-U','postgres','--schema-only','--no-owner',...['public','app_private','auth','storage'].flatMap(s=>['-n',s])],{maxBuffer:64000000})).stdout.replace(/^ALTER DEFAULT PRIVILEGES FOR ROLE (supabase_admin|supabase_auth_admin) [^\n]+;$/gm,'').replace(/^\\(?:un)?restrict .*$/gm,'');
  await root.query('create database '+name+' template template0');created=true;await db.connect();connected=true;
  await db.query('drop schema public;create schema extensions;create extension pgcrypto with schema extensions;');await db.query(schema);
  await db.query('insert into app_private.auth_authority(singleton) values(true)');
  previous=(await root.query("select rolname,rolcanlogin,rolpassword from pg_authid where rolname in ('asisteam_api','asisteam_auth','asisteam_invitation')")).rows;
  for(const role of ['asisteam_api','asisteam_auth','asisteam_invitation'])await root.query('alter role '+role+" login password '"+rolePassword+"'");
  const type='b2c3d4e5-0001-4b3c-8d4e-111111111111';
  await db.query("begin;set local session_replication_role='replica'");
  await db.query("insert into public.activity_types(id,name) values($1,'TRAINING')",[type]);await db.query('commit');
  for(const [kind,id] of Object.entries(subjects)){
   await db.query("insert into auth.users(id,email,email_confirmed_at,encrypted_password,raw_user_meta_data,banned_until) values($1,$2,now(),case when $3='social' then '' when $3='unsupported' then '$unsupported$synthetic' else extensions.crypt($4,extensions.gen_salt('bf',4)) end,$5,case when $3='banned' then now()+interval '1 day' else null end)",[id,email(kind),kind,password,JSON.stringify({full_name:'Importado sintético',birthdate:'1990-01-01'})]);
  }
  for(const provider of ['google','apple'])await db.query("insert into auth.identities(id,user_id,provider,provider_id,identity_data) values($1,$2,$3,$4,$5)",[randomUUID(),subjects.social,provider,'subject-'+provider,JSON.stringify({sub:'subject-'+provider,email:email('social')})]);
  // Existing MIG-18 replacement: execute the migration's actual reconciliation
  // statements and preserve its newer password despite the old infinity ban.
  await db.query("insert into app_private.auth_credentials(subject_id,password_hash) values($1,extensions.crypt($2,extensions.gen_salt('bf',4)))",[subjects['previous-native'],'Changed-'+password]);
  await db.query("update auth.users set banned_until='infinity' where id=$1",[subjects['previous-native']]);
  const migration=readFileSync(new URL('../../../supabase/migrations/20261008060000_auth_cutover.sql',import.meta.url),'utf8');
  await db.query(migration.slice(migration.indexOf('update app_private.auth_subjects s set native_owned=true,'),migration.indexOf('alter table app_private.auth_authority enable')));
  const profiles=(await db.query('select id,auth_user_id from public.users')).rows;
  for(const profile of profiles)await db.query("select app_private.record_account_consent($1,'2026-09-21','EMAIL_SIGNUP')",[profile.id]);
  const legacyProfile=profiles.find(r=>r.auth_user_id===subjects.legacy).id;
  const managed=randomUUID();await db.query("insert into public.users(id,full_name,birthdate,account_status) values($1,'MANAGED sintético','1990-01-01','MANAGED')",[managed]);
  globalThis.fetch=async(url,init)=>{
   if(String(url).startsWith('https://api.pwnedpasswords.com/range/'))return new Response('A'.repeat(35)+':0');
   if(String(url)==='https://api.resend.com/emails'){mail.push(JSON.parse(init.body));return new Response(JSON.stringify({id:randomUUID()}));}
   return originalFetch(url,init);
  };
  const configuration={NODE_ENV:'test',DATABASE_URL:'postgresql://asisteam_api:'+rolePassword+'@127.0.0.1:54322/'+name,NATIVE_AUTH_DATABASE_URL:'postgresql://asisteam_auth:'+rolePassword+'@127.0.0.1:54322/'+name,NATIVE_AUTH_SECRET:secret,NATIVE_AUTH_PROXY_SECRET:secret,NATIVE_AUTH_ISSUER:'https://synthetic-auth.example.test',NATIVE_AUTH_WEB_URL:'http://127.0.0.1:3120',INVITATION_DATABASE_URL:'postgresql://asisteam_invitation:'+rolePassword+'@127.0.0.1:54322/'+name,INVITATION_PROXY_SECRET:secret,RESEND_API_KEY:'synthetic',INVITATION_EMAIL_FROM:'auth@example.test',HTTP_TIMEOUT_MS:'30000',PG_STATEMENT_TIMEOUT_MS:'10000'};
  app=await createApplication(loadConfig(configuration),new SafeLogger(line=>logs.push(line)));await app.listen(0,'127.0.0.1');
  const client=access=>new ApiClient({origin,accessToken:async()=>access??null,authProxy:{secret,clientIp:randomUUID()},invitationProxy:{secret,clientIp:randomUUID()},nativeAuth:true,timeoutMs:30000});
  let origin=await app.getUrl();
  await app.close();app=await createApplication(loadConfig({...configuration,SUPABASE_AUTH_RETIRED:'1'}),new SafeLogger(line=>logs.push(line)));await app.listen(0,'127.0.0.1');origin=await app.getUrl();
  await assert.rejects(client().loginPassword({body:{email:email('legacy'),password}}),{status:503});
  await app.close();app=await createApplication(loadConfig(configuration),new SafeLogger(line=>logs.push(line)));await app.listen(0,'127.0.0.1');origin=await app.getUrl();
  await client().registerPassword({body:registration('native-before')});
  const initial=await client().loginPassword({body:{email:email('native-before'),password}});
  await db.query('insert into app_private.auth_credentials(subject_id,password_hash) select id,encrypted_password from auth.users where id=$1',[subjects.late]);
  await client().loginPassword({body:{email:email('late'),password}});
  await assert.rejects(db.query("update auth.users set encrypted_password='modified' where id=$1",[subjects.late]),e=>e.code==='PT503');
  const group=await client(initial.access_token).createGroup({body:{name:'Club MIG20',sport:'Tenis'}});
  await db.query('insert into app_private.billing_legacy_groups(group_id) values($1)',[group.group_id]);
  const membership=randomUUID();await db.query("insert into public.memberships(id,user_id,group_id,role,status,joined_at) values($1,$2,$3,'ATHLETE','ACTIVE',now()-interval '1 day')",[membership,legacyProfile,group.group_id]);
  const managedMembership=randomUUID();await db.query("insert into public.memberships(id,user_id,group_id,role,status,joined_at) values($1,$2,$3,'ATHLETE','ACTIVE',now()-interval '1 day')",[managedMembership,managed,group.group_id]);
  const activity=randomUUID();await db.query("insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values($1,$2,$3,'Historia MIG20',now()-interval '1 hour',now(),$4)",[activity,group.group_id,type,legacyProfile]);
  await db.query("insert into public.attendance_records(activity_id,membership_id,status,recorded_by) values($1,$2,'LATE',$3)",[activity,membership,legacyProfile]);
  const invitation=randomBytes(32).toString('hex');await db.query("insert into public.invitations(group_id,email,role,token,invited_user_id,created_by,activation_membership_id) values($1,$2,'ATHLETE',$3,$4,$5,$6)",[group.group_id,email('managed'),hash(invitation),managed,legacyProfile,managedMembership]);
  const before=(await db.query("select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(u) order by id) from public.users u),'members',(select jsonb_agg(to_jsonb(m) order by id) from public.memberships m),'history',(select jsonb_agg(to_jsonb(a) order by id) from public.attendance_records a),'consents',(select jsonb_agg(to_jsonb(c) order by id) from public.account_consents c)) as snapshot")).rows[0].snapshot;
  await assert.rejects(db.query('select app_private.import_auth_identities()'));
  await db.query("select app_private.auth_cutover('FREEZE')");
  await assert.rejects(client().registerPassword({body:registration('frozen')}),{status:503});
  await assert.rejects(db.query('update auth.users set email=email where id=$1',[subjects.legacy]),e=>e.code==='PT503');
  await db.query("select app_private.auth_cutover('ABORT')");
  await db.query("select app_private.auth_cutover('FREEZE')");
  const imported=(await db.query('select app_private.import_auth_identities() as data')).rows[0].data;assert.equal(imported.imported,6);assert.equal(imported.recovery_required,1);
  assert.equal((await db.query('select app_private.import_auth_identities() as data')).rows[0].data.imported,0);
  await assert.rejects(db.query("select app_private.auth_cutover('ABORT')"),e=>e.message==='Imported identities require forward recovery');
  await db.query("select app_private.auth_cutover('ACTIVATE')");
  assert.deepEqual((await db.query("select jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(u) order by id) from public.users u),'members',(select jsonb_agg(to_jsonb(m) order by id) from public.memberships m),'history',(select jsonb_agg(to_jsonb(a) order by id) from public.attendance_records a),'consents',(select jsonb_agg(to_jsonb(c) order by id) from public.account_consents c)) as snapshot")).rows[0].snapshot,before);
  await assert.rejects(client(initial.access_token).getSession(),{status:401});
  await app.close();app=await createApplication(loadConfig({...configuration,SUPABASE_AUTH_RETIRED:'1'}),new SafeLogger(line=>logs.push(line)));await app.listen(0,'127.0.0.1');origin=await app.getUrl();
  const session=await client().loginPassword({body:{email:email('legacy'),password}});assert.deepEqual(await client(session.access_token).getSession(),{user_id:legacyProfile});
  assert.equal((await client(session.access_token).getMyAttendanceHistory({params:{groupId:group.group_id}})).records.length,1);
  await assert.rejects(client().loginPassword({body:{email:email('banned'),password}}),{status:401});
  await assert.rejects(client().loginPassword({body:{email:email('previous-native'),password}}),{status:401});
  await client().loginPassword({body:{email:email('previous-native'),password:'Changed-'+password}});
  await assert.rejects(client().loginPassword({body:{email:email('unsupported'),password}}),{status:401});
  await client().requestRecovery({body:{email:email('unsupported')}});const link=mail.at(-1).text.match(/http:\/\/\S+/)[0];
  await client().resetPassword({body:{token:new URL(link).searchParams.get('token'),password}});await client().loginPassword({body:{email:email('unsupported'),password}});
  await db.query('begin');await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:subjects.legacy,role:'authenticated',auth_provider:'nest'})]);
  assert.equal((await db.query('select public.auth_user_id() as id')).rows[0].id,null);await db.query('rollback');
  await assert.rejects(db.query('update auth.users set encrypted_password=encrypted_password where id=$1',[subjects.legacy]),e=>e.code==='PT503');
  await client().registerPassword({body:registration('after')});const after=await client().loginPassword({body:{email:email('after'),password}});
  await client(after.access_token).changePassword({body:{current_password:password,password:'Changed-'+password}});
  // Add a provider pair through the same private OAuth boundary, then recover
  // the service artifact without reversing any post-cutover identity effects.
  const afterSubject=(await db.query('select auth_user_id from public.users where email=$1',[email('after')])).rows[0].auth_user_id;
  const transaction=randomUUID(),fresh=await client().loginPassword({body:{email:email('after'),password:'Changed-'+password}});
  const freshClaims=JSON.parse(Buffer.from(fresh.access_token.split('.')[1],'base64url').toString());
  const oauth={transaction_id:transaction,link:{subject_id:afterSubject,session_id:freshClaims.session_id}};
  await db.query("select app_private.auth_operation('oauth_begin',$1)",[JSON.stringify(oauth)]);
  await db.query("select app_private.auth_operation('oauth_complete',$1)",[JSON.stringify({...oauth,provider:'google',provider_subject:'after-cutover',email:email('after'),refresh_hash:hash(randomUUID())})]);
  const recoveryStart=performance.now();await db.query("select app_private.auth_cutover('RECOVER_FORWARD')");
  await assert.rejects(db.query("select app_private.auth_cutover('ABORT')"));
  await app.close();app=await createApplication(loadConfig({...configuration,SUPABASE_AUTH_RETIRED:'1'}),new SafeLogger(line=>logs.push(line)));await app.listen(0,'127.0.0.1');origin=await app.getUrl();
  await client().loginPassword({body:{email:email('after'),password:'Changed-'+password}});assert.ok(performance.now()-recoveryStart<10000);
  assert.equal((await db.query("select count(*)::int as n from app_private.auth_social_identities where provider_subject='after-cutover'")).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from app_private.auth_credentials where subject_id in(select auth_user_id from public.users where id=$1)',[managed])).rows[0].n,0);
  // Remove the legacy schema completely in the owned clone. Existing/new login,
  // password/reset, session context and domain RLS must remain executable.
  await db.query('drop schema auth cascade');
  await client().loginPassword({body:{email:email('late'),password}});
  const live=await client().loginPassword({body:{email:email('after'),password:'Changed-'+password}});
  assert.ok(await client(live.access_token).getSession());await client(live.access_token).changePassword({body:{current_password:'Changed-'+password,password:'Final-'+password}});
  // Retired API always selects native claim, even without the compatibility
  // header. Issued invitation hashes and domain IDs remain valid after cutover.
  const claimed=await originalFetch(origin+'/api/v1/invitations/claim',{method:'POST',headers:{'content-type':'application/json','x-asisteam-proxy':secret,'x-asisteam-client-ip':randomUUID()},body:JSON.stringify({token:invitation,registration:{email:email('managed'),password,terms_accepted:true,terms_version:'2026-09-21'}})});
  assert.equal(claimed.status,200);assert.equal((await db.query('select id from public.users where email=$1',[email('managed')])).rows[0].id,managed);
  const claimedSession=await client().loginPassword({body:{email:email('managed'),password}});assert.deepEqual(await client(claimedSession.access_token).getSession(),{user_id:managed});
  assert.ok(!logs.join('\n').includes(password));assert.ok(!logs.join('\n').includes(session.access_token));
 }finally{
  globalThis.fetch=originalFetch;if(app)await app.close();if(connected)await db.end();
  for(const r of previous)await root.query('alter role '+r.rolname+' '+(r.rolcanlogin?'login':'nologin')+' password '+(r.rolpassword===null?'null':"'"+r.rolpassword.replaceAll("'","''")+"'"));
  if(created)await root.query('drop database '+name+' with (force)');await root.end();
 }
});
