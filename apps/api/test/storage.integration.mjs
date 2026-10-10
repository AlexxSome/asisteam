import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {createApplication} from '../dist/application.js';
import {loadFixtureConfig as loadConfig,fixtureConnection} from './fixture-config.mjs';
import { SafeLogger } from '../dist/logger.js';
import { authFixture } from './auth-fixture.mjs';
import { ApiClient } from '../../../packages/api-client/dist/index.js';

import { storageFixture } from './storage-fixture.mjs';
import { PutObjectCommand, PutBucketPolicyCommand, DeleteBucketPolicyCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { sha256 } from '../dist/storage.js';
import { reconcile, avatarReference } from '../../../scripts/migration/storage/reconcile.mjs';
import { mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const enabled=process.env.API_RLS_TEST==='1';
test('MIG-17 real private S3/HTTP/Postgres: own and authorized avatars, roles/tenant, consent/revocation, validation and signed expiry', {skip:!enabled},async()=>{
  const admin = new pg.Client({ connectionString: fixtureConnection() });
  await admin.connect();
  const fixture = await authFixture();
  const s3 = await storageFixture();
  const auth = Array.from({ length: 7 }, () => randomUUID()), sessions = auth.map(() => randomUUID());
  const groupIds = [randomUUID(),randomUUID()], profiles = [];
  const rolePassword = randomUUID();
  const previous = (await admin.query("select rolcanlogin,rolpassword from pg_authid where rolname='asisteam_api'")).rows[0];
  let app, guardianship;
  const created = [];
  const logs = [];
  try {
    await admin.query("alter role asisteam_api login password '"+rolePassword+"'");
    for (const [i,id] of auth.entries()) {
      await admin.query("with subject as (insert into app_private.auth_subjects(id,email,native_owned) values($1,$2,true) returning id) insert into public.users(auth_user_id,email,full_name,birthdate,account_status) select id,$2,($3::jsonb->>'full_name'),($3::jsonb->>'birthdate')::date,'ACTIVE' from subject", [id,'mig161-'+id+'@example.test',JSON.stringify({ full_name:'Persona sintética '+i,birthdate:i===3?'2014-01-01':'1990-01-01' })]);
      profiles.push((await admin.query('select id from public.users where auth_user_id=$1',[id])).rows[0].id);
      await admin.query("insert into app_private.auth_families(id,subject_id,created_at,expires_at) values($1,$2,now(),now()+interval '1 hour')",[sessions[i],id]);
      if(i!==6)await admin.query("insert into public.account_consents(user_id,terms_version,channel) values($1,'2026-09-21','IN_APP')",[profiles[i]]);
    }
    for(const [i,id] of groupIds.entries()) {
      await admin.query('insert into public.groups(id,name,sport,invite_code,created_by) values($1,$2,$3,$4,$5)',[id,'Grupo sintético '+i,'Tenis',randomUUID().replaceAll('-','').slice(0,8),profiles[i===0?0:5]]);
      await admin.query('insert into app_private.billing_legacy_groups(group_id) values($1)',[id]);
    }
    guardianship=(await admin.query("insert into public.guardianships(guardian_user_id,athlete_user_id,relationship) values($1,$2,'Apoderado') returning id",[profiles[2],profiles[3]])).rows[0].id;
    await admin.query("insert into public.consents(guardianship_id,consent_type,terms_version,allows_avatar) values($1,'DATA_PROCESSING_MINOR','synthetic',false)",[guardianship]);
    for (const [i,g,role] of [[0,0,'ADMIN'],[0,0,'ATHLETE'],[1,0,'ATHLETE'],[3,0,'ATHLETE'],[4,0,'COACH'],[5,1,'ADMIN']]) await admin.query("insert into public.memberships(user_id,group_id,role,status,joined_at) values($1,$2,$3,'ACTIVE',now())",[profiles[i],groupIds[g],role]);
    app=await createApplication(loadConfig({ DATABASE_URL:fixtureConnection('asisteam_api',rolePassword),PG_POOL_MAX:'1',...s3.config }),new SafeLogger(line=>logs.push(line)));
    await app.listen(0,'127.0.0.1');
    const origin=await app.getUrl(),tokens=await Promise.all(auth.map((id,i)=>fixture.token(id,sessions[i])));
    const clients=tokens.map(token=>new ApiClient({origin,accessToken:async()=>token}));
    const request=(i,path,method='GET',body)=>fetch(origin+path,{method,headers:{authorization:'Bearer '+tokens[i],...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6rGQAAAAASUVORK5CYII=','base64');
    const upload=i=>clients[i].uploadAvatar({body:{type:'image/png',content_base64:png.toString('base64')}});
    const keyOf=async i=>(await admin.query('select avatar_url from public.users where id=$1',[profiles[i]])).rows[0].avatar_url.slice('/profile/avatar/'.length);
    const paramsOf=key=>({ownerId:key.split('/')[0],fileName:key.split('/')[1]});
    const download=(i,key)=>clients[i].getAvatar({params:paramsOf(key)});
    await upload(1);let key=await keyOf(1);
    assert.equal((await download(1,key)).content_base64,png.toString('base64'));
    for(const i of [0,4])assert.equal((await download(i,key)).content_base64,png.toString('base64'));
    for(const i of [2,3,5])await assert.rejects(download(i,key),{status:404});
    await clients[0].updateGroupSettings({params:{groupId:groupIds[0]},body:{athletes_can_view_group_stats:true}});
    assert.equal((await download(3,key)).type,'image/png');
    await upload(1);const newer=await keyOf(1);assert.notEqual(newer,key);
    await assert.rejects(download(0,key),{status:404}); // Retained old object cannot be enumerated by another user.
    assert.equal((await download(1,key)).type,'image/png');
    key=newer;
    await assert.rejects(upload(3),error=>error.status===422&&error.error.code==='avatar_consent_required');
    await clients[2].setAvatarPermission({params:{guardianshipId:guardianship},body:{allow:true}});
    await upload(3);const minorKey=await keyOf(3);
    for(const i of [0,2,3,4])assert.equal((await download(i,minorKey)).type,'image/png');
    await assert.rejects(download(5,minorKey),{status:404});
    await clients[2].setAvatarPermission({params:{guardianshipId:guardianship},body:{allow:false}});
    for(const i of [0,2,3,4])await assert.rejects(download(i,minorKey),{status:404});
    assert.equal((await fetch(origin+'/api/v1/avatars/'+key)).status,401);
    await assert.rejects(upload(6),{status:403});
    for(const data of [{type:'image/png',content_base64:png.toString('base64'),ownerId:auth[5]},
      {type:'image/jpeg',content_base64:png.toString('base64')},
      {type:'image/png',content_base64:Buffer.alloc(2097153).toString('base64')},
      {type:'image/png',content_base64:'broken!'}])assert.equal((await request(1,'/api/v1/me/avatar','POST',data)).status,400);
    assert.equal((await request(1,'/api/v1/avatars/'+auth[1]+'/invalid.png')).status,404);
    const signed=await s3.storage.signedRead(key);assert.equal((await fetch(signed)).status,200);
    const expired=await s3.storage.signedRead(key,1,new Date(Date.now()-60000));assert.equal((await fetch(expired)).status,403);
    const anonymous=new URL(signed);anonymous.search='';assert.equal((await fetch(anonymous)).status,403);
    await assert.rejects(s3.storage.signedRead(key,31));
    const corrupt=auth[1]+'/'+randomUUID()+'.png';
    await s3.storage.client.send(new PutObjectCommand({Bucket:s3.storage.bucket,Key:corrupt,Body:png,ContentType:'image/png',Metadata:{sha256:'0'.repeat(64)}}));
    await assert.rejects(s3.storage.read(corrupt),{message:'avatar_checksum_mismatch'});
    await admin.query("update public.memberships set status='INACTIVE' where user_id=$1 and group_id=$2 and role='COACH'",[profiles[4],groupIds[0]]);
    await assert.rejects(download(4,key),{status:404});
    await s3.storage.client.send(new PutBucketPolicyCommand({Bucket:s3.storage.bucket,Policy:JSON.stringify({Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:'*',Action:['s3:GetObject'],Resource:['arn:aws:s3:::'+s3.storage.bucket+'/*']}]})}));
    await assert.rejects(upload(1),{status:503}); // Bucket misconfiguration fails before a new object is written.
    await assert.rejects(download(1,key),{status:404});
    await s3.storage.client.send(new DeleteBucketPolicyCommand({Bucket:s3.storage.bucket}));
    // A denied profile commit leaves an unreferenced private object for
    // reconciliation. Never delete a possibly committed object from the client.
    const listing=()=>s3.storage.client.send(new ListObjectsV2Command({Bucket:s3.storage.bucket,Prefix:auth[1]+'/'}));
    const beforeKeys=new Set((await listing()).Contents.map(row=>row.Key));
    const oldReference=(await admin.query('select avatar_url from public.users where id=$1',[profiles[1]])).rows[0].avatar_url;
    await admin.query("create function public.synthetic_avatar_commit_denied() returns trigger language plpgsql as $$ begin raise exception 'avatar_consent_required' using errcode='PT422'; end $$");
    await admin.query("create trigger synthetic_avatar_commit_denied before update of avatar_url on public.users for each row when (new.id='"+profiles[1]+"'::uuid) execute function public.synthetic_avatar_commit_denied()");
    try {
      await assert.rejects(upload(1),error=>error.status===422&&error.error.code==='avatar_consent_required');
      assert.equal((await admin.query('select avatar_url from public.users where id=$1',[profiles[1]])).rows[0].avatar_url,oldReference);
      const orphan=(await listing()).Contents.map(row=>row.Key).filter(value=>!beforeKeys.has(value));
      assert.equal(orphan.length,1);
      for(const i of [0,2,3,4,5])await assert.rejects(download(i,orphan[0]),{status:404});
      const orphanSigned=await s3.storage.signedRead(orphan[0]),orphanAnonymous=new URL(orphanSigned);orphanAnonymous.search='';
      assert.equal((await fetch(orphanAnonymous)).status,403);
    } finally {
      await admin.query('drop trigger synthetic_avatar_commit_denied on public.users');
      await admin.query('drop function public.synthetic_avatar_commit_denied()');
    }
    for(const token of tokens)assert.ok(!logs.join('\n').includes(token));assert.ok(!logs.join('\n').includes(s3.config.S3_SECRET_ACCESS_KEY));
    assert.ok(!logs.join('\n').includes(key));
  } finally {
    if(app)await app.close();await fixture.close();s3.storage.client.destroy();s3.stop();
    const ownedGroups=[...groupIds,...created];
    await admin.query("set session_replication_role='replica'");
    try {
      await admin.query('delete from public.birthdate_change_approvals where request_id in (select id from public.birthdate_change_requests where user_id=any($1::uuid[]))',[profiles]);
      await admin.query('delete from public.birthdate_change_requests where user_id=any($1::uuid[])',[profiles]);
      await admin.query('delete from public.consents where guardianship_id=$1',[guardianship??randomUUID()]);
      await admin.query('delete from public.guardianships where guardian_user_id=any($1::uuid[])',[profiles]);
      await admin.query('delete from public.memberships where group_id=any($1::uuid[])',[ownedGroups]);
      await admin.query('delete from app_private.billing_legacy_groups where group_id=any($1::uuid[])',[ownedGroups]);
      await admin.query('delete from public.groups where id=any($1::uuid[])',[ownedGroups]);
      await admin.query('delete from app_private.join_code_attempts where user_id=any($1::uuid[])',[profiles]);
      await admin.query('delete from public.account_consents where user_id=any($1::uuid[])',[profiles]);
      await admin.query('delete from public.users where id=any($1::uuid[])',[profiles]);
      await admin.query('delete from app_private.auth_families where subject_id=any($1::uuid[])',[auth]);
      await admin.query('delete from app_private.auth_subjects where id=any($1::uuid[])',[auth]);
      const oldPassword=previous.rolpassword===null?'null':"'"+previous.rolpassword.replaceAll("'","''")+"'";
      await admin.query('alter role asisteam_api '+(previous.rolcanlogin?'login':'nologin')+' password '+oldPassword);
    } finally { await admin.query("set session_replication_role='origin'");await admin.end(); }
  }
});

test('private S3 copy, final snapshot delta and forward recovery reconcile private manifests/checksums', {skip:!enabled},async()=>{
  const database=new pg.Client({connectionString:fixtureConnection()});await database.connect();
  const s3=await storageFixture(), source=await storageFixture(), auth=randomUUID(), keys=[],directory=mkdtempSync(join(tmpdir(),'mig161-manifest-'));
  let profile;
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6rGQAAAAASUVORK5CYII=','base64');
  const options={database,storage:s3.storage,source:source.storage,scope:[auth]};
  const addSource=async()=>{const key=auth+'/'+randomUUID()+'.png';keys.push(key);await source.storage.put(key,png,'image/png');return key;};
  try{
    await database.query("with subject as (insert into app_private.auth_subjects(id,email,native_owned) values($1,$2,true) returning id) insert into public.users(auth_user_id,email,full_name,birthdate,account_status) select id,$2,($3::jsonb->>'full_name'),($3::jsonb->>'birthdate')::date,'ACTIVE' from subject",[auth,'mig161-copy-'+auth+'@example.test',JSON.stringify({full_name:'Persona sintética copia',birthdate:'1990-01-01'})]);
    profile=(await database.query('select id from public.users where auth_user_id=$1',[auth])).rows[0].id;
    for(let n=0;n<3;n++)await addSource();
    await database.query('update public.users set avatar_url=$1 where id=$2',['/profile/avatar/'+keys[0],profile]);
    const manifestPath=join(directory,'initial.json');
    let result=await reconcile({...options,manifestPath}).catch(error=>{throw new Error('initial-copy',{cause:error});});assert.equal(result.objects,3);assert.equal(result.checksums,true);assert.equal((await database.query('select avatar_url from public.users where id=$1',[profile])).rows[0].avatar_url,'/profile/avatar/'+keys[0]);
    assert.equal(statSync(manifestPath).mode&0o777,0o600);assert.equal(statSync(directory).mode&0o777,0o700);
    const manifest=JSON.parse(readFileSync(manifestPath));assert.equal(manifest.objects[0].owner_profile_id,profile);assert.ok(manifest.objects.every(row=>row.sha256===sha256(png)&&row.bytes===png.length&&row.type==='image/png'));
    const late=await addSource();await database.query('update public.users set avatar_url=$1 where id=$2',['/profile/avatar/'+late,profile]);
    result=await reconcile({...options,manifestPath:join(directory,'delta.json')}).catch(error=>{throw new Error('final-delta',{cause:error});});assert.equal(result.objects,4);
    const after=auth+'/'+randomUUID()+'.png';keys.push(after);await s3.storage.put(after,png,'image/png');await database.query('update public.users set avatar_url=$1 where id=$2',['/profile/avatar/'+after,profile]);
    await assert.rejects(reconcile(options),{message:'active_avatar_missing'}); // A forward recopy cannot hide destination-only writes.
    result=await reconcile({...options,direction:'reverse',manifestPath:join(directory,'reverse.json')}).catch(error=>{throw new Error('postcut-reverse',{cause:error});});assert.equal(result.objects,5);
    for(const key of keys)assert.equal(sha256((await source.storage.read(key)).bytes),sha256(png));
    assert.equal((await database.query('select avatar_url from public.users where id=$1',[profile])).rows[0].avatar_url,'/profile/avatar/'+after);
    assert.equal(avatarReference('/profile/avatar/'+after),after);
    assert.throws(()=>avatarReference('https://foreign.test/profile/avatar/'+after));
    // A dangling reference or corrupted copy blocks the cutover gate.
    const missing=auth+'/'+randomUUID()+'.png';await database.query('update public.users set avatar_url=$1 where id=$2',['/profile/avatar/'+missing,profile]);
    await assert.rejects(reconcile({...options,direction:'reverse'}),{message:'active_avatar_missing'});
    await database.query('update public.users set avatar_url=$1 where id=$2',['/profile/avatar/'+after,profile]);
  }finally{
    if(profile)await database.query('delete from public.users where id=$1',[profile]);await database.query('delete from app_private.auth_subjects where id=$1',[auth]);
    await database.end();s3.storage.client.destroy();s3.stop();source.storage.client.destroy();source.stop();rmSync(directory,{recursive:true,force:true});
  }
});
