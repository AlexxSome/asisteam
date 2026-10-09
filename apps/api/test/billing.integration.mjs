import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, createHmac } from 'node:crypto';
import pg from 'pg';
import { createApplication } from './legacy-application.mjs';
import { loadConfig } from './legacy-application.mjs';
import { SafeLogger } from '../dist/logger.js';
import { authFixture } from './auth-fixture.mjs';
import { ApiClient } from '../../../packages/api-client/dist/index.js';
import { createBillingWebhookRelay } from '../../../packages/core/dist/index.js';

test('MIG-14 SQL + HTTP: exclusive billing, concurrency, uncertain creation, signatures, replay, persistence and old URL', {skip:process.env.API_RLS_TEST!=='1'},async()=>{
  const db=new pg.Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:54322/postgres'});await db.connect();
  const previous=(await db.query("select rolname,rolcanlogin,rolpassword from pg_authid where rolname in ('asisteam_api','asisteam_billing')")).rows;
  const mode=(await db.query('select mode from app_private.billing_transport')).rows[0].mode;
  const auth=Array.from({length:5},()=>randomUUID()),sessions=auth.map(()=>randomUUID()),profiles=[],groups=Array.from({length:3},()=>randomUUID()),password=randomUUID(),secret='synthetic-billing-secret',logs=[];
  let app,fixture,remote,creates=0,uncertain=false,paymentStatus='pending',modified=Date.now(), invoices=[],failPersist=false,paymentCalls=0;
  const realFetch=globalThis.fetch;
  try{
    fixture=await authFixture();
    for(const role of ['asisteam_api','asisteam_billing'])await db.query('alter role '+role+" login password '"+password+"'");
    for(const [i,id] of auth.entries()){
      await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,'mig158-'+id+'@example.test',JSON.stringify({full_name:'Billing sintético',birthdate:'1990-01-01'})]);
      profiles.push((await db.query('select id from public.users where auth_user_id=$1',[id])).rows[0].id);
      await db.query("insert into auth.sessions(id,user_id,created_at,not_after) values($1,$2,now(),now()+interval '1 hour')",[sessions[i],id]);
      await db.query("insert into public.account_consents(user_id,terms_version,channel) values($1,'2026-09-21','IN_APP')",[profiles[i]]);
    }
    for(const [i,id] of groups.entries())await db.query("insert into public.groups(id,name,invite_code,created_by) values($1,'Club sintético',$2,$3)",[id,randomUUID().replaceAll('-','').slice(0,8),profiles[i===0?0:3]]);
    for(const [i,g,role] of [[0,0,'ADMIN'],[1,0,'COACH'],[2,0,'GUARDIAN'],[3,1,'ADMIN'],[3,2,'ADMIN']])await db.query("insert into public.memberships(user_id,group_id,role,status) values($1,$2,$3,'ACTIVE')",[profiles[i],groups[g],role]);
    globalThis.fetch=async(input,options)=>{
      const url=new URL(String(input));
      if(url.origin!=='https://api.mercadopago.com')return realFetch(input,options);
      assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer synthetic-token');
      const date=new Date(modified).toISOString();
      if(url.pathname==='/preapproval'&&options.method==='POST'){
        creates++;const body=JSON.parse(options.body);
        assert.equal(body.auto_recurring.transaction_amount,4990);assert.equal(body.auto_recurring.currency_id,'CLP');assert.equal(body.notification_url,'https://billing.example.test/api/v1/billing/mercadopago-webhook');
        remote={id:'mig158-'+randomUUID(),external_reference:body.external_reference,collector_id:'123',status:'pending',last_modified:date,auto_recurring:body.auto_recurring,init_point:'https://www.mercadopago.cl/subscriptions/checkout?preapproval_id=synthetic'};
        await new Promise(resolve=>setTimeout(resolve,80));
        if(uncertain)throw new Error('simulated lost response');return Response.json(remote);
      }
      if(url.pathname==='/preapproval/search')return Response.json({results:remote?[remote]:[]});
      if(url.pathname.startsWith('/preapproval/')){
        if(options.method==='PUT'){remote={...remote,status:'cancelled',last_modified:date};return Response.json(remote);}
        if(failPersist)await db.query("update app_private.billing_transport set mode='LEGACY'");
        return Response.json(remote);
      }
      if(url.pathname==='/authorized_payments/search')return Response.json({paging:{total:invoices.length},results:invoices.slice(Number(url.searchParams.get('offset')),Number(url.searchParams.get('offset'))+100)});
      if(url.pathname.startsWith('/authorized_payments/'))return Response.json(invoices.find(item=>item.id===url.pathname.split('/').at(-1)));
      if(url.pathname.startsWith('/v1/payments/')){paymentCalls++;return Response.json({id:url.pathname.split('/').at(-1),collector_id:'123',transaction_amount:4990,currency_id:'CLP',status:paymentStatus,date_approved:paymentStatus==='approved'?date:null,date_last_updated:date});}
      throw new Error('unexpected fixed API resource');
    };
    app=await createApplication(loadConfig({DATABASE_URL:'postgresql://asisteam_api:'+password+'@127.0.0.1:54322/postgres',BILLING_DATABASE_URL:'postgresql://asisteam_billing:'+password+'@127.0.0.1:54322/postgres',SUPABASE_AUTH_URL:fixture.issuer,SUPABASE_AUTH_PUBLIC_KEY:'sb_publishable_synthetic',MERCADOPAGO_ACCESS_TOKEN:'synthetic-token',MERCADOPAGO_WEBHOOK_SECRET:secret,MERCADOPAGO_COLLECTOR_ID:'123',BILLING_WEB_URL:'https://web.example.test',BILLING_WEBHOOK_URL:'https://billing.example.test/api/v1/billing/mercadopago-webhook',HTTP_TIMEOUT_MS:'60000'}),new SafeLogger(line=>logs.push(line)));
    await app.listen(0,'127.0.0.1');const origin=await app.getUrl(),tokens=await Promise.all(auth.map((id,i)=>fixture.token(id,sessions[i]))),clients=tokens.map(token=>new ApiClient({origin,accessToken:async()=>token,timeoutMs:60000}));
    const body={action:'checkout',group_id:groups[0],plan_code:'TEAM',payer_email:'synthetic-payer@example.test'},params={groupId:groups[0]};
    for(const i of [1,2])await assert.rejects(clients[i].getGroupBilling({params}),{status:403});
    await assert.rejects(clients[3].getGroupBilling({params}),{status:404});
    await assert.rejects(clients[4].manageSubscription({body}),{status:404});
    await db.query("update app_private.billing_transport set mode='LEGACY'");
    await assert.rejects(clients[0].manageSubscription({body}),{status:503});assert.equal(creates,0);
    await db.query('select app_private.billing_handoff(true)');
    const legacy=new pg.Client({connectionString:'postgresql://asisteam_billing:'+password+'@127.0.0.1:54322/postgres'});await legacy.connect();
    try{await assert.rejects(legacy.query('select public.claim_subscription_creation($1)',[groups[0]]),error=>error.code==='42501');await assert.rejects(legacy.query('select * from public.group_subscriptions'),error=>error.code==='42501');}finally{await legacy.end();}
    // Service role cannot execute the old effect path after the handoff.
    await db.query('begin');await db.query('set local role service_role');
    await assert.rejects(db.query('select public.begin_subscription_checkout($1,$2,$3)',[groups[0],auth[0],'TEAM']),error=>error.code==='PT503');await db.query('rollback');
    uncertain=true;
    const concurrent=await Promise.allSettled([clients[0].manageSubscription({body}),clients[0].manageSubscription({body})]);assert.equal(creates,1);assert.ok(concurrent.some(item=>item.status==='rejected'&&item.reason.status===409));
    uncertain=false;await clients[0].manageSubscription({body});assert.equal(creates,1);assert.equal((await clients[0].getGroupBilling({params})).athlete_limit,0);
    remote={...remote,status:'authorized',last_modified:new Date(++modified).toISOString()};await clients[0].manageSubscription({body:{action:'sync',group_id:groups[0]}});assert.equal((await clients[0].getGroupBilling({params})).athlete_limit,0);
    invoices=[{id:'158001',preapproval_id:remote.id,transaction_amount:4990,currency_id:'CLP',debit_date:'2026-01-01T12:00:00Z',last_modified:new Date(modified).toISOString(),status:'scheduled',payment:{id:'158101'}}];
    const signed=(id,type='subscription_authorized_payment',timestamp=Date.now(),sigSecret=secret,bodyId=id)=>{
      const ts=String(timestamp),requestId='mig158-request',signature=createHmac('sha256',sigSecret).update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');
      return new Request('https://old.example.test/functions/v1/mercadopago-webhook?data.id='+id,{method:'POST',headers:{'x-signature':`ts=${ts},v1=${signature}`,'x-request-id':requestId},body:JSON.stringify({type,data:{id:bodyId},status:'approved'})});
    };
    const send=async request=>realFetch(origin+'/api/v1/billing/mercadopago-webhook'+new URL(request.url).search,{method:'POST',headers:{'content-type':'application/json','x-signature':request.headers.get('x-signature'),'x-request-id':request.headers.get('x-request-id')},body:await request.text()});
    assert.equal((await send(signed('158001','subscription_authorized_payment',Date.now()-660000))).status,401);
    assert.equal((await send(signed('158001','subscription_authorized_payment',Date.now(),'wrong'))).status,401);
    assert.equal((await send(signed('158001','subscription_authorized_payment',Date.now(),secret,'other'))).status,400);
    assert.equal((await send(signed('158001'))).status,200);assert.ok(paymentCalls>0);assert.equal((await clients[0].getGroupBilling({params})).invoices[0].status,'OVERDUE');
    paymentStatus='approved';modified++;
    const relay=createBillingWebhookRelay('https://new.example.test/api/v1/billing/mercadopago-webhook',async(url,opts)=>realFetch(origin+new URL(url).pathname+new URL(url).search,opts));
    assert.equal((await relay(signed('158001'))).status,200);
    const paid=await clients[0].getGroupBilling({params});assert.equal(paid.athlete_limit,50);assert.equal(paid.invoices[0].status,'PAID');assert.ok(!/provider_subscription_id|payer|collector|email/.test(JSON.stringify(paid)));
    assert.equal((await send(signed('158001'))).status,200);assert.equal((await clients[0].getGroupBilling({params})).total_invoices,1);
    // An old event cannot regress the ledger; reversed payment retains paid capacity/history.
    paymentStatus='pending';modified-=1000;assert.equal((await send(signed('158001'))).status,200);assert.equal((await clients[0].getGroupBilling({params})).invoices[0].status,'PAID');
    paymentStatus='charged_back';modified+=2000;assert.equal((await relay(signed('158001'))).status,200);assert.equal((await clients[0].getGroupBilling({params})).invoices[0].status,'REFUNDED');assert.equal((await clients[0].getGroupBilling({params})).athlete_limit,50);
    // Pages of100 reconcile entirely through the fixed provider API; ledger view pages50.
    invoices=Array.from({length:101},(_,i)=>({...invoices[0],id:String(1581000+i),payment:null,last_modified:new Date(modified).toISOString()}));
    await clients[0].manageSubscription({body:{action:'sync',group_id:groups[0]}});const summary=await clients[0].getGroupBilling({params});assert.equal(summary.total_invoices,102);assert.equal(summary.invoices.length,50);assert.equal((await clients[0].getGroupBilling({params,query:{page:3}})).invoices.length,2);
    invoices=[];modified++;await clients[0].manageSubscription({body:{action:'cancel',group_id:groups[0]}});assert.equal((await clients[0].getGroupBilling({params})).subscription.status,'CANCELLED');assert.equal((await clients[0].getGroupBilling({params})).athlete_limit,50);
    remote={...remote,status:'authorized',last_modified:new Date(++modified).toISOString()};assert.equal((await send(signed(remote.id,'subscription_preapproval'))).status,200);assert.equal((await clients[0].getGroupBilling({params})).subscription.status,'CANCELLED');
    failPersist=true;assert.equal((await relay(signed(remote.id,'subscription_preapproval'))).status,503);failPersist=false;
    await db.query("update app_private.billing_transport set mode='NEST'");
    assert.equal((await send(signed('158999','payment'))).status,503);
    const spoof=await realFetch(origin+'/api/v1/billing/subscriptions',{method:'POST',headers:{authorization:'Bearer '+tokens[0],'content-type':'application/json'},body:JSON.stringify({...body,amount_clp:1,actor:auth[3]})});assert.equal(spoof.status,400);
    for(const token of tokens)assert.ok(!logs.join('\n').includes(token));assert.ok(!logs.join('\n').includes(password));assert.ok(!logs.join('\n').includes(body.payer_email));assert.ok(!logs.join('\n').includes(secret));
  }finally{
    globalThis.fetch=realFetch;if(app)await app.close();if(fixture)await fixture.close();
    await db.query('update app_private.billing_transport set mode=$1',[mode]);
    await db.query("set session_replication_role='replica'");
    try{
      await db.query('delete from public.subscription_invoices where subscription_id in(select id from public.group_subscriptions where group_id=any($1::uuid[]))',[groups]);
      await db.query('delete from public.group_subscriptions where group_id=any($1::uuid[])',[groups]);
      await db.query('delete from public.memberships where group_id=any($1::uuid[])',[groups]);await db.query('delete from public.groups where id=any($1::uuid[])',[groups]);
      await db.query('delete from public.account_consents where user_id=any($1::uuid[])',[profiles]);await db.query('delete from public.users where id=any($1::uuid[])',[profiles]);
      await db.query('delete from auth.sessions where user_id=any($1::uuid[])',[auth]);await db.query('delete from auth.users where id=any($1::uuid[])',[auth]);
      for(const row of previous)await db.query('alter role '+row.rolname+' '+(row.rolcanlogin?'login':'nologin')+' password '+(row.rolpassword===null?'null':"'"+row.rolpassword.replaceAll("'","''")+"'"));
    }finally{await db.query("set session_replication_role='origin'");await db.end();}
  }
});
