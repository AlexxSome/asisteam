import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {generateKeyPair,exportJWK,SignJWT,jwtDecrypt} from 'jose';
import pg from 'pg';
import {createApplication} from '../dist/application.js';
import {loadConfig} from '../dist/config.js';
import {SafeLogger} from '../dist/logger.js';
import {ApiClient} from '../../../packages/api-client/dist/index.js';
test('MIG-19 HTTP/PostgreSQL: import, history, linking, email collision, consent, replay and concurrency',{skip:process.env.API_RLS_TEST!=='1',timeout:90000},async()=>{
 const db=new pg.Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:54322/postgres',statement_timeout:10000});
 const run=randomUUID(),secret=randomBytes(32).toString('hex'),rolePassword=randomUUID(),prefix='mig163-'+run+'-';
 const emails={legacy:prefix+'legacy@example.test',owner:prefix+'owner@example.test',fresh:prefix+'fresh@privaterelay.appleid.com',managed:prefix+'managed@example.test',invited:prefix+'invited@example.test'};
 const {publicKey,privateKey}=await generateKeyPair('RS256'),jwk={...await exportJWK(publicKey),kid:'mig163',use:'sig',alg:'RS256'};
 const originalFetch=globalThis.fetch,codes=new Map(),transactionIds=[],groups=[],logs=[];let app,previous=[],connected=false;
 const providerSub=name=>'provider-'+run+'-'+name;
 try{
  await db.connect();connected=true;previous=(await db.query("select rolname,rolcanlogin,rolpassword from pg_authid where rolname in ('asisteam_api','asisteam_auth')")).rows;
  for(const role of ['asisteam_api','asisteam_auth'])await db.query("alter role "+role+" login password '"+rolePassword+"'");
  globalThis.fetch=async(url,init)=>{
   const address=String(url);
   if(address.startsWith('https://api.pwnedpasswords.com/range/'))return new Response('A'.repeat(35)+':0');
   if(address==='https://www.googleapis.com/oauth2/v3/certs'||address==='https://appleid.apple.com/auth/keys')return Response.json({keys:[jwk]});
   if(address==='https://oauth2.googleapis.com/token'||address==='https://appleid.apple.com/auth/token'){
    const data=new URLSearchParams(init.body),claims=codes.get(data.get('code'));assert.ok(claims);
    assert.equal(data.get('redirect_uri'),'https://web.example.test/auth/callback/'+claims.provider);
    assert.equal(data.get('client_id'),claims.provider+'-client');assert.equal(data.get('client_secret'),'synthetic-'+claims.provider);
    if(claims.provider==='google')assert.ok(data.get('code_verifier'));else assert.equal(data.get('code_verifier'),null);
    const token=await new SignJWT({sub:claims.sub,email:claims.email,email_verified:claims.verified??true,nonce:claims.nonce})
      .setProtectedHeader({alg:'RS256',kid:'mig163'}).setIssuer(claims.issuer??(claims.provider==='google'?'https://accounts.google.com':'https://appleid.apple.com'))
      .setAudience(claims.provider+'-client').setIssuedAt().setExpirationTime('5m').sign(privateKey);
    return Response.json({access_token:'synthetic-provider-access',token_type:'Bearer',id_token:token});
   }
   return originalFetch(url,init);
  };
  app=await createApplication(loadConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://asisteam_api:'+rolePassword+'@127.0.0.1:54322/postgres',NATIVE_AUTH_DATABASE_URL:'postgresql://asisteam_auth:'+rolePassword+'@127.0.0.1:54322/postgres',NATIVE_AUTH_SECRET:secret,NATIVE_AUTH_PROXY_SECRET:secret,NATIVE_AUTH_ISSUER:'https://synthetic-auth.example.test',NATIVE_AUTH_WEB_URL:'https://web.example.test',OAUTH_GOOGLE_CLIENT_ID:'google-client',OAUTH_GOOGLE_CLIENT_SECRET:'synthetic-google',OAUTH_APPLE_CLIENT_ID:'apple-client',OAUTH_APPLE_CLIENT_SECRET:'synthetic-apple',HTTP_TIMEOUT_MS:'30000',PG_STATEMENT_TIMEOUT_MS:'10000'}),new SafeLogger(line=>logs.push(line)));await app.listen(0,'127.0.0.1');
  const origin=await app.getUrl(),client=access=>new ApiClient({origin,accessToken:async()=>access??null,authProxy:{secret,clientIp:randomUUID()},nativeAuth:true});
  const flow=async(provider,sub,email,{access,context={},...overrides}={})=>{
   const start=await (access?client(access).startSocialLink({body:{provider,context}}):client().startSocialLogin({body:{provider,context}}));
   const {payload}=await jwtDecrypt(start.transaction,createHash('sha256').update('asisteam-oauth:'+secret).digest());transactionIds.push(payload.jti);
   const url=new URL(start.authorization_url),code=randomUUID();codes.set(code,{provider,sub,email,nonce:url.searchParams.get('nonce'),...overrides});
   return {provider,code,state:url.searchParams.get('state'),transaction:start.transaction};
  };
  assert.deepEqual(await client().getSocialProviders(),{google:true,apple:true});
  const raw=(path,body,headers={})=>originalFetch(origin+'/api/v1/auth/social/'+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await raw('link',{provider:'google',context:{}})).status,401);
  assert.equal((await raw('start',{provider:'google',context:{}},{cookie:'asisteam-access=forged'})).status,403);
  assert.equal((await raw('start',{provider:'google',context:{},subject_id:randomUUID()})).status,400);
  const legacy=randomUUID();await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",[legacy,emails.legacy,JSON.stringify({full_name:'Social legado sintético',birthdate:'1990-01-01'})]);
  const profile=(await db.query('select id from public.users where auth_user_id=$1',[legacy])).rows[0].id;
  for(const provider of ['google','apple'])await db.query('insert into auth.identities(id,provider_id,user_id,identity_data,provider) values($1,$2,$3,$4,$5)',[randomUUID(),providerSub('legacy-'+provider),legacy,JSON.stringify({sub:providerSub('legacy-'+provider),email:emails.legacy,email_verified:true}),provider]);
  const group=randomUUID();groups.push(group);await db.query("insert into public.groups(id,name,invite_code,created_by) values($1,'Club OAuth sintético',$2,$3)",[group,run.replaceAll('-','').slice(0,8).toUpperCase(),profile]);await db.query('insert into app_private.billing_legacy_groups(group_id) values($1)',[group]);
  await db.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,'ADMIN','ACTIVE',now()-interval '2 days')",[profile,group]);
  const membership=(await db.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,'ATHLETE','ACTIVE',now()-interval '2 days') returning id",[profile,group])).rows[0].id;
  const activity=(await db.query("insert into public.activities(group_id,activity_type_id,title,starts_at,ends_at,created_by) values($1,'b2c3d4e5-0001-4b3c-8d4e-111111111111','Historia OAuth',now()-interval '1 hour',now(),$2) returning id",[group,profile])).rows[0].id;
  await db.query("insert into public.attendance_records(activity_id,membership_id,status,recorded_by) values($1,$2,'LATE',$3)",[activity,membership,profile]);
  const history=(await db.query('select to_jsonb(a) as data from public.attendance_records a where activity_id=$1',[activity])).rows[0].data;
  assert.equal((await db.query('select app_private.import_social_identities() as n')).rows[0].n,2);assert.equal((await db.query('select app_private.import_social_identities() as n')).rows[0].n,0);
  let session;
  for(const provider of ['google','apple']){
   const input=await flow(provider,providerSub('legacy-'+provider),emails.fresh);session=(await client().completeSocialLogin({body:input})).tokens;
   assert.deepEqual(await client(session.access_token).getSession(),{user_id:profile});
   if(!(await client(session.access_token).getCurrentAccountConsent()).accepted)await client(session.access_token).acceptAccountTerms({body:{terms_accepted:true,terms_version:'2026-09-21'}});
   assert.equal((await client(session.access_token).getMyAttendanceHistory({params:{groupId:group}})).records.length,1);
   await assert.rejects(client().completeSocialLogin({body:input}),{status:401});
  }
  assert.deepEqual((await db.query('select to_jsonb(a) as data from public.attendance_records a where activity_id=$1',[activity])).rows[0].data,history);
  assert.equal((await db.query('select count(*)::int as n from public.users where email=$1',[emails.legacy])).rows[0].n,1);
  await db.query('delete from auth.users where id=$1',[legacy]);assert.deepEqual(await client(session.access_token).getSession(),{user_id:profile});
  assert.equal((await db.query('select auth_user_id from public.users where id=$1',[profile])).rows[0].auth_user_id,legacy);
  const fresh=await client().completeSocialLogin({body:await flow('apple',providerSub('fresh'),emails.fresh,{context:{invite_code:'ABCD1234'}})});
  assert.equal(fresh.context.invite_code,'ABCD1234');assert.equal((await client(fresh.tokens.access_token).getCurrentAccountConsent()).accepted,false);
  await assert.rejects(client(fresh.tokens.access_token).listMyGroups(),{status:403});
  await client(fresh.tokens.access_token).acceptAccountTerms({body:{terms_accepted:true,terms_version:'2026-09-21'}});
  const freshProfile=await client(fresh.tokens.access_token).getOwnProfile();assert.equal(freshProfile.email,emails.fresh);assert.equal(freshProfile.birthdate,null);
  assert.equal((await client(fresh.tokens.access_token).listMyGroups()).data.length,0);await assert.rejects(client(fresh.tokens.access_token).getGroup({params:{groupId:group}}),{status:404});
  const password='Synthetic-password-'+run;await client().registerPassword({body:{email:emails.owner,password,full_name:'Titular sintético',birthdate:'1990-01-01',terms_accepted:true,terms_version:'2026-09-21'}});
  const owner=await client().loginPassword({body:{email:emails.owner,password}}),ownerId=(await client(owner.access_token).getSession()).user_id;
  await assert.rejects(client().completeSocialLogin({body:await flow('google',providerSub('owner'),emails.owner)}),{status:401});
  const link=await client().completeSocialLogin({body:await flow('google',providerSub('owner'),emails.owner,{access:owner.access_token})});assert.equal(link.linked,true);assert.deepEqual(await client(link.tokens.access_token).getSession(),{user_id:ownerId});
  const linkedLogin=await client().completeSocialLogin({body:await flow('google',providerSub('owner'),emails.fresh)});assert.deepEqual(await client(linkedLogin.tokens.access_token).getSession(),{user_id:ownerId});
  await assert.rejects(client().completeSocialLogin({body:await flow('google',providerSub('legacy-google'),emails.owner,{access:owner.access_token})}),{status:401});
  // Password replacement holds the credential before revoking families. A link
  // in flight must wait and then reject its now-revoked parent, without deadlock.
  const revokedLink=await flow('apple',providerSub('revoked'),emails.owner,{access:owner.access_token});
  await db.query('begin');
  try {
   await db.query('select 1 from app_private.auth_credentials c join public.users u on u.auth_user_id=c.subject_id where u.id=$1 for update of c',[ownerId]);
   const completing=client().completeSocialLogin({body:revokedLink}).then(value=>({value}),error=>({error}));
   let waiting=false;
   for(let n=0;n<200;n++){
    waiting=(await db.query("select exists(select 1 from pg_stat_activity where usename='asisteam_auth' and wait_event_type='Lock' and query='select app_private.auth_operation($1,$2::jsonb) as data') as waiting")).rows[0].waiting;
    if(waiting)break;await delay(5);
   }
   assert.ok(waiting,'OAuth waits for the in-flight password operation');
   await db.query('update app_private.auth_families set revoked_at=now() where subject_id in(select auth_user_id from public.users where id=$1)',[ownerId]);
   await db.query('commit');
   assert.equal((await completing).error?.status,401);
   assert.equal((await db.query('select count(*)::int as n from app_private.auth_social_identities where provider_subject=$1',[providerSub('revoked')])).rows[0].n,0);
  }catch(error){await db.query('rollback');throw error;}
  const bad=await flow('google',providerSub('bad'),prefix+'bad@example.test');await assert.rejects(client().completeSocialLogin({body:{...bad,state:'forged'}}),{status:401});await assert.rejects(client().completeSocialLogin({body:{...bad,provider:'apple'}}),{status:401});
  await assert.rejects(client().completeSocialLogin({body:await flow('google',providerSub('issuer'),prefix+'issuer@example.test',{issuer:'https://attacker.example.test'})}),{status:401});
  await assert.rejects(client().completeSocialLogin({body:await flow('apple',providerSub('unverified'),prefix+'unverified@example.test',{verified:false})}),{status:401});
  const expired=await flow('google',providerSub('expired'),prefix+'expired@example.test');await db.query("update app_private.auth_oauth_transactions set expires_at=now()-interval '1 second' where id=$1",[transactionIds.at(-1)]);await assert.rejects(client().completeSocialLogin({body:expired}),{status:401});
  for(const status of ['MANAGED','INVITED']){const email=emails[status.toLowerCase()];await db.query('insert into public.users(email,full_name,birthdate,account_status) values($1,$2,$3,$4)',[email,'Cuenta sintética '+status,'2014-01-01',status]);await assert.rejects(client().completeSocialLogin({body:await flow('google',providerSub(status),email)}),{status:401});assert.equal((await db.query('select auth_user_id from public.users where email=$1',[email])).rows[0].auth_user_id,null);}
  const raceEmail=prefix+'race@example.test',one=await flow('google',providerSub('race'),raceEmail),two=await flow('google',providerSub('race'),raceEmail);
  const raced=await Promise.all([client().completeSocialLogin({body:one}),client().completeSocialLogin({body:two})]);assert.deepEqual(await client(raced[0].tokens.access_token).getSession(),await client(raced[1].tokens.access_token).getSession());assert.equal((await db.query('select count(*)::int as n from public.users where email=$1',[raceEmail])).rows[0].n,1);
  const same=await flow('google',providerSub('race'),raceEmail),twice=await Promise.allSettled([client().completeSocialLogin({body:same}),client().completeSocialLogin({body:same})]);assert.equal(twice.filter(r=>r.status==='fulfilled').length,1);
  for(const value of [secret,...Object.values(emails),password,fresh.tokens.access_token,fresh.tokens.refresh_token])assert.ok(!logs.join('').includes(value));
 }finally{
  globalThis.fetch=originalFetch;if(app)await app.close();
  if(connected){try{
   const own=(await db.query('select id,auth_user_id from public.users where email like $1',[prefix+'%'])).rows,ids=own.map(u=>u.id),subjects=own.map(u=>u.auth_user_id).filter(Boolean);
   await db.query('begin');await db.query("set local session_replication_role='replica'");await db.query('delete from app_private.auth_oauth_transactions where id=any($1::uuid[])',[transactionIds]);await db.query('delete from app_private.auth_social_identities where subject_id=any($1::uuid[])',[subjects]);
   for(const sql of ['delete from public.attendance_records where activity_id in(select id from public.activities where group_id=any($1::uuid[]))','delete from public.activities where group_id=any($1::uuid[])','delete from public.memberships where group_id=any($1::uuid[])','delete from app_private.billing_legacy_groups where group_id=any($1::uuid[])','delete from public.groups where id=any($1::uuid[])'])await db.query(sql,[groups]);
   for(const table of ['auth_refresh','auth_recovery','auth_families','auth_credentials'])await db.query('delete from app_private.'+table+(table==='auth_refresh'?' where family_id in(select id from app_private.auth_families where subject_id=any($1::uuid[]))':' where subject_id=any($1::uuid[])'),[subjects]);
   await db.query('delete from public.account_consents where user_id=any($1::uuid[])',[ids]);await db.query('delete from public.users where id=any($1::uuid[])',[ids]);await db.query('delete from auth.identities where user_id=any($1::uuid[])',[subjects]);await db.query('delete from auth.users where id=any($1::uuid[])',[subjects]);await db.query('delete from app_private.auth_subjects where id=any($1::uuid[])',[subjects]);
   for(const row of previous)await db.query('alter role '+row.rolname+' '+(row.rolcanlogin?'login':'nologin')+' password '+(row.rolpassword===null?'null':"'"+row.rolpassword.replaceAll("'","''")+"'"));await db.query('commit');
  }finally{await db.end();}}else await db.end();
 }
});
