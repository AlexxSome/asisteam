import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MajorityWorker, majorityText } from '../dist/worker.js';
import { loadConfig } from '../dist/config.js';
import { SafeLogger } from '../../api/dist/logger.js';

test('configuration fails closed and does not serialize secrets', () => {
  assert.throws(() => loadConfig({ DATABASE_URL: 'secret-invalid-url' }), { message: 'Configuración del worker inválida.' });
  assert.equal(loadConfig({DATABASE_URL:'postgresql://jobs:fixture@127.0.0.1/database'}).RESEND_API_KEY,undefined);
  assert.throws(() => loadConfig({ DATABASE_URL: 'https://example.test/db', RESEND_API_KEY:'secret',INVITATION_EMAIL_FROM:'fixture' }));
});
test('transition commits independently of failed provider and logs only numeric backlog', async () => {
  const calls=[], logs=[];
  const store={async call(op,values){calls.push([op,values]);if(op==='transition')return [{run_date:'2026-10-07',lease_token:'lease'}];if(op==='email')return [{delivery_id:'receipt',claim_token:'token',email:'private@example.test',full_name:'PRIVATE NAME',audience:'GUARDIAN'}];if(op==='payload')return [{payload:JSON.parse(values[2])}];if(op==='metrics')return [{metrics:{pending:1,blocked:0,retries:1,oldest_seconds:700,transition_overdue:false}}];return [{completed:true}];}};
  const email={payload(to,subject,text){return {from:'fixture',to:[to],subject,text};},async send(){throw new Error('secret-provider-response');}};
  await new MajorityWorker(store,email,new SafeLogger(line=>logs.push(line))).tick();
  assert.ok(calls.findIndex(([op])=>op==='complete')<calls.findIndex(([op])=>op==='email'));
  assert.equal(calls.find(([op])=>op==='finish')[1][2],false);
  assert.ok(logs.some(line=>line.includes('worker_backlog')));
  for(const value of ['private@example.test','PRIVATE NAME','secret-provider-response','token'])assert.ok(!logs.join().includes(value));
});
test('reclaimed task uses persisted payload and provider key and awaits durable preparation', async () => {
  const payload={from:'fixture',to:['original@example.test'],subject:'Fixed',text:'Fixed'},calls=[];
  const store={async call(op,values){calls.push(op);if(op==='email')return [{delivery_id:'receipt',claim_token:'new-token',payload}];if(op==='payload'){assert.deepEqual(JSON.parse(values[2]),payload);return [{payload}];}if(op==='metrics')return [];return [];}};
  let sent=0;
  const email={payload(){throw new Error('must use snapshot');},async send(body,key){assert.deepEqual(body,payload);assert.equal(key,'guardianship-majority-receipt');assert.equal(calls.at(-1),'payload');sent++;}};
  await new MajorityWorker(store,email,new SafeLogger(()=>{})).tick();assert.equal(sent,1);
});
test('expired lease with null prepared payload never contacts provider',async()=>{
  let sends=0;const store={async call(op){if(op==='email')return [{delivery_id:'receipt',claim_token:'expired',payload:{text:'fixture'}}];return [];}};
  await new MajorityWorker(store,{async send(){sends++;}},new SafeLogger(()=>{})).tick();assert.equal(sends,0);
});
test('canonical email audiences preserve Spanish instructions',()=>{
  assert.match(majorityText('ATHLETE','fixture'),/Cumpliste 18 años/);assert.match(majorityText('GUARDIAN','fixture'),/dejó de aparecer/);assert.match(majorityText('ADMIN','fixture'),/cuenta gestionada/);
});
