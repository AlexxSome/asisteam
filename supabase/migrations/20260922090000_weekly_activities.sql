-- HU-ADM-09 (#28): recurrencia semanal materializada y cambios por alcance.
alter table public.activities
  add column recurrence_rule jsonb,
  add column recurrence_source_id uuid references public.activities(id) on delete set null,
  add constraint chk_activity_recurrence check (
    (recurrence_rule is null and recurrence_source_id is null) or
    (recurrence_rule is not null and jsonb_typeof(recurrence_rule) = 'object' and recurrence_rule->>'freq' = 'WEEKLY') is true
  );
create index idx_activities_recurrence on public.activities(recurrence_source_id);

create or replace view public.v_group_activities with (security_barrier = true) as
select a.id, a.group_id, a.activity_type_id, a.title, a.description, a.location,
       a.starts_at, a.ends_at, t.name as activity_type_name, t.color as activity_type_color,
       (t.group_id is null) as is_system_type, a.recurrence_rule, a.recurrence_source_id
from public.activities a join public.activity_types t on t.id = a.activity_type_id
where app_private.can_read_group_activities(a.group_id);

-- Conserva validaciones, permisos y contrato UUID de la creación puntual.
alter function public.create_activity(uuid,uuid,text,timestamptz,timestamptz,text,text) set schema app_private;
alter function app_private.create_activity(uuid,uuid,text,timestamptz,timestamptz,text,text) rename to create_single_activity;
revoke all on function app_private.create_single_activity(uuid,uuid,text,timestamptz,timestamptz,text,text) from public, anon, authenticated;

-- PostgreSQL suele resolver silenciosamente saltos/repeticiones DST. Se rechazan
-- igual que Temporal en el formulario; cada semana conserva su hora de Chile.
create function app_private.activity_local_to_utc(p_local timestamp) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare v_utc timestamptz := p_local at time zone 'America/Santiago';
begin
  if not isfinite(p_local) or v_utc at time zone 'America/Santiago' <> p_local
    or (v_utc - interval '1 hour') at time zone 'America/Santiago' = p_local
    or (v_utc + interval '1 hour') at time zone 'America/Santiago' = p_local then
    raise sqlstate 'PT422' using message = 'invalid_local_datetime';
  end if;
  return v_utc;
end $$;

create function public.create_activity(
  p_group_id uuid, p_activity_type_id uuid, p_title text,
  p_starts_at timestamptz, p_ends_at timestamptz,
  p_description text default null, p_location text default null,
  p_recurrence_rule jsonb default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_first uuid; v_id uuid; v_start timestamp; v_end timestamp;
  v_until date; v_date date; v_count integer := 0; v_days text[];
  v_weekdays constant text[] := array['MO','TU','WE','TH','FR','SA','SU'];
  v_occurrence_start timestamptz; v_occurrence_end timestamptz;
begin
  if p_recurrence_rule is null then
    return app_private.create_single_activity(p_group_id,p_activity_type_id,p_title,p_starts_at,p_ends_at,p_description,p_location);
  end if;
  -- La primera inserción valida autorización antes de procesar la recurrencia.
  -- Cualquier error posterior revierte todas las filas de esta RPC.
  v_first := app_private.create_single_activity(p_group_id,p_activity_type_id,p_title,p_starts_at,p_ends_at,p_description,p_location);
  if jsonb_typeof(p_recurrence_rule) <> 'object' or
     not (p_recurrence_rule ?& array['freq','by_weekday','until']) or
     p_recurrence_rule - array['freq','by_weekday','until'] <> '{}'::jsonb or
     p_recurrence_rule->>'freq' is distinct from 'WEEKLY' or
     jsonb_typeof(p_recurrence_rule->'by_weekday') <> 'array' or
     jsonb_typeof(p_recurrence_rule->'until') <> 'string' then
    raise sqlstate 'PT400' using message = 'invalid_recurrence';
  end if;
  if jsonb_array_length(p_recurrence_rule->'by_weekday') not between 1 and 7 or exists (
    select 1 from jsonb_array_elements(p_recurrence_rule->'by_weekday') d
    where jsonb_typeof(d) <> 'string' or not (d #>> '{}') = any(v_weekdays)
  ) then raise sqlstate 'PT400' using message = 'invalid_recurrence'; end if;
  select array_agg(d) into v_days from jsonb_array_elements_text(p_recurrence_rule->'by_weekday') d;
  if (select count(distinct d) from unnest(v_days) d) <> cardinality(v_days) then
    raise sqlstate 'PT400' using message = 'invalid_recurrence';
  end if;
  begin
    if (p_recurrence_rule->>'until') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise sqlstate 'PT400' using message = 'invalid_recurrence';
    end if;
    v_until := (p_recurrence_rule->>'until')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise sqlstate 'PT400' using message = 'invalid_recurrence';
  end;
  v_start := p_starts_at at time zone 'America/Santiago';
  v_end := p_ends_at at time zone 'America/Santiago';
  if v_until < v_start::date then raise sqlstate 'PT422' using message = 'invalid_recurrence'; end if;
  if v_until > v_start::date + 182 then raise sqlstate 'PT422' using message = 'recurrence_limit_exceeded'; end if;
  v_date := v_start::date;
  while v_date <= v_until loop
    if v_weekdays[extract(isodow from v_date)::integer] = any(v_days) then
      v_count := v_count + 1;
      if v_count > 150 then raise sqlstate 'PT422' using message = 'recurrence_limit_exceeded'; end if;
      v_occurrence_start := app_private.activity_local_to_utc(v_date + v_start::time);
      v_occurrence_end := app_private.activity_local_to_utc(v_date + (v_end::date - v_start::date) + v_end::time);
      if v_occurrence_end <= v_occurrence_start or v_occurrence_end - v_occurrence_start > interval '24 hours' then
        raise sqlstate 'PT422' using message = 'invalid_date_range';
      end if;
      if v_count = 1 then
        update public.activities set starts_at = v_occurrence_start, ends_at = v_occurrence_end,
          recurrence_rule = p_recurrence_rule where id = v_first;
      else
        v_id := app_private.create_single_activity(p_group_id,p_activity_type_id,p_title,v_occurrence_start,v_occurrence_end,p_description,p_location);
        update public.activities set recurrence_rule = p_recurrence_rule, recurrence_source_id = v_first where id = v_id;
      end if;
    end if;
    v_date := v_date + 1;
  end loop;
  if v_count = 0 then raise sqlstate 'PT422' using message = 'invalid_recurrence'; end if;
  return v_first;
end $$;

-- Serializa cambios de estructura por grupo y bloquea actividades con el mismo
-- FOR UPDATE que la toma de asistencia. Reevalúa asistencia después del lock.
-- La lista completa también permite re-enlazar la raíz si se elimina.
create function app_private.lock_activity_series(p_group_id uuid, p_activity_id uuid)
returns public.activities language plpgsql security definer set search_path = '' as $$
declare v_activity public.activities; v_user_id uuid := public.auth_user_id(); v_root uuid;
begin
  if v_user_id is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if not app_private.can_read_group_activities(p_group_id) then
    raise sqlstate 'PT404' using message = 'activity_not_found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('activity-series:' || p_group_id::text, 0));
  select a.* into v_activity from public.activities a where a.id = p_activity_id and a.group_id = p_group_id;
  if not found then raise sqlstate 'PT404' using message = 'activity_not_found'; end if;
  v_root := coalesce(v_activity.recurrence_source_id, v_activity.id);
  perform 1 from public.activities where group_id = p_group_id and (id = v_root or recurrence_source_id = v_root)
    order by id for update;
  -- Usa la versión más reciente tras esperar una escritura de asistencia.
  select a.* into v_activity from public.activities a where a.id = p_activity_id and a.group_id = p_group_id;
  if not found then raise sqlstate 'PT404' using message = 'activity_not_found'; end if;
  perform 1 from public.memberships where group_id = p_group_id and user_id = v_user_id
    and role = 'ADMIN' and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
  return v_activity;
end $$;

create function public.update_activity(
  p_group_id uuid, p_activity_id uuid, p_activity_type_id uuid, p_title text,
  p_starts_at timestamptz, p_ends_at timestamptz,
  p_description text default null, p_location text default null, p_scope text default 'single'
) returns integer language plpgsql security definer set search_path = '' as $$
declare v_activity public.activities; v_row public.activities; v_count integer := 0;
  v_start timestamp; v_end timestamp; v_new_start timestamptz; v_new_end timestamptz;
begin
  v_activity := app_private.lock_activity_series(p_group_id,p_activity_id);
  if p_scope is null or p_scope not in ('single','series') or (p_scope = 'series' and v_activity.recurrence_rule is null) then
    raise sqlstate 'PT400' using message = 'invalid_activity_scope';
  end if;
  if p_title is null or length(trim(p_title)) not between 3 and 120 or length(p_description) > 2000 or length(p_location) > 200 then
    raise sqlstate 'PT400' using message = 'invalid_activity';
  end if;
  if p_starts_at is null or p_ends_at is null or not isfinite(p_starts_at) or not isfinite(p_ends_at)
    or p_ends_at <= p_starts_at or p_ends_at - p_starts_at > interval '24 hours' then
    raise sqlstate 'PT422' using message = 'invalid_date_range';
  end if;
  perform 1 from public.activity_types where id = p_activity_type_id
    and (is_active or id = v_activity.activity_type_id) and (group_id is null or group_id = p_group_id) for share;
  if not found then raise sqlstate 'PT422' using message = 'invalid_activity_type'; end if;
  v_start := p_starts_at at time zone 'America/Santiago';
  v_end := p_ends_at at time zone 'America/Santiago';
  if p_scope = 'series' and v_start::date <> (v_activity.starts_at at time zone 'America/Santiago')::date then
    raise sqlstate 'PT422' using message = 'series_date_change';
  end if;
  for v_row in select a.* from public.activities a where a.group_id = p_group_id and (
    (p_scope = 'single' and a.id = p_activity_id) or
    (p_scope = 'series' and coalesce(a.recurrence_source_id,a.id) = coalesce(v_activity.recurrence_source_id,v_activity.id)
      and a.starts_at >= v_activity.starts_at and a.starts_at >= now()
      and not exists(select 1 from public.attendance_records r where r.activity_id = a.id))
  ) order by a.id loop
    if p_scope = 'single' then v_new_start := p_starts_at; v_new_end := p_ends_at;
    else
      v_new_start := app_private.activity_local_to_utc((v_row.starts_at at time zone 'America/Santiago')::date + v_start::time);
      v_new_end := app_private.activity_local_to_utc((v_row.starts_at at time zone 'America/Santiago')::date + (v_end::date - v_start::date) + v_end::time);
      if v_new_start < now() then raise sqlstate 'PT422' using message = 'invalid_date_range'; end if;
    end if;
    if v_new_end <= v_new_start or v_new_end - v_new_start > interval '24 hours' then
      raise sqlstate 'PT422' using message = 'invalid_date_range';
    end if;
    update public.activities set title = trim(p_title), activity_type_id = p_activity_type_id,
      description = nullif(trim(p_description),''), location = nullif(trim(p_location),''),
      starts_at = v_new_start, ends_at = v_new_end where id = v_row.id;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise sqlstate 'PT409' using message = 'no_editable_occurrences'; end if;
  return v_count;
end $$;

create function public.delete_activity(p_group_id uuid, p_activity_id uuid, p_scope text default 'single', p_confirm_attendance boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_activity public.activities; v_ids uuid[]; v_root uuid; v_replacement uuid;
begin
  v_activity := app_private.lock_activity_series(p_group_id,p_activity_id);
  if p_scope is null or p_scope not in ('single','series') or (p_scope = 'series' and v_activity.recurrence_rule is null) then
    raise sqlstate 'PT400' using message = 'invalid_activity_scope';
  end if;
  v_root := coalesce(v_activity.recurrence_source_id,v_activity.id);
  select array_agg(a.id) into v_ids from public.activities a where a.group_id = p_group_id and (
    (p_scope = 'single' and a.id = p_activity_id) or
    (p_scope = 'series' and coalesce(a.recurrence_source_id,a.id) = v_root and a.starts_at >= v_activity.starts_at
      and a.starts_at >= now() and not exists(select 1 from public.attendance_records r where r.activity_id = a.id))
  );
  if v_ids is null then raise sqlstate 'PT409' using message = 'no_editable_occurrences'; end if;
  if p_scope = 'single' and not coalesce(p_confirm_attendance,false) and exists (
    select 1 from public.attendance_records where activity_id = p_activity_id
  ) then raise sqlstate 'PT409' using message = 'attendance_confirmation_required'; end if;
  if v_root = any(v_ids) then
    select id into v_replacement from public.activities where group_id = p_group_id and recurrence_source_id = v_root
      and not (id = any(v_ids)) order by starts_at,id limit 1;
    if v_replacement is not null then
      update public.activities set recurrence_source_id = case when id = v_replacement then null else v_replacement end
      where group_id = p_group_id and recurrence_source_id = v_root and not (id = any(v_ids));
    end if;
  end if;
  -- La FK RESTRICT existente obliga a hacer explícita la eliminación confirmada.
  delete from public.attendance_records where activity_id = any(v_ids);
  delete from public.activities where id = any(v_ids) and group_id = p_group_id;
  return cardinality(v_ids);
end $$;

revoke all on function app_private.activity_local_to_utc(timestamp), app_private.lock_activity_series(uuid,uuid) from public, anon, authenticated;
revoke all on function public.create_activity(uuid,uuid,text,timestamptz,timestamptz,text,text,jsonb),
  public.update_activity(uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,text), public.delete_activity(uuid,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.create_activity(uuid,uuid,text,timestamptz,timestamptz,text,text,jsonb),
  public.update_activity(uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,text), public.delete_activity(uuid,uuid,text,boolean) to authenticated;
