import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiClient } from '../dist/index.js';
const groupId='58000000-0000-4000-8000-000000000201',activityId='58000000-0000-4000-8000-000000000501';
const settings={opens_before_minutes:15,closes_after_minutes:60,late_after_minutes:10};
const input={activity_id:activityId,token:'a'.repeat(64)};
test('QR SDK: no-store, body-only token, strict actor and response, no retries',async()=>{
 const requests=[];let response=settings;
 const client=new ApiClient({origin:'http://127.0.0.1:3001',accessToken:async()=>'synthetic-session',fetch:async(url,options)=>{requests.push({url:new URL(url),options});return Response.json(response);}});
 await client.getQrSettings({params:{groupId}});await client.setQrSettings({params:{groupId},body:settings});
 response={...input,server_time:'2026-10-08T12:00:00Z',expires_at:'2026-10-08T12:01:00Z'};await client.issueCheckinQr({params:{activityId}});
 response={activity_id:activityId,group_id:groupId,activity_title:'Sintética',status:'PRESENT',recorded_at:'2026-10-08T12:00:00Z',created:true};await client.selfCheckin({body:input});
 assert.deepEqual(requests.map(r=>r.options.method),['GET','PUT','POST','POST']);assert.ok(requests.every(r=>r.options.cache==='no-store'&&!r.url.search&&!r.url.hash&&!r.url.href.includes(input.token)));
 assert.deepEqual(JSON.parse(requests[3].options.body),input);
 await assert.rejects(client.selfCheckin({body:{...input,user_id:groupId}}),{status:400});assert.equal(requests.length,4);
 response={...response,note:'private'};await assert.rejects(client.selfCheckin({body:input}),{status:502});assert.equal(requests.length,5);
});
