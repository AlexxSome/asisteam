import {writeFileSync} from 'node:fs';
import {storageFixture} from '../../api/test/storage-fixture.mjs';
import {randomBytes} from 'node:crypto';
import {createApplication} from '../../api/dist/application.js';
import {loadFixtureConfig,fixtureSecret} from '../../api/test/fixture-config.mjs';
import {SafeLogger} from '../../api/dist/logger.js';
// Synthetic QA owns the complete PostgreSQL/Auth/S3 stack for this run.
export async function startQaNest(fixture){
 const role=name=>{const url=new URL(fixture.url);url.username=name;return url.toString()};
 const proxySecret=randomBytes(32).toString('hex');
 let app,storage,stopPromise;
 const originalFetch=globalThis.fetch;
 const stop=()=>stopPromise??=(async()=>{globalThis.fetch=originalFetch;await app?.close();if(storage){storage.storage.client.destroy();await storage.stop()}})();
 try{
  if(process.env.ASISTEAM_QA_STORAGE==='1')storage=await storageFixture();
  globalThis.fetch=(input,init)=>String(input).startsWith('https://api.resend.com/')?(writeFileSync('.qa/last-email.json',String(init.body),{mode:0o600}),Promise.resolve(Response.json({id:'synthetic-qa-email'}))):originalFetch(input,init);
  app=await createApplication(loadFixtureConfig({...storage?.config,DATABASE_URL:role('asisteam_api'),INVITATION_DATABASE_URL:role('asisteam_invitation'),INVITATION_PROXY_SECRET:proxySecret,BILLING_DATABASE_URL:role('asisteam_billing'),RESEND_API_KEY:'synthetic',INVITATION_EMAIL_FROM:'Asisteam <synthetic@example.test>',INVITATION_WEB_URL:'http://127.0.0.1:3120'}),new SafeLogger(()=>{}));
  await app.listen(0,'127.0.0.1');
  const origin=await app.getUrl();
  return{env:{ASISTEAM_AUTH_WEB_ORIGIN:'http://127.0.0.1:3120',ASISTEAM_DATABASE_MODE:'independent',ASISTEAM_API_ORIGIN:origin,ASISTEAM_NATIVE_AUTH:'1',NATIVE_AUTH_PROXY_SECRET:fixtureSecret,INVITATION_PROXY_SECRET:proxySecret,ASISTEAM_API_TIMEOUT_MS:'30000'},runtime:{url:fixture.url,name:fixture.name,API_ORIGIN:origin,OPERATOR_TOKEN:randomBytes(32).toString('hex'),INVITATION_PROXY_SECRET:proxySecret},stop};
 }catch(error){await stop();throw new Error('No se pudo iniciar Nest para QA.',{cause:error})}
}
