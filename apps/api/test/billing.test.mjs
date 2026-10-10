import assert from 'node:assert/strict';
import test from 'node:test';
import {createHmac,randomUUID} from 'node:crypto';
import { createMercadoPagoWebhookHandler, verifyMercadoPagoSignature } from '../../../packages/core/dist/index.js';
import { loadConfig } from '../dist/config.js';

test('billing config enforces same database and fixed HTTPS origins',()=>{
  const base={DATABASE_URL:'postgresql://asisteam_api:synthetic@127.0.0.1:54322/postgres'};
  for(const extra of [{BILLING_DATABASE_URL:'postgresql://billing:synthetic@127.0.0.1:54322/other'},{BILLING_WEB_URL:'http://web.example.test'},{BILLING_WEB_URL:'https://web.example.test/billing'},{BILLING_WEBHOOK_URL:'https://user:synthetic@api.example.test/webhook'}])assert.throws(()=>loadConfig({...base,...extra}));
  assert.equal(loadConfig({...base,BILLING_DATABASE_URL:'postgresql://asisteam_billing:synthetic@127.0.0.1:54322/postgres'}).BILLING_DATABASE_URL,'postgresql://asisteam_billing:synthetic@127.0.0.1:54322/postgres');
});
test('native webhook waits for durable sync and fails closed without exposing downstream errors',async()=>{
  const secret='synthetic-only-secret',id=randomUUID();
  const local={id,group_id:randomUUID(),plan_code:'TEAM',amount_clp:4990,athlete_limit:50,status:'PENDING',provider_subscription_id:'provider-1',checkout_url:null};
  const remote={id:'provider-1',external_reference:id,collector_id:'123',status:'authorized',last_modified:new Date().toISOString(),auto_recurring:{currency_id:'CLP',transaction_amount:4990,frequency:1,frequency_type:'months'}};
  const request=()=>{
    const ts=String(Date.now()),requestId='synthetic-request',signature=createHmac('sha256',secret).update(`id:provider-1;request-id:${requestId};ts:${ts};`).digest('hex');
    return new Request('https://api.example.test/api/v1/billing/mercadopago-webhook?data.id=provider-1',{method:'POST',headers:{'x-signature':`ts=${ts},v1=${signature}`,'x-request-id':requestId},body:JSON.stringify({type:'subscription_preapproval',data:{id:'provider-1'}})});
  };
  let finish,complete=false;
  const options={client:{auth:{getUser:async()=>({data:{user:null},error:null})},rpc:async name=>name==='lookup_billing_subscription'?{data:local,error:null}:new Promise(resolve=>{finish=resolve})},provider:{subscription:async()=>remote},collectorId:'123',webUrl:'https://web.example.test',webhookUrl:'https://api.example.test/api/v1/billing/mercadopago-webhook',webhookSecret:secret,allowedOrigins:[],enabled:true};
  const pending=createMercadoPagoWebhookHandler(options)(request()).then(response=>{complete=true;return response});
  for(let attempt=0;!finish&&attempt<100;attempt++)await new Promise(resolve=>setImmediate(resolve));
  assert.ok(finish);assert.equal(complete,false);
  finish({data:null,error:null});assert.equal((await pending).status,200);
  options.client.rpc=async name=>name==='lookup_billing_subscription'?{data:local,error:null}:{data:null,error:{message:'private database diagnostics'}};
  const failed=await createMercadoPagoWebhookHandler(options)(request());assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('private database diagnostics'));
});
test('ambiguous repeated event IDs are rejected before signature acceptance',async()=>{
  assert.equal(await verifyMercadoPagoSignature(new Request('https://api.example.test/?data.id=123&data.id=456'),'synthetic'),false);
});
