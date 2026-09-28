-- HU-APO-02 (#46): pupilos propios y transición persistida de mayoría de edad.
-- Proyecciones del propietario con autorización explícita y barrera de seguridad.
create view public.v_my_ward_groups with (security_barrier = true) as
select gs.athlete_user_id, g.id as group_id, g.name, g.sport, m.status as membership_status
from public.guardianships gs
join public.users u on u.id = gs.athlete_user_id
join public.memberships m on m.user_id = u.id and m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')
join public.groups g on g.id = m.group_id
join public.memberships viewer on viewer.group_id = g.id and viewer.user_id = gs.guardian_user_id
  and viewer.role = 'GUARDIAN' and viewer.status = 'ACTIVE'
where gs.guardian_user_id = (select public.auth_user_id()) and gs.status = 'ACTIVE'
  and public.is_guardian_of(u.id);

-- Los helpers privados no se conceden a clientes: esta función devuelve solo
-- la proyección autorizada y la vista conserva el contrato de lectura.
create function public.list_my_wards()
returns table(athlete_user_id uuid, full_name text, avatar_url text, age integer, days_until_majority integer)
language sql stable security definer set search_path = '' as $$
select u.id as athlete_user_id, u.full_name,
  case when app_private.has_minor_consent(u.id, true) then u.avatar_url end as avatar_url,
  extract(year from age(app_private.chile_today(), u.birthdate))::integer as age,
  (u.birthdate + interval '18 years')::date - app_private.chile_today() as days_until_majority
from public.users u
where exists(select 1 from public.v_my_ward_groups g where g.athlete_user_id = u.id);
$$;
create view public.v_my_wards with (security_barrier = true) as
select athlete_user_id, full_name, avatar_url, age, days_until_majority from public.list_my_wards();

revoke all on function public.list_my_wards() from public, anon;
grant execute on function public.list_my_wards() to authenticated;
revoke all on public.v_my_wards, public.v_my_ward_groups from public, anon, authenticated;
grant select on public.v_my_wards, public.v_my_ward_groups to authenticated;

-- Registro operativo sin PII; no abre historial/auditoría de producto [P2].
create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null check (job_name = 'guardianship-majority'),
  run_date date not null,
  completed_at timestamptz not null default now(),
  affected_count integer not null check (affected_count >= 0),
  unique(job_name, run_date)
);
alter table public.job_runs enable row level security;
revoke all on public.job_runs from public, anon, authenticated;

-- Recibos privados de entrega de este job; solo la Edge Function ve destinatarios.
create table app_private.guardianship_majority_deliveries (
  id uuid primary key default gen_random_uuid(),
  athlete_user_id uuid not null references public.users(id) on delete restrict,
  recipient_user_id uuid not null references public.users(id) on delete restrict,
  audience text not null check (audience in ('ATHLETE','GUARDIAN','ADMIN')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  claimed_at timestamptz,
  claim_token uuid,
  unique(athlete_user_id, recipient_user_id, audience)
);
alter table app_private.guardianship_majority_deliveries enable row level security;
revoke all on app_private.guardianship_majority_deliveries from public, anon, authenticated;

create function public.run_guardianship_majority() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer := 0; v_athlete uuid; v_today date := app_private.chile_today();
begin
  -- Serializa ejecuciones y reintentos; la fecha se resuelve en la base, nunca desde HTTP.
  perform pg_advisory_xact_lock(hashtextextended('guardianship-majority', 0));
  if exists(select 1 from public.job_runs where job_name = 'guardianship-majority' and run_date = v_today) then
    return 0;
  end if;
  for v_athlete in
    select u.id from public.users u where u.birthdate is not null and not app_private.is_minor(u.birthdate)
      and exists(select 1 from public.guardianships gs where gs.athlete_user_id = u.id and gs.status = 'ACTIVE')
    order by u.id for update
  loop
    insert into app_private.guardianship_majority_deliveries(athlete_user_id, recipient_user_id, audience)
    select v_athlete, gs.guardian_user_id, 'GUARDIAN' from public.guardianships gs
    where gs.athlete_user_id = v_athlete and gs.status = 'ACTIVE'
    union select v_athlete, v_athlete, 'ATHLETE'
    on conflict do nothing;
    insert into app_private.guardianship_majority_deliveries(athlete_user_id, recipient_user_id, audience)
    select distinct v_athlete, admin_m.user_id, 'ADMIN'
    from public.users u join public.memberships athlete_m on athlete_m.user_id = u.id
      and athlete_m.role = 'ATHLETE' and athlete_m.status in ('ACTIVE','PENDING')
    join public.memberships admin_m on admin_m.group_id = athlete_m.group_id
      and admin_m.role = 'ADMIN' and admin_m.status = 'ACTIVE'
    where u.id = v_athlete and u.account_status = 'MANAGED'
    on conflict do nothing;
    update public.guardianships set status = 'INACTIVE', deactivated_at = now()
    where athlete_user_id = v_athlete and status = 'ACTIVE';
    v_count := v_count + 1;
  end loop;
  -- Conserva otros roles y al GUARDIAN con otro pupilo menor ACTIVE/PENDING.
  update public.memberships gm set status = 'INACTIVE'
  where gm.role = 'GUARDIAN' and gm.status = 'ACTIVE'
    and exists(select 1 from public.guardianships gs join public.users u on u.id = gs.athlete_user_id
      where gs.guardian_user_id = gm.user_id and u.birthdate is not null and not app_private.is_minor(u.birthdate))
    and not exists(select 1 from public.guardianships gs join public.users u on u.id = gs.athlete_user_id
      join public.memberships m on m.user_id = u.id and m.group_id = gm.group_id
        and m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')
      where gs.guardian_user_id = gm.user_id and gs.status = 'ACTIVE' and app_private.is_minor(u.birthdate));
  insert into public.job_runs(job_name, run_date, affected_count) values('guardianship-majority', v_today, v_count);
  return v_count;
end $$;

create function public.claim_guardianship_majority_emails()
returns table(delivery_id uuid, claim_token uuid, email text, full_name text, audience text)
language plpgsql security definer set search_path = '' as $$
begin
  return query with pending as (
    select d.id from app_private.guardianship_majority_deliveries d
    join public.users recipient on recipient.id = d.recipient_user_id
    where d.sent_at is null and (d.claimed_at is null or d.claimed_at < now() - interval '10 minutes')
      and recipient.email is not null
    order by d.created_at, d.id limit 5 for update of d skip locked
  ), claimed as (
    update app_private.guardianship_majority_deliveries d set claimed_at = now(), claim_token = gen_random_uuid()
    from pending p where d.id = p.id returning d.id, d.claim_token, d.recipient_user_id, d.athlete_user_id, d.audience
  ) select c.id, c.claim_token, recipient.email, athlete.full_name, c.audience
    from claimed c join public.users recipient on recipient.id = c.recipient_user_id
      join public.users athlete on athlete.id = c.athlete_user_id;
end $$;

create function public.complete_guardianship_majority_email(p_delivery_id uuid, p_claim_token uuid)
returns void language sql security definer set search_path = '' as $$
  update app_private.guardianship_majority_deliveries set sent_at = coalesce(sent_at, now())
  where id = p_delivery_id and claim_token = p_claim_token;
$$;

revoke all on function public.run_guardianship_majority(), public.claim_guardianship_majority_emails(),
  public.complete_guardianship_majority_email(uuid,uuid) from public, anon, authenticated;
grant execute on function public.run_guardianship_majority(), public.claim_guardianship_majority_emails(),
  public.complete_guardianship_majority_email(uuid,uuid) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Despacho cada 10 minutos: empieza a las 00:30 locales y recupera fallos durante
-- el día. La fecha chilena y job_runs evitan un doble proceso por cambios DST.
-- Vault se configura al desplegar; ningún secreto se incluye en esta migración.
create function app_private.dispatch_guardianship_majority() returns void
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_key text;
begin
  if (now() at time zone 'America/Santiago')::time < time '00:30' then return; end if;
  if exists(select 1 from public.job_runs where job_name = 'guardianship-majority' and run_date = app_private.chile_today())
    and not exists(select 1 from app_private.guardianship_majority_deliveries d
      join public.users u on u.id = d.recipient_user_id where d.sent_at is null and u.email is not null) then return; end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'guardianship_majority_url';
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'guardianship_majority_key';
  if v_url is null or v_key is null then return; end if;
  perform net.http_post(url := v_url, headers := jsonb_build_object('Content-Type','application/json',
    'Authorization','Bearer ' || v_key), body := '{}'::jsonb, timeout_milliseconds := 10000);
end $$;
revoke all on function app_private.dispatch_guardianship_majority() from public, anon, authenticated;
select cron.schedule('guardianship-majority', '*/10 * * * *', 'select app_private.dispatch_guardianship_majority()');
