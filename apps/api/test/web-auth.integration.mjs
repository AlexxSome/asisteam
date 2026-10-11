import assert from 'node:assert/strict';
import {test} from 'node:test';
import {request as httpRequest} from 'node:http';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {EncryptJWT,jwtDecrypt,SignJWT,generateKeyPair,exportJWK} from 'jose';
import pg from 'pg';
import {createApplication} from '../dist/application.js';
import {loadFixtureConfig,fixtureConnection} from './fixture-config.mjs';
import {SafeLogger} from '../dist/logger.js';
import {ApiClient} from '../../../packages/api-client/dist/index.js';
import {webReturnPath} from '../dist/web-auth.js';

test('WEB-02 HTTP/PostgreSQL: cookie session, CSRF, domain, multi-instance refresh, replay, minors and OAuth',
 {skip:process.env.API_RLS_TEST!=='1',timeout:90000},async()=>{
 const db=new pg.Client({connectionString:fixtureConnection(),statement_timeout:10000});
 const run=randomUUID(),prefix='web214-'+run+'-',password='Synthetic-WEB02-'+run,secret=randomBytes(32).toString('hex');
 const webOrigin='https://web.example.test',logs=[],mail=[],codes=new Map(),apps=[];
 const originalFetch=globalThis.fetch,roleUrl=role=>fixtureConnection(role);
 const {publicKey,privateKey}=await generateKeyPair('RS256');
 const jwk={...await exportJWK(publicKey),kid:'web214',alg:'RS256',use:'sig'};
 const hash=v=>createHash('sha256').update(v).digest('hex');
 const credentialKey=createHash('sha256').update('asisteam-web:credentials:'+secret).digest();
 const config=loadFixtureConfig({NODE_ENV:'test',DATABASE_URL:roleUrl('asisteam_api'),NATIVE_AUTH_DATABASE_URL:roleUrl('asisteam_auth'),
  NATIVE_AUTH_SECRET:secret,NATIVE_AUTH_PROXY_SECRET:secret,NATIVE_AUTH_WEB_URL:webOrigin,WEB_AUTH_ENABLED:'1',
  INVITATION_DATABASE_URL:roleUrl('asisteam_invitation'),INVITATION_PROXY_SECRET:secret,INVITATION_WEB_URL:webOrigin,
  RESEND_API_KEY:'synthetic',INVITATION_EMAIL_FROM:'synthetic@example.test',HTTP_TIMEOUT_MS:'30000',PG_STATEMENT_TIMEOUT_MS:'10000',
  OAUTH_GOOGLE_CLIENT_ID:'google-client',OAUTH_GOOGLE_CLIENT_SECRET:'synthetic-google',OAUTH_APPLE_CLIENT_ID:'apple-client',OAUTH_APPLE_CLIENT_SECRET:'synthetic-apple'});
 const profile=email=>({email,password,full_name:'Persona sintética WEB02',birthdate:'1990-01-01',terms_accepted:true,terms_version:'2026-09-21'});
 const jar=new Map();let origins,csrf,subject,group;
 const cookies=()=>[...jar].map(([k,v])=>k+'='+v).join('; ');
 const absorb=response=>{for(const item of response.headers.getSetCookie()){const pair=item.split(';')[0],index=pair.indexOf('=');if(/Max-Age=0/.test(item))jar.delete(pair.slice(0,index));else jar.set(pair.slice(0,index),pair.slice(index+1));}};
 const request=async(path,{body,method=body===undefined?'GET':'POST',headers={},instance=0,sendCookies=true,collect=true}={})=>{
  const send=path.startsWith('/auth/callback')?async(url,init)=>new Promise((resolve,reject)=>{const outgoing=httpRequest(url,{method:init.method,headers:init.headers},incoming=>{const chunks=[];incoming.on('data',chunk=>chunks.push(chunk));incoming.on('end',()=>{const headers=new Headers();for(let n=0;n<incoming.rawHeaders.length;n+=2)headers.append(incoming.rawHeaders[n],incoming.rawHeaders[n+1]);resolve(new Response(Buffer.concat(chunks),{status:incoming.statusCode,headers}));});});outgoing.on('error',reject);outgoing.end(init.body);}):originalFetch;
  const response=await send(origins[instance]+path,{method,redirect:'manual',headers:{host:'web.example.test',...(sendCookies?{cookie:cookies()}:{}),...(body===undefined?{}:{origin:webOrigin,'content-type':'application/json','x-csrf-token':csrf??''}),...headers},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})});
  if(collect)absorb(response);return response;
 };
 const bootstrap=async()=>{const res=await request('/web-api/v1/auth/csrf');assert.equal(res.status,200);csrf=(await res.json()).csrf_token;assert.match(csrf,/^[a-f0-9]{64}$/);return csrf;};
 const write=async(path,body,status=200,extra={})=>{const res=await request('/web-api/v1/'+path,{body,...extra});assert.equal(res.status,status);const value=await res.json();assert.equal(res.headers.get('cache-control'),'private, no-store');return value;};
 const session=async(instance=0)=>{const res=await request('/web-api/v1/auth/session',{instance});assert.equal(res.status,200);return res.json();};
 const stored=async()=>{const row=(await db.query('select family_id,credentials from app_private.web_sessions where token_hash=$1',[hash(jar.get('asisteam-web-session'))])).rows[0];return {...row,tokens:(await jwtDecrypt(row.credentials,credentialKey)).payload.tokens};};
 const login=async(email=prefix+'adult@example.test')=>{await bootstrap();assert.deepEqual(await write('auth/login',{email,password}),{success:true});await bootstrap();};
 try{
  await db.connect();
  // New pgTAP security checks run in addition to every existing domain case.
  const tap=(await db.query(await readFile(new URL('../../../packages/db/tests/web_sessions.sql',import.meta.url),'utf8'))).flatMap(r=>r.rows).map(r=>Object.values(r).join(' ')).join('\n');assert.doesNotMatch(tap,/not ok|Looks like you failed/);assert.match(tap,/1\.\.12/);
  globalThis.fetch=async(url,init)=>{
   const address=String(url);
   if(address.startsWith('https://api.pwnedpasswords.com/range/'))return new Response('A'.repeat(35)+':0');
   if(address==='https://api.resend.com/emails'){mail.push(JSON.parse(init.body));return Response.json({id:randomUUID()});}
   if(['https://www.googleapis.com/oauth2/v3/certs','https://appleid.apple.com/auth/keys'].includes(address))return Response.json({keys:[jwk]});
   if(['https://oauth2.googleapis.com/token','https://appleid.apple.com/auth/token'].includes(address)){
    const params=new URLSearchParams(init.body),code=codes.get(params.get('code'));assert.ok(code);
    assert.equal(params.get('redirect_uri'),webOrigin+'/auth/callback/'+code.provider);
    if(code.provider==='google')assert.ok(params.get('code_verifier'));else assert.equal(params.get('code_verifier'),null);
    const token=await new SignJWT({sub:code.sub,email:code.email,email_verified:code.verified??true,nonce:code.nonce})
     .setProtectedHeader({alg:'RS256',kid:'web214'}).setIssuer(code.provider==='google'?'https://accounts.google.com':'https://appleid.apple.com')
     .setAudience(code.provider+'-client').setIssuedAt().setExpirationTime('5m').sign(privateKey);
    return Response.json({access_token:'synthetic-provider-token',token_type:'Bearer',id_token:token});
   }
   return originalFetch(url,init);
  };
  for(let n=0;n<2;n++){const app=await createApplication(config,new SafeLogger(line=>logs.push(line)));apps.push(app);await app.listen(0,'127.0.0.1');}
  origins=await Promise.all(apps.map(app=>app.getUrl()));
  // Public bootstrap does not mint identity. All writes, including login/logout,
  // reject foreign/missing origins, absent/invalid CSRF and content types.
  assert.equal((await request('/web-api/v1/auth/csrf',{headers:{origin:'https://attacker.example.test'}})).status,403);
  assert.equal((await request('/web-api/v1/auth/csrf',{headers:{'sec-fetch-site':'cross-site'}})).status,403);
  assert.equal((await request('/WEB-api/v1/auth/login',{body:{email:prefix+'adult@example.test',password}})).status,404);
  await bootstrap();
  for(const headers of [{origin:''},{origin:'https://attacker.example.test'},{'x-csrf-token':''},{'x-csrf-token':'bad'},{authorization:'Bearer forged'},{'x-asisteam-auth-proxy':secret}]){
   assert.equal((await request('/web-api/v1/auth/login',{body:{email:prefix+'adult@example.test',password},headers})).status,403);
   assert.equal((await request('/web-api/v1/auth/logout',{body:{},headers})).status,403);
  }
  assert.equal((await request('/web-api/v1/auth/login',{body:{},headers:{'content-type':'text/plain'}})).status,400);
  const originalCsrf=csrf;await bootstrap();assert.equal(csrf,originalCsrf,'multiple tabs reuse the bound CSRF token');
  assert.deepEqual(await write('auth/register',profile(prefix+'adult@example.test')),{success:true});assert.equal((await session()).accepted,true);await bootstrap();
  await write('auth/register',{...profile(prefix+'bad@example.test'),terms_accepted:false},400);
  await login();
  const current=await session();assert.equal(current.accepted,true);subject=(await db.query('select auth_user_id from public.users where id=$1',[current.user_id])).rows[0].auth_user_id;
  assert.ok(!JSON.stringify(current).match(/access_token|refresh_token|transaction/));
  const cookieResponse=await request('/web-api/v1/auth/login',{body:{email:prefix+'adult@example.test',password}});
  assert.equal(cookieResponse.status,200);const setCookie=cookieResponse.headers.getSetCookie().find(c=>c.startsWith('asisteam-web-session='));
  assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/Secure/);assert.match(setCookie,/SameSite=Lax/);assert.match(setCookie,/Path=\//);assert.doesNotMatch(setCookie,/Domain=/);await bootstrap();
  const state=await stored();assert.ok(!state.credentials.includes(state.tokens.access_token));assert.ok(!state.credentials.includes(state.tokens.refresh_token));
  const native=new ApiClient({origin:origins[0],accessToken:async()=>state.tokens.access_token});
  assert.deepEqual(await native.getSession(),{user_id:current.user_id});
  assert.equal((await request('/api/v1/auth/login',{body:{email:prefix+'adult@example.test',password}})).status,403,'Bearer Auth still rejects cookies');
  assert.equal((await request('/web-api/v1/health')).status,404);assert.equal((await request('/web-api/v1/billing/mercadopago/webhook',{body:{}})).status,404);
  group=(await write('groups',{name:'Club WEB02',sport:'Tenis'},201)).group_id;
  await db.query('insert into app_private.billing_legacy_groups(group_id) values($1) on conflict do nothing',[group]);
  assert.equal((await request('/web-api/v1/groups/'+randomUUID())).status,404);
  assert.equal((await request('/web-api/v1/me/groups')).status,200);
  // Expired access forces one canonical rotation, coordinated by PostgreSQL
  // across two Nest instances. Stable handle means lost responses are harmless.
  const expired=await new SignJWT({session_id:state.family_id}).setProtectedHeader({alg:'HS256'}).setSubject(subject).setIssuer(config.NATIVE_AUTH_ISSUER).setAudience('asisteam-api').setIssuedAt(Math.floor(Date.now()/1000)-901).setExpirationTime(Math.floor(Date.now()/1000)-1).sign(new TextEncoder().encode(secret));
  const staleBundle=await new EncryptJWT({tokens:{...state.tokens,access_token:expired}}).setProtectedHeader({alg:'dir',enc:'A256GCM'}).setIssuer(config.NATIVE_AUTH_ISSUER).setAudience('asisteam-web:credentials').setIssuedAt().setExpirationTime('30d').encrypt(credentialKey);
  await db.query('update app_private.web_sessions set credentials=$1 where family_id=$2',[staleBundle,state.family_id]);
  const before=(await db.query('select count(*)::int as n from app_private.auth_refresh where family_id=$1',[state.family_id])).rows[0].n;
  await Promise.all(Array.from({length:8},(_,n)=>session(n%2)));
  const after=await stored();assert.notEqual(after.tokens.refresh_token,state.tokens.refresh_token);
  assert.equal((await db.query('select count(*)::int as n from app_private.auth_refresh where family_id=$1',[state.family_id])).rows[0].n,before+1);
  await write('auth/refresh',{});await session(1);
  // Genuine native replay retains its family revocation behavior.
  const nativeRefresh=new ApiClient({origin:origins[0],authProxy:{secret,clientIp:'synthetic-replay-'+run}});
  await assert.rejects(nativeRefresh.refreshSession({body:{refresh_token:state.tokens.refresh_token}}),{status:401});
  const revoked=await request('/web-api/v1/auth/session');assert.equal(revoked.status,401);assert.match(revoked.headers.getSetCookie().join(';'),/asisteam-web-session=;.*Max-Age=0/);
  await login();
  const alive=await stored();await write('auth/logout',{});assert.equal(jar.has('asisteam-web-session'),false);await assert.rejects(new ApiClient({origin:origins[0],accessToken:async()=>alive.tokens.access_token}).getSession(),{status:401});
  await bootstrap();await write('auth/logout',{});await login();
  await db.query('update app_private.auth_families set expires_at=now()-interval \'1 second\' where id=$1',[(await stored()).family_id]);assert.equal((await request('/web-api/v1/auth/session')).status,401);
  await login();
  await write('auth/password',{current_password:password,password:'Replacement-'+run});assert.equal(jar.has('asisteam-web-session'),false);
  await bootstrap();
  assert.deepEqual(await write('auth/recovery',{email:prefix+'adult@example.test'}),await write('auth/recovery',{email:prefix+'unknown@example.test'}));
  const recovery=new URL(mail.at(-1).text.match(/https:\/\/\S+/)[0]).searchParams.get('token');await write('auth/reset',{token:recovery,password});await bootstrap();await write('auth/reset',{token:recovery,password},401);await login();
  // Directed invitation/activation reuse canonical services, preserving history
  // and the minor guardianship + dual-consent gate.
  const minor=randomUUID(),membership=randomUUID(),invite=randomBytes(32).toString('hex');
  await db.query("insert into public.users(id,email,full_name,birthdate,account_status) values($1,$2,'Menor WEB02','2014-01-01','MANAGED')",[minor,prefix+'minor@example.test']);
  await db.query("insert into public.memberships(id,user_id,group_id,role,status) values($1,$2,$3,'ATHLETE','PENDING')",[membership,minor,group]);
  await db.query("insert into public.invitations(group_id,email,role,token,invited_user_id,created_by,activation_membership_id) values($1,$2,'ATHLETE',$3,$4,$5,$6)",[group,prefix+'minor@example.test',hash(invite),minor,current.user_id,membership]);
  await write('invitations/preview',{token:invite});
  const claim={token:invite,registration:{email:prefix+'minor@example.test',password,terms_accepted:true,terms_version:'2026-09-21'}};
  const denied=await write('invitations/claim',claim,422);assert.equal(denied.error.code,'guardian_consent_required');
  assert.equal((await db.query('select auth_user_id from public.users where id=$1',[minor])).rows[0].auth_user_id,null);
  const guardianship=(await db.query("insert into public.guardianships(guardian_user_id,athlete_user_id,relationship) values($1,$2,'Tutor') returning id",[current.user_id,minor])).rows[0].id;
  for(const kind of ['DATA_PROCESSING_MINOR','ACCOUNT_ACTIVATION_MINOR'])await db.query("insert into public.consents(guardianship_id,consent_type,terms_version) values($1,$2,'2026-09-21')",[guardianship,kind]);
  await write('invitations/claim',claim);assert.equal((await db.query('select status from public.memberships where id=$1',[membership])).rows[0].status,'PENDING');
  // Real OIDC grant/JWS verification with synthetic provider TLS responses.
  for(const provider of ['google','apple']){
   await bootstrap();
   const started=await write('auth/social/start',{provider,context:{invite_code:'ABCD1234'}});assert.deepEqual(Object.keys(started),['authorization_url']);
   const url=new URL(started.authorization_url),code=randomUUID();codes.set(code,{provider,sub:prefix+provider,email:prefix+provider+'@example.test',nonce:url.searchParams.get('nonce')});
   assert.ok(url.searchParams.get('state'));assert.ok(url.searchParams.get('nonce'));if(provider==='google')assert.equal(url.searchParams.get('code_challenge_method'),'S256');
   const transaction=jar.get('asisteam-web-oauth');assert.ok(transaction);const flowCookie=(await request('/web-api/v1/auth/social/start',{body:{provider,context:{}}})).headers.getSetCookie().find(c=>c.startsWith('asisteam-web-oauth=')&&!c.includes('Max-Age=0'));
   if(provider==='apple')assert.match(flowCookie,/SameSite=None/);else assert.match(flowCookie,/SameSite=Lax/);
   // Restore the first transaction to test its exact state/context.
   jar.set('asisteam-web-oauth',transaction);
   const parameters=new URLSearchParams({code,state:url.searchParams.get('state')});
   const callback=await request('/auth/callback/'+provider+(provider==='google'?'?'+parameters:''),provider==='apple'?{body:parameters.toString(),headers:{'content-type':'application/x-www-form-urlencoded',origin:'https://appleid.apple.com','x-csrf-token':''}}:{});
   assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),webOrigin+'/accept-terms?return_to='+encodeURIComponent('/join?code=ABCD1234'));
   assert.equal((await session()).accepted,false);
   assert.equal((await request('/web-api/v1/me/groups')).status,403,'missing consent does not grant domain access');
   // Flow replay fails even when a captured transaction cookie is reintroduced.
   jar.set('asisteam-web-oauth',transaction);
   const replay=await request('/auth/callback/'+provider+(provider==='google'?'?'+parameters:''),provider==='apple'?{body:parameters.toString(),headers:{'content-type':'application/x-www-form-urlencoded',origin:'https://appleid.apple.com'}}:{});
   assert.equal(replay.headers.get('location'),webOrigin+'/login?social_error=1');
   await bootstrap();await write('account-consents',{terms_accepted:true,terms_version:'2026-09-21'},201);
  }
  await login();
  const linkedBefore=(await session()).user_id;
  const link=await write('auth/social/link',{provider:'google',context:{}}),linkUrl=new URL(link.authorization_url),linkCode=randomUUID();
  codes.set(linkCode,{provider:'google',sub:prefix+'linked',email:prefix+'adult@example.test',nonce:linkUrl.searchParams.get('nonce')});
  const linked=await request('/auth/callback/google?'+new URLSearchParams({code:linkCode,state:linkUrl.searchParams.get('state')}));
  assert.equal(linked.headers.get('location'),webOrigin+'/profile?social_linked=1');assert.equal((await session()).user_id,linkedBefore);
  await bootstrap();const start=await write('auth/social/start' ,{provider:'google',context:{}}),url=new URL(start.authorization_url);
  const bad=await request('/auth/callback/google?code=synthetic&state='+url.searchParams.get('state')+'&state=duplicate');assert.equal(bad.headers.get('location'),webOrigin+'/login?social_error=1');
  assert.equal((await request('/auth/callback/google?code=synthetic&state=forged',{headers:{host:'attacker.example.test'}})).headers.get('location'),webOrigin+'/login?social_error=1');
  for(const destination of ['//attacker.example.test','https://attacker.example.test','/\\attacker.example.test','/login?return_to=https://attacker.example.test'])assert.equal(webReturnPath(destination),'/welcome');
  assert.equal(webReturnPath('/groups/'+group),'/groups/'+group);
  // Proxy IP spoofing has no effect without an explicitly trusted socket peer.
  const web=apps[0].get((await import('../dist/web-auth.js')).WebAuth);
  assert.equal(web.clientIp({socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-for':'attacker'}}),'127.0.0.1');
  for(const sensitive of [secret,password,prefix,recovery,...Object.values(after.tokens).filter(v=>typeof v==='string')])assert.ok(!logs.join('').includes(sensitive));
 }finally{
  globalThis.fetch=originalFetch;await Promise.all(apps.map(app=>app.close()));
  // Fixture is owned/disposable by native-suite; never clean domain history in a
  // shared environment. This test is intentionally only run in that runner.
  await db.end();
 }
});
