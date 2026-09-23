-- HU-ADM-13 (#32): métricas canónicas en vivo, con períodos de Chile.
create or replace function app_private.attendance_metrics(p_present bigint, p_late bigint, p_absent bigint, p_excused bigint)
returns table(convened bigint, present bigint, late bigint, absent bigint, excused bigint, attendance_pct numeric, late_rate numeric)
language sql immutable set search_path = '' as $$
    select p_present + p_late + p_absent + p_excused, p_present, p_late, p_absent, p_excused,
      round(100.0 * (p_present + p_late) / nullif(p_present + p_late + p_absent, 0), 1),
      round(100.0 * p_late / nullif(p_present + p_late, 0), 1)
$$;

-- Una fila por deportista/tipo/día: filtrar antes de volver a agregar evita
-- promediar porcentajes y mantiene una sola definición del universo elegible.
create or replace view public.v_group_attendance_report with (security_barrier = true) as
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
      and public.is_group_admin(m.group_id)
    group by m.group_id, m.id, a.activity_type_id, (a.starts_at at time zone 'America/Santiago')::date
) counts
cross join lateral app_private.attendance_metrics(counts.present, counts.late, counts.absent, counts.excused) metric;

create or replace function public.get_group_attendance_report(
    p_group_id uuid, p_period text default 'month', p_from date default null, p_to date default null,
    p_activity_type_ids uuid[] default '{}', p_include_inactive boolean default false,
    p_page integer default 1, p_page_size integer default 50, p_sort text default 'attendance'
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
    v_created_at timestamptz; v_from date; v_to date; v_anchor date;
    v_from_utc timestamptz; v_to_utc timestamptz; v_report jsonb;
begin
    if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    select g.created_at into v_created_at from public.groups g
    where g.id = p_group_id and public.is_member(g.id);
    if not found then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
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
    v_anchor := coalesce(p_from, app_private.chile_today());
    case p_period
      when 'week' then
        v_from := date_trunc('week', v_anchor::timestamp)::date; v_to := v_from + 7;
      when 'month' then
        v_from := date_trunc('month', v_anchor::timestamp)::date; v_to := (v_from + interval '1 month')::date;
      when 'custom' then
        if p_from is null or p_to is null or p_to < p_from then
          raise sqlstate 'PT400' using message = 'invalid_report_filters';
        end if;
        v_from := p_from; v_to := p_to + 1;
      when 'season' then
        v_from := (v_created_at at time zone 'America/Santiago')::date; v_to := app_private.chile_today() + 1;
    end case;
    v_from_utc := v_from::timestamp at time zone 'America/Santiago';
    v_to_utc := v_to::timestamp at time zone 'America/Santiago';

    with roster as materialized (
      select m.id as membership_id, u.full_name, m.status as membership_status
      from public.memberships m join public.users u on u.id = m.user_id
      where m.group_id = p_group_id and m.role = 'ATHLETE'
        and (m.status = 'ACTIVE' or (p_include_inactive and m.status = 'INACTIVE'))
    ), eligible as materialized (
      select v.membership_id, v.activity_type_id, v.activity_date, v.present, v.late, v.absent, v.excused
      from public.v_group_attendance_report v join roster r using(membership_id)
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

revoke all on function app_private.attendance_metrics(bigint,bigint,bigint,bigint) from public, anon, authenticated;
grant execute on function app_private.attendance_metrics(bigint,bigint,bigint,bigint) to authenticated;
revoke all on public.v_group_attendance_report from public, anon, authenticated;
grant select on public.v_group_attendance_report to authenticated;
revoke all on function public.get_group_attendance_report(uuid,text,date,date,uuid[],boolean,integer,integer,text) from public, anon, authenticated;
grant execute on function public.get_group_attendance_report(uuid,text,date,date,uuid[],boolean,integer,integer,text) to authenticated;
