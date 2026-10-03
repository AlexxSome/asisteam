-- HU-DEP-10 (#58): autoasistencia web con QR temporal, solo sobre la identidad JWT.
create table app_private.qr_checkin_settings (
  group_id uuid primary key references public.groups(id) on delete cascade,
  opens_before_minutes integer not null default 15 check (opens_before_minutes between 0 and 1440),
  closes_after_minutes integer not null default 60 check (closes_after_minutes between 1 and 1440),
  late_after_minutes integer not null default 10 check (late_after_minutes between 0 and closes_after_minutes)
);
create table app_private.qr_checkin_keys (
  activity_id uuid primary key references public.activities(id) on delete cascade,
  secret bytea not null default extensions.gen_random_bytes(32) check (octet_length(secret) = 32)
);
alter table app_private.qr_checkin_settings enable row level security;
alter table app_private.qr_checkin_keys enable row level security;
revoke all on app_private.qr_checkin_settings, app_private.qr_checkin_keys from public, anon, authenticated;

create function app_private.qr_checkin_status(p_starts_at timestamptz, p_now timestamptz,
  p_opens_before integer, p_closes_after integer, p_late_after integer)
returns text language sql immutable set search_path = '' as $$
  select case when p_now < p_starts_at - make_interval(mins => p_opens_before)
    or p_now > p_starts_at + make_interval(mins => p_closes_after) then null
    when p_now > p_starts_at + make_interval(mins => p_late_after) then 'LATE' else 'PRESENT' end
$$;

-- Un token por actividad y tramo UTC de 60 s. La clave nunca sale de la base.
create function app_private.qr_checkin_token(p_activity_id uuid, p_secret bytea, p_now timestamptz)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.hmac(convert_to(p_activity_id::text || ':' || floor(extract(epoch from p_now) / 60)::bigint::text, 'UTF8'), p_secret, 'sha256'), 'hex')
$$;

create function public.get_qr_checkin_settings(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_settings jsonb;
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
  if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
  select to_jsonb(s) - 'group_id' into v_settings from app_private.qr_checkin_settings s where group_id = p_group_id;
  return coalesce(v_settings, '{"opens_before_minutes":15,"closes_after_minutes":60,"late_after_minutes":10}'::jsonb);
end $$;

create function public.set_qr_checkin_settings(p_group_id uuid, p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_value jsonb; v_open integer; v_close integer; v_late integer;
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
  perform 1 from public.memberships where group_id = p_group_id and user_id = public.auth_user_id()
    and role = 'ADMIN' and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object'
    or not (p_settings ?& array['opens_before_minutes','closes_after_minutes','late_after_minutes'])
    or p_settings - array['opens_before_minutes','closes_after_minutes','late_after_minutes'] <> '{}'::jsonb then
    raise sqlstate 'PT400' using message = 'invalid_qr_settings';
  end if;
  for v_value in select value from jsonb_each(p_settings) loop
    if jsonb_typeof(v_value) <> 'number' or v_value::text !~ '^[0-9]{1,4}$' then
      raise sqlstate 'PT400' using message = 'invalid_qr_settings';
    end if;
  end loop;
  v_open := (p_settings->>'opens_before_minutes')::integer;
  v_close := (p_settings->>'closes_after_minutes')::integer;
  v_late := (p_settings->>'late_after_minutes')::integer;
  if v_open not between 0 and 1440 or v_close not between 1 and 1440 or v_late not between 0 and v_close then
    raise sqlstate 'PT400' using message = 'invalid_qr_settings';
  end if;
  insert into app_private.qr_checkin_settings values(p_group_id, v_open, v_close, v_late)
    on conflict(group_id) do update set opens_before_minutes = excluded.opens_before_minutes,
      closes_after_minutes = excluded.closes_after_minutes, late_after_minutes = excluded.late_after_minutes;
  return p_settings;
end $$;

create function public.issue_activity_checkin_qr(p_activity_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_activity public.activities; v_settings app_private.qr_checkin_settings;
  v_secret bytea; v_now timestamptz; v_expires timestamptz;
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  -- Mismo bloqueo que tomar/editar/borrar asistencia; el permiso aquí es ADMIN.
  select a.* into v_activity from public.activities a
    where a.id = p_activity_id and public.is_member(a.group_id) for update;
  if not found then raise sqlstate 'PT404' using message = 'activity_not_found'; end if;
  perform 1 from public.memberships where group_id = v_activity.group_id and user_id = public.auth_user_id()
    and role = 'ADMIN' and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
  insert into app_private.qr_checkin_settings(group_id) values(v_activity.group_id) on conflict do nothing;
  select s.* into v_settings from app_private.qr_checkin_settings s where group_id = v_activity.group_id for share;
  v_now := clock_timestamp();
  if app_private.qr_checkin_status(v_activity.starts_at, v_now, v_settings.opens_before_minutes,
    v_settings.closes_after_minutes, v_settings.late_after_minutes) is null then
    raise sqlstate 'PT422' using message = 'checkin_window_closed';
  end if;
  insert into app_private.qr_checkin_keys(activity_id) values(p_activity_id) on conflict do nothing;
  select secret into v_secret from app_private.qr_checkin_keys where activity_id = p_activity_id;
  v_expires := least(to_timestamp((floor(extract(epoch from v_now) / 60) + 1) * 60),
    v_activity.starts_at + make_interval(mins => v_settings.closes_after_minutes));
  return jsonb_build_object('activity_id', p_activity_id,
    'token', app_private.qr_checkin_token(p_activity_id, v_secret, v_now),
    'server_time', v_now, 'expires_at', v_expires);
end $$;

create function public.self_checkin(p_activity_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid := public.auth_user_id(); v_activity public.activities;
  v_settings app_private.qr_checkin_settings; v_membership uuid;
  v_secret bytea; v_now timestamptz; v_status text; v_record public.attendance_records; v_created boolean := false;
begin
  if v_user is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  select a.* into v_activity from public.activities a
    where a.id = p_activity_id and public.is_member(a.group_id) for update;
  if not found then raise sqlstate 'PT404' using message = 'checkin_not_available'; end if;
  select id into v_membership from public.memberships
    where group_id = v_activity.group_id and user_id = v_user and role = 'ATHLETE' and status = 'ACTIVE' for share;
  if not found then
    raise sqlstate 'PT404' using message = 'checkin_not_available';
  end if;
  select s.* into v_settings from app_private.qr_checkin_settings s where group_id = v_activity.group_id for share;
  select secret into v_secret from app_private.qr_checkin_keys where activity_id = p_activity_id;
  v_now := clock_timestamp();
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' or v_secret is null
    or p_token <> app_private.qr_checkin_token(p_activity_id, v_secret, v_now) then
    raise sqlstate 'PT422' using message = 'checkin_qr_expired';
  end if;
  v_status := app_private.qr_checkin_status(v_activity.starts_at, v_now, v_settings.opens_before_minutes,
    v_settings.closes_after_minutes, v_settings.late_after_minutes);
  if v_status is null then raise sqlstate 'PT422' using message = 'checkin_window_closed'; end if;
  -- Nunca modifica una marca previa (incluidos ABSENT/EXCUSED manuales).
  -- El bloqueo de actividad serializa escaneos y las RPC de ADMIN/COACH.
  select r.* into v_record from public.attendance_records r
    where activity_id = p_activity_id and membership_id = v_membership;
  if not found then
    insert into public.attendance_records(activity_id, membership_id, status, recorded_by, recorded_at)
      values(p_activity_id, v_membership, v_status, v_user, v_now) returning * into v_record;
    v_created := true;
  end if;
  return jsonb_build_object('activity_id', p_activity_id, 'group_id', v_activity.group_id,
    'activity_title', v_activity.title, 'status', v_record.status, 'recorded_at', v_record.recorded_at, 'created', v_created);
end $$;

revoke all on function app_private.qr_checkin_status(timestamptz,timestamptz,integer,integer,integer),
  app_private.qr_checkin_token(uuid,bytea,timestamptz) from public, anon, authenticated;
revoke all on function public.get_qr_checkin_settings(uuid), public.set_qr_checkin_settings(uuid,jsonb),
  public.issue_activity_checkin_qr(uuid), public.self_checkin(uuid,text) from public, anon, authenticated;
grant execute on function public.get_qr_checkin_settings(uuid), public.set_qr_checkin_settings(uuid,jsonb),
  public.issue_activity_checkin_qr(uuid), public.self_checkin(uuid,text) to authenticated;
