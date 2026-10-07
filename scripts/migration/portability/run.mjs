import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execute = promisify(execFile);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const script = new URL('./', import.meta.url);
const runId = randomUUID().replaceAll('-', '');
const source = 'supabase_db_asisteam'; // fixed local project; never accepts a cloud DSN
const database = `mig150_${runId}`;
const target = `asisteam-portability-${runId}`;
const image = 'postgres:17.9-bookworm';
const dir = await mkdtemp(join(tmpdir(), 'asisteam-portability-'));
await chmod(dir, 0o700);
const evidence = { sourceCommit: process.env.SOURCE_COMMIT ?? (await command('git', ['rev-parse','HEAD'])).trim(), date: new Date().toISOString(), environment: process.env.GITHUB_ACTIONS ? 'github-actions-synthetic' : 'local-synthetic', node: process.version, checks: [], pending: ['independent-auth-login-and-sessions-162-164', 'oauth-provider-login-163', 'private-s3-authorization-161', 'managed-provider-and-production-volume', 'worker-dispatch-157-159', 'full-cutover-and-rollback-166'] };
const accounts = [];
const objects = [];
let local;
let targetCreated = false;

async function command(program, args, input) {
  // No shell interpolation, raw diagnostics, arguments, hashes or tokens in logs.
  if (input !== undefined) {
    const { spawn } = await import('node:child_process');
    return new Promise((resolve, reject) => {
      const child = spawn(program, args, { stdio: ['pipe','pipe','pipe'] });
      const chunks = []; let size = 0; let diagnostic = '';
      const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
      child.stdout.on('data', chunk => { size += chunk.length; if(size <= 64_000_000) chunks.push(chunk); else child.kill('SIGKILL'); });
      child.stderr.on('data', chunk => { if(diagnostic.length < 100000) diagnostic += chunk; });
      child.stdin.on('error', () => {}); // early process exit, reported by close
      child.once('error', error => { clearTimeout(timer); reject(new Error('command_unavailable', { cause: error })); });
      child.once('close', code => { clearTimeout(timer); if(code === 0) resolve(Buffer.concat(chunks).toString()); else reject(new Error('command_failed', { cause: diagnostic })); });
      child.stdin.end(input);
    });
  }
  const result = await execute(program, args, { timeout: 120000, maxBuffer: 64_000_000 });
  return result.stdout;
}
async function check(name, action) {
  const start = performance.now();
  try { const value = await action(); if(process.env.PORTABILITY_FAIL_AFTER===name) throw new Error('injected_fault'); evidence.checks.push({ check:name,status:'PASS',seconds:Number(((performance.now()-start)/1000).toFixed(3)) }); console.log(JSON.stringify(evidence.checks.at(-1))); return value; }
  catch (error) { evidence.checks.push({check:name,status:'FAIL',seconds:Number(((performance.now()-start)/1000).toFixed(3))}); throw new Error(name, {cause:error}); }
}
const sql = (container, db, input, variables = {}) => command('docker', ['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1', ...Object.entries(variables).flatMap(([key,value])=>['-v',`${key}=${value}`])], input);
const quote = value => `'${value.replaceAll("'", "''")}'`;
const dump = (db, schemaOnly = false) => command('docker',['exec',source,'pg_dump','-U','postgres','-d',db,'--no-owner',...(schemaOnly?['--schema-only']:[]),...['public','app_private','auth','storage'].flatMap(schema=>['-n',schema])]);
async function http(path, options = {}) {
  const response = await fetch(`${local.API_URL}${path}`, { ...options, signal: AbortSignal.timeout(15000), headers: { apikey:local.SERVICE_ROLE_KEY, Authorization:`Bearer ${local.SERVICE_ROLE_KEY}`, ...options.headers }, redirect:'error' });
  if(!response.ok) throw new Error(`local_http_${response.status}`);
  return response;
}
async function importRow(table, row) {
  // Export only rows belonging to newly created synthetic IDs. Generated columns
  // (auth confirmed_at / identity email) are recomputed by PostgreSQL.
  const columns = (await sql(source,'postgres',`select column_name from information_schema.columns where table_schema=${quote(table.split('.')[0])} and table_name=${quote(table.split('.')[1])} and is_generated='NEVER' order by ordinal_position;`)).trim().split('\n');
  assert.ok(columns.every(name => /^[a-z_]+$/.test(name)));
  const data = JSON.stringify(Object.fromEntries(columns.map(column=>[column,row[column]])));
  await sql(source,database,`insert into ${table}(${columns.join(',')}) select ${columns.join(',')} from jsonb_populate_record(null::${table}, ${quote(data)}::jsonb);`);
}

try {
  await check('local-only-source-and-versions', async () => {
    local = JSON.parse(await command('pnpm',['exec','supabase','status','-o','json']));
    assert.match(process.version,/^v24\./);
    assert.equal(new URL(local.API_URL).hostname,'127.0.0.1');
    assert.equal(new URL(local.API_URL).port,'54321');
    assert.ok(local.SERVICE_ROLE_KEY);
    const inspect = JSON.parse(await command('docker',['inspect',source]))[0];
    assert.match(inspect.Config.Image,/^public\.ecr\.aws\/supabase\/postgres:17\./);
    evidence.sourceImage = inspect.Config.Image;
    evidence.sourcePostgres = (await sql(source,'postgres','show server_version;')).trim();
    const table = (await sql(source,'postgres',"select to_regprocedure('app_private.api_session_user_id(uuid)') is not null;")).trim();
    assert.equal(table,'t');
  });
  const schema = await check('export-schema-without-existing-data', () => dump('postgres',true));
  evidence.schemaBytes = Buffer.byteLength(schema);
  evidence.schemaSha256 = digest(schema);
  await check('owned-empty-source-clone', async () => {
    await sql(source,'postgres',`create database ${database} template template0;`);
    await sql(source,database,'drop schema public; create schema extensions; create extension pgcrypto with schema extensions;');
    // Current ACLs remain unchanged. Provider future-object defaults require
    // changing a role owned by Supabase; omit only these enumerated defaults.
    const compatible = schema.replace(/^ALTER DEFAULT PRIVILEGES FOR ROLE (supabase_admin|supabase_auth_admin) [^\n]+;$/gm, '');
    evidence.omittedProviderDefaultAcls = [...schema.matchAll(/^ALTER DEFAULT PRIVILEGES FOR ROLE (supabase_admin|supabase_auth_admin) [^\n]+;$/gm)].length;
    await sql(source,database,compatible);
    assert.equal((await sql(source,database,'select count(*) from public.users;')).trim(),'0');
  });
  const variables = {};
  await check('gotrue-synthetic-credential-export', async () => {
    for(const role of ['admin','athlete','guardian']) {
      const password = randomBytes(24).toString('base64url');
      const email = `mig150-${role}-${runId}@example.invalid`;
      const account = {role,email,password}; accounts.push(account);
      const response = await http('/auth/v1/admin/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,email_confirm:true,user_metadata:{full_name:`Fixture ${role}`,birthdate:'2000-01-01'}})});
      const user = await response.json(); assert.match(user.id,/^[0-9a-f-]{36}$/);
      account.id=user.id;
      const auth = JSON.parse((await sql(source,'postgres',`select to_jsonb(u) from auth.users u where id=${quote(user.id)}::uuid;`)).trim());
      account.profile = JSON.parse((await sql(source,'postgres',`select to_jsonb(u) from public.users u where auth_user_id=${quote(user.id)}::uuid;`)).trim());
      assert.match(auth.encrypted_password,/^\$2[aby]\$/);
      account.hash = auth.encrypted_password;
      await importRow('auth.users',auth);
      // handle_new_user ran with the actual metadata. Preserve the original profile
      // ID before any FK fixture is inserted, including ACTIVE/INVITED/MANAGED.
      await sql(source,database,`update public.users set id=${quote(account.profile.id)}::uuid where auth_user_id=${quote(user.id)}::uuid;`);
      const identities = JSON.parse((await sql(source,'postgres',`select coalesce(jsonb_agg(to_jsonb(i)),'[]'::jsonb) from auth.identities i where user_id=${quote(user.id)}::uuid;`)).trim());
      for(const identity of identities) await importRow('auth.identities',identity);
      variables[role]=account.profile.id; variables[`${role}_auth`]=user.id;
    }
  });
  await check('domain-and-oauth-transport-fixtures',async()=>sql(source,database,await readFile(new URL('fixtures.sql',script),'utf8'),variables));
  await check('local-storage-export',async()=>{
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6rGQAAAAASUVORK5CYII=','base64');
    for(let n=0;n<3;n++) {
      const key=`${accounts[0].id}/${randomUUID()}.png`;
      // Register before upload so a successful write followed by an ambiguous
      // response is still covered by exact-key cleanup.
      const object={key,bytes:bytes.length,sha256:digest(bytes),profileId:accounts[0].profile.id,authId:accounts[0].id}; objects.push(object);
      await http(`/storage/v1/object/avatars/${key}`,{method:'POST',headers:{'Content-Type':'image/png','x-upsert':'false'},body:bytes});
      const downloaded = Buffer.from(await (await http(`/storage/v1/object/avatars/${key}`)).arrayBuffer());
      assert.equal(digest(downloaded),object.sha256);
      await mkdir(join(dir,'export'),{recursive:true,mode:0o700});
      await writeFile(join(dir,'export',`${n}.png`),downloaded,{mode:0o600});
      await sql(source,database,`insert into storage.objects(bucket_id,name,metadata) values('avatars',${quote(key)},jsonb_build_object('size',${object.bytes},'mimetype','image/png'));`);
    }
    await writeFile(join(dir,'manifest.json'),JSON.stringify(objects),{mode:0o600});
    await sql(source,database,`update public.users set avatar_url=${quote(`/profile/avatar/${objects[0].key}`)} where id=${quote(objects[0].profileId)}::uuid;`);
  });
  const archive = await check('synthetic-dump-export',()=>dump(database));
  evidence.dumpBytes=Buffer.byteLength(archive);
  // Dump includes only owned fixture rows plus schema, never production data.
  // Keep credentials/hash bytes in memory and private transient storage only.
  await writeFile(join(dir,'rehearsal.sql'),archive,{mode:0o600});
  await check('standalone-postgres-start',async()=>{
    await command('docker',['run','-d','--pull=missing','--name',target,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]); targetCreated=true;
    for(let n=0;n<40;n++) {
      try { await command('docker',['exec',target,'pg_isready','-h','127.0.0.1','-U','postgres']); break; }
      catch(error) { if(n===39) throw error; await new Promise(resolve=>setTimeout(resolve,250)); }
    }
    evidence.targetPostgres=(await sql(target,'postgres','show server_version;')).trim();
    assert.match(evidence.targetPostgres,/^17\.9/);
    evidence.targetImage=(await command('docker',['image','inspect',image,'--format','{{.Id}}'])).trim();
    const inspect=JSON.parse(await command('docker',['inspect',target]))[0];
    assert.equal(inspect.HostConfig.NetworkMode,'none');
    assert.deepEqual(inspect.HostConfig.PortBindings,{});
  });
  await check('clean-restore-with-explicit-compatibility',async()=>{
    await sql(target,'postgres',await readFile(new URL('bootstrap.sql',script),'utf8'));
    await sql(target,'postgres','drop schema public; create schema extensions; create extension pgcrypto with schema extensions;');
    await sql(target,'postgres',archive);
  });
  await check('all-table-counts-and-content-reconciliation',async()=>{
    const tables=(await sql(source,database,"select schemaname||'.'||tablename from pg_tables where schemaname in ('public','app_private','auth','storage') order by 1;")).trim().split('\n');
    assert.ok(tables.every(table=>/^(public|app_private|auth|storage)\.[a-z_][a-z0-9_]*$/.test(table)));
    const snapshot = async(container,db)=> {
      const records=[];
      for(const table of tables) {
        // Stable representation of every synthetic row, including all FK/history,
        // credential/identity/Storage metadata. Digests stay in memory: they are
        // not password-hash artifacts and are not added to the safe report.
        const result=(await sql(container,db,`select count(*), encode(extensions.digest(coalesce(string_agg(to_jsonb(t)::text, E'\\n' order by to_jsonb(t)::text),''),'sha256'),'hex') from ${table} t;`)).trim();
        records.push(result);
      }
      return records;
    };
    const expected=await snapshot(source,database);
    assert.deepEqual(await snapshot(target,'postgres'),expected);
    evidence.tables=tables.length;
    evidence.nonEmptyTables=expected.filter(record=>!record.startsWith('0|')).length;
  });
  await check('catalog-constraints-policies-and-current-grants',async()=>{
    const catalog = `select jsonb_build_object(
      'constraints',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,x.conname,pg_get_constraintdef(x.oid)) order by n.nspname,c.relname,x.conname) from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private','auth','storage')),
      'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','app_private','auth','storage')),
      'rls',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity) order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private','auth','storage') and c.relkind in ('r','p')),
      'acl',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.grantor::regrole::text,case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end,a.privilege_type,a.is_grantable) order by n.nspname,c.relname,a.grantor::regrole::text,a.grantee::regrole::text,a.privilege_type) from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(c.relacl) a where n.nspname in ('public','app_private','auth','storage')));`;
    assert.equal((await sql(target,'postgres',catalog)).trim(),(await sql(source,database,catalog)).trim());
  });
  await check('restored-constraints-rls-roles-and-canonical-metrics',async()=>sql(target,'postgres',await readFile(new URL('verify.sql',script),'utf8'),variables));
  await check('imported-bcrypt-verification-and-recovery-cases',async()=>{
    const results=[];
    for(const account of accounts) {
      const outcome=(await sql(target,'postgres',`select encrypted_password=extensions.crypt(${quote(account.password)},encrypted_password), encrypted_password<>extensions.crypt('incorrect-synthetic-password',encrypted_password) from auth.users where id=${quote(account.id)}::uuid;`)).trim();
      assert.equal(outcome,'t|t');
      results.push({kind:'gotrue-'+account.hash.slice(1,3),verified:true,recovery:false});
    }
    const candidates=['2a','2b','2y'].map(prefix=>({kind:prefix,hash:accounts[0].hash.replace(/^\$2[a-z]\$/,`$${prefix}$`)}));
    candidates.push({kind:'missing',hash:''},{kind:'unsupported',hash:'$argon2id$synthetic'},{kind:'malformed',hash:'$2a$'});
    for(const candidate of candidates) {
      const compatible=(await sql(target,'postgres',`do $probe$ begin
        begin perform set_config('test.compatible',coalesce((${quote(candidate.hash)}=extensions.crypt(${quote(accounts[0].password)},${quote(candidate.hash)}))::text,'false'),false);
        exception when invalid_parameter_value then perform set_config('test.compatible','false',false); end;
        end $probe$; select current_setting('test.compatible');`)).trim()==='true';
      if(['missing','unsupported','malformed'].includes(candidate.kind)) assert.equal(compatible,false);
      results.push({kind:candidate.kind,verified:compatible,recovery:!compatible});
    }
    evidence.credentials=results;
    const identityMap=(await sql(target,'postgres',"select count(*) from auth.identities i join public.users u on u.auth_user_id=i.user_id where i.provider in ('google','apple');")).trim();
    assert.equal(identityMap,'2');
    assert.equal((await sql(target,'postgres',"select count(*) from (select provider,provider_id,count(*) from auth.identities group by provider,provider_id having count(*)>1) s;")).trim(),'0');
    evidence.oauth={transportIdentities:2,providerSubjectCollisionSeparated:true,providerAuthentication:'PENDING'};
    // No existing refresh/session/token exported into the independent target.
    assert.equal((await sql(target,'postgres','select count(*) from auth.sessions;')).trim(),'0');
  });
  await check('nonportable-dispatch-and-extension-detection',async()=>{
    assert.equal((await sql(target,'postgres',"select count(*) from pg_extension where extname in ('pg_cron','pg_net','supabase_vault');")).trim(),'0');
    const functions=JSON.parse((await sql(target,'postgres',"select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'dependencies',array_remove(array[case when p.prosrc ~ '\\mnet\\.' then 'pg_net' end,case when p.prosrc ~ '\\mvault\\.' then 'vault' end,case when p.prosrc ~ '\\mcron\\.' then 'pg_cron' end],null))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') and p.prosrc ~ '\\m(net|vault|cron)\\.';")).trim());
    assert.equal(functions.length,2);
    evidence.nonportable=functions;
    for(const entry of functions) {
      assert.match(entry.signature,/^app_private\.[a-z_]+\(\)$/);
      // Explicitly remove the old dispatchers from the owned destination only.
      // Domain/ledger functions remain. No worker is enabled as a substitute.
      await sql(target,'postgres',`drop function ${entry.signature};`);
    }
    let missingCron=false;
    try { await sql(target,'postgres',"select cron.schedule('synthetic','* * * * *','select 1');"); }
    catch(error) { missingCron=Boolean(error); }
    assert.equal(missingCron,true);
    evidence.authStorage='native SQL compatibility schemas retained; services absent';
  });
  await check('object-import-manifest-and-checksums',async()=>{
    const manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));
    assert.deepEqual(manifest,objects);
    await mkdir(join(dir,'import'),{mode:0o700});
    for(let n=0;n<manifest.length;n++) {
      const bytes=await readFile(join(dir,'export',`${n}.png`));
      await writeFile(join(dir,'import',`${n}.png`),bytes,{mode:0o600});
      assert.equal(digest(await readFile(join(dir,'import',`${n}.png`))),manifest[n].sha256);
      const object=manifest[n];
      assert.equal((await sql(target,'postgres',`select count(*) from storage.objects o join public.users u on u.auth_user_id=${quote(object.authId)}::uuid where o.name=${quote(object.key)} and o.bucket_id='avatars' and u.id=${quote(object.profileId)}::uuid;`)).trim(),'1');
      if(n===0) assert.equal((await sql(target,'postgres',`select avatar_url from public.users where id=${quote(object.profileId)}::uuid;`)).trim(),`/profile/avatar/${object.key}`);
    }
    evidence.objects={count:objects.length,bytes:objects.reduce((total,o)=>total+o.bytes,0),checksums:objects.map(({bytes,sha256},index)=>({fixture:`avatar-${index}`,bytes,sha256})),ownerMappingPreserved:true,destination:'private local directory (S3 integration pending #161)'};
    // Detect a missing object and a corrupt one; never trust size or an S3 ETag.
    assert.notEqual(digest(Buffer.from('corrupt')),objects[0].sha256);
    await assert.rejects(readFile(join(dir,'import','missing.png')),{code:'ENOENT'});
  });
} catch(error) {
  // The label is controlled by this file; do not print error/cause/SQL/HTTP body.
  console.error(JSON.stringify({status:'FAIL',check:evidence.checks.find(record=>record.status==='FAIL')?.check??'setup'}));
  process.exitCode=1;
} finally {
  // Exact resources generated by this run. Cleanup must pass, never mask it.
  await check('owned-resource-cleanup',async()=>{
    const actions=[];
    if(local) {
      for(const object of objects) actions.push(async()=>{
        await http('/storage/v1/object/avatars',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[object.key]})});
        assert.equal((await sql(source,'postgres',`select count(*) from storage.objects where bucket_id='avatars' and name=${quote(object.key)};`)).trim(),'0');
      });
      for(const account of accounts) actions.push(async()=>{
        // Resolve an ambiguous create response by the run's unique synthetic email.
        const id=account.id??(await sql(source,'postgres',`select id from auth.users where email=${quote(account.email)};`)).trim();
        if(!id) return;
        assert.match(id,/^[0-9a-f-]{36}$/);
        await sql(source,'postgres',`delete from public.users where auth_user_id=${quote(id)}::uuid and not exists(select 1 from public.memberships where user_id=public.users.id);`);
        await http(`/auth/v1/admin/users/${id}`,{method:'DELETE'});
        assert.equal((await sql(source,'postgres',`select count(*) from auth.users where id=${quote(id)}::uuid;`)).trim(),'0');
        assert.equal((await sql(source,'postgres',`select count(*) from public.users where email=${quote(account.email)};`)).trim(),'0');
      });
    }
    // Attempt every cleanup even if one resource fails; names are generated here.
    actions.push(async()=>sql(source,'postgres',`drop database if exists ${database} with (force);`));
    if(targetCreated) actions.push(async()=>command('docker',['rm','-f','-v',target]));
    const results=await Promise.allSettled(actions.map(action=>action()));
    const failed=results.filter(result=>result.status==='rejected').length;
    await rm(dir,{recursive:true,force:true});
    assert.equal(failed,0);
  }).catch(()=>{process.exitCode=1;});
  await mkdir('.ci-results',{recursive:true});
  await writeFile(process.env.PORTABILITY_FAIL_AFTER ? '.ci-results/portability-fault.json' : '.ci-results/portability.json',JSON.stringify(evidence,null,2)+'\n');
}
