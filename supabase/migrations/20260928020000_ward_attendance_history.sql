-- HU-APO-03 (#47): historial del pupilo, aislado del historial propio.
-- La proyección de pupilos exige GUARDIAN ACTIVE, vínculo ACTIVE y edad <18
-- en Chile en cada lectura. Solo ATHLETE ACTIVE puede tener historial visible.
create view public.v_ward_attendance_history with (security_barrier = true) as
select r.id, m.group_id, m.user_id as athlete_user_id, m.id as membership_id,
  a.id as activity_id, a.title, a.starts_at, t.id as activity_type_id,
  t.name as activity_type_name, t.color as activity_type_color,
  (t.group_id is null) as is_system_type, r.status, r.note
from public.attendance_records r
join public.memberships m on m.id = r.membership_id and m.role = 'ATHLETE' and m.status = 'ACTIVE'
join public.v_my_ward_groups w on w.group_id = m.group_id and w.athlete_user_id = m.user_id
  and w.membership_status = 'ACTIVE'
join public.activities a on a.id = r.activity_id and a.group_id = m.group_id
join public.activity_types t on t.id = a.activity_type_id
where a.starts_at <= now() and a.starts_at >= m.joined_at;

create function public.get_ward_attendance_history(
  p_group_id uuid, p_athlete_user_id uuid, p_period text default 'month', p_from date default null, p_to date default null,
  p_activity_type_ids uuid[] default '{}', p_page integer default 1, p_page_size integer default 50
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_created_at timestamptz; v_membership_id uuid; v_full_name text;
  v_from date; v_until date; v_from_utc timestamptz; v_until_utc timestamptz; v_history jsonb;
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  select g.created_at, m.id, u.full_name into v_created_at, v_membership_id, v_full_name
  from public.groups g join public.memberships m on m.group_id = g.id
  join public.users u on u.id = m.user_id
  join public.v_my_ward_groups w on w.group_id = m.group_id and w.athlete_user_id = m.user_id
  where g.id = p_group_id and m.user_id = p_athlete_user_id and m.role = 'ATHLETE'
    and m.status = 'ACTIVE' and w.membership_status = 'ACTIVE';
  if not found then raise sqlstate 'PT404' using message = 'attendance_history_not_found'; end if;
  if p_page is null or p_page not between 1 and 1000000
    or p_page_size is null or p_page_size not between 1 and 100
    or p_activity_type_ids is null or cardinality(p_activity_type_ids) > 100 then
    raise sqlstate 'PT400' using message = 'invalid_report_filters';
  end if;
  if exists(select 1 from unnest(p_activity_type_ids) selected(id)
    where not exists(select 1 from public.activity_types t where t.id = selected.id
      and (t.group_id is null or t.group_id = p_group_id))) then
    raise sqlstate 'PT400' using message = 'invalid_report_activity_type';
  end if;
  select b.from_date, b.until_date, b.from_utc, b.until_utc into v_from, v_until, v_from_utc, v_until_utc
  from app_private.attendance_period_bounds(p_period, p_from, p_to, v_created_at) b;

  with eligible as materialized (
    select h.id, h.activity_id, h.title, h.starts_at, h.activity_type_id,
      h.activity_type_name, h.activity_type_color, h.is_system_type, h.status, h.note
    from public.v_ward_attendance_history h
    where h.group_id = p_group_id and h.membership_id = v_membership_id
      and h.starts_at >= v_from_utc and h.starts_at < v_until_utc
      and (p_period <> 'season' or h.starts_at >= v_created_at)
      and (cardinality(p_activity_type_ids) = 0 or h.activity_type_id = any(p_activity_type_ids))
  ), page as (
    select * from eligible order by starts_at desc, id desc limit p_page_size offset (p_page - 1) * p_page_size
  ), counts as (
    select count(*) filter(where status = 'PRESENT') as present, count(*) filter(where status = 'LATE') as late,
      count(*) filter(where status = 'ABSENT') as absent, count(*) filter(where status = 'EXCUSED') as excused from eligible
  )
  select jsonb_build_object('group_id', p_group_id, 'membership_id', v_membership_id, 'full_name', v_full_name,
    'period', jsonb_build_object('type', p_period, 'from', v_from, 'to', v_until - 1, 'timezone', 'America/Santiago'),
    'totals', (select to_jsonb(metric) from counts c
      cross join lateral app_private.attendance_metrics(c.present, c.late, c.absent, c.excused) metric),
    'records', coalesce((select jsonb_agg(to_jsonb(p) order by p.starts_at desc, p.id desc) from page p), '[]'::jsonb),
    'page', p_page, 'page_size', p_page_size) into v_history;
  return v_history;
end $$;
revoke all on public.v_ward_attendance_history from public, anon, authenticated;
grant select on public.v_ward_attendance_history to authenticated;
revoke all on function public.get_ward_attendance_history(uuid,uuid,text,date,date,uuid[],integer,integer) from public, anon, authenticated;
grant execute on function public.get_ward_attendance_history(uuid,uuid,text,date,date,uuid[],integer,integer) to authenticated;
comment on view public.v_ward_attendance_history is 'HU-APO-03: solo historial de pupilos menores vigentes en grupos compartidos, independiente de toggles.';
