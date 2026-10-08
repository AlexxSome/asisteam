-- MIG-13 (#157): one scheduler, leased transitions and independent delivery retries.
create table app_private.majority_executor (
  singleton boolean primary key default true check(singleton),
  mode text not null default 'LEGACY' check(mode in ('LEGACY','DRAINING','WORKER')),
  draining_since timestamptz,
  email_next_at timestamptz
);
insert into app_private.majority_executor(singleton) values(true);
create table app_private.majority_tasks (
  run_date date primary key,
  completed_at timestamptz,
  lease_until timestamptz,
  lease_token uuid,
  attempts integer not null default 0 check(attempts>=0)
);
alter table app_private.majority_executor enable row level security;
alter table app_private.majority_tasks enable row level security;
revoke all on app_private.majority_executor, app_private.majority_tasks from public,anon,authenticated,service_role,asisteam_jobs;

alter table app_private.guardianship_majority_deliveries
  add column attempts integer not null default 0 check(attempts>=0),
  add column retry_at timestamptz not null default now(),
  add column first_attempt_at timestamptz,
  add column blocked_at timestamptz,
  add column payload jsonb;
-- An old uncertain send has no durable original payload/first attempt: require reconciliation.
update app_private.guardianship_majority_deliveries set blocked_at=now()
where sent_at is null and claimed_at is not null;

-- Private clock seam for transactional fixtures; no runtime role can replace it.
create function app_private.worker_now() returns timestamptz language sql stable set search_path='' as $$ select statement_timestamp() $$;
revoke all on function app_private.worker_now() from public,anon,authenticated,service_role,asisteam_jobs;

alter function public.run_guardianship_majority() set schema app_private;
alter function app_private.run_guardianship_majority() rename to majority_transition;
alter function public.claim_guardianship_majority_emails() set schema app_private;
alter function app_private.claim_guardianship_majority_emails() rename to legacy_majority_claim;
alter function public.complete_guardianship_majority_email(uuid,uuid) set schema app_private;
alter function app_private.complete_guardianship_majority_email(uuid,uuid) rename to legacy_majority_complete;
revoke all on function app_private.majority_transition(), app_private.legacy_majority_claim(), app_private.legacy_majority_complete(uuid,uuid) from public,anon,authenticated,service_role,asisteam_jobs;

create function public.run_guardianship_majority() returns integer language plpgsql security definer set search_path='' as $$
begin
  perform 1 from app_private.majority_executor where mode='LEGACY' for share;
  if not found then raise exception using errcode='55000',message='Ejecutor anterior deshabilitado'; end if;
  return app_private.majority_transition();
end $$;
create function public.claim_guardianship_majority_emails()
returns table(delivery_id uuid,claim_token uuid,email text,full_name text,audience text)
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from app_private.majority_executor where mode='LEGACY' for share;
  if not found then raise exception using errcode='55000',message='Ejecutor anterior deshabilitado'; end if;
  return query select c.delivery_id,c.claim_token,c.email,c.full_name,c.audience from app_private.legacy_majority_claim() c;
end $$;
create function public.complete_guardianship_majority_email(p_delivery_id uuid,p_claim_token uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from app_private.majority_executor where mode in ('LEGACY','DRAINING') for share;
  if not found then raise exception using errcode='55000',message='Ejecutor anterior deshabilitado'; end if;
  perform app_private.legacy_majority_complete(p_delivery_id,p_claim_token);
end $$;
revoke all on function public.run_guardianship_majority(),public.claim_guardianship_majority_emails(),public.complete_guardianship_majority_email(uuid,uuid) from public,anon,authenticated;
grant execute on function public.run_guardianship_majority(),public.claim_guardianship_majority_emails(),public.complete_guardianship_majority_email(uuid,uuid) to service_role;

-- Operator only. Drain legacy requests/leases before enabling any new executor.
create function app_private.majority_handoff(p_mode text,p_legacy_stopped boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare v_state app_private.majority_executor; v_now timestamptz:=app_private.worker_now(); v_has_cron boolean:=false;
begin
  select * into v_state from app_private.majority_executor for update;
  if p_mode='DRAINING' and v_state.mode='LEGACY' then
    if to_regclass('cron.job') is not null then
      execute 'select cron.unschedule(jobid) from cron.job where jobname=''guardianship-majority''';
    end if;
    update app_private.majority_executor set mode='DRAINING',draining_since=v_now;
  elsif p_mode='WORKER' and v_state.mode='DRAINING' then
    if to_regclass('cron.job') is not null then
      execute 'select exists(select 1 from cron.job where jobname=''guardianship-majority'')' into v_has_cron;
    end if;
    if p_legacy_stopped is distinct from true or v_now<v_state.draining_since+interval '11 minutes' or v_has_cron then
      raise exception using errcode='55000',message='Debe completarse el drenaje del ejecutor anterior';
    end if;
    update app_private.guardianship_majority_deliveries set blocked_at=coalesce(blocked_at,v_now)
      where sent_at is null and claimed_at is not null and payload is null;
    update app_private.majority_executor set mode='WORKER';
  elsif p_mode=v_state.mode then return;
  else raise exception using errcode='55000',message='Transición de ejecutor inválida';
  end if;
end $$;
revoke all on function app_private.majority_handoff(text,boolean) from public,anon,authenticated,service_role,asisteam_jobs;

create function app_private.worker_claim_transition() returns table(run_date date,lease_token uuid)
language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=app_private.worker_now();
begin
  perform 1 from app_private.majority_executor where mode='WORKER' for share;
  if not found then return; end if;
  -- Chile's missing 00:30 on spring DST runs at the first later local time.
  -- A task leased yesterday must not run the new day's transition before 00:30.
  if (v_now at time zone 'America/Santiago')::time<time '00:30' then return; end if;
  insert into app_private.majority_tasks(run_date) values((v_now at time zone 'America/Santiago')::date) on conflict do nothing;
  return query with pending as (
    select t.run_date from app_private.majority_tasks t where t.completed_at is null
      and (t.lease_until is null or t.lease_until<=v_now)
    order by t.run_date limit 1 for update skip locked
  ) update app_private.majority_tasks t set lease_token=gen_random_uuid(),lease_until=v_now+interval '1 minute',attempts=t.attempts+1
    from pending p where t.run_date=p.run_date returning t.run_date,t.lease_token;
end $$;
create function app_private.worker_complete_transition(p_date date,p_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from app_private.majority_executor where mode='WORKER' for share;
  if not found then return false; end if;
  perform 1 from app_private.majority_tasks where run_date=p_date and lease_token=p_token and lease_until>app_private.worker_now() and completed_at is null for update;
  if not found then return false; end if;
  if (app_private.worker_now() at time zone 'America/Santiago')::time<time '00:30' then return false; end if;
  perform app_private.majority_transition();
  update app_private.majority_tasks set completed_at=app_private.worker_now(),lease_until=null where run_date=p_date;
  return true;
end $$;
create function app_private.worker_claim_email() returns table(delivery_id uuid,claim_token uuid,email text,full_name text,audience text,payload jsonb)
language plpgsql security definer set search_path='' as $$
declare v_now timestamptz:=app_private.worker_now();
begin
  perform 1 from app_private.majority_executor where mode='WORKER' and (email_next_at is null or email_next_at<=v_now) for update;
  if not found then return; end if;
  update app_private.majority_executor set email_next_at=v_now+interval '600 milliseconds';
  update app_private.guardianship_majority_deliveries d set blocked_at=v_now
    where d.sent_at is null and d.blocked_at is null and d.first_attempt_at<=v_now-interval '23 hours';
  return query with pending as (
    select d.id from app_private.guardianship_majority_deliveries d join public.users u on u.id=d.recipient_user_id
    where d.sent_at is null and d.blocked_at is null and d.retry_at<=v_now
      and (d.claimed_at is null or d.claimed_at<=v_now-interval '1 minute') and u.email is not null
    order by d.created_at,d.id limit 1 for update of d skip locked
  ), claimed as (
    update app_private.guardianship_majority_deliveries d set claimed_at=v_now,claim_token=gen_random_uuid(),attempts=d.attempts+1
    from pending p where d.id=p.id returning d.id,d.claim_token,d.recipient_user_id,d.athlete_user_id,d.audience,d.payload
  ) select c.id,c.claim_token,u.email,a.full_name,c.audience,c.payload from claimed c
    join public.users u on u.id=c.recipient_user_id join public.users a on a.id=c.athlete_user_id;
end $$;
create function app_private.worker_email_payload(p_id uuid,p_token uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_payload jsonb;
begin
  update app_private.guardianship_majority_deliveries set payload=coalesce(payload,p_payload),first_attempt_at=coalesce(first_attempt_at,app_private.worker_now())
    where id=p_id and claim_token=p_token and sent_at is null and blocked_at is null
      and claimed_at>app_private.worker_now()-interval '1 minute' returning payload into v_payload;
  return v_payload;
end $$;
create function app_private.worker_finish_email(p_id uuid,p_token uuid,p_sent boolean) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update app_private.guardianship_majority_deliveries d set sent_at=case when p_sent then app_private.worker_now() else null end,
    retry_at=app_private.worker_now()+make_interval(secs=>least(3600,30*power(2,least(d.attempts,7))::integer)),
    claimed_at=null,claim_token=null
  where d.id=p_id and d.claim_token=p_token and d.sent_at is null and d.claimed_at>app_private.worker_now()-interval '1 minute';
  return found;
end $$;
create function app_private.worker_metrics() returns jsonb language sql security definer set search_path='' as $$
select jsonb_build_object('pending',count(*) filter(where d.sent_at is null and u.email is not null),
 'blocked',count(*) filter(where d.sent_at is null and d.blocked_at is not null and u.email is not null),
 'retries',count(*) filter(where d.sent_at is null and d.attempts>1 and u.email is not null),
 'oldest_seconds',coalesce(extract(epoch from app_private.worker_now()-min(d.created_at) filter(where d.sent_at is null and u.email is not null))::integer,0),
 'transition_overdue',exists(select 1 from app_private.majority_executor where mode='WORKER')
   and (app_private.worker_now() at time zone 'America/Santiago')::time>=time '00:35'
   and not exists(select 1 from public.job_runs where job_name='guardianship-majority' and run_date=(app_private.worker_now() at time zone 'America/Santiago')::date))
from app_private.guardianship_majority_deliveries d join public.users u on u.id=d.recipient_user_id;
$$;
revoke all on function app_private.worker_claim_transition(),app_private.worker_complete_transition(date,uuid),app_private.worker_claim_email(),app_private.worker_email_payload(uuid,uuid,jsonb),app_private.worker_finish_email(uuid,uuid,boolean),app_private.worker_metrics() from public,anon,authenticated,service_role;
grant usage on schema public,app_private to asisteam_jobs;
grant execute on function app_private.worker_claim_transition(),app_private.worker_complete_transition(date,uuid),app_private.worker_claim_email(),app_private.worker_email_payload(uuid,uuid,jsonb),app_private.worker_finish_email(uuid,uuid,boolean),app_private.worker_metrics() to asisteam_jobs;
