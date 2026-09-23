-- HU-ADM-14 (#33): configuración transaccional y agregados V4/V5/V6.
alter table public.groups
  add column settings_updated_by uuid references public.users(id) on delete restrict,
  add column settings_updated_at timestamptz;

create function public.update_group_settings(p_group_id uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_settings jsonb;
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
  perform 1 from public.memberships where group_id = p_group_id and user_id = public.auth_user_id()
    and role = 'ADMIN' and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb
    or p_changes - array['athletes_can_view_group_stats', 'guardians_can_view_group_stats'] <> '{}'::jsonb then
    raise sqlstate 'PT400' using message = 'invalid_group_settings';
  end if;
  if exists(select 1 from jsonb_each(p_changes) entry where jsonb_typeof(entry.value) <> 'boolean') then
    raise sqlstate 'PT400' using message = 'invalid_group_settings';
  end if;
  -- La combinación se hace sobre la fila bloqueada por UPDATE: cambiar un
  -- toggle nunca repone el valor obsoleto del otro desde otra pestaña.
  update public.groups set settings = settings || p_changes,
    settings_updated_by = public.auth_user_id(), settings_updated_at = clock_timestamp()
  where id = p_group_id returning settings into v_settings;
  return v_settings;
end $$;

create function app_private.can_view_group_stats(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.groups g join public.memberships m on m.group_id = g.id
    where g.id = p_group_id and m.user_id = public.auth_user_id() and m.status = 'ACTIVE'
      and (m.role = 'ADMIN'
        or m.role = 'ATHLETE' and (g.settings ->> 'athletes_can_view_group_stats')::boolean
        or m.role = 'GUARDIAN' and (g.settings ->> 'guardians_can_view_group_stats')::boolean
          and exists(select 1 from public.memberships ward where ward.group_id = g.id
            and ward.role = 'ATHLETE' and ward.status = 'ACTIVE' and public.is_guardian_of(ward.user_id)))
  )
$$;

create or replace view public.v_group_detail with (security_barrier = true) as
select g.id, g.name, g.sport, g.description, g.logo_url, mine.roles,
  case when public.is_group_admin(g.id) then g.invite_code end as invite_code,
  case when public.is_group_admin(g.id) then g.settings end as settings,
  app_private.can_view_group_stats(g.id) as can_view_group_stats,
  case when public.is_group_admin(g.id) then g.settings_updated_at end as settings_updated_at,
  case when public.is_group_admin(g.id) then author.full_name end as settings_updated_by_name
from public.groups g join public.v_my_groups mine on mine.id = g.id
left join public.users author on author.id = g.settings_updated_by
where public.is_member(g.id);

-- La vista agrega antes de proyectar: no ofrece fechas, estados por actividad,
-- notas, identidad de apoderados ni metadatos de cuenta/membresía.
create view public.v_group_stats_members with (security_barrier = true) as
select counts.group_id, counts.membership_id, counts.full_name, counts.avatar_url,
  metric.convened, metric.present, metric.late, metric.absent, metric.excused,
  metric.attendance_pct, metric.late_rate
from (
  select m.group_id, m.id as membership_id, u.full_name,
    case when public.can_read_avatar(substr(u.avatar_url, length('/profile/avatar/') + 1))
      then u.avatar_url end as avatar_url,
    count(*) filter(where r.status = 'PRESENT') as present,
    count(*) filter(where r.status = 'LATE') as late,
    count(*) filter(where r.status = 'ABSENT') as absent,
    count(*) filter(where r.status = 'EXCUSED') as excused
  from public.memberships m join public.users u on u.id = m.user_id
  left join (public.attendance_records r join public.activities a on a.id = r.activity_id)
    on r.membership_id = m.id and a.group_id = m.group_id
      and a.starts_at <= now() and a.starts_at >= m.joined_at
  where m.role = 'ATHLETE' and m.status = 'ACTIVE' and app_private.can_view_group_stats(m.group_id)
  group by m.group_id, m.id, u.id
) counts
cross join lateral app_private.attendance_metrics(counts.present, counts.late, counts.absent, counts.excused) metric;

create function public.get_group_stats(p_group_id uuid, p_page integer default 1, p_page_size integer default 50)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
  if not app_private.can_view_group_stats(p_group_id) then raise sqlstate 'PT403' using message = 'group_stats_disabled'; end if;
  if p_page is null or p_page not between 1 and 1000000 or p_page_size is null or p_page_size not between 1 and 100 then
    raise sqlstate 'PT400' using message = 'invalid_report_filters';
  end if;
  with members as materialized (
    select membership_id, full_name, avatar_url, convened, present, late, absent, excused, attendance_pct, late_rate
    from public.v_group_stats_members where group_id = p_group_id
  ), page as (
    select * from members order by full_name, membership_id limit p_page_size offset (p_page - 1) * p_page_size
  ), counts as (
    select count(*) as athletes, coalesce(sum(present), 0)::bigint as present, coalesce(sum(late), 0)::bigint as late,
      coalesce(sum(absent), 0)::bigint as absent, coalesce(sum(excused), 0)::bigint as excused from members
  )
  select jsonb_build_object('group_id', p_group_id, 'page', p_page, 'page_size', p_page_size,
    'members', coalesce((select jsonb_agg(to_jsonb(p) order by p.full_name, p.membership_id) from page p), '[]'::jsonb),
    'totals', (select to_jsonb(metric) || jsonb_build_object('athletes', c.athletes)
      from counts c cross join lateral app_private.attendance_metrics(c.present, c.late, c.absent, c.excused) metric)) into v_result;
  return v_result;
end $$;

revoke all on function public.update_group_settings(uuid,jsonb), public.get_group_stats(uuid,integer,integer),
  app_private.can_view_group_stats(uuid) from public, anon, authenticated;
grant execute on function public.update_group_settings(uuid,jsonb), public.get_group_stats(uuid,integer,integer),
  app_private.can_view_group_stats(uuid) to authenticated;
revoke all on public.v_group_stats_members from public, anon, authenticated;
grant select on public.v_group_stats_members to authenticated;
comment on view public.v_group_stats_members is 'Agregados de temporada por ATHLETE ACTIVE, autorizados por toggle vigente y rol; proyección mínima V5.';
comment on view public.v_group_detail is 'Detalle de miembro ACTIVE; settings, código y autor/fecha solo ADMIN. can_view_group_stats expresa permiso efectivo actual.';
