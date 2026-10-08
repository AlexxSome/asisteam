-- MIG-18 (#162): independent credentials/sessions; GoTrue remains for #164.
do $$ begin
 if not exists(select 1 from pg_roles where rolname='asisteam_auth') then
  create role asisteam_auth nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
 end if;
end $$;
grant asisteam_auth to postgres with inherit false,set true;
grant usage on schema app_private to asisteam_auth;

-- Subjects preserve the identifier used by auth.uid()/profile/avatar. This is
-- only a compatibility map; no password or session is imported by this migration.
create table app_private.auth_subjects (
 id uuid primary key, email text not null,
 created_at timestamptz not null default now()
);
insert into app_private.auth_subjects(id,email) select id,coalesce(email,'') from auth.users;
create function app_private.sync_auth_subject() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  -- Native credentials survive deletion of the legacy identity during #164.
  if not exists(select 1 from app_private.auth_credentials where subject_id=old.id) then
   delete from app_private.auth_subjects where id=old.id;
  end if;
  return old;
 end if;
 insert into app_private.auth_subjects(id,email) values(new.id,coalesce(new.email,''))
 on conflict(id) do update set email=excluded.email;
 return new;
end $$;
create trigger trg_auth_subject before insert or update of email on auth.users for each row execute function app_private.sync_auth_subject();
alter table public.users drop constraint users_auth_user_id_fkey;
alter table public.users add constraint users_auth_user_id_fkey foreign key(auth_user_id) references app_private.auth_subjects(id) on delete set null;
comment on column public.users.auth_user_id is 'Authentication subject UUID; legacy/native compatibility map in app_private.auth_subjects, NULL for MANAGED/INVITED without credentials.';

create table app_private.auth_credentials (
 subject_id uuid primary key references app_private.auth_subjects(id),
 password_hash text not null check(length(password_hash) between 20 and 512),
 updated_at timestamptz not null default now()
);
create trigger trg_auth_subject_delete after delete on auth.users for each row execute function app_private.sync_auth_subject();
create table app_private.auth_families (
 id uuid primary key default gen_random_uuid(), subject_id uuid not null references app_private.auth_subjects(id),
 expires_at timestamptz not null default now()+interval '30 days', revoked_at timestamptz,
 created_at timestamptz not null default now()
);
create index on app_private.auth_families(subject_id);
create table app_private.auth_refresh (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 family_id uuid not null references app_private.auth_families(id), consumed_at timestamptz
);
create table app_private.auth_recovery (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),
 subject_id uuid not null references app_private.auth_subjects(id),
 expires_at timestamptz not null default now()+interval '60 minutes', consumed_at timestamptz
);
create table app_private.auth_attempts (
 key text primary key check(key ~ '^[0-9a-f]{64}$'), count integer not null,
 reset_at timestamptz not null default now()+interval '15 minutes'
);
do $$ declare t text; begin
 foreach t in array array['auth_subjects','auth_credentials','auth_families','auth_refresh','auth_recovery','auth_attempts'] loop
  execute format('alter table app_private.%I enable row level security',t);
  execute format('revoke all on app_private.%I from public,anon,authenticated,service_role,asisteam_api,asisteam_auth',t);
 end loop;
end $$;
revoke all on function app_private.sync_auth_subject() from public,anon,authenticated,service_role;

-- Preserve the exact current canonical invitation rules (R1, activation consent,
-- capacity and history), changing only its identity/email source.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('app_private.accept_invitation(text,uuid,jsonb)'::regprocedure);
 if position('select email into v_auth_email from auth.users where id = p_auth_user_id;' in definition)=0 then
  raise exception 'Canonical invitation identity lookup changed; review migration';
 end if;
 execute replace(definition,'select email into v_auth_email from auth.users where id = p_auth_user_id;',
  'select email into v_auth_email from app_private.auth_subjects where id = p_auth_user_id;');
end $$;

create function app_private.native_session_user_id(p_session_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; begin
 -- SHARE conflicts with revocation UPDATE: authorized writes and revocation
 -- serialize; transaction-local provider is installed only by the API runtime.
 if current_setting('request.jwt.claims',true)::jsonb ->> 'auth_provider' is distinct from 'nest' then return null; end if;
 perform 1 from app_private.auth_families where id=p_session_id and subject_id=auth.uid()
  and revoked_at is null and expires_at>statement_timestamp() for share;
 if not found then return null; end if;
 select id into v_id from public.users where auth_user_id=auth.uid() and account_status='ACTIVE';
 return v_id;
end $$;
revoke all on function app_private.native_session_user_id(uuid) from public,anon,authenticated,service_role;
grant execute on function app_private.native_session_user_id(uuid) to asisteam_api;

-- Narrow privileged boundary: HTTP selects a fixed operation; credentials are
-- never granted to asisteam_api/anon/PostgREST. All mutation effects are atomic.
create function app_private.auth_operation(p_operation text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_subject uuid; v_user uuid; v_family app_private.auth_families%rowtype;
 v_refresh app_private.auth_refresh%rowtype; v_recovery app_private.auth_recovery%rowtype;
 v_hash text; v_result jsonb; v_count integer; v_reset timestamptz;
begin
 if p_operation='rate' then
  perform pg_advisory_xact_lock(hashtextextended(p_data->>'key',162));
  delete from app_private.auth_attempts where reset_at<now()-interval '1 day';
  select count,reset_at into v_count,v_reset from app_private.auth_attempts where key=p_data->>'key';
  if v_reset is null or v_reset<=now() then v_count:=0;v_reset:=now()+interval '15 minutes'; end if;
  if v_count >= (p_data->>'limit')::integer then return jsonb_build_object('allowed',false); end if;
  insert into app_private.auth_attempts(key,count,reset_at) values(p_data->>'key',v_count+1,v_reset)
   on conflict(key) do update set count=excluded.count,reset_at=excluded.reset_at;
  return jsonb_build_object('allowed',true);
 elsif p_operation='rate_success' then
  delete from app_private.auth_attempts where key=p_data->>'key';
  return '{}'::jsonb;
 elsif p_operation='lookup' then
  select u.auth_user_id,c.password_hash into v_subject,v_hash from public.users u
   join app_private.auth_credentials c on c.subject_id=u.auth_user_id
   where lower(u.email)=lower(p_data->>'email') and u.account_status='ACTIVE';
  return jsonb_build_object('subject_id',v_subject,'password_hash',v_hash);
 elsif p_operation='subject' then
  select c.password_hash into v_hash from app_private.auth_credentials c join public.users u on u.auth_user_id=c.subject_id
    where c.subject_id=(p_data->>'subject_id')::uuid and u.account_status='ACTIVE';
  return jsonb_build_object('password_hash',v_hash);
 elsif p_operation='register' then
  -- Any business error rolls back identity, credentials, consent and claim.
  if p_data#>'{profile,terms_accepted}' is distinct from 'true'::jsonb
    or p_data#>>'{profile,terms_version}' is distinct from app_private.account_terms_version() then
   raise sqlstate 'PT400' using message='account_terms_required';
  end if;
  v_subject:=(p_data->>'subject_id')::uuid;
  insert into app_private.auth_subjects(id,email) values(v_subject,lower(p_data#>>'{profile,email}'));
  if p_data->>'invitation_hash' is not null then
   if p_data->>'claim'='true' then
    v_result:=app_private.accept_invitation(p_data->>'invitation_hash',v_subject,
      jsonb_build_object('managed_claim',true,'terms_version',p_data#>>'{profile,terms_version}'));
   else
    v_result:=app_private.accept_invitation(p_data->>'invitation_hash',v_subject,p_data->'profile');
   end if;
   if v_result ? 'error' then raise sqlstate 'PT422' using message=v_result->>'error'; end if;
   select id into v_user from public.users where auth_user_id=v_subject;
  else
   if length(trim(p_data#>>'{profile,full_name}')) not between 2 and 120
     or (p_data#>>'{profile,birthdate}')::date>=app_private.chile_today() then raise sqlstate 'PT400' using message='invalid_registration'; end if;
   insert into public.users(auth_user_id,email,full_name,birthdate,phone,account_status)
    values(v_subject,lower(p_data#>>'{profile,email}'),trim(p_data#>>'{profile,full_name}'),
      (p_data#>>'{profile,birthdate}')::date,nullif(p_data#>>'{profile,phone}',''),'ACTIVE') returning id into v_user;
  end if;
  insert into app_private.auth_credentials(subject_id,password_hash) values(v_subject,p_data->>'password_hash');
  perform app_private.record_account_consent(v_user,p_data#>>'{profile,terms_version}',case when p_data->>'invitation_hash' is null then 'EMAIL_SIGNUP' else 'INVITATION' end);
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('user_id',v_user);
 elsif p_operation='login' then
  v_subject:=(p_data->>'subject_id')::uuid;
  select password_hash into v_hash from app_private.auth_credentials where subject_id=v_subject for update;
  if v_hash is distinct from p_data->>'expected_hash' or not exists(select 1 from public.users where auth_user_id=v_subject and account_status='ACTIVE') then
   return jsonb_build_object('error','authentication_required');
  end if;
  if p_data->>'rehash' is not null then update app_private.auth_credentials set password_hash=p_data->>'rehash',updated_at=now() where subject_id=v_subject; end if;
  insert into app_private.auth_families(subject_id) values(v_subject) returning * into v_family;
  insert into app_private.auth_refresh(token_hash,family_id) values(p_data->>'refresh_hash',v_family.id);
  return jsonb_build_object('subject_id',v_subject,'session_id',v_family.id);
 elsif p_operation='refresh' then
  -- Find first, then lock family before token: all family operations share order.
  select * into v_refresh from app_private.auth_refresh where token_hash=p_data->>'token_hash';
  if not found then return jsonb_build_object('error','authentication_required'); end if;
  select * into v_family from app_private.auth_families where id=v_refresh.family_id for update;
  select * into v_refresh from app_private.auth_refresh where token_hash=p_data->>'token_hash' for update;
  if v_refresh.consumed_at is not null then
   update app_private.auth_families set revoked_at=coalesce(revoked_at,now()) where id=v_family.id;
   return jsonb_build_object('error','authentication_required');
  end if;
  if v_family.revoked_at is not null or v_family.expires_at<=now() or not exists(select 1 from public.users where auth_user_id=v_family.subject_id and account_status='ACTIVE') then
   return jsonb_build_object('error','authentication_required');
  end if;
  update app_private.auth_refresh set consumed_at=now() where token_hash=v_refresh.token_hash;
  insert into app_private.auth_refresh(token_hash,family_id) values(p_data->>'next_hash',v_family.id);
  return jsonb_build_object('subject_id',v_family.subject_id,'session_id',v_family.id);
 elsif p_operation='logout' then
  update app_private.auth_families set revoked_at=coalesce(revoked_at,now()) where id=(p_data->>'session_id')::uuid and subject_id=(p_data->>'subject_id')::uuid;
  return jsonb_build_object('success',true);
 elsif p_operation='recovery' then
  select u.auth_user_id into v_subject from public.users u join app_private.auth_credentials c on c.subject_id=u.auth_user_id
   where lower(u.email)=lower(p_data->>'email') and u.account_status='ACTIVE';
  if v_subject is null then return '{}'::jsonb; end if;
  insert into app_private.auth_recovery(token_hash,subject_id) values(p_data->>'token_hash',v_subject);
  return jsonb_build_object('send',true);
 elsif p_operation='reset' or p_operation='password' then
  if p_operation='reset' then
   select * into v_recovery from app_private.auth_recovery where token_hash=p_data->>'token_hash';
   v_subject:=v_recovery.subject_id;
  else v_subject:=(p_data->>'subject_id')::uuid; end if;
  -- Credential lock serializes login, password changes and concurrent recovery.
  select password_hash into v_hash from app_private.auth_credentials where subject_id=v_subject for update;
  if v_hash is null then return jsonb_build_object('error','authentication_required'); end if;
  if p_operation='reset' then
   select * into v_recovery from app_private.auth_recovery where token_hash=p_data->>'token_hash' for update;
   if v_recovery.consumed_at is not null or v_recovery.expires_at<=now() then return jsonb_build_object('error','authentication_required'); end if;
  elsif v_hash is distinct from p_data->>'expected_hash' then return jsonb_build_object('error','authentication_required');
  else
   perform 1 from app_private.auth_families where id=(p_data->>'session_id')::uuid and subject_id=v_subject and revoked_at is null and expires_at>now() for share;
   if not found then return jsonb_build_object('error','authentication_required'); end if;
  end if;
  if not exists(select 1 from public.users where auth_user_id=v_subject and account_status='ACTIVE') then return jsonb_build_object('error','authentication_required'); end if;
  update app_private.auth_credentials set password_hash=p_data->>'password_hash',updated_at=now() where subject_id=v_subject;
  update app_private.auth_recovery set consumed_at=coalesce(consumed_at,now()) where subject_id=v_subject;
  update app_private.auth_families set revoked_at=coalesce(revoked_at,now()) where subject_id=v_subject;
  -- Password replaced in Nest: invalidate legacy sessions and disable the old
  -- password authority for that migrated identity (remaining subjects unaffected).
  delete from auth.sessions where user_id=v_subject;
  update auth.users set banned_until='infinity'::timestamptz where id=v_subject;
  return jsonb_build_object('success',true);
 end if;
 raise sqlstate 'PT400' using message='invalid_request';
end $$;
revoke all on function app_private.auth_operation(text,jsonb) from public,anon,authenticated,service_role,asisteam_api;
grant execute on function app_private.auth_operation(text,jsonb) to asisteam_auth;
