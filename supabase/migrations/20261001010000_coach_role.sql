-- HU-ADM-20 (#55): delegación por grupo, manteniendo la privacidad V5.
alter table public.memberships drop constraint memberships_role_check;
alter table public.memberships add constraint memberships_role_check
  check (role in ('ADMIN','ATHLETE','GUARDIAN','COACH'));

create function app_private.can_manage_attendance(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships where group_id = p_group_id
    and user_id = public.auth_user_id() and status = 'ACTIVE' and role in ('ADMIN','COACH'))
$$;
revoke all on function app_private.can_manage_attendance(uuid) from public, anon, authenticated;
grant execute on function app_private.can_manage_attendance(uuid) to authenticated;

-- Agrega una membresía: nunca sustituye ATHLETE ni altera su historial.
create function public.assign_member_coach(p_group_id uuid, p_membership_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.auth_user_id(); v_user uuid; v_coach uuid;
begin
  if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
  if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
  select user_id into v_user from public.memberships where id = p_membership_id and group_id = p_group_id;
  if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;
  -- Mismo orden persona -> grupo -> membresías que las transiciones existentes.
  perform 1 from public.users where id = v_user for update;
  perform 1 from public.groups where id = p_group_id for update;
  perform 1 from public.memberships where user_id = v_actor and group_id = p_group_id
    and role = 'ADMIN' and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
  perform 1 from public.memberships where id = p_membership_id and group_id = p_group_id and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT409' using message = 'membership_status_changed'; end if;
  select id into v_coach from public.memberships
    where user_id = v_user and group_id = p_group_id and role = 'COACH' and status = 'ACTIVE';
  if found then return v_coach; end if;
  if (select count(*) from public.memberships where group_id = p_group_id and status = 'ACTIVE') >= 500 then
    raise sqlstate 'PT422' using message = 'group_member_limit';
  end if;
  insert into public.memberships(user_id, group_id, role, status, joined_at)
    values(v_user, p_group_id, 'COACH', 'ACTIVE', now())
    on conflict(user_id, group_id, role) do update set status = 'ACTIVE',
      joined_at = coalesce(public.memberships.joined_at, excluded.joined_at)
    returning id into v_coach;
  return v_coach;
end $$;
revoke all on function public.assign_member_coach(uuid,uuid) from public, anon, authenticated;
grant execute on function public.assign_member_coach(uuid,uuid) to authenticated;


create or replace function public.list_group_members(p_group_id uuid, p_role text default null,
    p_status text default null, p_offset integer default 0)
returns table(membership_id uuid, full_name text, email text, phone text, birthdate date,
    account_status text, role text, status text, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
    if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_offset is null or p_offset < 0 or p_offset > 5000000
      or (p_role is not null and p_role not in ('ADMIN','ATHLETE','GUARDIAN','COACH'))
      or (p_status is not null and p_status not in ('ACTIVE','INACTIVE','PENDING','INVITED')) then
        raise sqlstate 'PT400' using message = 'invalid_member_filters';
    end if;
    return query select m.id, u.full_name, u.email, u.phone, u.birthdate,
      u.account_status, m.role, m.status, count(*) over ()
    from public.memberships m join public.users u on u.id = m.user_id
    where m.group_id = p_group_id and (p_role is null or m.role = p_role)
      and (p_status is null or m.status = p_status)
    order by u.full_name, m.id limit 50 offset p_offset;
end $$;

create or replace function app_private.can_read_group_activities(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.memberships m
        where m.group_id = p_group_id and m.user_id = public.auth_user_id() and m.status = 'ACTIVE'
          and (m.role in ('ADMIN', 'ATHLETE', 'COACH') or (m.role = 'GUARDIAN' and exists (
              select 1 from public.memberships ward
              where ward.group_id = p_group_id and ward.role = 'ATHLETE' and ward.status = 'ACTIVE'
                and public.is_guardian_of(ward.user_id)
          )))
    )
$$;

create or replace function app_private.can_view_group_stats(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.groups g join public.memberships m on m.group_id = g.id
    where g.id = p_group_id and m.user_id = public.auth_user_id() and m.status = 'ACTIVE'
      and (m.role in ('ADMIN','COACH')
        or m.role = 'ATHLETE' and (g.settings ->> 'athletes_can_view_group_stats')::boolean
        or m.role = 'GUARDIAN' and (g.settings ->> 'guardians_can_view_group_stats')::boolean
          and exists(select 1 from public.memberships ward where ward.group_id = g.id
            and ward.role = 'ATHLETE' and ward.status = 'ACTIVE' and public.is_guardian_of(ward.user_id)))
  )
$$;

create or replace function public.can_read_avatar(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
    select exists(select 1 from public.users u where u.auth_user_id::text = split_part(p_name, '/', 1)
      and u.birthdate is not null and (not app_private.is_minor(u.birthdate) or app_private.has_minor_consent(u.id, true))
      and (u.id = public.auth_user_id() or (u.avatar_url = '/profile/avatar/' || p_name and exists(
        select 1 from public.memberships target join public.memberships viewer on viewer.group_id = target.group_id
        join public.groups g on g.id = target.group_id
        where target.user_id = u.id and viewer.user_id = public.auth_user_id() and viewer.status = 'ACTIVE'
          and (viewer.role = 'ADMIN' and target.status in ('ACTIVE','PENDING')
            or target.role = 'ATHLETE' and target.status = 'ACTIVE' and (
              viewer.role = 'COACH' or viewer.role = 'GUARDIAN' and public.is_guardian_of(u.id)
              or viewer.role = 'ATHLETE' and (g.settings ->> 'athletes_can_view_group_stats')::boolean
              or viewer.role = 'GUARDIAN' and (g.settings ->> 'guardians_can_view_group_stats')::boolean
                and exists(select 1 from public.guardianships wg join public.users wu on wu.id = wg.athlete_user_id
                  join public.memberships wm on wm.user_id = wu.id and wm.group_id = target.group_id and wm.role = 'ATHLETE' and wm.status = 'ACTIVE'
                  where wg.guardian_user_id = viewer.user_id and wg.status = 'ACTIVE' and app_private.is_minor(wu.birthdate))
            ))
      ))))
$$;

create or replace function app_private.lock_attendance_activity(p_activity_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_group_id uuid; v_user_id uuid := public.auth_user_id();
begin
    if v_user_id is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    select group_id into v_group_id from public.activities
    where id = p_activity_id and public.is_member(group_id) for update;
    if not found then raise sqlstate 'PT404' using message = 'activity_not_found'; end if;
    perform 1 from public.memberships where group_id = v_group_id and user_id = v_user_id
      and role in ('ADMIN','COACH') and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    return v_group_id;
end $$;

create or replace view public.v_attendance_roster with (security_barrier = true) as
select m.id as membership_id, m.group_id, u.full_name,
       case when public.can_read_avatar(substr(u.avatar_url, length('/profile/avatar/') + 1))
         then u.avatar_url end as avatar_url
from public.memberships m join public.users u on u.id = m.user_id
where m.role = 'ATHLETE' and m.status = 'ACTIVE' and app_private.can_manage_attendance(m.group_id);

-- ADMIN conserva su vista original; COACH recibe solo lo necesario para operar.
create view public.v_attendance_operator with (security_barrier = true) as
select r.id, a.group_id, r.activity_id, r.membership_id, r.status,
  case when public.is_group_admin(a.group_id) then r.note end as note
from public.attendance_records r join public.activities a on a.id = r.activity_id
where app_private.can_manage_attendance(a.group_id);
revoke all on public.v_attendance_operator from public, anon, authenticated;
grant select on public.v_attendance_operator to authenticated;

create or replace function public.record_attendance_bulk(p_activity_id uuid, p_records jsonb, p_only_unmarked boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_group_id uuid; v_is_admin boolean; v_record jsonb; v_mid uuid; v_existing boolean;
    v_user_id uuid := public.auth_user_id(); v_recorded_at timestamptz;
    v_created integer := 0; v_updated integer := 0; v_summary jsonb; v_records jsonb;
begin
    v_group_id := app_private.lock_attendance_activity(p_activity_id);
    v_is_admin := public.is_group_admin(v_group_id);
    if p_records is null or jsonb_typeof(p_records) <> 'array' then
        raise sqlstate 'PT400' using message = 'invalid_attendance_batch';
    end if;
    if jsonb_array_length(p_records) not between 1 and 500 then
        raise sqlstate 'PT400' using message = 'invalid_attendance_batch';
    end if;
    for v_record in select value from jsonb_array_elements(p_records) loop
        if jsonb_typeof(v_record) <> 'object' then
            raise sqlstate 'PT400' using message = 'invalid_attendance_batch';
        end if;
        if not (v_record ?& array['membership_id','status'])
          or v_record - array['membership_id','status','note'] <> '{}'::jsonb
          or jsonb_typeof(v_record->'membership_id') <> 'string'
          or (v_record->>'membership_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or jsonb_typeof(v_record->'status') <> 'string'
          or (v_record->>'status') not in ('PRESENT','ABSENT','LATE','EXCUSED')
          or (v_record ? 'note' and (jsonb_typeof(v_record->'note') not in ('string','null') or length(v_record->>'note') > 500)) then
            raise sqlstate 'PT400' using message = 'invalid_attendance_batch';
        end if;
        if not v_is_admin and v_record ? 'note' then
            raise sqlstate 'PT403' using message = 'attendance_notes_admin_required';
        end if;
    end loop;
    if (select count(distinct (value->>'membership_id')::uuid) from jsonb_array_elements(p_records)) <> jsonb_array_length(p_records) then
        raise sqlstate 'PT400' using message = 'duplicate_membership';
    end if;
    -- Bloquea todas las membresías antes de escribir; un lote inválido no deja
    -- filas parciales ni puede activarse sobre otro rol/grupo durante la RPC.
    perform 1 from public.memberships where id in (
      select (value->>'membership_id')::uuid from jsonb_array_elements(p_records)
    ) order by id for share;
    if exists (
      select 1 from jsonb_array_elements(p_records) i
      left join public.memberships m on m.id = (i.value->>'membership_id')::uuid
      where m.id is null or m.group_id <> v_group_id or m.role <> 'ATHLETE' or m.status <> 'ACTIVE'
    ) then raise sqlstate 'PT422' using message = 'membership_not_athlete_in_group'; end if;

    v_recorded_at := clock_timestamp();
    for v_record in select value from jsonb_array_elements(p_records) loop
        v_mid := (v_record->>'membership_id')::uuid;
        select exists(select 1 from public.attendance_records where activity_id = p_activity_id and membership_id = v_mid) into v_existing;
        if coalesce(p_only_unmarked, false) and v_existing then continue; end if;
        insert into public.attendance_records(activity_id, membership_id, status, note, recorded_by, recorded_at)
        values(p_activity_id, v_mid, v_record->>'status', nullif(trim(v_record->>'note'), ''), v_user_id, v_recorded_at)
        on conflict(activity_id, membership_id) do update set
          status = excluded.status,
          note = case when v_record ? 'note' then excluded.note else public.attendance_records.note end,
          recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at;
        if v_existing then v_updated := v_updated + 1; else v_created := v_created + 1; end if;
    end loop;
    select jsonb_build_object('PRESENT', count(*) filter(where status='PRESENT'),
      'ABSENT', count(*) filter(where status='ABSENT'), 'LATE', count(*) filter(where status='LATE'),
      'EXCUSED', count(*) filter(where status='EXCUSED')) into v_summary
    from public.attendance_records where activity_id = p_activity_id;
    select coalesce(jsonb_agg(jsonb_build_object('membership_id', membership_id, 'status', status, 'note', case when v_is_admin then note end) order by membership_id), '[]'::jsonb)
    into v_records from public.attendance_records where activity_id = p_activity_id and membership_id in (
      select (value->>'membership_id')::uuid from jsonb_array_elements(p_records)
    );
    return jsonb_build_object('activity_id', p_activity_id, 'recorded_by', v_user_id, 'recorded_at', v_recorded_at,
      'created', v_created, 'updated', v_updated, 'summary', v_summary, 'records', v_records);
end $$;

create or replace function public.clear_attendance_record(p_activity_id uuid, p_membership_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_group_id uuid;
begin
    v_group_id := app_private.lock_attendance_activity(p_activity_id);
    -- Desmarcar elimina también la nota: se mantiene reservado a ADMIN.
    if not public.is_group_admin(v_group_id) then raise sqlstate 'PT403' using message = 'attendance_clear_admin_required'; end if;
    perform 1 from public.memberships where id = p_membership_id and group_id = v_group_id
      and role = 'ATHLETE' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT422' using message = 'membership_not_athlete_in_group'; end if;
    delete from public.attendance_records where activity_id = p_activity_id and membership_id = p_membership_id;
end $$;

-- Una fuente de conteos; el detalle diario sigue fuera del alcance COACH.
create view app_private.attendance_report_counts with (security_barrier = true) as
select counts.group_id, counts.membership_id, counts.activity_type_id, counts.activity_date, metric.*
from (
    select m.group_id, m.id as membership_id, a.activity_type_id,
      (a.starts_at at time zone 'America/Santiago')::date as activity_date,
      count(*) filter(where r.status = 'PRESENT') as present,
      count(*) filter(where r.status = 'LATE') as late,
      count(*) filter(where r.status = 'ABSENT') as absent,
      count(*) filter(where r.status = 'EXCUSED') as excused
    from public.attendance_records r
    join public.memberships m on m.id = r.membership_id
    join public.activities a on a.id = r.activity_id and a.group_id = m.group_id
    where m.role = 'ATHLETE' and m.status in ('ACTIVE', 'INACTIVE')
      and a.starts_at <= now() and a.starts_at >= m.joined_at
    group by m.group_id, m.id, a.activity_type_id, (a.starts_at at time zone 'America/Santiago')::date
) counts
cross join lateral app_private.attendance_metrics(counts.present, counts.late, counts.absent, counts.excused) metric;
revoke all on app_private.attendance_report_counts from public, anon, authenticated;
create or replace view public.v_group_attendance_report with (security_barrier = true) as
select group_id, membership_id, activity_type_id, activity_date,
  convened, present, late, absent, excused, attendance_pct, late_rate
from app_private.attendance_report_counts where public.is_group_admin(group_id);

create or replace function public.get_group_attendance_report(
    p_group_id uuid, p_period text default 'month', p_from date default null, p_to date default null,
    p_activity_type_ids uuid[] default '{}', p_include_inactive boolean default false,
    p_page integer default 1, p_page_size integer default 50, p_sort text default 'attendance'
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    v_created_at timestamptz; v_from date; v_to date;
    v_from_utc timestamptz; v_to_utc timestamptz; v_report jsonb;
begin
    if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    select g.created_at into v_created_at from public.groups g
    where g.id = p_group_id and public.is_member(g.id);
    if not found then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not app_private.can_manage_attendance(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_period is null or p_period not in ('week', 'month', 'custom', 'season')
      or p_page is null or p_page not between 1 and 1000000
      or p_page_size is null or p_page_size not between 1 and 100
      or p_sort is null or p_sort not in ('attendance', 'name')
      or p_include_inactive is null or p_activity_type_ids is null
      or cardinality(p_activity_type_ids) > 100
      or (p_from is not null and (not isfinite(p_from) or p_from not between date '0001-01-01' and date '9999-12-31'))
      or (p_to is not null and (not isfinite(p_to) or p_to not between date '0001-01-01' and date '9999-12-31')) then
        raise sqlstate 'PT400' using message = 'invalid_report_filters';
    end if;
    -- Tipos desactivados siguen siendo válidos para consultar su historia.
    if exists(select 1 from unnest(p_activity_type_ids) selected(id)
      where not exists(select 1 from public.activity_types t where t.id = selected.id
        and (t.group_id is null or t.group_id = p_group_id))) then
        raise sqlstate 'PT400' using message = 'invalid_report_activity_type';
    end if;
    select b.from_date, b.until_date, b.from_utc, b.until_utc
      into v_from, v_to, v_from_utc, v_to_utc
    from app_private.attendance_period_bounds(p_period, p_from, p_to, v_created_at) b;

    with roster as materialized (
      select m.id as membership_id, u.full_name, m.status as membership_status
      from public.memberships m join public.users u on u.id = m.user_id
      where m.group_id = p_group_id and m.role = 'ATHLETE'
        and (m.status = 'ACTIVE' or (p_include_inactive and m.status = 'INACTIVE'))
    ), eligible as materialized (
      select v.membership_id, v.activity_type_id, v.activity_date, v.present, v.late, v.absent, v.excused
      from app_private.attendance_report_counts v join roster r using(membership_id)
      where v.group_id = p_group_id and v.activity_date >= v_from and v.activity_date < v_to
        and (cardinality(p_activity_type_ids) = 0 or v.activity_type_id = any(p_activity_type_ids))
    ), athlete_counts as (
      select r.membership_id, r.full_name, r.membership_status,
        coalesce(sum(e.present), 0)::bigint as present, coalesce(sum(e.late), 0)::bigint as late,
        coalesce(sum(e.absent), 0)::bigint as absent, coalesce(sum(e.excused), 0)::bigint as excused
      from roster r left join eligible e using(membership_id)
      group by r.membership_id, r.full_name, r.membership_status
    ), athletes as materialized (
      select c.membership_id, c.full_name, c.membership_status, metric.*
      from athlete_counts c cross join lateral app_private.attendance_metrics(c.present, c.late, c.absent, c.excused) metric
    ), page as (
      select a.* from athletes a
      order by case when p_sort = 'attendance' then a.attendance_pct end desc nulls last, a.full_name, a.membership_id
      limit p_page_size offset (p_page - 1) * p_page_size
    ), total_counts as (
      select coalesce(sum(present), 0)::bigint as present, coalesce(sum(late), 0)::bigint as late,
        coalesce(sum(absent), 0)::bigint as absent, coalesce(sum(excused), 0)::bigint as excused from athletes
    ), filtered_activities as materialized (
      select a.id, a.activity_type_id from public.activities a where a.group_id = p_group_id
        and a.starts_at >= v_from_utc and a.starts_at < v_to_utc and a.starts_at <= now()
        and (p_period <> 'season' or a.starts_at >= v_created_at)
        and (cardinality(p_activity_type_ids) = 0 or a.activity_type_id = any(p_activity_type_ids))
    ), type_counts as (
      select e.activity_type_id, sum(e.present)::bigint as present, sum(e.late)::bigint as late,
        sum(e.absent)::bigint as absent, sum(e.excused)::bigint as excused
      from eligible e group by e.activity_type_id
    ), by_type as (
      select t.id as activity_type_id, t.name, t.color, (t.group_id is null) as is_system,
        (select count(*) from filtered_activities a where a.activity_type_id = t.id) as activities, metric.*
      from public.activity_types t left join type_counts c on c.activity_type_id = t.id
      cross join lateral app_private.attendance_metrics(coalesce(c.present, 0), coalesce(c.late, 0), coalesce(c.absent, 0), coalesce(c.excused, 0)) metric
      where (t.group_id is null or t.group_id = p_group_id)
        and (cardinality(p_activity_type_ids) = 0 or t.id = any(p_activity_type_ids))
        and (c.activity_type_id is not null or exists(select 1 from filtered_activities a where a.activity_type_id = t.id))
    ), weekly_athlete_counts as (
      select date_trunc('week', e.activity_date::timestamp)::date as week_from, e.membership_id,
        sum(e.present)::bigint as present, sum(e.late)::bigint as late,
        sum(e.absent)::bigint as absent, sum(e.excused)::bigint as excused
      from eligible e group by date_trunc('week', e.activity_date::timestamp)::date, e.membership_id
    ), trend as (
      select w.week_from, round(avg(metric.attendance_pct), 1) as attendance_pct,
        sum(metric.convened)::bigint as convened
      from weekly_athlete_counts w cross join lateral app_private.attendance_metrics(w.present, w.late, w.absent, w.excused) metric
      group by w.week_from
    )
    select jsonb_build_object(
      'group_id', p_group_id,
      'period', jsonb_build_object('type', p_period, 'from', v_from, 'to', v_to - 1, 'timezone', 'America/Santiago'),
      'has_activities', exists(select 1 from public.activities where group_id = p_group_id),
      'totals', (select to_jsonb(metric) || jsonb_build_object('athletes', (select count(*) from athletes),
        'activities', (select count(*) from filtered_activities), 'average_attendance_pct', (select round(avg(attendance_pct), 1) from athletes),
        'best_full_name', (select full_name from athletes where attendance_pct is not null order by attendance_pct desc, full_name, membership_id limit 1))
        from total_counts c cross join lateral app_private.attendance_metrics(c.present, c.late, c.absent, c.excused) metric),
      'by_athlete', coalesce((select jsonb_agg(to_jsonb(p) order by case when p_sort = 'attendance' then p.attendance_pct end desc nulls last, p.full_name, p.membership_id) from page p), '[]'::jsonb),
      'by_activity_type', coalesce((select jsonb_agg(to_jsonb(t) order by t.name, t.activity_type_id) from by_type t), '[]'::jsonb),
      'trend', coalesce((select jsonb_agg(to_jsonb(t) order by t.week_from) from trend t), '[]'::jsonb),
      'page', p_page, 'page_size', p_page_size
    ) into v_report;
    return v_report;
end $$;
