import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {readFileSync,writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {createApplication} from '../../api/dist/application.js';
import {loadConfig} from '../../api/dist/config.js';
import {ApiClient} from '../../../packages/api-client/dist/index.js';
const apiRequire=createRequire(new URL('../../api/package.json',import.meta.url)),{Client}=apiRequire('pg');
const {generateKeyPair,exportJWK,SignJWT,jwtDecrypt}=await import(apiRequire.resolve('jose'));
const isolated=await (await import('../../api/test/native-browser-database.mjs')).nativeBrowserDatabase();
const db=new Client({connectionString:isolated.url});
const databaseConnection=(role,password)=>{const url=new URL(isolated.url);url.username=role;url.password=password;return url.toString()};
const run=randomUUID(),email='mig163-browser-'+run+'@example.test',ownerEmail='mig163-browser-'+run+'-owner@example.test',secret=randomBytes(32).toString('hex'),rolePassword=randomUUID();
const originalFetch=globalThis.fetch,nextEnv=new URL('../next-env.d.ts',import.meta.url),previousEnv=readFileSync(nextEnv,'utf8'),codes=new Map(),transactionIds=[];
const {publicKey,privateKey}=await generateKeyPair('RS256'),jwk={...await exportJWK(publicKey),kid:'browser163',alg:'RS256',use:'sig'};
let previous=[],app,next,browser,identity={sub:'browser163-'+run,email};
try{
 await db.connect();previous=(await db.query("select rolname,rolcanlogin,rolpassword from pg_authid where rolname in ('asisteam_api','asisteam_auth')")).rows;
 for(const role of ['asisteam_api','asisteam_auth'])await db.query("alter role "+role+" login password '"+rolePassword+"'");
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const webOrigin='http://127.0.0.1:'+port;
 globalThis.fetch=async(url,init)=>{
  if(String(url).startsWith('https://api.pwnedpasswords.com/range/'))return new Response('A'.repeat(35)+':0');
  if(String(url)==='https://www.googleapis.com/oauth2/v3/certs')return Response.json({keys:[jwk]});
  if(String(url)==='https://oauth2.googleapis.com/token'){
   const body=new URLSearchParams(init.body),claim=codes.get(body.get('code'));assert.ok(claim);assert.ok(body.get('code_verifier'));assert.equal(body.get('redirect_uri'),webOrigin+'/auth/callback/google');
   const token=await new SignJWT({sub:claim.sub,email:claim.email,email_verified:true,nonce:claim.nonce,name:'Persona sintética OAuth'})
     .setProtectedHeader({alg:'RS256',kid:'browser163'}).setIssuer('https://accounts.google.com').setAudience('synthetic-google-client').setIssuedAt().setExpirationTime('5m').sign(privateKey);
   return Response.json({access_token:'synthetic-provider',token_type:'Bearer',id_token:token});
  }
  return originalFetch(url,init);
 };
 app=await createApplication(loadConfig({NODE_ENV:'test',DATABASE_URL:databaseConnection('asisteam_api',rolePassword),NATIVE_AUTH_DATABASE_URL:databaseConnection('asisteam_auth',rolePassword),NATIVE_AUTH_SECRET:secret,NATIVE_AUTH_PROXY_SECRET:secret,NATIVE_AUTH_ISSUER:'https://synthetic-auth.example.test',NATIVE_AUTH_WEB_URL:webOrigin,OAUTH_GOOGLE_CLIENT_ID:'synthetic-google-client',OAUTH_GOOGLE_CLIENT_SECRET:'synthetic-google-secret',HTTP_TIMEOUT_MS:'30000'}),{log(){},error(){},warn(){},debug(){},verbose(){},fatal(){},event(){}});await app.listen(0,'127.0.0.1');
 const env={...process.env,NODE_ENV:'development',ASISTEAM_API_ORIGIN:await app.getUrl(),ASISTEAM_TRANSPORT_AUTH:'nest',ASISTEAM_AUTH_WEB_ORIGIN:webOrigin,ASISTEAM_SITE_URL:webOrigin,NATIVE_AUTH_PROXY_SECRET:secret,NEXT_TELEMETRY_DISABLED:'1'};
 for(const module of ['groups','profile','members','invitations','activities','attendance','reports','billing','announcements','qr','storage'])env['ASISTEAM_TRANSPORT_'+module.toUpperCase()]='nest';
 next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{cwd:new URL('..',import.meta.url),env,stdio:'ignore'});
 let ready=false;for(let n=0;n<120;n++){try{if((await originalFetch(webOrigin+'/login',{signal:AbortSignal.timeout(15000)})).ok){ready=true;break;}}catch{/* Next starts in the owned process. */}if(next.exitCode!==null)throw Error('Next terminó antes del smoke OAuth');await delay(250);}assert.ok(ready);
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:375,height:812}}),page=await context.newPage();page.setDefaultTimeout(30000);
 await context.route('https://accounts.google.com/o/oauth2/v2/auth**',async route=>{
  const url=new URL(route.request().url()),code=randomUUID();codes.set(code,{...identity,nonce:url.searchParams.get('nonce')});
  const cookies=await context.cookies(webOrigin+'/auth/callback/google'),transaction=cookies.find(c=>c.name==='asisteam-oauth-transaction');assert.ok(transaction?.httpOnly);assert.equal(transaction.sameSite,'Lax');
  const {payload}=await jwtDecrypt(transaction.value,createHash('sha256').update('asisteam-oauth:'+secret).digest());transactionIds.push(payload.jti);
  const callback=new URL('/auth/callback/google',webOrigin);callback.searchParams.set('state',url.searchParams.get('state'));callback.searchParams.set('code',code);
  await route.fulfill({status:302,headers:{location:callback.href},body:''});
 });
 await page.goto(webOrigin+'/login');await page.getByRole('button',{name:'Continuar con Google',exact:true}).click();await page.waitForURL('**/accept-terms**');
 let cookies=await context.cookies();assert.ok(cookies.find(c=>c.name==='asisteam-access')?.httpOnly);assert.ok(!cookies.some(c=>c.name==='asisteam-oauth-transaction'));assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),[]);
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Aceptar y continuar'}).click();await page.waitForURL('**/welcome');await page.getByRole('heading',{name:'¡Hola, Persona!'}).waitFor();
 const profile=(await db.query('select id from public.users where email=$1',[email])).rows[0].id;
 await context.clearCookies();await page.goto(webOrigin+'/login');await page.getByRole('button',{name:'Continuar con Google',exact:true}).click();await page.waitForURL('**/welcome');assert.equal((await db.query('select id from public.users where email=$1',[email])).rows[0].id,profile);
 const client=new ApiClient({origin:await app.getUrl(),authProxy:{secret,clientIp:randomUUID()}}),password='Synthetic-OAuth-browser-'+run;
 await client.registerPassword({body:{email:ownerEmail,password,full_name:'Titular navegador',birthdate:'1990-01-01',terms_accepted:true,terms_version:'2026-09-21'}});const owner=await client.loginPassword({body:{email:ownerEmail,password}});
 const ownerId=(await db.query('select id from public.users where email=$1',[ownerEmail])).rows[0].id;
 await context.clearCookies();await context.addCookies([{name:'asisteam-access',value:owner.access_token,url:webOrigin,httpOnly:true,sameSite:'Lax'},{name:'asisteam-refresh',value:owner.refresh_token,url:webOrigin,httpOnly:true,sameSite:'Lax'}]);
 await page.goto(webOrigin+'/profile');assert.equal((await new AxeBuilder({page}).analyze()).violations.length,0);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));identity={sub:'browser163-owner-'+run,email:ownerEmail};
 await page.getByRole('button',{name:'Vincular Google',exact:true}).click();await page.waitForURL('**/profile?social_linked=1');await page.getByText('Cuenta social vinculada. Tu perfil e historial se conservaron.').waitFor();
 assert.equal((await db.query('select id from public.users where email=$1',[ownerEmail])).rows[0].id,ownerId);assert.equal((await db.query('select count(*)::int as n from app_private.auth_social_identities s join public.users u on u.auth_user_id=s.subject_id where u.id=$1',[ownerId])).rows[0].n,1);
 cookies=await context.cookies();assert.ok(!cookies.some(c=>c.name==='asisteam-oauth-transaction'||c.name.startsWith('sb-')));
 console.log('PASS: Chromium375 + Next/Nest/PostgreSQL OAuth Google: nueva cuenta/consentimiento/onboarding, cookie vinculada/consumida, login existente y vinculación explícita; axe/reflow. Proveedor sintético firmado; no ensayo externo Google/Apple.');
}finally{
 globalThis.fetch=originalFetch;if(browser)await browser.close();if(next){next.kill('SIGTERM');if(next.exitCode===null)await Promise.race([new Promise(r=>next.once('exit',r)),delay(5000)]);if(next.exitCode===null)next.kill('SIGKILL');}writeFileSync(nextEnv,previousEnv);if(app)await app.close();
 try{await db.query('begin');await db.query("set local session_replication_role='replica'");const own=(await db.query('select id,auth_user_id from public.users where email=any($1::text[])',[[email,ownerEmail]])).rows,ids=own.map(u=>u.id),subjects=own.map(u=>u.auth_user_id).filter(Boolean);
  await db.query('delete from app_private.auth_oauth_transactions where id=any($1::uuid[]) or link_subject_id=any($2::uuid[])',[transactionIds,subjects]);await db.query('delete from app_private.auth_social_identities where subject_id=any($1::uuid[])',[subjects]);
  for(const table of ['auth_refresh','auth_recovery','auth_families','auth_credentials'])await db.query('delete from app_private.'+table+(table==='auth_refresh'?' where family_id in(select id from app_private.auth_families where subject_id=any($1::uuid[]))':' where subject_id=any($1::uuid[])'),[subjects]);await db.query('delete from public.account_consents where user_id=any($1::uuid[])',[ids]);await db.query('delete from public.users where id=any($1::uuid[])',[ids]);await db.query('delete from app_private.auth_subjects where id=any($1::uuid[])',[subjects]);
  for(const row of previous)await db.query('alter role '+row.rolname+' '+(row.rolcanlogin?'login':'nologin')+' password '+(row.rolpassword===null?'null':"'"+row.rolpassword.replaceAll("'","''")+"'"));await db.query('commit');
 }finally{await db.end();await isolated.cleanup();}
}
