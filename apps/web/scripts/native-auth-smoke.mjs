import assert from 'node:assert/strict';
import {staticServer} from './static-server.mjs';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '@playwright/test';
import {createApplication} from '../../api/dist/application.js';
import {loadConfig} from '../../api/dist/config.js';
import {ApiClient} from '../../../packages/api-client/dist/index.js';
const {Client}=createRequire(new URL('../../api/package.json',import.meta.url))('pg');
const isolated = process.env.INDEPENDENT_PG_TEST_URL ? null : await (await import('../../api/test/native-browser-database.mjs')).nativeBrowserDatabase();
const databaseUrl=process.env.INDEPENDENT_PG_TEST_URL??isolated.url;
const databaseTarget=new URL(databaseUrl);
assert.equal(databaseTarget.hostname,'127.0.0.1');assert.ok(/^\/(?:postgres|native_browser_[a-f0-9]+)$/.test(databaseTarget.pathname));assert.ok(['postgres:','postgresql:'].includes(databaseTarget.protocol));
const databaseConnection=(role,password)=>{const url=new URL(databaseUrl);url.username=role;url.password=password;return url.toString();};
const db=new Client({connectionString:databaseUrl});
const run=randomUUID(),password='Synthetic-browser-'+run,email='mig162-browser-'+run+'@example.test',secret=randomBytes(32).toString('hex'),rolePassword=randomUUID();
const {jwtDecrypt,EncryptJWT,SignJWT,decodeJwt}=createRequire(new URL('../../api/package.json',import.meta.url))('jose');
const originalFetch=globalThis.fetch,mail=[];let previous=[],app,gateway,browser,page;
const report={sourceCommit:process.env.SOURCE_COMMIT??execFileSync('git',['rev-parse','HEAD'],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'}).trim(),environment:process.env.GITHUB_ACTIONS?'github-actions-synthetic':'local-synthetic',phase:'setup',status:'RUNNING',api:[]};
const reportDir=new URL('../../../.ci-results/',import.meta.url);
const phase=name=>{report.phase=name;delete report.lastActionStatus;delete report.actionOriginMatches;report.actionRequests=0;};
try{
 await db.connect();previous=(await db.query("select rolname,rolcanlogin,rolpassword from pg_authid where rolname in ('asisteam_api','asisteam_auth')")).rows;
 for(const role of ['asisteam_api','asisteam_auth'])await db.query("alter role "+role+" login password '"+rolePassword+"'");
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const webOrigin='http://127.0.0.1:'+port;
 globalThis.fetch=async(url,init)=>{
  if(String(url).startsWith('https://api.pwnedpasswords.com/range/'))return new Response('A'.repeat(35)+':0');
  if(String(url)==='https://api.resend.com/emails'){mail.push(JSON.parse(init.body));return new Response(JSON.stringify({id:randomUUID()}));}
  return originalFetch(url,init);
 };
 app=await createApplication(loadConfig({NODE_ENV:'test',DATABASE_URL:databaseConnection('asisteam_api',rolePassword),NATIVE_AUTH_DATABASE_URL:databaseConnection('asisteam_auth',rolePassword),NATIVE_AUTH_SECRET:secret,NATIVE_AUTH_PROXY_SECRET:secret,NATIVE_AUTH_ISSUER:'https://synthetic-auth.example.test',NATIVE_AUTH_WEB_URL:webOrigin,WEB_AUTH_ENABLED:'1',RESEND_API_KEY:'synthetic',INVITATION_EMAIL_FROM:'auth@example.test',HTTP_TIMEOUT_MS:'30000'}),{log(){},error(){},warn(){},debug(){},verbose(){},fatal(){},event(){}});await app.listen(0,'127.0.0.1');
 const observed=new Set(['register','login','refresh','logout','recovery','reset']);
 app.getHttpServer().on('request',(request,response)=>{
  const operation=request.url?.match(/^\/api\/v1\/auth\/([a-z]+)$/)?.[1];
  if(observed.has(operation))response.once('finish',()=>report.api.push({operation,status:response.statusCode}));
 });
 gateway=staticServer({directory:new URL('../dist',import.meta.url).pathname,target:await app.getUrl()});
 await new Promise(resolve=>gateway.listen(port,'127.0.0.1',resolve));
 phase('csrf');
 assert.equal((await originalFetch(webOrigin+'/web-api/v1/auth/logout',{method:'POST',headers:{origin:'https://attacker.example.test','content-type':'application/json'},body:'{}'})).status,403);
 assert.equal((await originalFetch(webOrigin+'/web-api/v1/auth/logout',{method:'POST',headers:{origin:webOrigin,'content-type':'application/json'},body:'{}'})).status,403);
 phase('chromium');browser=await chromium.launch({headless:true});const context=await browser.newContext();page=await context.newPage();page.setDefaultTimeout(30000);
 if(process.env.AUTH_SMOKE_SLOW_BROWSER==='1'){const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});await context.route('**/assets/*.js',async route=>{await delay(500);await route.continue();});report.browserCpuRate=6;}
 // The SPA renders these controls only after React commits their handlers.
 // Public browser events are enough; there is no SSR hydration to inspect.
 const readyForm=async locator=>{
  await locator.waitFor({state:'visible'});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 };
 page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/web-api/v1/')){report.actionRequests++;report.actionOriginMatches=request.headers().origin===webOrigin;}});
 page.on('pageerror',()=>{report.pageErrors=(report.pageErrors??0)+1;});
 page.on('response',response=>{if(response.request().method()==='POST'&&new URL(response.url()).pathname.startsWith('/web-api/v1/'))report.lastActionStatus=response.status();});
 phase('register');
 await page.goto(webOrigin+'/register',{waitUntil:'commit'});await readyForm(page.getByLabel('Nombre completo',{exact:true}));await page.getByLabel('Nombre completo',{exact:true}).fill('Perfil navegador');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Fecha de nacimiento',{exact:true}).fill('1990-01-01');await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();await page.waitForURL('**/welcome');await page.getByRole('heading',{name:'¡Hola, Perfil!'}).waitFor();
 phase('cookies');let cookies=await context.cookies();const handle=cookies.find(c=>c.name==='asisteam-web-session');assert.ok(handle?.httpOnly);assert.equal(handle.sameSite,'Lax');assert.ok(!cookies.some(c=>['asisteam-access','asisteam-refresh'].includes(c.name)));assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),[]);
 // Read credentials only through the operator of this owned synthetic DB.
 const key=createHash('sha256').update('asisteam-web:credentials:'+secret).digest();
 const credentials=async()=>{
  const sealed=(await db.query('select credentials from app_private.web_sessions where token_hash=$1',[createHash('sha256').update(handle.value).digest('hex')])).rows[0].credentials;
  return (await jwtDecrypt(sealed,key,{issuer:'https://synthetic-auth.example.test',audience:'asisteam-web:credentials'})).payload.tokens;
 };
 phase('refresh');const before=await credentials();
 const access_token=await new SignJWT(decodeJwt(before.access_token)).setProtectedHeader({alg:'HS256',typ:'JWT'}).setExpirationTime(Math.floor(Date.now()/1000)-1).sign(new TextEncoder().encode(secret));
 const expired=await new EncryptJWT({tokens:{...before,access_token}}).setProtectedHeader({alg:'dir',enc:'A256GCM'}).setIssuer('https://synthetic-auth.example.test').setAudience('asisteam-web:credentials').setIssuedAt().setExpirationTime('30d').encrypt(key);
 await db.query('update app_private.web_sessions set credentials=$1 where token_hash=$2',[expired,createHash('sha256').update(handle.value).digest('hex')]);
 await Promise.all([page.waitForResponse(response=>new URL(response.url()).pathname==='/web-api/v1/auth/session'&&response.status()===200),page.reload()]);await page.getByRole('heading',{name:'¡Hola, Perfil!'}).waitFor();assert.equal((await context.cookies()).find(c=>c.name==='asisteam-web-session').value,handle.value);assert.notEqual((await credentials()).refresh_token,before.refresh_token);
 phase('logout');const awaitedApiOrigin=await app.getUrl();
 const nativeClient=accessToken=>new ApiClient({origin:awaitedApiOrigin,authProxy:{secret,clientIp:'synthetic-other-device'},accessToken:async()=>accessToken??null,nativeAuth:true,timeoutMs:30000});
 const otherDevice=await nativeClient().loginPassword({body:{email,password}}),leaving=await credentials();
 await page.getByText('Mi cuenta',{exact:true}).click();await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.waitForURL('**/login');assert.ok(!(await context.cookies()).some(c=>['asisteam-web-session','asisteam-access','asisteam-refresh'].includes(c.name)));
 await assert.rejects(nativeClient(leaving.access_token).getSession(),{status:401});await assert.rejects(nativeClient().refreshSession({body:{refresh_token:leaving.refresh_token}}),{status:401});
 const surviving=await nativeClient().refreshSession({body:{refresh_token:otherDevice.refresh_token}});assert.ok((await nativeClient(surviving.access_token).getSession()).user_id);
 const anonymous=await page.evaluate(async()=>{const {csrf_token}=await(await fetch('/web-api/v1/auth/csrf')).json();return(await fetch('/web-api/v1/auth/logout',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf_token},body:'{}'})).status;});assert.equal(anonymous,200);
 report.logout={leavingAccessRevoked:true,leavingRefreshRevoked:true,otherDeviceSurvives:true,anonymousExitIdempotent:true};
 phase('recovery');
 await page.goto(webOrigin+'/forgot-password',{waitUntil:'commit'});await readyForm(page.getByLabel('Email',{exact:true}));await page.getByLabel('Email',{exact:true}).fill(email);await page.getByRole('button',{name:/enviar/i}).click();await page.getByText(/Si el email/).waitFor();assert.equal(mail.length,1);
 phase('reset');const link=mail[0].text.match(/http:\/\/\S+/)[0],newPassword='Changed-browser-'+run;await page.goto(link,{waitUntil:'commit'});await readyForm(page.getByLabel('Nueva contraseña',{exact:true}));await page.getByLabel('Nueva contraseña',{exact:true}).fill(newPassword);await page.getByLabel('Confirmar nueva contraseña',{exact:true}).fill(newPassword);await page.getByRole('button',{name:'Guardar nueva contraseña'}).click();await page.getByText('Tu contraseña fue actualizada. Ya puedes iniciar sesión con ella.').waitFor();assert.equal(new URL(page.url()).searchParams.get('token'),null);
 phase('login');
 await page.goto(webOrigin+'/login',{waitUntil:'commit'});await readyForm(page.getByLabel('Email',{exact:true}));await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(newPassword);await page.getByRole('button',{name:'Ingresar',exact:true}).click();await page.waitForURL('**/welcome');
 console.log('PASS: Chromium + artefacto estático + Nest/PostgreSQL: registro/perfil, sesión opaca HttpOnly/Lax, Origin/CSRF, refresh, logout, recovery/reset y login; proveedores HIBP/Resend simulados.');
 report.status='PASS';phase('completed');
}catch(error){
 report.status='FAIL';report.failure=error?.name==='TimeoutError'?'timeout':error?.code==='ERR_ASSERTION'?'assertion':'runtime';
 // Store counts/booleans only. No page text, URLs, credentials or exception.
 if(page)try{
  report.invalidFields=await page.locator('input[aria-invalid="true"]').evaluateAll(inputs=>inputs.map(input=>input.name).filter(name=>['full_name','email','birthdate','password','confirmPassword','terms_accepted'].includes(name)));
  const alerts=await page.getByRole('alert').allTextContents();
  report.alertKind=alerts.some(text=>text.includes('El enlace es inválido'))?'invalid-link':alerts.some(text=>text.includes('No pudimos conectar'))?'connection':alerts.length?'other':'none';
 }catch{/* Page itself may have closed; never publish raw page/errors. */}
 report.mailCount=mail.length;
 try{report.accountExists=(await db.query('select exists(select 1 from public.users where email=$1) as present',[email])).rows[0].present;}catch{/* Setup failed before DB was available. */}
 throw error; // The CI runner retains raw diagnostics in memory only.
}finally{
 mkdirSync(reportDir,{recursive:true});writeFileSync(new URL('native-auth-browser.json',reportDir),JSON.stringify(report,null,2)+'\n');
 globalThis.fetch=originalFetch;if(browser)await browser.close();if(gateway)await new Promise(resolve=>gateway.close(resolve));if(app)await app.close();
 try{await db.query('begin');await db.query("set local session_replication_role='replica'");const own=(await db.query('select id,auth_user_id from public.users where email=$1',[email])).rows[0];if(own){await db.query('delete from app_private.web_sessions where family_id in(select id from app_private.auth_families where subject_id=$1)',[own.auth_user_id]);for(const table of ['auth_refresh','auth_recovery','auth_families','auth_credentials'])await db.query('delete from app_private.'+table+(table==='auth_refresh'?' where family_id in(select id from app_private.auth_families where subject_id=$1)':' where subject_id=$1'),[own.auth_user_id]);await db.query('delete from public.account_consents where user_id=$1',[own.id]);await db.query('delete from public.users where id=$1',[own.id]);await db.query('delete from app_private.auth_subjects where id=$1',[own.auth_user_id]);}for(const row of previous)await db.query('alter role '+row.rolname+' '+(row.rolcanlogin?'login':'nologin')+' password '+(row.rolpassword===null?'null':"'"+row.rolpassword.replaceAll("'","''")+"'"));await db.query('commit');}finally{await db.end();await isolated?.cleanup();}
}
