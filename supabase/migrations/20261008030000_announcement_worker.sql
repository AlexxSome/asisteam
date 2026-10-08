-- MIG-15 (#159): authenticated API and a single Expo executor.
grant select(enabled) on public.announcement_push_preferences to asisteam_api;
grant select(id,is_active) on public.push_tokens to asisteam_api;
grant execute on function public.list_group_announcements(uuid,integer),public.publish_group_announcement(uuid,text,text,uuid),public.update_group_announcement(uuid,uuid,text,text,timestamptz),public.delete_group_announcement(uuid,uuid,timestamptz),public.register_announcement_push_token(text,text),public.unregister_announcement_push_token(text),public.set_announcement_push_enabled(boolean) to asisteam_api;

create table app_private.announcement_executor (
  singleton boolean primary key default true check(singleton),
  mode text not null default 'LEGACY' check(mode in ('LEGACY','DRAINING','WORKER')),
  draining_since timestamptz, activated_at timestamptz
);
insert into app_private.announcement_executor(singleton) values(true);
alter table app_private.announcement_executor enable row level security;
revoke all on app_private.announcement_executor from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs;

alter function public.claim_announcement_push(boolean) set schema app_private;
alter function app_private.claim_announcement_push(boolean) rename to canonical_claim_announcement_push;
alter function public.complete_announcement_push(uuid,uuid,text,text) set schema app_private;
alter function app_private.complete_announcement_push(uuid,uuid,text,text) rename to canonical_complete_announcement_push;
alter function public.record_announcement_push_run(integer) set schema app_private;
alter function app_private.record_announcement_push_run(integer) rename to canonical_record_announcement_push_run;
revoke all on function app_private.canonical_claim_announcement_push(boolean),app_private.canonical_complete_announcement_push(uuid,uuid,text,text),app_private.canonical_record_announcement_push_run(integer) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs;

create function public.claim_announcement_push(p_receipts boolean default false)
returns table(delivery_id uuid,claim_token uuid,token text,announcement_id uuid,group_id uuid,ticket_id text)
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from app_private.announcement_executor where mode='LEGACY' for share;
  if not found then raise exception using errcode='55000',message='Ejecutor anterior deshabilitado'; end if;
  return query select c.delivery_id,c.claim_token,c.token,c.announcement_id,c.group_id,c.ticket_id from app_private.canonical_claim_announcement_push(p_receipts) c;
end $$;
create function public.complete_announcement_push(p_delivery_id uuid,p_claim_token uuid,p_outcome text,p_ticket_id text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from app_private.announcement_executor where mode in ('LEGACY','DRAINING') for share;
  if not found then raise exception using errcode='55000',message='Ejecutor anterior deshabilitado'; end if;
  perform app_private.canonical_complete_announcement_push(p_delivery_id,p_claim_token,p_outcome,p_ticket_id);
end $$;
create function public.record_announcement_push_run(p_processed integer) returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from app_private.announcement_executor where mode in ('LEGACY','DRAINING') for share;
  if not found then raise exception using errcode='55000',message='Ejecutor anterior deshabilitado'; end if;
  perform app_private.canonical_record_announcement_push_run(p_processed);
end $$;
revoke all on function public.claim_announcement_push(boolean),public.complete_announcement_push(uuid,uuid,text,text),public.record_announcement_push_run(integer) from public,anon,authenticated,asisteam_api,asisteam_jobs;
grant execute on function public.claim_announcement_push(boolean),public.complete_announcement_push(uuid,uuid,text,text),public.record_announcement_push_run(integer) to service_role;

-- Operator-only handoff. A fixed wait does not prove external HTTP quiescence.
create function app_private.announcement_handoff(p_mode text,p_legacy_stopped boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare v_state app_private.announcement_executor; v_cron boolean:=false;
begin
  select * into v_state from app_private.announcement_executor for update;
  if p_mode='DRAINING' and v_state.mode='LEGACY' then
    if to_regclass('cron.job') is not null then execute 'select cron.unschedule(jobid) from cron.job where jobname=''send-announcement-push'''; end if;
    update app_private.announcement_executor set mode='DRAINING',draining_since=clock_timestamp();
  elsif p_mode='WORKER' and v_state.mode='DRAINING' then
    if to_regclass('cron.job') is not null then execute 'select exists(select 1 from cron.job where jobname=''send-announcement-push'')' into v_cron; end if;
    if p_legacy_stopped is distinct from true or clock_timestamp()<v_state.draining_since+interval '3 minutes' or v_cron
      or exists(select 1 from app_private.announcement_push_deliveries where claim_token is not null and claimed_until>now()) then
      raise exception using errcode='55000',message='Debe completarse el drenaje del ejecutor anterior';
    end if;
    update app_private.announcement_executor set mode='WORKER',activated_at=clock_timestamp();
  elsif p_mode=v_state.mode then return;
  else raise exception using errcode='55000',message='Transición de ejecutor inválida'; end if;
end $$;
revoke all on function app_private.announcement_handoff(text,boolean) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs;

create function app_private.worker_claim_announcement_push(p_receipts boolean default false)
returns table(delivery_id uuid,claim_token uuid,token text,announcement_id uuid,group_id uuid,ticket_id text)
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from app_private.announcement_executor where mode='WORKER' for share;
  if not found then return; end if;
  return query select c.delivery_id,c.claim_token,c.token,c.announcement_id,c.group_id,c.ticket_id from app_private.canonical_claim_announcement_push(p_receipts) c;
end $$;
create function app_private.worker_complete_announcement_push(p_delivery_id uuid,p_claim_token uuid,p_outcome text,p_ticket_id text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from app_private.announcement_executor where mode='WORKER' for share;
  if not found then raise exception using errcode='55000',message='Ejecutor deshabilitado'; end if;
  perform 1 from app_private.announcement_push_deliveries where id=p_delivery_id and claim_token=p_claim_token and claimed_until>now() for update;
  if not found then raise exception using errcode='55000',message='Reserva vencida o cancelada'; end if;
  perform app_private.canonical_complete_announcement_push(p_delivery_id,p_claim_token,p_outcome,p_ticket_id);
end $$;
create function app_private.worker_record_announcement_push_run(p_processed integer) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from app_private.announcement_executor where mode='WORKER' for share;
  if not found then return; end if;
  if p_processed is null or p_processed<0 or p_processed>20 then raise exception using errcode='22023',message='Conteo inválido'; end if;
  perform app_private.canonical_record_announcement_push_run(p_processed);
end $$;
create function app_private.announcement_worker_metrics() returns jsonb language sql security definer set search_path='' as $$
select jsonb_build_object('pending',count(*) filter(where status in ('PENDING','AWAITING_RECEIPT')),
  'failed',count(*) filter(where status='FAILED'),
  'oldest_seconds',coalesce(extract(epoch from now()-min(created_at) filter(where status in ('PENDING','AWAITING_RECEIPT')))::integer,0))
from app_private.announcement_push_deliveries;
$$;
revoke all on function app_private.worker_claim_announcement_push(boolean),app_private.worker_complete_announcement_push(uuid,uuid,text,text),app_private.worker_record_announcement_push_run(integer),app_private.announcement_worker_metrics() from public,anon,authenticated,service_role,asisteam_api;
grant execute on function app_private.worker_claim_announcement_push(boolean),app_private.worker_complete_announcement_push(uuid,uuid,text,text),app_private.worker_record_announcement_push_run(integer),app_private.announcement_worker_metrics() to asisteam_jobs;

create or replace function app_private.dispatch_announcement_push() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_key text;
begin
  perform 1 from app_private.announcement_executor where mode='LEGACY' for share;
  if not found then return; end if;
  if not exists(select 1 from app_private.announcement_push_deliveries where status in ('PENDING','AWAITING_RECEIPT') and next_attempt_at<=now()) then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='announcement_push_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name='announcement_push_key';
  if v_url is null or v_key is null then return; end if;
  perform net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key),body:='{}'::jsonb,timeout_milliseconds:=60000);
end $$;

-- Preserve retry backoff with valid named-argument notation.
create or replace function app_private.canonical_complete_announcement_push(p_delivery_id uuid,p_claim_token uuid,p_outcome text,p_ticket_id text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_delivery app_private.announcement_push_deliveries;
begin
  if p_outcome is null or p_outcome not in ('accepted','delivered','retry','unregistered','failed','receipt_pending') then
    raise sqlstate 'PT400' using message='invalid_push_outcome';
  end if;
  select * into v_delivery from app_private.announcement_push_deliveries where id=p_delivery_id and claim_token=p_claim_token for update;
  if not found then return; end if;
  if p_outcome='accepted' then
    if v_delivery.status<>'PENDING' or p_ticket_id is null or length(p_ticket_id) not between 1 and 200 then
      raise sqlstate 'PT400' using message='invalid_push_outcome'; end if;
    update app_private.announcement_push_deliveries set status='AWAITING_RECEIPT',ticket_id=p_ticket_id,accepted_at=now(),
      next_attempt_at=now()+interval '15 minutes',claim_token=null,claimed_until=null where id=p_delivery_id;
  elsif p_outcome='receipt_pending' then
    update app_private.announcement_push_deliveries set next_attempt_at=now()+interval '15 minutes',claim_token=null,claimed_until=null where id=p_delivery_id;
  elsif p_outcome='retry' then
    update app_private.announcement_push_deliveries set status=case when attempts>=6 then 'FAILED' else 'PENDING' end,
      failure_code='temporary_error',ticket_id=null,accepted_at=null,next_attempt_at=now()+make_interval(secs=>60*(2^attempts)::integer),claim_token=null,claimed_until=null where id=p_delivery_id;
  else
    update app_private.announcement_push_deliveries set status=case when p_outcome='delivered' then 'DELIVERED' else 'FAILED' end,
      failure_code=case when p_outcome='delivered' then null else p_outcome end,completed_at=now(),claim_token=null,claimed_until=null where id=p_delivery_id;
    if p_outcome='unregistered' then
      update public.push_tokens set is_active=false where id=v_delivery.push_token_id and user_id=v_delivery.user_id;
    end if;
  end if;
end $$;
