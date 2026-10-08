import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
const execute=promisify(execFile),secret=randomUUID(),container='asisteam-worker-smoke-'+randomUUID(),dir=await mkdtemp(join(tmpdir(),'asisteam-worker157-'));
const db=new pg.Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:54322/postgres'});await db.connect();
const previous=(await db.query("select rolcanlogin,rolpassword from pg_authid where rolname='asisteam_jobs'")).rows[0];
const image=process.env.WORKER_IMAGE??'asisteam-worker:issue157';
assert.match(image,/^asisteam-worker:[a-z0-9][a-z0-9.-]{0,64}$/);
let started=false;
try {
  await db.query("alter role asisteam_jobs login password '"+secret+"'");
  const hostname=process.platform==='linux'?'127.0.0.1':'host.docker.internal';
  await writeFile(join(dir,'worker.env'),'DATABASE_URL=postgresql://asisteam_jobs:'+secret+'@'+hostname+':54322/postgres\n',{mode:0o600});
  await execute('docker',['run','-d','--name',container,'--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--env-file',join(dir,'worker.env'),...(process.platform==='linux'?['--network','host']:[]),image]);started=true;
  let active=false;
  for(let n=0;n<40;n++) {
    const logs=(await execute('docker',['logs',container])).stdout;
    assert.ok(!logs.includes(secret));assert.ok(!logs.includes('@example.test'));
    if((logs.includes('worker_tick')||logs.includes('worker_backlog'))&&(logs.includes('push_tick')||logs.includes('push_backlog'))){active=true;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(active,'container connects with the minimum jobs role');
  await execute('docker',['stop','--time','20',container]);
  assert.equal((await execute('docker',['inspect',container,'--format','{{.State.ExitCode}}'])).stdout.trim(),'0');
  assert.ok((await execute('docker',['logs',container])).stdout.includes('runtime_stopped'));
  console.log(JSON.stringify({check:'worker-container-postgres-sigterm',status:'PASS'}));
} finally {
  if(started)await execute('docker',['rm','-f',container]);
  const old=previous.rolpassword===null?'null':"'"+previous.rolpassword.replaceAll("'","''")+"'";await db.query('alter role asisteam_jobs '+(previous.rolcanlogin?'login':'nologin')+' password '+old);await db.end();await rm(dir,{recursive:true,force:true});
}
