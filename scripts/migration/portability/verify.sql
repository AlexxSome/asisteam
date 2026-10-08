-- All negatives use subtransactions or a final rollback; restore is preserved.
begin;
select set_config('test.admin',:'admin',true),set_config('test.athlete',:'athlete',true);
do $$ declare v numeric; begin
  if exists(select 1 from pg_constraint where connamespace in ('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace,'app_private'::regnamespace) and not convalidated) then
    raise exception 'unvalidated_constraint'; end if;
  if (select count(*) from public.users)<>5 or (select count(*) from public.attendance_records)<>10 then raise exception 'fixture_count'; end if;
  if exists(select 1 from public.users where account_status='MANAGED' and auth_user_id is not null) then raise exception 'managed_identity'; end if;
  select attendance_pct into v from app_private.attendance_metrics(6,1,2,1);
  if v is distinct from 77.8 then raise exception 'canonical_metric'; end if;
  select attendance_pct into v from app_private.attendance_metrics(0,0,0,1);
  if v is not null then raise exception 'zero_denominator'; end if;
  if (select attendance_pct from app_private.attendance_report_counts where membership_id='15000000-0000-4000-8000-000000000021') is distinct from 77.8 then raise exception 'restored_history_metric'; end if;
  begin
    insert into public.memberships(user_id,group_id,role,status,joined_at)
    values(current_setting('test.admin')::uuid,'15000000-0000-4000-8000-000000000010','ADMIN','ACTIVE',now());
    raise exception 'unique_not_enforced'; exception when unique_violation then null; end;
  begin
    insert into public.memberships(user_id,group_id,role,status) values(gen_random_uuid(),'15000000-0000-4000-8000-000000000010','COACH','PENDING');
    raise exception 'fk_not_enforced'; exception when foreign_key_violation then null; end;
  begin
    update public.users set birthdate=app_private.chile_today()-interval '12 years' where id=current_setting('test.admin')::uuid;
    insert into public.memberships(user_id,group_id,role,status,joined_at)
    values(current_setting('test.admin')::uuid,'15000000-0000-4000-8000-000000000010','ATHLETE','ACTIVE',now());
    raise exception 'R1_not_enforced'; exception when check_violation then null; end;
  begin delete from public.consents; raise exception 'consent_history_not_enforced'; exception when check_violation then null; end;
  if exists(select 1 from pg_roles where rolname in ('authenticated','asisteam_api','asisteam_jobs','asisteam_webhook','asisteam_billing') and (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb)) then raise exception 'runtime_privilege'; end if;
end $$;
set local role asisteam_api;
select set_config('request.jwt.claim.sub',:'athlete_auth',true);
do $$ begin
 if public.auth_user_id() is distinct from current_setting('test.athlete')::uuid then raise exception 'identity_mapping'; end if;
 if (select count(*) from public.users)<>1 then raise exception 'third_party_profile'; end if;
 if (select count(*) from public.v_athlete_attendance_history)<>10 then raise exception 'own_history'; end if;
 if public.is_group_admin('15000000-0000-4000-8000-000000000010') then raise exception 'athlete_admin'; end if;
 if not public.is_group_admin('15000000-0000-4000-8000-000000000011') then raise exception 'multi_group_role'; end if;
end $$;
select set_config('request.jwt.claim.sub',:'admin_auth',true);
do $$ begin
 if not public.is_group_admin('15000000-0000-4000-8000-000000000010') then raise exception 'admin_grant'; end if;
 if public.is_member('15000000-0000-4000-8000-000000000011') then raise exception 'tenant_leak'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform 1 from public.users; raise exception 'anon_profile'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
