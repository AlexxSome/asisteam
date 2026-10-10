-- Remove inactive provider entry points after the independent baseline.
-- Fail closed if an imported deployment has not completed its handoffs.
do $$begin
 if exists(select 1 from app_private.auth_authority where mode not in ('NATIVE','FROZEN'))
 or exists(select 1 from app_private.billing_transport where mode<>'NEST')
 or exists(select 1 from app_private.majority_executor where mode not in ('WORKER','DRAINING'))
 or exists(select 1 from app_private.announcement_executor where mode not in ('WORKER','DRAINING')) then raise exception 'Native authorities required before retirement';end if;
end$$;
alter table app_private.auth_authority alter column mode set default 'NATIVE',drop constraint auth_authority_mode_check,add constraint auth_authority_mode_check check(mode in ('NATIVE','FROZEN'));
alter table app_private.majority_executor alter column mode set default 'WORKER',drop constraint majority_executor_mode_check,add constraint majority_executor_mode_check check(mode in ('WORKER','DRAINING'));
alter table app_private.announcement_executor alter column mode set default 'WORKER',drop constraint announcement_executor_mode_check,add constraint announcement_executor_mode_check check(mode in ('WORKER','DRAINING'));
alter table app_private.billing_transport drop constraint billing_transport_mode_check,add constraint billing_transport_mode_check check(mode='NEST');
CREATE OR REPLACE FUNCTION app_private.auth_operation(p_operation text, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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

 end if;
 return v_result;
end $$;
CREATE OR REPLACE FUNCTION app_private.password_auth_operation(p_operation text, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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
   where lower(u.email)=lower(p_data->>'email') and u.account_status in ('ACTIVE','INVITED');
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
  if not exists(select 1 from public.users where auth_user_id=v_subject
    and (account_status='ACTIVE' or p_operation='reset' and account_status='INVITED')) then
   return jsonb_build_object('error','authentication_required');
  end if;
  -- HU-GEN-03: verified recovery restores an already credentialed INVITED
  -- account. It grants neither membership nor consent; MANAGED stays blocked.
  if p_operation='reset' then update public.users set account_status='ACTIVE'
    where auth_user_id=v_subject and account_status='INVITED';end if;
  update app_private.auth_credentials set password_hash=p_data->>'password_hash',updated_at=now() where subject_id=v_subject;
  update app_private.auth_recovery set consumed_at=coalesce(consumed_at,now()) where subject_id=v_subject;
  update app_private.auth_families set revoked_at=coalesce(revoked_at,now()) where subject_id=v_subject;
  -- Native password changes already revoke every active family above.

  return jsonb_build_object('success',true);
 end if;
 raise sqlstate 'PT400' using message='invalid_request';
end $$;
create or replace function app_private.auth_cutover(p_action text) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_mode text;
begin
 select mode into current_mode from app_private.auth_authority where singleton for update;
 if p_action='FREEZE' and current_mode='NATIVE' then
  update app_private.auth_authority set mode='FROZEN' where singleton;
 elsif p_action='ABORT' and current_mode='FROZEN' then
  update app_private.auth_authority set mode='NATIVE' where singleton;
 elsif p_action='RECOVER_FORWARD' and current_mode='NATIVE' then
  update app_private.auth_authority set recovery_started_at=now() where singleton;
 else raise exception 'Native authority required';end if;
 return jsonb_build_object('mode',(select mode from app_private.auth_authority where singleton));
end$$;
-- Administrative maintenance changes admission, never restores old data or a
-- provider authority. Runtime roles have no execute grant on this function.
do $$declare item record;begin
 for item in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
  (n.nspname='app_private' and p.proname in ('api_session_user_id','invalidate_legacy_subject','legacy_majority_claim','legacy_majority_complete','billing_handoff'))
  or (n.nspname='public' and p.proname in ('begin_subscription_checkout','claim_subscription_creation','get_subscription_context','lookup_billing_subscription','reject_subscription_creation','sync_group_subscription','sync_subscription_invoice','claim_announcement_push','complete_announcement_push','record_announcement_push_run','run_guardianship_majority','claim_guardianship_majority_emails','complete_guardianship_majority_email'))
 loop execute format('drop function %s',item.signature);end loop;
end$$;
