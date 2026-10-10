-- Synthetic domain accounts for transactional pgTAP cases. The runtime owns
-- subjects/profiles; these seeds do not install a provider schema or SDK.
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
do $$begin
 if not exists(select 1 from pg_roles where rolname='asisteam_test_anonymous') then create role asisteam_test_anonymous nologin;end if;
 if not exists(select 1 from pg_roles where rolname='asisteam_test_operator') then create role asisteam_test_operator nologin;end if;
end$$;
grant usage on schema extensions to asisteam_test_anonymous,asisteam_test_operator;
grant execute on all functions in schema extensions to asisteam_test_anonymous,asisteam_test_operator;
create temporary table fixture_accounts(id uuid primary key,email text,profile_data jsonb default '{}',provider_info jsonb default '{}');
create temporary table fixture_social_identities(provider_id text,user_id uuid,identity_data jsonb,provider text);
create function pg_temp.seed_native_account() returns trigger language plpgsql as $$
declare profile_id uuid; registration app_private.invitation_registrations%rowtype; outcome jsonb;
begin
 insert into app_private.auth_subjects(id,email,native_owned) values(new.id,new.email,true);
 if new.profile_data ? 'invitation_registration_nonce' then
  select * into registration from app_private.invitation_registrations where nonce_hash=encode(extensions.digest(new.profile_data->>'invitation_registration_nonce','sha256'),'hex') and email=lower(new.email) and expires_at>now() for update;
  if not found then raise exception 'invitation_not_available';end if;
  outcome:=app_private.accept_invitation(registration.token_hash,new.id,registration.registration);
  if outcome ? 'error' then raise exception '%',outcome->>'error';end if;
  select id into profile_id from public.users where auth_user_id=new.id;
  perform app_private.record_account_consent(profile_id,registration.registration->>'terms_version','INVITATION');
  delete from app_private.invitation_registrations where nonce_hash=registration.nonce_hash;
 else
  insert into public.users(auth_user_id,full_name,email,phone,birthdate,account_status)
   values(new.id,coalesce(nullif(trim(new.profile_data->>'full_name'),''),split_part(new.email,'@',1)),new.email,nullif(trim(new.profile_data->>'phone'),''),nullif(new.profile_data->>'birthdate','')::date,'ACTIVE') returning id into profile_id;
  if coalesce(new.provider_info->>'provider','email')='email' and new.profile_data ? 'account_terms' then
   if (new.profile_data #> '{account_terms,accepted}') is distinct from 'true'::jsonb then raise sqlstate 'PT400' using message='account_terms_required';end if;
   perform app_private.record_account_consent(profile_id,new.profile_data #>> '{account_terms,version}','EMAIL_SIGNUP');
  end if;
 end if;
 return new;
end$$;
create trigger seed_native_account after insert on fixture_accounts for each row execute function pg_temp.seed_native_account();
-- Catalog assertions treat a removed capability as non-executable. This helper
-- is test-only and distinguishes absence from a grant; it never supplies it.
create function pg_temp.can_execute(actor text,signature text,privilege text) returns boolean language sql security definer set search_path='' as $$
 select case when to_regprocedure(signature) is null then false else has_function_privilege(actor,to_regprocedure(signature),privilege) end;
$$;
do $$begin execute format('grant usage,create on schema %I to asisteam_api,asisteam_member,asisteam_test_anonymous,asisteam_test_operator,asisteam_jobs', (select nspname from pg_namespace where oid=pg_my_temp_schema()));end$$;

create function pg_temp.can_execute(actor text,function_oid oid,privilege text) returns boolean language sql security definer set search_path='' as $$select has_function_privilege(actor,function_oid,privilege)$$;
