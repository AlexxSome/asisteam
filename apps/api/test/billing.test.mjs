import assert from 'node:assert/strict';
import test from 'node:test';
import { createBillingWebhookRelay, verifyMercadoPagoSignature } from '../../../packages/core/dist/index.js';
import { loadConfig } from '../dist/config.js';

test('billing config enforces same database and fixed HTTPS origins',()=>{
  const base={DATABASE_URL:'postgresql://asisteam_api:synthetic@127.0.0.1:54322/postgres'};
  for(const extra of [{BILLING_DATABASE_URL:'postgresql://billing:synthetic@127.0.0.1:54322/other'},{BILLING_WEB_URL:'http://web.example.test'},{BILLING_WEB_URL:'https://web.example.test/billing'},{BILLING_WEBHOOK_URL:'https://user:synthetic@api.example.test/webhook'}])assert.throws(()=>loadConfig({...base,...extra}));
  assert.equal(loadConfig({...base,BILLING_DATABASE_URL:'postgresql://asisteam_billing:synthetic@127.0.0.1:54322/postgres'}).BILLING_DATABASE_URL,'postgresql://asisteam_billing:synthetic@127.0.0.1:54322/postgres');
});
test('old receiver waits for persisted200, fails closed and forwards only signature fields',async()=>{
  let finish,seen;
  const relay=createBillingWebhookRelay('https://api.example.test/api/v1/billing/mercadopago-webhook',async(url,init)=>{seen={url,init};return new Promise(resolve=>{finish=resolve;});});
  const body='{"type":"payment","data":{"id":"123"}}';
  let complete=false;
  const pending=relay(new Request('https://old.example.test/webhook?data.id=123&untrusted=yes',{method:'POST',headers:{'x-signature':'synthetic-signature','x-request-id':'request-1',authorization:'Bearer must-not-forward'},body})).then(result=>{complete=true;return result;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(complete,false);assert.equal(new URL(seen.url).search,'?data.id=123');assert.equal(seen.init.body,body);assert.equal(seen.init.redirect,'error');assert.equal(seen.init.headers.has('authorization'),false);
  finish(new Response(null,{status:200}));assert.equal((await pending).status,200);
  for(const status of [202,302,400,500])assert.equal((await createBillingWebhookRelay('https://api.example.test/api/v1/billing/mercadopago-webhook',async()=>new Response('private diagnostics',{status}))(new Request('https://old.example.test/?data.id=123',{method:'POST',body}))).status,503);
  assert.equal((await createBillingWebhookRelay('http://evil.example.test/api/v1/billing/mercadopago-webhook')(new Request('https://old.example.test/?data.id=123',{method:'POST',body}))).status,503);
});
test('ambiguous repeated event IDs are rejected before signature acceptance',async()=>{
  assert.equal(await verifyMercadoPagoSignature(new Request('https://api.example.test/?data.id=123&data.id=456'),'synthetic'),false);
});
