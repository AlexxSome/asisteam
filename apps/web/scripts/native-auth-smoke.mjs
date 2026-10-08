import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '@playwright/test';
import {createApplication} from '../../api/dist/application.js';
import {loadConfig} from '../../api/dist/config.js';
const {Client}=createRequire(new URL('../../api/package.json',import.meta.url))('pg');
const db=new Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:54322/postgres'});
const run=randomUUID(),password='Synthetic-browser-'+run,email='mig162-browser-'+run+'@example.test',secret=randomBytes(32).toString('hex'),rolePassword=randomUUID();
const fixture=new URL('../src/app/native-auth-fixture/',import.meta.url),nextEnv=new URL('../next-env.d.ts',import.meta.url),previousEnv=readFileSync(nextEnv,'utf8');
const originalFetch=globalThis.fetch,mail=[];let previous=[],app,next,browser,owns=false;
try{
 await db.connect();previous=(await db.query("select rolname,rolcanlogin,rolpassword from pg_authid where rolname in ('asisteam_api','asisteam_auth')")).rows;
 for(const role of ['asisteam_api','asisteam_auth'])await db.query("alter role "+role+" login password '"+rolePassword+"'");
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const webOrigin='http://127.0.0.1:'+port;
 globalThis.fetch=async(url,init)=>{
  if(String(url).startsWith('https://api.pwnedpasswords.com/range/'))return new Response('A'.repeat(35)+':0');
  if(String(url)==='https://api.resend.com/emails'){mail.push(JSON.parse(init.body));return new Response(JSON.stringify({id:randomUUID()}));}
  return originalFetch(url,init);
 };
 app=await createApplication(loadConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://asisteam_api:'+rolePassword+'@127.0.0.1:54322/postgres',NATIVE_AUTH_DATABASE_URL:'postgresql://asisteam_auth:'+rolePassword+'@127.0.0.1:54322/postgres',NATIVE_AUTH_SECRET:secret,NATIVE_AUTH_PROXY_SECRET:secret,NATIVE_AUTH_ISSUER:'https://synthetic-auth.example.test',NATIVE_AUTH_WEB_URL:webOrigin,RESEND_API_KEY:'synthetic',INVITATION_EMAIL_FROM:'auth@example.test',HTTP_TIMEOUT_MS:'30000'}),{log(){},error(){},warn(){},debug(){},verbose(){},fatal(){},event(){}});await app.listen(0,'127.0.0.1');
 mkdirSync(fixture);owns=true;
 mkdirSync(new URL('csrf/',fixture));writeFileSync(new URL('csrf/route.ts',fixture),'import {assertAuthOrigin} from "@/lib/api/native-auth"; export async function POST(){try{await assertAuthOrigin();return new Response(null,{status:204});}catch{return new Response(null,{status:403});}}');
 writeFileSync(new URL('page.tsx',fixture),'import {signOutUser} from "@/app/login/actions";export default function Fixture(){return <form action={async()=>{"use server";await signOutUser();}}><button>Cerrar sesión sintética</button></form>;}');
 const env={...process.env,NODE_ENV:'development',ASISTEAM_API_ORIGIN:await app.getUrl(),NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic-build-fixture',ASISTEAM_API_SUPABASE_URL:'http://127.0.0.1:54321',ASISTEAM_TRANSPORT_AUTH:'nest',ASISTEAM_AUTH_WEB_ORIGIN:webOrigin,NATIVE_AUTH_PROXY_SECRET:secret,NEXT_TELEMETRY_DISABLED:'1'};
 delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // MIG-20: no legacy SDK/config needed for sessions.
 for(const module of ['groups','profile','members','invitations','activities','attendance','reports','billing','announcements','qr','storage'])env['ASISTEAM_TRANSPORT_'+module.toUpperCase()]='nest';
 next=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port',String(port)],{cwd:new URL('..',import.meta.url),env,stdio:'ignore'});
 let ready=false;for(let n=0;n<120;n++){try{if((await originalFetch(webOrigin+'/login',{signal:AbortSignal.timeout(15000)})).ok){ready=true;break;}}catch{/* Next is still starting. */}if(next.exitCode!==null)throw Error('Next terminó antes del smoke nativo');await delay(250);}assert.ok(ready);
 assert.equal((await originalFetch(webOrigin+'/native-auth-fixture/csrf',{method:'POST',headers:{origin:'https://attacker.example.test'}})).status,403);
 assert.equal((await originalFetch(webOrigin+'/native-auth-fixture/csrf',{method:'POST',headers:{origin:webOrigin}})).status,204);
 browser=await chromium.launch({headless:true});const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(30000);
 await page.goto(webOrigin+'/register');await page.getByLabel('Nombre completo',{exact:true}).fill('Perfil navegador');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Fecha de nacimiento',{exact:true}).fill('1990-01-01');await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Crear cuenta',exact:true}).click();await page.waitForURL('**/welcome');await page.getByRole('heading',{name:'¡Hola, Perfil!'}).waitFor();
 let tokens=await context.cookies();const access=tokens.find(c=>c.name==='asisteam-access'),refresh=tokens.find(c=>c.name==='asisteam-refresh');assert.ok(access?.httpOnly&&refresh?.httpOnly);assert.equal(access.sameSite,'Lax');assert.ok(!tokens.some(c=>c.name.startsWith('sb-')&&c.name.includes('-auth-token')));assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),[]);
 await context.clearCookies({name:'asisteam-access'});await page.reload();await page.waitForURL('**/welcome');tokens=await context.cookies();assert.notEqual(tokens.find(c=>c.name==='asisteam-refresh').value,refresh.value);assert.ok(tokens.find(c=>c.name==='asisteam-access'));
 await page.goto(webOrigin+'/native-auth-fixture');await page.getByRole('button',{name:'Cerrar sesión sintética'}).click();await page.waitForURL('**/login');assert.ok(!(await context.cookies()).some(c=>c.name==='asisteam-access'||c.name==='asisteam-refresh'));
 await page.goto(webOrigin+'/forgot-password');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByRole('button',{name:/enviar/i}).click();await page.getByText(/Si el email/).waitFor();assert.equal(mail.length,1);
 const link=mail[0].text.match(/http:\/\/\S+/)[0],newPassword='Changed-browser-'+run;await page.goto(link);await page.getByLabel('Nueva contraseña',{exact:true}).fill(newPassword);await page.getByLabel('Confirmar nueva contraseña',{exact:true}).fill(newPassword);await page.getByRole('button',{name:'Guardar nueva contraseña'}).click();await page.getByText('Tu contraseña fue actualizada. Ya puedes iniciar sesión con ella.').waitFor().catch(async error=>{console.error('Reset alert:',await page.getByRole('alert').allTextContents());throw error;});assert.equal(new URL(page.url()).searchParams.get('token'),null);
 await page.goto(webOrigin+'/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(newPassword);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();await page.waitForURL('**/welcome');
 console.log('PASS: Chromium + Next real + Nest/PostgreSQL: registro/perfil, cookies HttpOnly/Lax, Origin/CSRF, refresh, logout, recovery/reset y login; proveedores HIBP/Resend simulados.');
}finally{
 globalThis.fetch=originalFetch;if(browser)await browser.close();if(next){next.kill('SIGTERM');if(next.exitCode===null)await Promise.race([new Promise(r=>next.once('exit',r)),delay(5000)]);if(next.exitCode===null)next.kill('SIGKILL');}if(owns)rmSync(fixture,{recursive:true,force:true});writeFileSync(nextEnv,previousEnv);if(app)await app.close();
 try{await db.query('begin');await db.query("set local session_replication_role='replica'");const own=(await db.query('select id,auth_user_id from public.users where email=$1',[email])).rows[0];if(own){for(const table of ['auth_refresh','auth_recovery','auth_families','auth_credentials'])await db.query('delete from app_private.'+table+(table==='auth_refresh'?' where family_id in(select id from app_private.auth_families where subject_id=$1)':' where subject_id=$1'),[own.auth_user_id]);await db.query('delete from public.account_consents where user_id=$1',[own.id]);await db.query('delete from public.users where id=$1',[own.id]);await db.query('delete from app_private.auth_subjects where id=$1',[own.auth_user_id]);}for(const row of previous)await db.query('alter role '+row.rolname+' '+(row.rolcanlogin?'login':'nologin')+' password '+(row.rolpassword===null?'null':"'"+row.rolpassword.replaceAll("'","''")+"'"));await db.query('commit');}finally{await db.end();}
}
