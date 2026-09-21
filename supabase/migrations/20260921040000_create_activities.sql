-- HU-ADM-08 (#27): actividades puntuales y contratos de lectura compartidos.
create table public.activity_types (
    id uuid primary key default gen_random_uuid(),
    group_id uuid references public.groups(id) on delete restrict,
    name text not null check (length(trim(name)) between 2 and 40),
    color text not null default '#6B7280' check (color ~ '^#[0-9a-fA-F]{6}$'),
    is_active boolean not null default true
);
create unique index uq_activity_types_group on public.activity_types(group_id, lower(name)) where group_id is not null;
create unique index uq_activity_types_system on public.activity_types(lower(name)) where group_id is null;

insert into public.activity_types(id, name, color) values
('b2c3d4e5-0001-4b3c-8d4e-111111111111', 'TRAINING', '#2563EB'),
('b2c3d4e5-0002-4b3c-8d4e-222222222222', 'PHYSICAL_PREP', '#7C3AED'),
('b2c3d4e5-0003-4b3c-8d4e-333333333333', 'COMPETITION', '#DC2626'),
('b2c3d4e5-0004-4b3c-8d4e-444444444444', 'MEETING', '#6B7280');

create function app_private.protect_system_activity_type() returns trigger
language plpgsql set search_path = '' as $$
begin
    if (tg_op <> 'INSERT' and old.group_id is null)
       or (tg_op <> 'DELETE' and new.group_id is null) then
        raise exception using errcode = '23514', message = 'system_activity_type_immutable';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end $$;
create trigger trg_system_activity_type before insert or update or delete on public.activity_types
for each row execute function app_private.protect_system_activity_type();

create table public.activities (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict,
    activity_type_id uuid not null references public.activity_types(id) on delete restrict,
    title text not null check (length(trim(title)) between 3 and 120),
    description text check (length(description) <= 2000),
    location text check (length(location) <= 200),
    starts_at timestamptz not null check (isfinite(starts_at)),
    ends_at timestamptz not null check (isfinite(ends_at)),
    created_by uuid not null references public.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint chk_activity_range check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours')
);
create index idx_activities_group_starts on public.activities(group_id, starts_at);
create index idx_activities_type on public.activities(activity_type_id);
create trigger trg_activities_updated_at before update on public.activities
for each row execute function public.set_updated_at();

-- También protege escrituras privilegiadas y futuras RPC: el tipo pertenece
-- al grupo o es de sistema; desactivarlo no altera actividades históricas.
create function app_private.validate_activity_type() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
    if tg_op = 'INSERT' or new.activity_type_id is distinct from old.activity_type_id
       or new.group_id is distinct from old.group_id then
        perform 1 from public.activity_types t where t.id = new.activity_type_id
          and t.is_active and (t.group_id is null or t.group_id = new.group_id) for share;
        if not found then
            raise exception using errcode = '23514', message = 'invalid_activity_type';
        end if;
    end if;
    return new;
end $$;
create trigger trg_activity_type before insert or update on public.activities
for each row execute function app_private.validate_activity_type();

-- V6 y C10: ser GUARDIAN sin pupilo vigente no concede acceso a la agenda.
create function app_private.can_read_group_activities(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.memberships m
        where m.group_id = p_group_id and m.user_id = public.auth_user_id() and m.status = 'ACTIVE'
          and (m.role in ('ADMIN', 'ATHLETE') or (m.role = 'GUARDIAN' and exists (
              select 1 from public.memberships ward
              where ward.group_id = p_group_id and ward.role = 'ATHLETE' and ward.status = 'ACTIVE'
                and public.is_guardian_of(ward.user_id)
          )))
    )
$$;
alter table public.activity_types enable row level security;
alter table public.activities enable row level security;
create policy activity_types_read on public.activity_types for select to authenticated
using ((group_id is null and public.auth_user_id() is not null) or app_private.can_read_group_activities(group_id));
create policy activities_read on public.activities for select to authenticated
using (app_private.can_read_group_activities(group_id));

-- Vistas del propietario con barrera y autorización explícita, como v_my_groups.
-- Las tablas base no se conceden al cliente; ninguna vista incluye PII.
create view public.v_activity_types with (security_barrier = true) as
select t.id, t.group_id, t.name, t.color, t.is_active
from public.activity_types t
where (t.group_id is null and public.auth_user_id() is not null)
   or app_private.can_read_group_activities(t.group_id);
create view public.v_group_activities with (security_barrier = true) as
select a.id, a.group_id, a.activity_type_id, a.title, a.description, a.location,
       a.starts_at, a.ends_at, t.name as activity_type_name, t.color as activity_type_color,
       (t.group_id is null) as is_system_type
from public.activities a join public.activity_types t on t.id = a.activity_type_id
where app_private.can_read_group_activities(a.group_id);

create function public.create_activity(
    p_group_id uuid, p_activity_type_id uuid, p_title text,
    p_starts_at timestamptz, p_ends_at timestamptz,
    p_description text default null, p_location text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user_id uuid := public.auth_user_id();
begin
    if v_user_id is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not app_private.can_read_group_activities(p_group_id) then
        raise sqlstate 'PT404' using message = 'group_not_found';
    end if;
    -- El lock conserva el permiso ADMIN hasta finalizar la escritura.
    perform 1 from public.memberships where group_id = p_group_id and user_id = v_user_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_title is null or length(trim(p_title)) not between 3 and 120
       or length(p_description) > 2000 or length(p_location) > 200 then
        raise sqlstate 'PT400' using message = 'invalid_activity';
    end if;
    if p_starts_at is null or p_ends_at is null or not isfinite(p_starts_at)
       or not isfinite(p_ends_at) or p_ends_at <= p_starts_at or p_ends_at - p_starts_at > interval '24 hours' then
        raise sqlstate 'PT422' using message = 'invalid_date_range';
    end if;
    perform 1 from public.activity_types where id = p_activity_type_id and is_active
      and (group_id is null or group_id = p_group_id) for share;
    if not found then raise sqlstate 'PT422' using message = 'invalid_activity_type'; end if;
    insert into public.activities(group_id, activity_type_id, title, description, location, starts_at, ends_at, created_by)
    values(p_group_id, p_activity_type_id, trim(p_title), nullif(trim(p_description), ''),
           nullif(trim(p_location), ''), p_starts_at, p_ends_at, v_user_id)
    returning id into v_id;
    return v_id;
end $$;

revoke all on public.activity_types, public.activities from public, anon, authenticated;
revoke all on public.v_activity_types, public.v_group_activities from public, anon, authenticated;
grant select on public.v_activity_types, public.v_group_activities to authenticated;
revoke all on function public.create_activity(uuid, uuid, text, timestamptz, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.create_activity(uuid, uuid, text, timestamptz, timestamptz, text, text) to authenticated;
revoke all on function app_private.can_read_group_activities(uuid) from public, anon;
grant execute on function app_private.can_read_group_activities(uuid) to authenticated;
revoke all on function app_private.protect_system_activity_type(), app_private.validate_activity_type() from public, anon, authenticated;
