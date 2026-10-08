import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CreateBucketCommand } from '@aws-sdk/client-s3';
import { AvatarStorage } from '../dist/storage.js';
import { loadConfig } from '../dist/config.js';
export async function storageFixture() {
  const name='asisteam-mig161-'+randomUUID(), directory=mkdtempSync(join(tmpdir(),'mig161-'));
  const key='synthetic-'+randomUUID(), secret=randomUUID()+randomUUID();
  const env=join(directory,'env');writeFileSync(env,`MINIO_ROOT_USER=${key}\nMINIO_ROOT_PASSWORD=${secret}\n`,{mode:0o600});
  const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  let created=false;
  const stop=()=>{try{if(created){docker('rm','-f','-v',name);created=false;}}finally{rmSync(directory,{recursive:true,force:true});}};
  try {
    docker('run','-d','--name',name,'--env-file',env,'-p','127.0.0.1::9000','asisteam-storage-fixture:161','server','/data');created=true;
    const port=docker('port',name,'9000/tcp').split(':').at(-1), endpoint='http://127.0.0.1:'+port;
    const deadline=Date.now()+30000;let ready=false;
    while(Date.now()<deadline){try{ready=(await fetch(endpoint+'/minio/health/ready')).ok;}catch{/* Startup may still be pending. */}if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));}
    if(!ready)throw new Error('Storage sintético no disponible.');
    const config={S3_LOCAL_POLICY_ONLY:'1',S3_ENDPOINT:endpoint,S3_AVATAR_BUCKET:'synthetic-avatars',S3_ACCESS_KEY_ID:key,S3_SECRET_ACCESS_KEY:secret,S3_REGION:'us-east-1'};
    const storage=new AvatarStorage(loadConfig({DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:54322/postgres',...config}));
    await storage.client.send(new CreateBucketCommand({Bucket:storage.bucket}));
    return {config,storage,stop};
  } catch(error){stop();throw error;}
}
