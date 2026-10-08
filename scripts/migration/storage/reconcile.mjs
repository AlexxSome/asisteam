import { writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ListObjectsV2Command } from '../../../apps/api/node_modules/@aws-sdk/client-s3/dist-cjs/index.js';
import { AvatarStorage, AVATAR_KEY, validateAvatar, sha256 } from '../../../apps/api/dist/storage.js';
import { loadConfig } from '../../../apps/api/dist/config.js';
import pg from '../../../apps/api/node_modules/pg/lib/index.js';

export function avatarReference(reference, origin) {
  if (reference.startsWith('/profile/avatar/')) { const key=reference.slice('/profile/avatar/'.length); if(AVATAR_KEY.test(key))return key; }
  try {
    const url=new URL(reference), base=new URL(origin);
    if(url.origin!==base.origin || url.hash)throw new Error();
    // Only known Storage routes at the configured source; never fetch arbitrary profile URLs.
    const match=url.pathname.match(/^\/storage\/v1\/object\/(?:public\/|sign\/|authenticated\/)?avatars\/(.+)$/);
    if(match&&AVATAR_KEY.test(match[1]))return match[1];
  }catch{/* Reject noncanonical references below. */}
  throw new Error('unsupported_avatar_reference');
}
async function bounded(response) {
  if(!response.ok||!response.body)throw new Error('storage_transfer_failed');
  let length=0;const chunks=[],reader=response.body.getReader();
  try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>2097152)throw new Error('avatar_too_large');chunks.push(part.value);}}
  finally{await reader.cancel();}
  return Buffer.concat(chunks);
}
export async function reconcile({database,storage,origin,secret,direction='forward',scope,manifestPath}) {
  if(!['forward','reverse'].includes(direction))throw new Error('invalid_direction');
  const source=new URL(origin);
  if(source.username||source.password||source.search||source.hash||source.pathname!=='/'||!(source.protocol==='https:'||source.protocol==='http:'&&['127.0.0.1','localhost'].includes(source.hostname)))throw new Error('invalid_source');
  const http=(path,options={})=>fetch(source.origin+path,{...options,headers:{apikey:secret,authorization:'Bearer '+secret,...options.headers},redirect:'error',signal:AbortSignal.timeout(15000)});
  const ownScope=scope?.length?scope:null;
  if((await database.query("select public from storage.buckets where id='avatars'")).rows[0]?.public !== false)throw new Error('source_bucket_not_private');
  // Owner/profile map is operator-only; API does not gain these cross-tenant grants.
  const profiles=(await database.query('select id,auth_user_id,avatar_url from public.users where ($1::uuid[] is null or auth_user_id=any($1))',[ownScope])).rows;
  const owners=new Map(profiles.filter(row=>row.auth_user_id).map(row=>[row.auth_user_id,row.id]));
  const references=profiles.filter(row=>row.avatar_url).map(row=>({...row,key:avatarReference(row.avatar_url,origin)}));
  for(const row of references)if(row.key.split('/')[0]!==row.auth_user_id)throw new Error('avatar_owner_mismatch');
  const keys=new Set(), sourceMetadata=new Map();
  if(direction==='forward') {
    const rows=(await database.query("select name,metadata from storage.objects where bucket_id='avatars' and ($1::uuid[] is null or split_part(name,'/',1)=any(select unnest($1)::text))",[ownScope])).rows;
    for(const row of rows){if(!AVATAR_KEY.test(row.name)||!owners.has(row.name.split('/')[0]))throw new Error('avatar_owner_missing');keys.add(row.name);sourceMetadata.set(row.name,row.metadata);}
  } else {
    let continuation;
    do{const page=await storage.client.send(new ListObjectsV2Command({Bucket:storage.bucket,ContinuationToken:continuation}));
      for(const object of page.Contents??[]){if(ownScope&&!ownScope.includes(object.Key.split('/')[0]))continue;
        if(!AVATAR_KEY.test(object.Key)||!owners.has(object.Key.split('/')[0]))throw new Error('avatar_owner_missing');keys.add(object.Key);}
      continuation=page.IsTruncated?page.NextContinuationToken:undefined;
    }while(continuation);
  }
  for(const row of references)if(!keys.has(row.key))throw new Error('active_avatar_missing');
  const manifest=[];
  for(const key of [...keys].sort()){
    let bytes,type;
    if(direction==='forward'){
      const response=await http('/storage/v1/object/avatars/'+key);type=response.headers.get('content-type')?.split(';')[0];bytes=await bounded(response);validateAvatar(bytes,type);
      const metadata=sourceMetadata.get(key);if(Number(metadata?.size)!==bytes.length||metadata?.mimetype!==type)throw new Error('source_metadata_mismatch');
      // Never overwrite an object of uncertain origin. Retries verify a previous copy.
      let copy;
      try{copy=await storage.read(key);}catch(error){if(!['NotFound','NoSuchKey'].includes(error?.name))throw error;}
      if(!copy){await storage.put(key,bytes,type);copy=await storage.read(key);}if(sha256(copy.bytes)!==sha256(bytes)||copy.type!==type)throw new Error('checksum_mismatch');
    }else{
      ({bytes,type}=await storage.read(key));
      const previous=await http('/storage/v1/object/avatars/'+key);
      if(previous.ok){if(sha256(await bounded(previous))!==sha256(bytes))throw new Error('source_copy_conflict');}
      else{
        const error=await previous.json().catch(()=>({}));
        if(previous.status!==404&&String(error.statusCode)!=='404'&&error.error!=='not_found')throw new Error('source_storage_unavailable');
        await bounded(await http('/storage/v1/object/avatars/'+key,{method:'POST',headers:{'content-type':type,'x-upsert':'false'},body:bytes}));
      }
      const copy=await bounded(await http('/storage/v1/object/avatars/'+key));if(sha256(copy)!==sha256(bytes))throw new Error('checksum_mismatch');
    }
    const anonymousUrl=direction==='forward'?new URL(await storage.signedRead(key)):new URL(source.origin+'/storage/v1/object/public/avatars/'+key);
    anonymousUrl.search='';
    const anonymous=await fetch(anonymousUrl,{redirect:'error',signal:AbortSignal.timeout(5000)});
    await anonymous.body?.cancel();
    if(anonymous.ok)throw new Error('bucket_public');
    manifest.push({key,owner_profile_id:owners.get(key.split('/')[0]),owner_auth_id:key.split('/')[0],bytes:bytes.length,type,sha256:sha256(bytes)});
  }
  // Private manifest precedes reference changes; restart/delta rechecks every checksum.
  if(manifestPath){const path=resolve(manifestPath);await mkdir(dirname(path),{recursive:true,mode:0o700});const directory=await stat(dirname(path));if((directory.mode&0o077)!==0)throw new Error('manifest_directory_not_private');await writeFile(path,JSON.stringify({version:1,direction,objects:manifest},null,2)+'\n',{mode:0o600,flag:'wx'});}
  await database.query('begin');
  try {
    for(const row of references){const result=await database.query('update public.users set avatar_url=$1 where id=$2 and avatar_url=$3 returning id',['/profile/avatar/'+row.key,row.id,row.avatar_url]);if(result.rowCount!==1)throw new Error('avatar_delta_conflict');}
    // Re-read the full scoped inventory: unreferenced uploads during coexistence also require another delta.
    const currentKeys=new Set();
    if(direction==='forward'){
      for(const row of (await database.query("select name from storage.objects where bucket_id='avatars' and ($1::uuid[] is null or split_part(name,'/',1)=any(select unnest($1)::text))",[ownScope])).rows)currentKeys.add(row.name);
    }else{
      let continuation;
      do{const page=await storage.client.send(new ListObjectsV2Command({Bucket:storage.bucket,ContinuationToken:continuation}));for(const object of page.Contents??[])if(!ownScope||ownScope.includes(object.Key.split('/')[0]))currentKeys.add(object.Key);continuation=page.IsTruncated?page.NextContinuationToken:undefined;}while(continuation);
    }
    if(currentKeys.size!==keys.size||[...currentKeys].some(key=>!keys.has(key)))throw new Error('avatar_delta_conflict');
    // Catch new references during a copy: final gate requires frozen writes and a repeated delta.
    const latest=(await database.query('select id,avatar_url from public.users where ($1::uuid[] is null or auth_user_id=any($1)) and avatar_url is not null',[ownScope])).rows;
    for(const row of latest)if(!keys.has(avatarReference(row.avatar_url,origin)))throw new Error('avatar_delta_conflict');
    await database.query('commit');
  }catch(error){await database.query('rollback');throw error;}
  return {direction,objects:manifest.length,bytes:manifest.reduce((n,row)=>n+row.bytes,0),references:references.length,checksums:true};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  let database,storage;
  try{
    if(process.env.STORAGE_MIGRATION_ACK!=='frozen-synthetic-or-approved-cutover')throw new Error('cutover_not_acknowledged');
    if(!process.env.STORAGE_MANIFEST_PATH||!process.env.STORAGE_SOURCE_ORIGIN||!process.env.STORAGE_SOURCE_SECRET)throw new Error('missing_configuration');
    const config=loadConfig({...process.env,DATABASE_URL:process.env.STORAGE_MIGRATION_DATABASE_URL});
    database=new pg.Client({connectionString:config.DATABASE_URL});await database.connect();
    // This dedicated operator connection must fail rather than silently inventory RLS-filtered rows.
    // row_security=off does not bypass RLS; PostgreSQL errors for a subject role.
    await database.query('set row_security=off');
    storage=new AvatarStorage(config);
    const result=await reconcile({database,storage,origin:process.env.STORAGE_SOURCE_ORIGIN,secret:process.env.STORAGE_SOURCE_SECRET,direction:process.env.STORAGE_MIGRATION_DIRECTION??'forward',manifestPath:process.env.STORAGE_MANIFEST_PATH});
    console.log(JSON.stringify({status:'PASS',...result}));
  }catch{console.error(JSON.stringify({status:'FAIL',check:'storage-reconciliation'}));process.exitCode=1;}
  finally{storage?.client?.destroy();if(database)await database.end();}
}
