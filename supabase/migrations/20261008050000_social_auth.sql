-- MIG-19 (#163): provider subjects are authoritative; email never links accounts.
create table app_private.auth_social_identities (
 provider text not null check(provider in ('google','apple')),
 provider_subject text not null check(length(provider_subject) between 1 and 255),
 subject_id uuid not null references app_private.auth_subjects(id),
 created_at timestamptz not null default now(),
 primary key(provider,provider_subject)
);
create index on app_private.auth_social_identities(subject_id);
create table app_private.auth_oauth_transactions (
 id uuid primary key,
 expires_at timestamptz not null default now()+interval '10 minutes', consumed_at timestamptz,
 link_subject_id uuid references app_private.auth_subjects(id),
 link_session_id uuid references app_private.auth_families(id),
 check((link_subject_id is null)=(link_session_id is null))
);
alter table app_private.auth_social_identities enable row level security;
alter table app_private.auth_oauth_transactions enable row level security;
revoke all on app_private.auth_social_identities,app_private.auth_oauth_transactions from public,anon,authenticated,service_role,asisteam_api,asisteam_auth;

-- Repeat with the migrator during the legacy OAuth write freeze before enabling
-- Auth=nest. Idempotent same mapping; an inconsistent pair fails the entire import.
create function app_private.import_social_identities() returns integer
language plpgsql security definer set search_path='' as $$
declare v_count integer; begin
 if exists(select 1 from auth.identities i where i.provider in ('google','apple')
   and (nullif(i.provider_id,'') is null or length(i.provider_id)>255
     or (i.identity_data->>'sub' is not null and i.identity_data->>'sub'<>i.provider_id))) then
  raise exception 'OAuth subject mapping requires operator review';
 end if;
 if exists(select 1 from auth.identities i join app_private.auth_social_identities s
   on s.provider=i.provider and s.provider_subject=i.provider_id
   where i.provider in ('google','apple') and s.subject_id<>i.user_id) then
  raise exception 'OAuth identity conflict requires operator review';
 end if;
 insert into app_private.auth_social_identities(provider,provider_subject,subject_id,created_at)
  select i.provider,i.provider_id,i.user_id,coalesce(i.created_at,now())
  from auth.identities i join app_private.auth_subjects s on s.id=i.user_id
  join public.users u on u.auth_user_id=i.user_id
  where i.provider in ('google','apple')
  on conflict(provider,provider_subject) do nothing;
 get diagnostics v_count=row_count;
 return v_count;
end $$;
revoke all on function app_private.import_social_identities() from public,anon,authenticated,service_role,asisteam_api,asisteam_auth;
select app_private.import_social_identities();

-- Imported social-only subjects survive GoTrue retirement as password subjects do.
create or replace function app_private.sync_auth_subject() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  if not exists(select 1 from app_private.auth_credentials where subject_id=old.id)
    and not exists(select 1 from app_private.auth_social_identities where subject_id=old.id) then
   delete from app_private.auth_subjects where id=old.id;
  end if;
  return old;
 end if;
 insert into app_private.auth_subjects(id,email) values(new.id,coalesce(new.email,''))
 on conflict(id) do update set email=excluded.email;
 return new;
end $$;

-- Keep MIG-18 unchanged behind the same least-privilege dispatcher.
alter function app_private.auth_operation(text,jsonb) rename to password_auth_operation;
revoke all on function app_private.password_auth_operation(text,jsonb) from public,anon,authenticated,service_role,asisteam_api,asisteam_auth;
create function app_private.auth_operation(p_operation text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 v_id uuid; v_subject uuid; v_existing uuid; v_session uuid; v_user uuid;
 v_transaction app_private.auth_oauth_transactions%rowtype;
 v_provider text; v_provider_subject text; v_email text; v_name text;
begin
 if p_operation not in ('oauth_begin','oauth_check','oauth_complete') then
  return app_private.password_auth_operation(p_operation,p_data);
 end if;
 v_id:=(p_data->>'transaction_id')::uuid;
 if p_operation='oauth_begin' then
  v_subject:=(p_data#>>'{link,subject_id}')::uuid;
  v_session:=(p_data#>>'{link,session_id}')::uuid;
  if (v_subject is null)<>(v_session is null) then return jsonb_build_object('error','authentication_required'); end if;
  if v_subject is not null then
   perform 1 from app_private.auth_families f join public.users u on u.auth_user_id=f.subject_id
    where f.id=v_session and f.subject_id=v_subject and f.revoked_at is null and f.expires_at>statement_timestamp() and u.account_status='ACTIVE' for share of f;
   if not found then return jsonb_build_object('error','authentication_required'); end if;
  end if;
  delete from app_private.auth_oauth_transactions where expires_at<now()-interval '1 day';
  insert into app_private.auth_oauth_transactions(id,link_subject_id,link_session_id) values(v_id,v_subject,v_session);
  return '{}'::jsonb;
 end if;
 select * into v_transaction from app_private.auth_oauth_transactions where id=v_id for update;
 if not found or v_transaction.consumed_at is not null or v_transaction.expires_at<=statement_timestamp()
   or v_transaction.link_subject_id is distinct from (p_data#>>'{link,subject_id}')::uuid
   or v_transaction.link_session_id is distinct from (p_data#>>'{link,session_id}')::uuid then
  return jsonb_build_object('error','authentication_required');
 end if;
 if p_operation='oauth_check' and v_transaction.link_subject_id is not null then
  perform 1 from app_private.auth_families f join public.users u on u.auth_user_id=f.subject_id
   where f.id=v_transaction.link_session_id and f.subject_id=v_transaction.link_subject_id
    and f.revoked_at is null and f.expires_at>statement_timestamp() and u.account_status='ACTIVE' for share of f;
  if not found then return jsonb_build_object('error','authentication_required'); end if;
 end if;
 if p_operation='oauth_check' then return '{}'::jsonb; end if;
 v_provider:=p_data->>'provider'; v_provider_subject:=p_data->>'provider_subject';
 v_email:=lower(p_data->>'email');
 if v_provider not in ('google','apple') or v_provider is null or v_provider_subject is null
   or length(v_provider_subject) not between 1 and 255 or v_email is null or length(v_email) not between 3 and 254
   or p_data->>'refresh_hash' is null or p_data->>'refresh_hash' !~ '^[0-9a-f]{64}$' then
  raise sqlstate 'PT400' using message='invalid_request';
 end if;
 -- Serialize the provider pair across login/link and concurrent first callbacks.
 perform pg_advisory_xact_lock(hashtextextended(v_provider||':'||v_provider_subject,163));
 select subject_id into v_existing from app_private.auth_social_identities
  where provider=v_provider and provider_subject=v_provider_subject;
 update app_private.auth_oauth_transactions set consumed_at=now() where id=v_id;
 if v_transaction.link_subject_id is not null then
  v_subject:=v_transaction.link_subject_id;
  if v_existing is not null and v_existing<>v_subject then return jsonb_build_object('error','authentication_required'); end if;
 elsif v_existing is not null then v_subject:=v_existing;
 else
  -- Email collision, including MANAGED/INVITED, requires the canonical access or
  -- invitation flow plus explicit authenticated linking. Never upsert a profile.
  if exists(select 1 from public.users where lower(email)=v_email) then return jsonb_build_object('error','authentication_required'); end if;
  v_subject:=(p_data->>'subject_id')::uuid;
 end if;
 -- Match password login/reset lock order: credential before family. Existing
 -- password subjects cannot gain an OAuth family outside reset's revocation.
 -- Pair serialization precedes this lock for every completion to avoid a cycle
 -- between a concurrent login and explicit linking of that same pair.
 perform 1 from app_private.auth_credentials where subject_id=v_subject for update;
 if v_transaction.link_subject_id is not null then
  perform 1 from app_private.auth_families f join public.users u on u.auth_user_id=f.subject_id
   where f.id=v_transaction.link_session_id and f.subject_id=v_subject
    and f.revoked_at is null and f.expires_at>statement_timestamp() and u.account_status='ACTIVE' for share of f;
  if not found then return jsonb_build_object('error','authentication_required'); end if;
 end if;
 begin
  if v_existing is null and v_transaction.link_subject_id is null then
   insert into app_private.auth_subjects(id,email) values(v_subject,v_email);
   v_name:=left(coalesce(nullif(btrim(p_data->>'name'),''),'Usuario de Asisteam'),120);
   insert into public.users(auth_user_id,email,full_name,account_status)
    values(v_subject,v_email,v_name,'ACTIVE') returning id into v_user;
   -- No inferred birthdate, consent or memberships; onboarding uses canonical RPC.
  else
   select id into v_user from public.users where auth_user_id=v_subject and account_status='ACTIVE';
   if v_user is null then return jsonb_build_object('error','authentication_required'); end if;
  end if;
  if v_existing is null then
   insert into app_private.auth_social_identities(provider,provider_subject,subject_id) values(v_provider,v_provider_subject,v_subject);
  end if;
  insert into app_private.auth_families(subject_id) values(v_subject) returning id into v_session;
  insert into app_private.auth_refresh(token_hash,family_id) values(p_data->>'refresh_hash',v_session);
 exception when unique_violation then
  -- A simultaneous password/OAuth signup may win the email uniqueness check;
  -- roll back all creation effects, but persist consumption of this transaction.
  return jsonb_build_object('error','authentication_required');
 end;
 return jsonb_build_object('subject_id',v_subject,'session_id',v_session);
end $$;
revoke all on function app_private.auth_operation(text,jsonb) from public,anon,authenticated,service_role,asisteam_api;
grant execute on function app_private.auth_operation(text,jsonb) to asisteam_auth;
