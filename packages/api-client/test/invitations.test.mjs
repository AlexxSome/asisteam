import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ApiClient } from '../dist/index.js';
test('MIG09 proxy metadata, public request, strict projection and no replay retry',async()=>{
  let count=0;
  const api=new ApiClient({origin:'http://127.0.0.1:3001',invitationProxy:{secret:'synthetic-secret',clientIp:'synthetic-ip'},fetch:async(url,init)=>{
    count++;assert.equal(url.pathname,'/api/v1/invitations/preview');assert.equal(url.search,'');assert.equal(init.headers['x-asisteam-proxy'],'synthetic-secret');assert.equal(init.headers['x-asisteam-client-ip'],'synthetic-ip');assert.equal(init.headers.authorization,undefined);assert.ok(JSON.parse(init.body).token);
    return new Response(JSON.stringify({group_name:'Grupo',role:'ATHLETE'}));
  }});
  assert.deepEqual(await api.previewInvitation({body:{token:'a'.repeat(32)}}),{group_name:'Grupo',role:'ATHLETE'});assert.equal(count,1);
  await assert.rejects(api.claimInvitation({body:{token:'a'.repeat(32),registration:{email:'synthetic@example.test',password:'synthetic-password',terms_accepted:true,terms_version:'2026-09-21',full_name:'Injected'}}}),{status:400});assert.equal(count,1);
  const absent=new ApiClient({origin:'http://127.0.0.1:3001',fetch:async()=>{throw new Error('must not fetch');}});await assert.rejects(absent.previewInvitation({body:{token:'a'.repeat(32)}}),{status:401});
  const failed=new ApiClient({origin:'http://127.0.0.1:3001',invitationProxy:{secret:'synthetic-secret',clientIp:'synthetic-ip'},fetch:async()=>{count++;return new Response(JSON.stringify({error:{code:'invitation_expired',message:'remote token and PII',details:{}}}),{status:410});}});
  await assert.rejects(failed.previewInvitation({body:{token:'a'.repeat(32)}}),error=>error.status===410&&error.error.code==='invitation_expired'&&!JSON.stringify(error).includes('remote token'));assert.equal(count,2);
});
