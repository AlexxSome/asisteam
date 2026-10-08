// Baseline derivation uses schema/catalog only from the fixed synthetic local
// project. No external DSN, credentials or application rows are exported.
import {randomUUID,createHash} from 'node:crypto';
import {writeFile,mkdir,readFile,readdir} from 'node:fs/promises';
import {command,sql,normalizeDump} from './local.mjs';
const source='supabase_db_asisteam',name='mig165_prepare_'+randomUUID().replaceAll('-','');
const root=new URL('../',import.meta.url);let created=false;
try {
 const schema=await command('docker',['exec',source,'pg_dump','-U','postgres','--schema-only','--no-owner','--no-acl',...['public','app_private','auth','storage'].flatMap(s=>['-n',s])]);
 await sql(source,'postgres','create database '+name+' template template0');created=true;
 await sql(source,name,'drop schema public;create schema extensions;create extension pgcrypto with schema extensions;'+schema);
 const removed=['app_private.dispatch_announcement_push()','app_private.dispatch_guardianship_majority()','app_private.majority_handoff(text,boolean)','app_private.announcement_handoff(text,boolean)','app_private.import_auth_identities()','app_private.import_social_identities()','app_private.legacy_session_user_id(uuid)','app_private.guard_legacy_identity()','app_private.sync_auth_subject()','public.handle_new_user()'];
 await sql(source,name,await readFile(new URL('transform.sql',root),'utf8'));
 for(const signature of removed)await sql(source,name,'drop function if exists '+signature+' cascade;');
 await sql(source,name,'drop schema auth cascade;drop schema storage cascade;');
 const residual=(await sql(source,name,"select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') and p.prosrc ~ '\\m(auth|storage|net|vault|cron)\\.';")).trim();
 if(residual!=='0')throw new Error('residual_platform_dependency');
 let baseline=normalizeDump(await command('docker',['exec',source,'pg_dump','-U','postgres','-d',name,'--schema-only','--no-owner','--no-acl','-n','public','-n','app_private']));
 baseline=baseline.replace(/ TO authenticated\b/g,' TO asisteam_member').replace('CREATE SCHEMA public;','CREATE SCHEMA IF NOT EXISTS public;');
 // Preserve each existing explicit app ACL, including column-level PII
 // projections. Discard only provider ACLs; future defaults deny all runtime.
 const acl=await sql(source,'postgres',await readFile(new URL('scripts/acl.sql',root),'utf8'));
 const grants=acl.replace(/\bauthenticated;/g,'asisteam_member;');
 const seeds=await sql(source,'postgres',"select 'INSERT INTO public.billing_plans SELECT * FROM jsonb_populate_record(NULL::public.billing_plans, '||quote_literal(to_jsonb(p)::text)||'::jsonb);' from public.billing_plans p order by code; select 'INSERT INTO public.activity_types SELECT * FROM jsonb_populate_record(NULL::public.activity_types, '||quote_literal(to_jsonb(t)::text)||'::jsonb);' from public.activity_types t where group_id is null order by id;");
 const output='-- MIG-21 #165. Derived from versioned Supabase schema; see transformation.json.\n'+baseline+'\n'+await readFile(new URL('permissions.sql',root),'utf8')+'\n'+grants+'\nALTER TABLE public.activity_types DISABLE TRIGGER trg_system_activity_type;\n'+seeds+'\nALTER TABLE public.activity_types ENABLE TRIGGER trg_system_activity_type;\n'+await readFile(new URL('fixtures/control.sql',root),'utf8');
 await mkdir(new URL('migrations/',root),{recursive:true});await writeFile(new URL('migrations/0001_baseline.sql',root),output);
 const catalog=JSON.parse((await sql(source,'postgres',await readFile(new URL('scripts/catalog.sql',root),'utf8'))).replace(/"authenticated"/g,'"asisteam_member"'));
 // Explicit, exact equivalences observed when PostgreSQL reparses the dump:
 // qualify pgcrypto's default and flatten associative AND grouping. Changed
 // operands, operators, limits or any other constraint still fail comparison.
 for(const row of catalog.columns)if(row[0]==='app_private'&&row[1]==='qr_checkin_keys'&&row[2]==='secret'&&row[5]==='gen_random_bytes(32)')row[5]='extensions.gen_random_bytes(32)';
 for(const [column,limit] of [['body',5000],['title',120]]){
  const row=catalog.constraints.find(r=>r[0]==='public'&&r[1]==='group_announcements'&&r[2]===`group_announcements_${column}_check`);
  const before=`CHECK ((((length(btrim(${column})) >= 1) AND (length(btrim(${column})) <= ${limit})) AND (${column} ~ '[^[:space:]]'::text)))`;
  if(row?.[3]===before)row[3]=`CHECK (((length(btrim(${column})) >= 1) AND (length(btrim(${column})) <= ${limit}) AND (${column} ~ '[^[:space:]]'::text)))`;
 }
 await writeFile(new URL('source-catalog.json',root),JSON.stringify(catalog,null,2)+'\n');
 const history=[];for(const file of (await readdir(new URL('../../../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())history.push({file,sha256:createHash('sha256').update(await readFile(new URL('../../../supabase/migrations/'+file,import.meta.url))).digest('hex')});
 await writeFile(new URL('transformation.json',root),JSON.stringify({sourceCommit:(await command('git',['rev-parse','HEAD'])).trim(),sourceMigrations:history,removedFunctions:removed,removedSchemas:['auth','storage'],retainedSchemas:['public','app_private'],retainedBusinessTables:'all, including auth import ledger, jobs, push, billing and avatar manifests',policyRole:{authenticated:'asisteam_member'},runtimeRoles:['asisteam_api','asisteam_jobs','asisteam_auth','asisteam_invitation','asisteam_billing'],baselineSha256:createHash('sha256').update(output).digest('hex')},null,2)+'\n');
 console.log('baseline_prepare PASS');
} finally {if(created)await sql(source,'postgres','drop database '+name+' with (force)');}
