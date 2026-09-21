-- HU-ADM-11 (#30): asistencia transaccional y proyecciones por rol.
create table public.attendance_records (
    id uuid primary key default gen_random_uuid(),
    activity_id uuid not null references public.activities(id) on delete restrict,
    membership_id uuid not null references public.memberships(id) on delete restrict,
    status text not null check (status in ('PRESENT','ABSENT','LATE','EXCUSED')),
    note text check (length(note) <= 500),
    recorded_by uuid not null references public.users(id) on delete restrict,
    recorded_at timestamptz not null default now(),
    constraint uq_attendance unique(activity_id, membership_id)
);
create index idx_attendance_membership on public.attendance_records(membership_id, status);
alter table public.attendance_records enable row level security;

create function app_private.validate_attendance_membership() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'UPDATE' and (new.activity_id <> old.activity_id or new.membership_id <> old.membership_id) then
        raise exception using errcode = '23514', message = 'attendance_identity_immutable';
    end if;
    perform 1 from public.memberships m join public.activities a on a.group_id = m.group_id
    where a.id = new.activity_id and m.id = new.membership_id and m.role = 'ATHLETE' and m.status = 'ACTIVE'
    for share of m;
    if not found then raise exception using errcode = '23514', message = 'membership_not_athlete_in_group'; end if;
    return new;
end $$;
create trigger trg_attendance_membership before insert or update on public.attendance_records
for each row execute function app_private.validate_attendance_membership();

-- Autorización común + serialización de operaciones de una actividad: protege
-- el upsert y la operación "todos presentes" frente a guardados concurrentes.
create function app_private.lock_attendance_activity(p_activity_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_group_id uuid; v_user_id uuid := public.auth_user_id();
begin
    if v_user_id is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    select group_id into v_group_id from public.activities
    where id = p_activity_id and public.is_member(group_id) for update;
    if not found then raise sqlstate 'PT404' using message = 'activity_not_found'; end if;
    perform 1 from public.memberships where group_id = v_group_id and user_id = v_user_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    return v_group_id;
end $$;

create view public.v_attendance_roster with (security_barrier = true) as
select m.id as membership_id, m.group_id, u.full_name,
       case when public.can_read_avatar(substr(u.avatar_url, length('/profile/avatar/') + 1))
         then u.avatar_url end as avatar_url
from public.memberships m join public.users u on u.id = m.user_id
where m.role = 'ATHLETE' and m.status = 'ACTIVE' and public.is_group_admin(m.group_id);

create view public.v_attendance_admin with (security_barrier = true) as
select r.id, a.group_id, r.activity_id, r.membership_id, r.status, r.note, r.recorded_by, r.recorded_at
from public.attendance_records r join public.activities a on a.id = r.activity_id
where public.is_group_admin(a.group_id);

-- V1/V2/V5: las notas solo se proyectan al titular o a su apoderado vigente.
create view public.v_attendance_own with (security_barrier = true) as
select r.id, a.group_id, r.activity_id, r.membership_id, r.status, r.note, r.recorded_at
from public.attendance_records r join public.activities a on a.id = r.activity_id
join public.memberships m on m.id = r.membership_id
where public.is_member(a.group_id) and (
    m.user_id = public.auth_user_id() or (
        m.status = 'ACTIVE' and public.is_guardian_of(m.user_id) and exists (
            select 1 from public.memberships viewer where viewer.user_id = public.auth_user_id()
              and viewer.group_id = a.group_id and viewer.role = 'GUARDIAN' and viewer.status = 'ACTIVE'
        )
    )
);

create function public.record_attendance_bulk(p_activity_id uuid, p_records jsonb, p_only_unmarked boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_group_id uuid; v_record jsonb; v_mid uuid; v_existing boolean;
    v_user_id uuid := public.auth_user_id(); v_recorded_at timestamptz;
    v_created integer := 0; v_updated integer := 0; v_summary jsonb; v_records jsonb;
begin
    v_group_id := app_private.lock_attendance_activity(p_activity_id);
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
    select coalesce(jsonb_agg(jsonb_build_object('membership_id', membership_id, 'status', status, 'note', note) order by membership_id), '[]'::jsonb)
    into v_records from public.attendance_records where activity_id = p_activity_id and membership_id in (
      select (value->>'membership_id')::uuid from jsonb_array_elements(p_records)
    );
    return jsonb_build_object('activity_id', p_activity_id, 'recorded_by', v_user_id, 'recorded_at', v_recorded_at,
      'created', v_created, 'updated', v_updated, 'summary', v_summary, 'records', v_records);
end $$;

-- ASI-01 permite volver a "sin marcar": solo se quita esa convocatoria,
-- nunca la persona, membresía, vínculo o evidencia de consentimiento.
create function public.clear_attendance_record(p_activity_id uuid, p_membership_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_group_id uuid;
begin
    v_group_id := app_private.lock_attendance_activity(p_activity_id);
    perform 1 from public.memberships where id = p_membership_id and group_id = v_group_id
      and role = 'ATHLETE' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT422' using message = 'membership_not_athlete_in_group'; end if;
    delete from public.attendance_records where activity_id = p_activity_id and membership_id = p_membership_id;
end $$;

revoke all on public.attendance_records from public, anon, authenticated;
revoke all on public.v_attendance_roster, public.v_attendance_admin, public.v_attendance_own from public, anon, authenticated;
grant select on public.v_attendance_roster, public.v_attendance_admin, public.v_attendance_own to authenticated;
revoke all on function app_private.validate_attendance_membership(), app_private.lock_attendance_activity(uuid) from public, anon, authenticated;
revoke all on function public.record_attendance_bulk(uuid,jsonb,boolean), public.clear_attendance_record(uuid,uuid) from public, anon, authenticated;
grant execute on function public.record_attendance_bulk(uuid,jsonb,boolean), public.clear_attendance_record(uuid,uuid) to authenticated;
