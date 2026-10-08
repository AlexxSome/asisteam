-- MIG-20 (#164). Preparing the schema does not cut traffic. The operator freezes
-- both authorities, reconciles and activates in separate committed transactions.
create table app_private.auth_authority (
 singleton boolean primary key default true check(singleton),
 mode text not null default 'LEGACY' check(mode in ('LEGACY','FROZEN','NATIVE')),
 frozen_at timestamptz, activated_at timestamptz, recovery_started_at timestamptz
);
insert into app_private.auth_authority(singleton) values(true);
create table app_private.auth_import_ledger (
 subject_id uuid primary key references app_private.auth_subjects(id),
 profile_id uuid not null references public.users(id),
 source_digest text not null, recovery_required boolean not null,
 imported_at timestamptz not null default now()
);
alter table app_private.auth_subjects add column disabled_until timestamptz;
alter table app_private.auth_subjects add column native_owned boolean not null default false;
-- Credentials/families already written by MIG-18/19 belong to Nest. Preserve
-- those replacements; their legacy infinity ban was the prior handover marker.
update app_private.auth_subjects s set native_owned=true,
 disabled_until=case when a.deleted_at is not null then 'infinity'::timestamptz
  when a.banned_until is distinct from 'infinity'::timestamptz then a.banned_until end
from auth.users a where a.id=s.id and
 (exists(select 1 from app_private.auth_credentials c where c.subject_id=s.id)
  or exists(select 1 from app_private.auth_families f where f.subject_id=s.id));
update app_private.auth_subjects s set native_owned=true where not exists(select 1 from auth.users a where a.id=s.id);
alter table app_private.auth_authority enable row level security;
alter table app_private.auth_import_ledger enable row level security;
revoke all on app_private.auth_authority,app_private.auth_import_ledger from public,anon,authenticated,service_role,asisteam_api,asisteam_auth;

-- These primitives use only transaction-local verified claims. Never accept an
-- actor parameter, and never depend on a provider schema/function at runtime.
create function app_private.actor_subject_id() returns uuid language sql stable security definer set search_path='' as $$
 select case when a.mode='FROZEN' or (a.mode='NATIVE' and
  (coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'auth_provider','')<>'nest'
   or (session_user<>'asisteam_api' and current_setting('role',true)<>'asisteam_api'))) then null
 else coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
 nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid end
 from app_private.auth_authority a where singleton
$$;
create function app_private.actor_claims() returns jsonb language sql stable set search_path='' as $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;
create function app_private.actor_role() returns text language sql stable set search_path='' as $$
 select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),app_private.actor_claims()->>'role')
$$;
revoke all on function app_private.actor_subject_id(),app_private.actor_claims(),app_private.actor_role() from public;
grant execute on function app_private.actor_subject_id(),app_private.actor_claims(),app_private.actor_role() to anon,authenticated,service_role,asisteam_api;

-- Replace only provider claim primitives. Preserve each canonical function,
-- policy, view, ACL and rule; no rewriting R1/V1-V6/invitations/history.
do $$ declare r record; definition text; expression text; check_expression text; begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','app_private') and p.prokind='f'
    and p.prosrc ~ 'auth\.(uid|jwt|role)\(' loop
  definition:=pg_get_functiondef(r.oid);
  definition:=replace(replace(replace(definition,'auth.uid()','app_private.actor_subject_id()'),'auth.jwt()','app_private.actor_claims()'),'auth.role()','app_private.actor_role()');
  execute definition;
 end loop;
 for r in select schemaname,tablename,policyname,qual,with_check from pg_policies
  where schemaname in ('public','app_private','storage') and (coalesce(qual,'')||coalesce(with_check,'')) ~ 'auth\.(uid|jwt|role)\(' loop
  expression:=replace(replace(replace(r.qual,'auth.uid()','app_private.actor_subject_id()'),'auth.jwt()','app_private.actor_claims()'),'auth.role()','app_private.actor_role()');
  check_expression:=replace(replace(replace(r.with_check,'auth.uid()','app_private.actor_subject_id()'),'auth.jwt()','app_private.actor_claims()'),'auth.role()','app_private.actor_role()');
  execute format('alter policy %I on %I.%I%s%s',r.policyname,r.schemaname,r.tablename,
    case when expression is null then '' else ' using ('||expression||')' end,
    case when check_expression is null then '' else ' with check ('||check_expression||')' end);
 end loop;
 for r in select v.schemaname,v.viewname,v.definition from pg_views v where v.schemaname='public'
   and v.definition ~ 'auth\.(uid|jwt|role)\(' loop
  execute format('create or replace view %I.%I as %s',r.schemaname,r.viewname,
    replace(replace(replace(r.definition,'auth.uid()','app_private.actor_subject_id()'),'auth.jwt()','app_private.actor_claims()'),'auth.role()','app_private.actor_role()'));
 end loop;
end $$;

create function app_private.auth_is_native() returns boolean language sql stable security definer set search_path='' as $$
 select mode='NATIVE' from app_private.auth_authority where singleton
$$;
revoke all on function app_private.auth_is_native() from public,anon,authenticated,service_role;
grant execute on function app_private.auth_is_native() to asisteam_api,asisteam_auth;

-- The shared lock is held through each boundary transaction. Freeze waits for
-- in-flight effects; a stale API/GoTrue process cannot continue writing afterward.
create function app_private.guard_legacy_identity() returns trigger language plpgsql security definer set search_path='' as $$
declare v_mode text; begin
 select mode into v_mode from app_private.auth_authority where singleton for share;
 if v_mode<>'LEGACY' then raise sqlstate 'PT503' using message='identity_authority_frozen'; end if;
 if tg_table_name='users' and tg_op='UPDATE' then
  if (new.encrypted_password is distinct from old.encrypted_password or new.email is distinct from old.email)
   and exists(select 1 from app_private.auth_subjects where id=old.id and native_owned) then
   raise sqlstate 'PT503' using message='identity_authority_frozen';
  end if;
 elsif tg_table_name='identities' then
  perform 1 from app_private.auth_subjects where id=case when tg_op='DELETE' then old.user_id else new.user_id end for share;
  if exists(select 1 from app_private.auth_subjects where id=case when tg_op='DELETE' then old.user_id else new.user_id end and native_owned) then
   raise sqlstate 'PT503' using message='identity_authority_frozen';
  end if;
 elsif tg_table_name in ('sessions','refresh_tokens') then
  perform 1 from app_private.auth_subjects where id::text=new.user_id::text for share;
  if exists(select 1 from app_private.auth_subjects where id::text=new.user_id::text and native_owned) then
   raise sqlstate 'PT503' using message='identity_authority_frozen';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function app_private.guard_legacy_identity() from public,anon,authenticated,service_role;
create trigger trg_identity_authority before insert or update or delete on auth.users for each row execute function app_private.guard_legacy_identity();
create trigger trg_identity_authority before insert or update or delete on auth.identities for each row execute function app_private.guard_legacy_identity();
create trigger trg_identity_authority before insert or update on auth.sessions for each row execute function app_private.guard_legacy_identity();
create trigger trg_identity_authority before insert or update on auth.refresh_tokens for each row execute function app_private.guard_legacy_identity();

alter function app_private.api_session_user_id(uuid) rename to legacy_session_user_id;
revoke all on function app_private.legacy_session_user_id(uuid) from asisteam_api;
create function app_private.api_session_user_id(p_session_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_mode text; begin
 select mode into v_mode from app_private.auth_authority where singleton for share;
 if v_mode<>'LEGACY' then return null; end if;
 if exists(select 1 from app_private.auth_subjects where id=app_private.actor_subject_id() and native_owned) then return null; end if;
 return app_private.legacy_session_user_id(p_session_id);
end $$;
revoke all on function app_private.api_session_user_id(uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.api_session_user_id(uuid) to asisteam_api;

create or replace function app_private.native_session_user_id(p_session_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_mode text; begin
 select mode into v_mode from app_private.auth_authority where singleton for share;
 if v_mode='FROZEN' or app_private.actor_claims()->>'auth_provider' is distinct from 'nest' then return null; end if;
 perform 1 from app_private.auth_families f join app_private.auth_subjects s on s.id=f.subject_id
  where f.id=p_session_id and f.subject_id=app_private.actor_subject_id()
   and f.revoked_at is null and f.expires_at>statement_timestamp()
   and (s.disabled_until is null or s.disabled_until<=statement_timestamp()) for share of f;
 if not found then return null; end if;
 select id into v_id from public.users where auth_user_id=app_private.actor_subject_id() and account_status='ACTIVE';
 return v_id;
end $$;

-- Keep the existing password dispatcher identical except for the obsolete
-- cross-authority invalidation. After NATIVE it never touches auth.*.
create function app_private.invalidate_legacy_subject(p_subject uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if (select mode from app_private.auth_authority where singleton)<>'LEGACY' then return; end if;
 delete from auth.sessions where user_id=p_subject;
 update auth.users set banned_until='infinity'::timestamptz where id=p_subject;
end $$;
revoke all on function app_private.invalidate_legacy_subject(uuid) from public,anon,authenticated,service_role,asisteam_api,asisteam_auth;
do $$ declare r record; begin
 for r in select id from app_private.auth_subjects where native_owned loop
  perform app_private.invalidate_legacy_subject(r.id);
 end loop;
end $$;
do $$ declare definition text; old_body text; begin
 definition:=pg_get_functiondef('app_private.password_auth_operation(text,jsonb)'::regprocedure);
 old_body:=E'delete from auth.sessions where user_id=v_subject;\n  update auth.users set banned_until=\'infinity\'::timestamptz where id=v_subject;';
 if position(old_body in definition)=0 then raise exception 'Password dispatcher changed; review cutover'; end if;
 execute replace(definition,old_body,'perform app_private.invalidate_legacy_subject(v_subject);');
end $$;
alter function app_private.auth_operation(text,jsonb) rename to identity_auth_operation;
revoke all on function app_private.identity_auth_operation(text,jsonb) from asisteam_auth;
create function app_private.auth_operation(p_operation text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_mode text; v_subject uuid; v_result jsonb; begin
 select mode into v_mode from app_private.auth_authority where singleton for share;
 if v_mode='FROZEN' then raise sqlstate 'PT503' using message='identity_authority_frozen'; end if;
 if p_operation in ('lookup','recovery') then
  select auth_user_id into v_subject from public.users where lower(email)=lower(p_data->>'email');
 elsif p_data->>'subject_id' is not null then v_subject:=(p_data->>'subject_id')::uuid;
 end if;
 if exists(select 1 from app_private.auth_subjects where id=v_subject and disabled_until>statement_timestamp()) then
  if p_operation='recovery' then return '{}'::jsonb; end if;
  return jsonb_build_object('error','authentication_required');
 end if;
 v_result:=app_private.identity_auth_operation(p_operation,p_data);
 if v_result->>'subject_id' is not null and exists(select 1 from app_private.auth_subjects
   where id=(v_result->>'subject_id')::uuid and disabled_until>statement_timestamp()) then
  update app_private.auth_families set revoked_at=now() where id=(v_result->>'session_id')::uuid;
  return jsonb_build_object('error','authentication_required');
 end if;
 if not (v_result ? 'error') and p_operation in ('register','login','password','reset','oauth_complete') then
  v_subject:=coalesce((v_result->>'subject_id')::uuid,v_subject);
  if p_operation='reset' then select subject_id into v_subject from app_private.auth_recovery where token_hash=p_data->>'token_hash'; end if;
  update app_private.auth_subjects set native_owned=true where id=v_subject;
  if v_mode='LEGACY' then perform app_private.invalidate_legacy_subject(v_subject); end if;
 end if;
 return v_result;
end $$;
revoke all on function app_private.auth_operation(text,jsonb) from public,anon,authenticated,service_role,asisteam_api;
grant execute on function app_private.auth_operation(text,jsonb) to asisteam_auth;

-- Operator only. Read the entire frozen source; import no sessions/recovery/PKCE
-- tokens. Repeating cannot overwrite a native hash, merge emails or change IDs.
create function app_private.import_auth_identities() returns jsonb
language plpgsql security definer set search_path='' as $$
declare r record; v_supported boolean; v_digest text; v_ledger app_private.auth_import_ledger%rowtype; v_total integer:=0; v_recovery integer:=0; begin
 perform 1 from app_private.auth_authority where singleton and mode='FROZEN' for update;
 if not found then raise exception 'Freeze identity authority before import'; end if;
 if exists(select 1 from auth.users a left join public.users u on u.auth_user_id=a.id where u.id is null)
  or exists(select 1 from public.users u join auth.users a on a.id=u.auth_user_id where lower(u.email) is distinct from lower(a.email))
  or exists(select 1 from auth.identities where provider not in ('email','google','apple')) then
  raise exception 'Identity reconciliation requires operator review';
 end if;
 for r in select a.*,u.id as profile_id,u.account_status from auth.users a join public.users u on u.auth_user_id=a.id order by a.id loop
  if r.account_status<>'ACTIVE' then raise exception 'Non-active legacy profile requires operator review'; end if;
  insert into app_private.auth_subjects(id,email) values(r.id,coalesce(r.email,'')) on conflict(id) do nothing;
  if (select email from app_private.auth_subjects where id=r.id) is distinct from coalesce(r.email,'') then raise exception 'Subject email conflict'; end if;
  v_digest:=encode(extensions.digest(coalesce(r.encrypted_password,'')||':'||coalesce(r.email,''),'sha256'),'hex');
  select * into v_ledger from app_private.auth_import_ledger where subject_id=r.id;
  if found then
   if v_ledger.profile_id<>r.profile_id or v_ledger.source_digest<>v_digest then raise exception 'Legacy delta after import requires review'; end if;
   continue;
  end if;
  -- Native replacements made during the compatibility window already disabled
  -- their legacy authority; do not import the obsolete password or ban.
  update app_private.auth_subjects set disabled_until=case when native_owned then disabled_until
   when r.deleted_at is not null then 'infinity'::timestamptz else r.banned_until end where id=r.id;
  if not exists(select 1 from app_private.auth_credentials where subject_id=r.id) then
   v_supported:=coalesce(r.encrypted_password ~ '^\$2[aby]\$(0[4-9]|1[0-4])\$[./A-Za-z0-9]{53}$',false) and r.email_confirmed_at is not null;
   if coalesce(r.encrypted_password,'')<>'' or not exists(select 1 from auth.identities where user_id=r.id and provider in ('google','apple')) then
    insert into app_private.auth_credentials(subject_id,password_hash)
     values(r.id,case when v_supported then r.encrypted_password else '!recovery_required_'||gen_random_uuid()::text end);
    if not v_supported then v_recovery:=v_recovery+1; end if;
   else v_supported:=true;
   end if;
  else v_supported:=true;
  end if;
  insert into app_private.auth_import_ledger(subject_id,profile_id,source_digest,recovery_required) values(r.id,r.profile_id,v_digest,not v_supported);
  v_total:=v_total+1;
 end loop;
 perform app_private.import_social_identities();
 if exists(select 1 from auth.identities i left join app_private.auth_social_identities s
  on s.provider=i.provider and s.provider_subject=i.provider_id and s.subject_id=i.user_id where i.provider in ('google','apple') and s.subject_id is null) then
  raise exception 'OAuth reconciliation incomplete';
 end if;
 return jsonb_build_object('imported',v_total,'recovery_required',v_recovery,
  'mapped',(select count(*) from app_private.auth_import_ledger),
  'social',(select count(*) from app_private.auth_social_identities));
end $$;
revoke all on function app_private.import_auth_identities() from public,anon,authenticated,service_role,asisteam_api,asisteam_auth;

create function app_private.auth_cutover(p_action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_mode text; begin
 select mode into v_mode from app_private.auth_authority where singleton for update;
 if p_action='FREEZE' and v_mode='LEGACY' then
  update app_private.auth_authority set mode='FROZEN',frozen_at=now() where singleton;
 elsif p_action='ABORT' and v_mode='FROZEN' then
  -- Do not expose copied credentials beside a writable legacy authority after
  -- an import. A successful import commits to forward completion/recovery.
  if exists(select 1 from app_private.auth_import_ledger) then raise exception 'Imported identities require forward recovery'; end if;
  update app_private.auth_authority set mode='LEGACY',frozen_at=null where singleton;
 elsif p_action='ACTIVATE' and v_mode='FROZEN' then
  perform app_private.import_auth_identities();
  -- Sessions/link/recovery previously emitted by either authority must re-login.
  update app_private.auth_families set revoked_at=coalesce(revoked_at,now());
  update app_private.auth_recovery set consumed_at=coalesce(consumed_at,now());
  update app_private.auth_oauth_transactions set consumed_at=coalesce(consumed_at,now());
  delete from auth.sessions;
  delete from auth.refresh_tokens;
  drop trigger if exists trg_on_auth_user_created on auth.users;
  drop trigger if exists trg_auth_subject on auth.users;
  drop trigger if exists trg_auth_subject_delete on auth.users;
  update app_private.auth_authority set mode='NATIVE',activated_at=now() where singleton;
 elsif p_action='RECOVER_FORWARD' and v_mode='NATIVE' then
  -- Never switch back to a snapshot/flag: preserve new profiles, hashes, links
  -- and revocations. Restore a compatible Nest artifact against this same DB.
  update app_private.auth_authority set recovery_started_at=now() where singleton;
 else raise exception 'Invalid identity authority transition'; end if;
 return jsonb_build_object('mode',(select mode from app_private.auth_authority where singleton));
end $$;
revoke all on function app_private.auth_cutover(text) from public,anon,authenticated,service_role,asisteam_api,asisteam_auth;
