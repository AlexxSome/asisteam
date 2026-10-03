-- HU-ADM-22 (#57): muro de grupo y transporte Expo opt-in.
create table public.group_announcements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 120 and title ~ '[^[:space:]]'),
  body text not null check (length(btrim(body)) between 1 and 5000 and body ~ '[^[:space:]]'),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index group_announcements_wall on public.group_announcements(group_id, created_at desc, id desc) where deleted_at is null;
alter table public.group_announcements enable row level security;
revoke all on public.group_announcements from public, anon, authenticated;
grant select(id, group_id, title, body, created_at, updated_at) on public.group_announcements to authenticated;
create policy group_announcements_read on public.group_announcements for select to authenticated
  using (deleted_at is null and public.is_member(group_id));

-- Registro por dispositivo; ningún cliente puede leer tokens de otra persona.
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  platform text not null check (platform in ('IOS','ANDROID')),
  token text not null unique check (token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from public, anon, authenticated;
grant select(id, platform, is_active, last_seen_at) on public.push_tokens to authenticated;
create policy push_tokens_owner on public.push_tokens for select to authenticated using (user_id = public.auth_user_id());
create table public.announcement_push_preferences (
  user_id uuid primary key references public.users(id) on delete restrict,
  enabled boolean not null default false
);
alter table public.announcement_push_preferences enable row level security;
revoke all on public.announcement_push_preferences from public, anon, authenticated;
grant select(enabled) on public.announcement_push_preferences to authenticated;
create policy announcement_push_preferences_owner on public.announcement_push_preferences for select to authenticated
  using (user_id = public.auth_user_id());

create table app_private.announcement_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.group_announcements(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  push_token_id uuid not null references public.push_tokens(id) on delete restrict,
  status text not null default 'PENDING' check (status in ('PENDING','AWAITING_RECEIPT','DELIVERED','CANCELLED','FAILED')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  claimed_until timestamptz,
  claim_token uuid,
  ticket_id text,
  accepted_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  unique(announcement_id, push_token_id)
);
alter table app_private.announcement_push_deliveries enable row level security;
revoke all on app_private.announcement_push_deliveries from public, anon, authenticated;
create index announcement_push_pending on app_private.announcement_push_deliveries(next_attempt_at)
  where status in ('PENDING','AWAITING_RECEIPT');

create function public.register_announcement_push_token(p_token text, p_platform text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.auth_user_id(); v_id uuid;
begin
  if v_actor is null or not exists(select 1 from public.users where id=v_actor and account_status='ACTIVE') then
    raise sqlstate 'PT401' using message='authentication_required';
  end if;
  if p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$'
    or p_platform is null or p_platform not in ('IOS','ANDROID') then
    raise sqlstate 'PT400' using message='invalid_push_token';
  end if;
  -- Solo reasigna un token después de que su propietario lo desregistre.
  perform pg_advisory_xact_lock(hashtextextended(p_token,57));
  if exists(select 1 from public.push_tokens where token=p_token and user_id<>v_actor and is_active) then
    raise sqlstate 'PT409' using message='push_token_unavailable';
  end if;
  insert into public.push_tokens(user_id,platform,token) values(v_actor,p_platform,p_token)
    on conflict(token) do update set user_id=excluded.user_id,platform=excluded.platform,is_active=true,last_seen_at=now()
    returning id into v_id;
  return v_id;
end $$;

create function public.unregister_announcement_push_token(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message='authentication_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_token,57));
  update public.push_tokens set is_active=false where token=p_token and user_id=public.auth_user_id();
end $$;

create function public.set_announcement_push_enabled(p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.auth_user_id();
begin
  if v_actor is null then raise sqlstate 'PT401' using message='authentication_required'; end if;
  if p_enabled is null then raise sqlstate 'PT400' using message='invalid_push_preference'; end if;
  insert into public.announcement_push_preferences(user_id,enabled) values(v_actor,p_enabled)
    on conflict(user_id) do update set enabled=excluded.enabled;
  if not p_enabled then
    update app_private.announcement_push_deliveries set status='CANCELLED',completed_at=now(),claim_token=null
      where user_id=v_actor and status='PENDING';
  end if;
end $$;

create function app_private.require_announcement_admin(p_group_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.auth_user_id();
begin
  if v_actor is null then raise sqlstate 'PT401' using message='authentication_required'; end if;
  if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message='group_not_found'; end if;
  -- Compartir lock de membresía impide revocar ADMIN durante la escritura.
  perform 1 from public.memberships where group_id=p_group_id and user_id=v_actor and role='ADMIN' and status='ACTIVE' for share;
  if not found then raise sqlstate 'PT403' using message='admin_required'; end if;
  return v_actor;
end $$;

create function public.publish_group_announcement(p_group_id uuid,p_title text,p_body text,p_request_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_existing public.group_announcements;
begin
  v_actor := app_private.require_announcement_admin(p_group_id);
  if p_request_id is null or p_title is null or p_body is null
    or length(btrim(p_title)) not between 1 and 120 or length(btrim(p_body)) not between 1 and 5000
    or p_title !~ '[^[:space:]]' or p_body !~ '[^[:space:]]' then
    raise sqlstate 'PT400' using message='invalid_announcement';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,57));
  select * into v_existing from public.group_announcements where id=p_request_id;
  if found then
    if v_existing.group_id=p_group_id and v_existing.created_by=v_actor and v_existing.deleted_at is null
      and v_existing.title=btrim(p_title) and v_existing.body=btrim(p_body) then return v_existing.id; end if;
    raise sqlstate 'PT409' using message='announcement_request_conflict';
  end if;
  insert into public.group_announcements(id,group_id,title,body,created_by)
    values(p_request_id,p_group_id,btrim(p_title),btrim(p_body),v_actor);
  -- EXISTS evita duplicados de usuarios multirol; solo dispositivos opt-in actuales.
  insert into app_private.announcement_push_deliveries(announcement_id,user_id,push_token_id)
    select p_request_id,t.user_id,t.id from public.push_tokens t
    join public.announcement_push_preferences pref on pref.user_id=t.user_id and pref.enabled
    join public.users u on u.id=t.user_id and u.account_status='ACTIVE'
    where t.is_active and exists(select 1 from public.memberships m where m.user_id=t.user_id and m.group_id=p_group_id and m.status='ACTIVE');
  return p_request_id;
end $$;

create function public.update_group_announcement(p_group_id uuid,p_announcement_id uuid,p_title text,p_body text,p_updated_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare v_updated timestamptz;
begin
  perform app_private.require_announcement_admin(p_group_id);
  if p_title is null or p_body is null or length(btrim(p_title)) not between 1 and 120
    or length(btrim(p_body)) not between 1 and 5000 or p_updated_at is null
    or p_title !~ '[^[:space:]]' or p_body !~ '[^[:space:]]' then
    raise sqlstate 'PT400' using message='invalid_announcement';
  end if;
  select updated_at into v_updated from public.group_announcements where id=p_announcement_id and group_id=p_group_id and deleted_at is null for update;
  if not found then raise sqlstate 'PT404' using message='announcement_not_found'; end if;
  if v_updated<>p_updated_at then raise sqlstate 'PT409' using message='announcement_changed'; end if;
  update public.group_announcements set title=btrim(p_title),body=btrim(p_body),updated_at=clock_timestamp() where id=p_announcement_id;
end $$;

create function public.delete_group_announcement(p_group_id uuid,p_announcement_id uuid,p_updated_at timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
declare v_updated timestamptz;
begin
  perform app_private.require_announcement_admin(p_group_id);
  select updated_at into v_updated from public.group_announcements where id=p_announcement_id and group_id=p_group_id and deleted_at is null for update;
  if not found then raise sqlstate 'PT404' using message='announcement_not_found'; end if;
  if p_updated_at is null or v_updated<>p_updated_at then raise sqlstate 'PT409' using message='announcement_changed'; end if;
  update public.group_announcements set deleted_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_announcement_id;
  update app_private.announcement_push_deliveries set status='CANCELLED',completed_at=now(),claim_token=null
    where announcement_id=p_announcement_id and status='PENDING';
end $$;

create function public.list_group_announcements(p_group_id uuid,p_page integer default 1)
returns table(id uuid,group_id uuid,title text,body text,created_at timestamptz,updated_at timestamptz,total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message='authentication_required'; end if;
  if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message='group_not_found'; end if;
  if p_page is null or p_page<1 or p_page>100000 then raise sqlstate 'PT400' using message='invalid_announcement_page'; end if;
  return query select a.id,a.group_id,a.title,a.body,a.created_at,a.updated_at,count(*) over ()
    from public.group_announcements a where a.group_id=p_group_id and a.deleted_at is null
    order by a.created_at desc,a.id desc limit 50 offset (p_page-1)*50;
end $$;

-- Los workers reciben únicamente el lote reservado. Tokens nunca salen al muro.
create function public.claim_announcement_push(p_receipts boolean default false)
returns table(delivery_id uuid,claim_token uuid,token text,announcement_id uuid,group_id uuid,ticket_id text)
language plpgsql security definer set search_path = '' as $$
begin
  update app_private.announcement_push_deliveries d set status='CANCELLED',completed_at=now(),claim_token=null
    where d.status='PENDING' and not exists(
      select 1 from public.group_announcements a join public.push_tokens t on t.id=d.push_token_id and t.user_id=d.user_id and t.is_active
      join public.announcement_push_preferences pref on pref.user_id=d.user_id and pref.enabled
      join public.users u on u.id=d.user_id and u.account_status='ACTIVE'
      where a.id=d.announcement_id and a.deleted_at is null and exists(
        select 1 from public.memberships m where m.group_id=a.group_id and m.user_id=d.user_id and m.status='ACTIVE'));
  update app_private.announcement_push_deliveries d set status='FAILED',failure_code='attempts_exhausted',completed_at=now(),claim_token=null
    where d.status='PENDING' and d.attempts>=6 and (d.claimed_until is null or d.claimed_until<now());
  update app_private.announcement_push_deliveries d set status='FAILED',failure_code='receipt_timeout',completed_at=now(),claim_token=null
    where d.status='AWAITING_RECEIPT' and d.accepted_at<now()-interval '23 hours';
  return query with pending as (
    select d.id from app_private.announcement_push_deliveries d
    where d.status=case when p_receipts then 'AWAITING_RECEIPT' else 'PENDING' end
      and d.next_attempt_at<=now() and (d.claimed_until is null or d.claimed_until<now())
    order by d.next_attempt_at,d.id limit 10 for update skip locked
  ), claimed as (
    update app_private.announcement_push_deliveries d set claimed_until=now()+interval '2 minutes',claim_token=gen_random_uuid(),
      attempts=d.attempts+case when p_receipts then 0 else 1 end
    from pending p where d.id=p.id returning d.*
  ) select c.id,c.claim_token,case when p_receipts then null else t.token end,c.announcement_id,a.group_id,c.ticket_id
    from claimed c join public.push_tokens t on t.id=c.push_token_id join public.group_announcements a on a.id=c.announcement_id;
end $$;

create function public.complete_announcement_push(p_delivery_id uuid,p_claim_token uuid,p_outcome text,p_ticket_id text default null) returns void
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
      failure_code='temporary_error',ticket_id=null,accepted_at=null,next_attempt_at=now()+make_interval(secs=60*(2^attempts)::integer),claim_token=null,claimed_until=null where id=p_delivery_id;
  else
    update app_private.announcement_push_deliveries set status=case when p_outcome='delivered' then 'DELIVERED' else 'FAILED' end,
      failure_code=case when p_outcome='delivered' then null else p_outcome end,completed_at=now(),claim_token=null,claimed_until=null where id=p_delivery_id;
    if p_outcome='unregistered' then
      update public.push_tokens set is_active=false where id=v_delivery.push_token_id and user_id=v_delivery.user_id;
    end if;
  end if;
end $$;

alter table public.job_runs drop constraint job_runs_job_name_check;
alter table public.job_runs add constraint job_runs_job_name_check check(job_name in ('guardianship-majority','send-announcement-push'));
create function public.record_announcement_push_run(p_processed integer) returns void
language sql security definer set search_path = '' as $$
  insert into public.job_runs(job_name,run_date,affected_count) values('send-announcement-push',app_private.chile_today(),p_processed)
  on conflict(job_name,run_date) do update set affected_count=public.job_runs.affected_count+excluded.affected_count,completed_at=now();
$$;

revoke all on function app_private.require_announcement_admin(uuid) from public,anon,authenticated;
revoke all on function public.publish_group_announcement(uuid,text,text,uuid),public.update_group_announcement(uuid,uuid,text,text,timestamptz),
  public.delete_group_announcement(uuid,uuid,timestamptz),public.list_group_announcements(uuid,integer),
  public.register_announcement_push_token(text,text),public.unregister_announcement_push_token(text),public.set_announcement_push_enabled(boolean)
  from public,anon,authenticated;
grant execute on function public.publish_group_announcement(uuid,text,text,uuid),public.update_group_announcement(uuid,uuid,text,text,timestamptz),
  public.delete_group_announcement(uuid,uuid,timestamptz),public.list_group_announcements(uuid,integer),
  public.register_announcement_push_token(text,text),public.unregister_announcement_push_token(text),public.set_announcement_push_enabled(boolean) to authenticated;
revoke all on function public.claim_announcement_push(boolean),public.complete_announcement_push(uuid,uuid,text,text),public.record_announcement_push_run(integer)
  from public,anon,authenticated;
grant execute on function public.claim_announcement_push(boolean),public.complete_announcement_push(uuid,uuid,text,text),public.record_announcement_push_run(integer) to service_role;

create function app_private.dispatch_announcement_push() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_key text;
begin
  if not exists(select 1 from app_private.announcement_push_deliveries where status in ('PENDING','AWAITING_RECEIPT') and next_attempt_at<=now()) then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name='announcement_push_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name='announcement_push_key';
  if v_url is null or v_key is null then return; end if;
  perform net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key),body:='{}'::jsonb,timeout_milliseconds:=60000);
end $$;
revoke all on function app_private.dispatch_announcement_push() from public,anon,authenticated;
select cron.schedule('send-announcement-push','* * * * *','select app_private.dispatch_announcement_push()');
