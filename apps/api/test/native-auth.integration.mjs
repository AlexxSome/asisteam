import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import pg from 'pg';
import {createApplication} from '../dist/application.js';
import {loadFixtureConfig as loadConfig,fixtureConnection} from './fixture-config.mjs';
import {SafeLogger} from '../dist/logger.js';
import {ApiClient} from '../../../packages/api-client/dist/index.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
test('MIG-18 real HTTP/PostgreSQL: register/identity, RLS, refresh replay/concurrency, recovery, logout, claim and rate limits',{skip:process.env.API_RLS_TEST!=='1',timeout:120000},async()=>{
 const db=new pg.Client({connectionString:fixtureConnection(),statement_timeout:10000});
 const run=randomUUID(),rolePassword=randomUUID(),secret=randomBytes(32).toString('hex'),issuer='https://synthetic-auth.example.test',password='Synthetic-162-password!'+run;
 const emails=['adult','missing','managed','invited','minor','guardian','limits'].map(n=>'mig162-'+run+'-'+n+'@example.test'),logs=[],mail=[];
 const subjects=[],profiles=[],groups=[],activityIds=[];let app,previous=[],connected=false;
 const originalFetch=globalThis.fetch;
 const registration=email=>({email,password,full_name:'Perfil sintético MIG18',birthdate:'1990-01-01',terms_accepted:true,terms_version:'2026-09-21'});
 let failPasswordProvider=false;
 try{
  await db.connect();connected=true;
  previous=(await db.query("select rolname,rolcanlogin,rolpassword from pg_authid where rolname in ('asisteam_api','asisteam_auth','asisteam_invitation')")).rows;
  for(const role of ['asisteam_api','asisteam_auth','asisteam_invitation'])await db.query("alter role "+role+" login password '"+rolePassword+"'");
  globalThis.fetch=async(url,init)=>{
   if(String(url).startsWith('https://api.pwnedpasswords.com/range/'))return new Response('A'.repeat(35)+':0',{status:failPasswordProvider?503:200});
   if(String(url)==='https://api.resend.com/emails'){mail.push(JSON.parse(init.body));return new Response(JSON.stringify({id:randomUUID()}));}
   return originalFetch(url,init);
  };
  app=await createApplication(loadConfig({NODE_ENV:'test',DATABASE_URL:fixtureConnection('asisteam_api',rolePassword),NATIVE_AUTH_DATABASE_URL:fixtureConnection('asisteam_auth',rolePassword),NATIVE_AUTH_SECRET:secret,NATIVE_AUTH_PROXY_SECRET:secret,NATIVE_AUTH_ISSUER:issuer,NATIVE_AUTH_WEB_URL:'http://127.0.0.1:3120',INVITATION_DATABASE_URL:fixtureConnection('asisteam_invitation',rolePassword),INVITATION_PROXY_SECRET:secret,RESEND_API_KEY:'synthetic',INVITATION_EMAIL_FROM:'auth@example.test',HTTP_TIMEOUT_MS:'30000',PG_STATEMENT_TIMEOUT_MS:'10000'}),new SafeLogger(line=>logs.push(line)));
  await app.listen(0,'127.0.0.1');const origin=await app.getUrl();
  const client=(access,ip=randomUUID())=>new ApiClient({origin,accessToken:async()=>access??null,authProxy:{secret,clientIp:ip},invitationProxy:{secret,clientIp:ip},nativeAuth:true,timeoutMs:30000});
  const raw=(path,body,extra={})=>originalFetch(origin+'/api/v1/auth/'+path,{method:'POST',headers:{'content-type':'application/json',...extra},body:JSON.stringify(body)});
  assert.equal((await raw('login',{email:emails[0],password,actor:randomUUID()})).status,400);
  assert.equal((await raw('login',{email:emails[0],password},{cookie:'asisteam-access=forged'})).status,403);
  assert.equal((await raw('login',{email:emails[0],password},{'x-asisteam-auth-proxy':'forged','x-asisteam-client-ip':'forged'})).status,401);
  await client().registerPassword({body:registration(emails[0])});
  const account=(await db.query('select id,auth_user_id from public.users where email=$1',[emails[0]])).rows[0];profiles.push(account.id);subjects.push(account.auth_user_id);
  assert.equal((await db.query('select count(*)::int as n from app_private.auth_subjects where id=$1 and native_owned',[account.auth_user_id])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from public.account_consents where user_id=$1',[account.id])).rows[0].n,1);
  const stored=(await db.query('select password_hash from app_private.auth_credentials where subject_id=$1',[account.auth_user_id])).rows[0].password_hash;assert.match(stored,/^\$argon2id\$/);
  await assert.rejects(client().registerPassword({body:registration(emails[0])}),error=>error.status===422);
  const missing=await raw('login',{email:emails[1],password}),wrong=await raw('login',{email:emails[0],password:'incorrect'});assert.equal(missing.status,401);assert.deepEqual(await missing.json(),await wrong.json());
  let session=await client().loginPassword({body:{email:emails[0],password}});
  assert.deepEqual(await client(session.access_token).getSession(),{user_id:account.id});
  assert.equal((await raw('password',{current_password:password,password:'Replacement-'+run},{authorization:'Bearer forged'})).status,401);
  // Reusing a rotated token revokes its family, including the already issued JWT.
  const rotated=await client().refreshSession({body:{refresh_token:session.refresh_token}});
  assert.deepEqual(await client(rotated.access_token).getSession(),{user_id:account.id});
  await assert.rejects(client().refreshSession({body:{refresh_token:session.refresh_token}}),{status:401});
  await assert.rejects(client(rotated.access_token).getSession(),{status:401});
  session=await client().loginPassword({body:{email:emails[0],password}});
  const racing=await Promise.allSettled([client().refreshSession({body:{refresh_token:session.refresh_token}}),client().refreshSession({body:{refresh_token:session.refresh_token}})]);
  assert.equal(racing.filter(x=>x.status==='fulfilled').length,1);const winner=racing.find(x=>x.status==='fulfilled').value;await assert.rejects(client(winner.access_token).getSession(),{status:401});
  // Live native session operates canonical RLS, rejecting an unrelated tenant.
  session=await client().loginPassword({body:{email:emails[0],password}});
  const group=await client(session.access_token).createGroup({body:{name:'Club MIG18',sport:'Tenis'}});groups.push(group.group_id);await db.query('insert into app_private.billing_legacy_groups(group_id) values($1) on conflict do nothing',[group.group_id]);
  const groupDetail=await client(session.access_token).getGroup({params:{groupId:group.group_id}});assert.ok(groupDetail.roles.includes('ADMIN'));
  await assert.rejects(client(session.access_token).getGroup({params:{groupId:randomUUID()}}),{status:404});
  await client(session.access_token).logoutSession();await assert.rejects(client(session.access_token).getSession(),{status:401});
  await assert.rejects(client().refreshSession({body:{refresh_token:session.refresh_token}}),{status:401});
  // Anti-enumeration, one-use/expiration and transaction rollback on bad hash.
  assert.deepEqual(await client().requestRecovery({body:{email:emails[1]}}),await client().requestRecovery({body:{email:emails[0]}}));
  const recovery=new URL(mail.at(-1).text.match(/http:\/\/\S+/)[0]).searchParams.get('token');assert.match(recovery,/^[a-f0-9]{64}$/);
  assert.equal((await db.query('select count(*)::int as n from app_private.auth_recovery where token_hash=$1',[hash(recovery)])).rows[0].n,1);
  const recoverBefore=(await db.query('select password_hash from app_private.auth_credentials where subject_id=$1',[account.auth_user_id])).rows[0].password_hash;
  await assert.rejects(db.query("select app_private.auth_operation('reset',$1::jsonb)",[JSON.stringify({token_hash:hash(recovery),password_hash:'bad'})]));
  assert.equal((await db.query('select consumed_at from app_private.auth_recovery where token_hash=$1',[hash(recovery)])).rows[0].consumed_at,null);
  assert.equal((await db.query('select password_hash from app_private.auth_credentials where subject_id=$1',[account.auth_user_id])).rows[0].password_hash,recoverBefore);
  const nextPassword='New-native-'+run;const resets=await Promise.allSettled([client().resetPassword({body:{token:recovery,password:nextPassword}}),client().resetPassword({body:{token:recovery,password:nextPassword}})]);
  assert.equal(resets.filter(x=>x.status==='fulfilled').length,1);await assert.rejects(client().resetPassword({body:{token:recovery,password:nextPassword}}),{status:401});
  const alive=await client().loginPassword({body:{email:emails[0],password:nextPassword}});
  await client(alive.access_token).changePassword({body:{current_password:nextPassword,password:'Changed-native-'+run}});await assert.rejects(client(alive.access_token).getSession(),{status:401});
  await client().requestRecovery({body:{email:emails[0]}});const expired=new URL(mail.at(-1).text.match(/http:\/\/\S+/)[0]).searchParams.get('token');await db.query("update app_private.auth_recovery set expires_at=now()-interval '1 minute' where token_hash=$1",[hash(expired)]);await assert.rejects(client().resetPassword({body:{token:expired,password}}),{status:401});
  // A migrated legacy hash keeps the subject/profile and rehashes only on success.
  const legacyId=randomUUID();subjects.push(legacyId);
  await db.query("insert into app_private.auth_subjects(id,email,native_owned) values($1,$2,true)",[legacyId,emails[6]]);
  await db.query("insert into public.users(auth_user_id,email,full_name,birthdate,account_status) values($1,$2,'Cuenta importada sintética','1990-01-01','ACTIVE')",[legacyId,emails[6]]);
  const legacyProfile=(await db.query('select id from public.users where auth_user_id=$1',[legacyId])).rows[0].id;profiles.push(legacyProfile);
  await db.query("insert into app_private.auth_credentials(subject_id,password_hash) values($1,extensions.crypt($2,extensions.gen_salt('bf',4)))",[legacyId,password]);
  const legacySession=await client().loginPassword({body:{email:emails[6],password}});assert.deepEqual(await client(legacySession.access_token).getSession(),{user_id:legacyProfile});assert.match((await db.query('select password_hash from app_private.auth_credentials where subject_id=$1',[legacyId])).rows[0].password_hash,/^\$argon2id\$/);
  await client().requestRecovery({body:{email:emails[6]}});const legacyRecovery=new URL(mail.at(-1).text.match(/http:\/\/\S+/)[0]).searchParams.get('token');await client().resetPassword({body:{token:legacyRecovery,password:nextPassword}});assert.equal((await db.query('select native_owned from app_private.auth_subjects where id=$1',[legacyId])).rows[0].native_owned,true);
  // MANAGED has no credential; only directed claim preserves history and profile.
  const userId=randomUUID(),membership=randomUUID(),claimToken=randomBytes(32).toString('hex');profiles.push(userId);
  await db.query("insert into public.users(id,email,full_name,birthdate,account_status) values($1,$2,'MANAGED sintético','1990-01-01','MANAGED')",[userId,emails[2]]);
  await db.query("insert into public.memberships(id,user_id,group_id,role,status,joined_at) values($1,$2,$3,'ATHLETE','ACTIVE',now()-interval '1 day')",[membership,userId,group.group_id]);
  const activity=randomUUID();activityIds.push(activity);await db.query("insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values($1,$2,'b2c3d4e5-0001-4b3c-8d4e-111111111111','Historia MIG18',now()-interval '1 hour',now(),$3)",[activity,group.group_id,account.id]);await db.query("insert into public.attendance_records(activity_id,membership_id,status,recorded_by) values($1,$2,'LATE',$3)",[activity,membership,account.id]);
  await db.query("insert into public.invitations(group_id,email,role,token,invited_user_id,created_by,activation_membership_id) values($1,$2,'ATHLETE',$3,$4,$5,$6)",[group.group_id,emails[2],hash(claimToken),userId,account.id,membership]);
  const history=(await db.query('select to_jsonb(m) as data from public.memberships m where id=$1',[membership])).rows[0].data;
  await assert.rejects(client().registerPassword({body:registration(emails[2])}),{status:422});await assert.rejects(client().loginPassword({body:{email:emails[2],password}}),{status:401});
  const claim={token:claimToken,registration:{email:emails[2],password,terms_accepted:true,terms_version:'2026-09-21'}};
  const claims=await Promise.allSettled([client().claimInvitation({body:claim}),client().claimInvitation({body:claim})]);assert.equal(claims.filter(x=>x.status==='fulfilled').length,1);
  assert.deepEqual((await db.query('select to_jsonb(m) as data from public.memberships m where id=$1',[membership])).rows[0].data,history);
  const claimed=(await db.query('select id,auth_user_id from public.users where email=$1',[emails[2]])).rows[0];subjects.push(claimed.auth_user_id);assert.equal(claimed.id,userId);
  const claimedSession=await client().loginPassword({body:{email:emails[2],password}});assert.equal((await client(claimedSession.access_token).getMyAttendanceHistory({params:{groupId:group.group_id}})).records.length,1);
  // A minor cannot claim without both guardian consents; failed claim rolls back.
  const minor=randomUUID(),minorMembership=randomUUID(),minorToken=randomBytes(32).toString('hex');profiles.push(minor);
  await db.query("insert into public.users(id,email,full_name,birthdate,account_status) values($1,$2,'Menor sintético','2014-01-01','MANAGED')",[minor,emails[4]]);
  await db.query("insert into public.memberships(id,user_id,group_id,role,status) values($1,$2,$3,'ATHLETE','PENDING')",[minorMembership,minor,group.group_id]);
  await db.query("insert into public.invitations(group_id,email,role,token,invited_user_id,created_by,activation_membership_id) values($1,$2,'ATHLETE',$3,$4,$5,$6)",[group.group_id,emails[4],hash(minorToken),minor,account.id,minorMembership]);
  await assert.rejects(client().claimInvitation({body:{token:minorToken,registration:{...claim.registration,email:emails[4]}}}),error=>error.status===422&&error.error.code==='guardian_consent_required');
  assert.equal((await db.query('select auth_user_id from public.users where id=$1',[minor])).rows[0].auth_user_id,null);assert.equal((await db.query('select count(*)::int as n from app_private.auth_subjects where email=$1',[emails[4]])).rows[0].n,0);
  // Existing guardian and both live consents permit claim without modifying
  // membership history; absence/revocation cannot be substituted by ADMIN.
  const guardianship=(await db.query("insert into public.guardianships(guardian_user_id,athlete_user_id,relationship) values($1,$2,'Tutor') returning id",[account.id,minor])).rows[0].id;
  for(const kind of ['DATA_PROCESSING_MINOR','ACCOUNT_ACTIVATION_MINOR'])await db.query("insert into public.consents(guardianship_id,consent_type,terms_version) values($1,$2,'2026-09-21')",[guardianship,kind]);
  await client().claimInvitation({body:{token:minorToken,registration:{...claim.registration,email:emails[4]}}});
  subjects.push((await db.query('select auth_user_id from public.users where id=$1',[minor])).rows[0].auth_user_id);
  assert.equal((await db.query('select status from public.memberships where id=$1',[minorMembership])).rows[0].status,'PENDING');
  // Provider unavailable fails closed before creating any profile.
  failPasswordProvider=true;await assert.rejects(client().registerPassword({body:registration(emails[3])}),{status:503});failPasswordProvider=false;
  assert.equal((await db.query('select count(*)::int as n from public.users where email=$1',[emails[3]])).rows[0].n,0);
  const limitsEmail='limits-'+run+'@example.test';for(let n=0;n<5;n++)await assert.rejects(client().loginPassword({body:{email:limitsEmail,password}}),{status:401});await assert.rejects(client().loginPassword({body:{email:limitsEmail,password}}),{status:429});
  const ipClient=client(undefined,'recovery-'+run);for(let n=0;n<10;n++)await ipClient.requestRecovery({body:{email:emails[1]}});await assert.rejects(ipClient.requestRecovery({body:{email:emails[1]}}),{status:429});
  for(const sensitive of [password,secret,...emails,session.access_token,session.refresh_token,recovery])assert.ok(!logs.join('').includes(sensitive));
 }finally{
  globalThis.fetch=originalFetch;if(app)await app.close();
  if(connected){try{
   const own=(await db.query('select id,auth_user_id from public.users where email like $1',['mig162-'+run+'-%@example.test'])).rows;
   const ids=[...new Set([...profiles,...own.map(r=>r.id)])],auth=[...new Set([...subjects,...own.map(r=>r.auth_user_id).filter(Boolean)])];
   await db.query('begin');await db.query("set local session_replication_role='replica'");
   for(const table of ['auth_refresh','auth_recovery','auth_families','auth_credentials'])await db.query('delete from app_private.'+table+(table==='auth_refresh'?' where family_id in(select id from app_private.auth_families where subject_id=any($1::uuid[]))':' where subject_id=any($1::uuid[])'),[auth]);
   for(const sql of ['delete from public.attendance_records where activity_id in(select id from public.activities where group_id=any($1::uuid[]))','delete from public.activities where group_id=any($1::uuid[])','delete from public.invitations where group_id=any($1::uuid[])','delete from public.memberships where group_id=any($1::uuid[])','delete from app_private.billing_legacy_groups where group_id=any($1::uuid[])','delete from public.groups where id=any($1::uuid[])'])await db.query(sql,[groups]);
   await db.query('delete from public.consents where guardianship_id in(select id from public.guardianships where athlete_user_id=any($1::uuid[]))',[ids]);await db.query('delete from public.guardianships where athlete_user_id=any($1::uuid[])',[ids]);
   await db.query('delete from public.account_consents where user_id=any($1::uuid[])',[ids]);await db.query('delete from public.users where id=any($1::uuid[])',[ids]);await db.query('delete from app_private.auth_families where subject_id=any($1::uuid[])',[auth]);await db.query('delete from app_private.auth_subjects where id=any($1::uuid[])',[auth]);await db.query('delete from app_private.auth_subjects where id=any($1::uuid[])',[auth]);
   for(const row of previous){const old=row.rolpassword===null?'null':"'"+row.rolpassword.replaceAll("'","''")+"'";await db.query('alter role '+row.rolname+' '+(row.rolcanlogin?'login':'nologin')+' password '+old);}
   await db.query('commit');
  }finally{await db.end();}}else await db.end();
 }
});
