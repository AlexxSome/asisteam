-- HU-GEN-04 (#16): perfil global, foto privada y corrección de edad confirmada
-- por un ADMIN de CADA grupo ATHLETE ACTIVE/PENDING (decisión de producto).
-- Fundaciones mínimas de M2/M3; no habilita CRUD directo de estas entidades.
create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create table public.groups (
    id uuid primary key default gen_random_uuid(),
    name text not null check (length(trim(name)) between 3 and 80),
    sport text, description text, logo_url text,
    invite_code text not null unique check (invite_code ~ '^[A-Za-z0-9]{8}$'),
    settings jsonb not null default '{"athletes_can_view_group_stats":false,"guardians_can_view_group_stats":false}',
    created_by uuid not null references public.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (jsonb_typeof(settings -> 'athletes_can_view_group_stats') = 'boolean'
       and jsonb_typeof(settings -> 'guardians_can_view_group_stats') = 'boolean'
       and settings ?& array['athletes_can_view_group_stats','guardians_can_view_group_stats']
       and settings - array['athletes_can_view_group_stats','guardians_can_view_group_stats'] = '{}'::jsonb)
);
create table public.memberships (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete restrict,
    group_id uuid not null references public.groups(id) on delete restrict,
    role text not null check (role in ('ADMIN','ATHLETE','GUARDIAN')),
    status text not null check (status in ('INVITED','PENDING','ACTIVE','INACTIVE')),
    joined_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, group_id, role)
);
create index idx_memberships_group on public.memberships(group_id, role, status);
create index idx_memberships_user on public.memberships(user_id);
create table public.guardianships (
    id uuid primary key default gen_random_uuid(),
    guardian_user_id uuid not null references public.users(id) on delete restrict,
    athlete_user_id uuid not null references public.users(id) on delete restrict,
    relationship text not null check (length(trim(relationship)) between 2 and 40),
    status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
    created_at timestamptz not null default now(),
    deactivated_at timestamptz,
    unique (guardian_user_id, athlete_user_id),
    check (guardian_user_id <> athlete_user_id)
);
create index idx_guardianships_athlete on public.guardianships(athlete_user_id) where status = 'ACTIVE';
create index idx_guardianships_guardian on public.guardianships(guardian_user_id) where status = 'ACTIVE';
create table public.consents (
    id uuid primary key default gen_random_uuid(),
    guardianship_id uuid not null references public.guardianships(id) on delete restrict,
    consent_type text not null check (consent_type in ('DATA_PROCESSING_MINOR','ACCOUNT_ACTIVATION_MINOR')),
    terms_version text not null check (length(trim(terms_version)) > 0),
    granted_at timestamptz not null default now(),
    revoked_at timestamptz,
    channel text check (channel in ('EMAIL_LINK','IN_APP')),
    -- Cláusula explícita de foto del consentimiento (doc 11 §3.1).
    allows_avatar boolean not null default false,
    check (revoked_at is null or revoked_at >= granted_at)
);
create index idx_consents_guardianship on public.consents(guardianship_id) where revoked_at is null;

create table public.birthdate_change_requests (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete restrict,
    old_birthdate date not null,
    requested_birthdate date not null,
    status text not null default 'PENDING' check (status in ('PENDING','APPROVED','APPLIED','REJECTED','CANCELLED')),
    created_at timestamptz not null default now(),
    resolved_at timestamptz
);
create unique index uq_pending_birthdate_change on public.birthdate_change_requests(user_id) where status in ('PENDING','APPROVED');
create table public.birthdate_change_approvals (
    request_id uuid not null references public.birthdate_change_requests(id) on delete restrict,
    group_id uuid not null references public.groups(id) on delete restrict,
    approved_by uuid not null references public.users(id) on delete restrict,
    approved_at timestamptz not null default now(),
    primary key(request_id, group_id)
);

create function app_private.chile_today() returns date language sql stable
set search_path = '' as $$ select (now() at time zone 'America/Santiago')::date $$;
create function app_private.is_minor(p_birthdate date) returns boolean language sql stable
set search_path = '' as $$ select p_birthdate is not null and p_birthdate > (app_private.chile_today() - interval '18 years')::date $$;
create function app_private.has_minor_consent(p_user_id uuid, p_avatar boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.guardianships g join public.consents c on c.guardianship_id = g.id
        where g.athlete_user_id = p_user_id and g.status = 'ACTIVE'
          and c.consent_type = 'DATA_PROCESSING_MINOR' and c.revoked_at is null
          and c.granted_at <= now() and (not p_avatar or c.allows_avatar)
    )
$$;
create function public.is_member(p_group_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
    select exists(select 1 from public.memberships where group_id = p_group_id and user_id = public.auth_user_id() and status = 'ACTIVE')
$$;
create function public.is_group_admin(p_group_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
    select exists(select 1 from public.memberships where group_id = p_group_id and user_id = public.auth_user_id() and status = 'ACTIVE' and role = 'ADMIN')
$$;
create function public.is_guardian_of(p_athlete_user_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
    select exists(select 1 from public.guardianships g join public.users u on u.id = g.athlete_user_id
      where g.guardian_user_id = public.auth_user_id() and g.athlete_user_id = p_athlete_user_id
        and g.status = 'ACTIVE' and app_private.is_minor(u.birthdate))
$$;
create function public.can_upload_avatar() returns boolean language sql stable security definer set search_path = '' as $$
    select coalesce((select u.birthdate is not null and (not app_private.is_minor(u.birthdate)
       or app_private.has_minor_consent(u.id, true)) from public.users u
       where u.id = public.auth_user_id() and u.account_status = 'ACTIVE'), false)
$$;

create function app_private.validate_membership() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_birthdate date;
begin
    select birthdate into v_birthdate from public.users where id = new.user_id for update;
    if new.role = 'ATHLETE' then
        if v_birthdate is null then raise exception using errcode = '23514', message = 'athlete_birthdate_required'; end if;
        if new.status = 'ACTIVE' and app_private.is_minor(v_birthdate) and not app_private.has_minor_consent(new.user_id) then
            raise exception using errcode = '23514', message = 'minor_requires_guardian_consent';
        end if;
    end if;
    return new;
end $$;
create trigger trg_membership_minor before insert or update on public.memberships for each row execute function app_private.validate_membership();
create trigger trg_memberships_updated_at before update on public.memberships for each row execute function public.set_updated_at();
create trigger trg_groups_updated_at before update on public.groups for each row execute function public.set_updated_at();

create function app_private.validate_guardianship() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_birthdate date;
begin
    if tg_op = 'DELETE' then raise exception using errcode = '23514', message = 'guardianship_history_required'; end if;
    select birthdate into v_birthdate from public.users where id = new.athlete_user_id for update;
    if new.status = 'ACTIVE' and not coalesce(app_private.is_minor(v_birthdate), false) then
        raise exception using errcode = '23514', message = 'guardian_only_for_minor';
    end if;
    if tg_op = 'UPDATE' and (new.guardian_user_id <> old.guardian_user_id or new.athlete_user_id <> old.athlete_user_id) then
        raise exception using errcode = '23514', message = 'guardianship_identity_immutable';
    end if;
    if tg_op = 'UPDATE' and old.status = 'ACTIVE' and new.status = 'INACTIVE' and app_private.is_minor(v_birthdate)
      and exists(select 1 from public.memberships where user_id = new.athlete_user_id and role = 'ATHLETE' and status in ('ACTIVE','PENDING'))
      and not exists(select 1 from public.guardianships where athlete_user_id = new.athlete_user_id and id <> new.id and status = 'ACTIVE') then
        raise exception using errcode = '23514', message = 'minor_requires_guardian';
    end if;
    return new;
end $$;
create trigger trg_guardianship_minor before insert or update or delete on public.guardianships for each row execute function app_private.validate_guardianship();

create function app_private.protect_consent() returns trigger language plpgsql set search_path = '' as $$
begin
    if tg_op = 'DELETE' then raise exception using errcode = '23514', message = 'consent_history_required'; end if;
    if (to_jsonb(new) - 'revoked_at') is distinct from (to_jsonb(old) - 'revoked_at') or old.revoked_at is not null or new.revoked_at is null then
        raise exception using errcode = '23514', message = 'consent_append_only';
    end if;
    return new;
end $$;
create trigger trg_consent_history before update or delete on public.consents for each row execute function app_private.protect_consent();

create function app_private.sync_guardian_memberships() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
    if tg_table_name = 'memberships' then v_user := new.user_id;
    else v_user := new.athlete_user_id; end if;
    insert into public.memberships(user_id, group_id, role, status, joined_at)
    select distinct g.guardian_user_id, m.group_id, 'GUARDIAN', 'ACTIVE', now()
    from public.guardianships g join public.memberships m on m.user_id = g.athlete_user_id
    join public.users u on u.id = g.athlete_user_id
    where g.athlete_user_id = v_user and g.status = 'ACTIVE' and app_private.is_minor(u.birthdate)
      and m.role = 'ATHLETE' and m.status = 'ACTIVE'
    on conflict(user_id, group_id, role) do update set status = 'ACTIVE', joined_at = coalesce(public.memberships.joined_at, excluded.joined_at)
    where public.memberships.status <> 'ACTIVE';
    return new;
end $$;
create trigger trg_athlete_guardian_memberships after insert or update on public.memberships
for each row when (new.role = 'ATHLETE') execute function app_private.sync_guardian_memberships();
create trigger trg_guardianship_memberships after insert or update on public.guardianships
for each row when (new.status = 'ACTIVE') execute function app_private.sync_guardian_memberships();

-- Privilegios por columna: RLS solo autoriza la fila, no sus columnas.
revoke all on public.users from anon, authenticated;
grant select on public.users to authenticated;
grant update(full_name, phone, birthdate, avatar_url) on public.users to authenticated;
create policy users_update_own on public.users for update to authenticated
using (auth_user_id = (select auth.uid()) and account_status = 'ACTIVE')
with check (auth_user_id = (select auth.uid()) and account_status = 'ACTIVE');

create function app_private.validate_profile_update() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_request uuid;
begin
    if new.full_name is distinct from old.full_name and length(trim(new.full_name)) not between 2 and 120 then
        raise exception using errcode = '23514', message = 'invalid_full_name';
    end if;
    if new.phone is distinct from old.phone and new.phone is not null and new.phone !~ '^\+[1-9][0-9]{7,14}$' then
        raise exception using errcode = '23514', message = 'invalid_phone';
    end if;
    if new.birthdate is distinct from old.birthdate then
        if new.birthdate is not null and (new.birthdate >= app_private.chile_today()
          or extract(year from age(app_private.chile_today(), new.birthdate)) > 110) then
            raise exception using errcode = '23514', message = 'invalid_birthdate';
        end if;
        if new.birthdate is null and exists(select 1 from public.memberships where user_id = new.id and role = 'ATHLETE') then
            raise exception using errcode = '23514', message = 'athlete_birthdate_required';
        end if;
        if app_private.is_minor(old.birthdate) and not coalesce(app_private.is_minor(new.birthdate), false)
          and exists(select 1 from public.memberships where user_id = new.id and role = 'ATHLETE' and status in ('ACTIVE','PENDING')) then
            select id into v_request from public.birthdate_change_requests
            where user_id = new.id and old_birthdate = old.birthdate and requested_birthdate = new.birthdate and status = 'APPROVED' for update;
            if v_request is null then raise exception using errcode = 'P0001', message = 'birthdate_admin_confirmation_required'; end if;
            update public.birthdate_change_requests set status = 'APPLIED', resolved_at = now() where id = v_request;
        end if;
        if app_private.is_minor(new.birthdate) and exists(select 1 from public.memberships where user_id = new.id and role = 'ATHLETE' and status = 'ACTIVE')
           and not app_private.has_minor_consent(new.id) then
            raise exception using errcode = '23514', message = 'minor_requires_guardian_consent';
        end if;
        update public.birthdate_change_requests set status = 'CANCELLED', resolved_at = now() where user_id = new.id and status = 'PENDING';
    end if;
    if new.avatar_url is not null then
        if new.birthdate is null or (app_private.is_minor(new.birthdate) and not app_private.has_minor_consent(new.id, true)) then
            if new.avatar_url is distinct from old.avatar_url then raise exception using errcode = 'P0001', message = 'avatar_consent_required'; end if;
            new.avatar_url := null;
        elsif new.avatar_url is distinct from old.avatar_url and (new.auth_user_id is null
          or new.avatar_url !~ ('^/profile/avatar/' || new.auth_user_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')) then
            raise exception using errcode = '23514', message = 'invalid_avatar';
        end if;
    end if;
    return new;
end $$;
create trigger trg_profile_validation before update on public.users for each row execute function app_private.validate_profile_update();

create function app_private.deactivate_adult_guardianships() returns trigger language plpgsql security definer set search_path = '' as $$
begin
    if new.birthdate is distinct from old.birthdate and new.birthdate is not null and not app_private.is_minor(new.birthdate) then
        update public.guardianships set status = 'INACTIVE', deactivated_at = now() where athlete_user_id = new.id and status = 'ACTIVE';
        update public.memberships gm set status = 'INACTIVE'
        where gm.role = 'GUARDIAN' and gm.status = 'ACTIVE'
          and exists(select 1 from public.guardianships g where g.athlete_user_id = new.id and g.guardian_user_id = gm.user_id)
          and not exists(select 1 from public.guardianships g join public.users u on u.id = g.athlete_user_id
            join public.memberships m on m.user_id = u.id and m.group_id = gm.group_id and m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')
            where g.guardian_user_id = gm.user_id and g.status = 'ACTIVE' and app_private.is_minor(u.birthdate));
    end if;
    return new;
end $$;
create trigger trg_profile_majority after update of birthdate on public.users for each row execute function app_private.deactivate_adult_guardianships();

-- Aislamiento: solo el perfil propio lee las solicitudes completas. ADMIN
-- recibe una proyección acotada a su grupo mediante RPC, nunca usuarios.*.
alter table public.groups enable row level security;
alter table public.memberships enable row level security;
alter table public.guardianships enable row level security;
alter table public.consents enable row level security;
alter table public.birthdate_change_requests enable row level security;
alter table public.birthdate_change_approvals enable row level security;
revoke all on public.groups, public.memberships, public.guardianships, public.consents, public.birthdate_change_requests, public.birthdate_change_approvals from anon, authenticated;
grant select on public.memberships, public.guardianships, public.consents, public.birthdate_change_requests, public.birthdate_change_approvals to authenticated;
create policy memberships_select_own on public.memberships for select to authenticated using(user_id = (select public.auth_user_id()));
create policy guardianships_select_own on public.guardianships for select to authenticated using(athlete_user_id = (select public.auth_user_id()) or (guardian_user_id = (select public.auth_user_id()) and public.is_guardian_of(athlete_user_id)));
create policy consents_select_own on public.consents for select to authenticated using(exists(select 1 from public.guardianships g where g.id = guardianship_id));
create policy birthdate_requests_select_own on public.birthdate_change_requests for select to authenticated using(user_id = (select public.auth_user_id()));
create policy birthdate_approvals_select_own on public.birthdate_change_approvals for select to authenticated using(exists(select 1 from public.birthdate_change_requests r where r.id = request_id));

create function public.request_birthdate_change(p_birthdate date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user public.users%rowtype; v_id uuid;
begin
    select * into v_user from public.users where id = public.auth_user_id() and account_status = 'ACTIVE' for update;
    if v_user.id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
    if p_birthdate is null or not app_private.is_minor(v_user.birthdate) or app_private.is_minor(p_birthdate)
      or extract(year from age(app_private.chile_today(), p_birthdate)) > 110 then
        raise exception using errcode = '22023', message = 'invalid_birthdate_request';
    end if;
    if not exists(select 1 from public.memberships where user_id = v_user.id and role = 'ATHLETE' and status in ('ACTIVE','PENDING')) then
        raise exception using errcode = '22023', message = 'birthdate_confirmation_not_required';
    end if;
    select id into v_id from public.birthdate_change_requests where user_id = v_user.id and status = 'PENDING' and requested_birthdate = p_birthdate;
    if v_id is not null then return v_id; end if;
    update public.birthdate_change_requests set status = 'CANCELLED', resolved_at = now() where user_id = v_user.id and status = 'PENDING';
    insert into public.birthdate_change_requests(user_id, old_birthdate, requested_birthdate) values(v_user.id, v_user.birthdate, p_birthdate) returning id into v_id;
    return v_id;
end $$;

create function public.review_birthdate_change(p_request_id uuid, p_group_id uuid, p_approve boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid; v_request public.birthdate_change_requests%rowtype;
begin
    perform 1 from public.memberships where user_id = public.auth_user_id() and group_id = p_group_id and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise exception using errcode = 'P0002', message = 'request_not_found'; end if;
    select user_id into v_user_id from public.birthdate_change_requests where id = p_request_id;
    if v_user_id is null or v_user_id = public.auth_user_id() then raise exception using errcode = 'P0002', message = 'request_not_found'; end if;
    perform 1 from public.users where id = v_user_id for update;
    select * into v_request from public.birthdate_change_requests where id = p_request_id for update;
    if v_request.status <> 'PENDING' or not exists(select 1 from public.memberships where user_id = v_user_id and group_id = p_group_id and role = 'ATHLETE' and status in ('ACTIVE','PENDING')) then
        raise exception using errcode = 'P0002', message = 'request_not_found';
    end if;
    if p_approve is null then raise exception using errcode = '22023', message = 'invalid_decision'; end if;
    if not p_approve then
        update public.birthdate_change_requests set status = 'REJECTED', resolved_at = now() where id = p_request_id;
        return 'REJECTED';
    end if;
    insert into public.birthdate_change_approvals(request_id, group_id, approved_by)
      values(p_request_id, p_group_id, public.auth_user_id())
      on conflict(request_id, group_id) do update set approved_by = excluded.approved_by, approved_at = now();
    perform 1 from public.memberships am join public.birthdate_change_approvals a on a.approved_by = am.user_id and a.group_id = am.group_id
      where a.request_id = p_request_id and am.role = 'ADMIN' and am.status = 'ACTIVE' for share of am;
    -- Revalidar grupos y rol actual del aprobador: una aprobación deja de
    -- contar si su ADMIN pierde el rol mientras la solicitud está pendiente.
    if exists(select 1 from public.memberships m where m.user_id = v_user_id and m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')
      and not exists(select 1 from public.birthdate_change_approvals a join public.memberships admin_m
        on admin_m.user_id = a.approved_by and admin_m.group_id = a.group_id and admin_m.role = 'ADMIN' and admin_m.status = 'ACTIVE'
        where a.request_id = p_request_id and a.group_id = m.group_id)) then return 'PENDING'; end if;
    update public.birthdate_change_requests set status = 'APPROVED' where id = p_request_id;
    update public.users set birthdate = v_request.requested_birthdate where id = v_user_id and birthdate = v_request.old_birthdate;
    if not found then raise exception using errcode = '40001', message = 'birthdate_request_stale'; end if;
    -- Puede haber cumplido 18 durante la espera; en ese caso el trigger ya
    -- no necesita consumir la autorización, pero el flujo igual concluye.
    update public.birthdate_change_requests set status = 'APPLIED', resolved_at = now()
      where id = p_request_id and status = 'APPROVED';
    return 'APPLIED';
end $$;

create function public.list_birthdate_reviews()
returns table(request_id uuid, group_id uuid, group_name text, full_name text, old_birthdate date, requested_birthdate date, approved boolean)
language sql stable security definer set search_path = '' as $$
    select r.id, g.id, g.name, u.full_name, r.old_birthdate, r.requested_birthdate,
      exists(select 1 from public.birthdate_change_approvals a join public.memberships am
        on am.user_id = a.approved_by and am.group_id = a.group_id and am.role = 'ADMIN' and am.status = 'ACTIVE'
        where a.request_id = r.id and a.group_id = g.id)
    from public.birthdate_change_requests r join public.users u on u.id = r.user_id
      join public.memberships m on m.user_id = r.user_id and m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')
      join public.groups g on g.id = m.group_id
    where r.status = 'PENDING' and r.user_id <> public.auth_user_id() and public.is_group_admin(g.id)
    order by r.created_at, g.name
$$;

-- Las fotos no tienen URL pública ni acceso anónimo. El endpoint web sirve
-- objetos bajo la sesión y estas mismas políticas (incluido consentimiento).
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('avatars', 'avatars', false, 2097152, array['image/jpeg','image/png','image/webp']);
create policy avatars_select_own on storage.objects for select to authenticated
using(bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and public.can_upload_avatar());
create policy avatars_insert_own on storage.objects for insert to authenticated
with check(bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and public.can_upload_avatar());
create policy avatars_delete_own on storage.objects for delete to authenticated
using(bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Ningún helper SECURITY DEFINER queda invocable por anon/PUBLIC.
revoke all on all functions in schema app_private from public, anon, authenticated;
revoke all on function public.is_member(uuid), public.is_group_admin(uuid), public.is_guardian_of(uuid), public.can_upload_avatar(), public.request_birthdate_change(date), public.review_birthdate_change(uuid,uuid,boolean), public.list_birthdate_reviews() from public, anon;
grant execute on function public.is_member(uuid), public.is_group_admin(uuid), public.is_guardian_of(uuid), public.can_upload_avatar(), public.request_birthdate_change(date), public.review_birthdate_change(uuid,uuid,boolean), public.list_birthdate_reviews() to authenticated;

-- Consentimiento de imagen: disponible al apoderado en su propio perfil.
-- La autorización general del menor pertenece al alta M3; esta operación
-- solo versiona la cláusula de foto de un consentimiento ya vigente.
create function public.list_avatar_permissions()
returns table(guardianship_id uuid, full_name text, allows_avatar boolean)
language sql stable security definer set search_path = '' as $$
    select g.id, u.full_name, bool_or(c.allows_avatar)
    from public.guardianships g join public.users u on u.id = g.athlete_user_id
    join public.consents c on c.guardianship_id = g.id and c.consent_type = 'DATA_PROCESSING_MINOR' and c.revoked_at is null and c.granted_at <= now()
    where g.guardian_user_id = public.auth_user_id() and g.status = 'ACTIVE' and app_private.is_minor(u.birthdate)
    group by g.id, u.full_name
$$;
create function public.set_avatar_permission(p_guardianship_id uuid, p_allow boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_athlete uuid; v_terms text; v_consent uuid;
begin
    if public.auth_user_id() is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
    select athlete_user_id into v_athlete from public.guardianships
    where id = p_guardianship_id and guardian_user_id = public.auth_user_id() and status = 'ACTIVE';
    if v_athlete is null then raise exception using errcode = 'P0002', message = 'guardianship_not_found'; end if;
    perform 1 from public.users where id = v_athlete and app_private.is_minor(birthdate) for update;
    if not found or p_allow is null then raise exception using errcode = '22023', message = 'invalid_avatar_permission'; end if;
    perform 1 from public.guardianships where id = p_guardianship_id and status = 'ACTIVE' for share;
    if not found then raise exception using errcode = 'P0002', message = 'guardianship_not_found'; end if;
    select terms_version into v_terms from public.consents where guardianship_id = p_guardianship_id
      and consent_type = 'DATA_PROCESSING_MINOR' and revoked_at is null and granted_at <= now()
      order by granted_at desc, id limit 1;
    if v_terms is null then raise exception using errcode = 'P0001', message = 'minor_consent_required'; end if;
    -- El perfil bloqueado serializa decisiones/lecturas del invariante.
    insert into public.consents(guardianship_id,consent_type,terms_version,channel,allows_avatar)
      values(p_guardianship_id,'DATA_PROCESSING_MINOR',v_terms,'IN_APP',p_allow) returning id into v_consent;
    update public.consents set revoked_at = now() where guardianship_id = p_guardianship_id and consent_type = 'DATA_PROCESSING_MINOR' and revoked_at is null and id <> v_consent;
    if not app_private.has_minor_consent(v_athlete, true) then update public.users set avatar_url = null where id = v_athlete; end if;
end $$;

create function public.can_read_avatar(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
    select exists(select 1 from public.users u where u.auth_user_id::text = split_part(p_name, '/', 1)
      and u.birthdate is not null and (not app_private.is_minor(u.birthdate) or app_private.has_minor_consent(u.id, true))
      and (u.id = public.auth_user_id() or (u.avatar_url = '/profile/avatar/' || p_name and exists(
        select 1 from public.memberships target join public.memberships viewer on viewer.group_id = target.group_id
        join public.groups g on g.id = target.group_id
        where target.user_id = u.id and viewer.user_id = public.auth_user_id() and viewer.status = 'ACTIVE'
          and (viewer.role = 'ADMIN' and target.status in ('ACTIVE','PENDING')
            or target.role = 'ATHLETE' and target.status = 'ACTIVE' and (
              viewer.role = 'GUARDIAN' and public.is_guardian_of(u.id)
              or viewer.role = 'ATHLETE' and (g.settings ->> 'athletes_can_view_group_stats')::boolean
              or viewer.role = 'GUARDIAN' and (g.settings ->> 'guardians_can_view_group_stats')::boolean
                and exists(select 1 from public.guardianships wg join public.users wu on wu.id = wg.athlete_user_id
                  join public.memberships wm on wm.user_id = wu.id and wm.group_id = target.group_id and wm.role = 'ATHLETE' and wm.status = 'ACTIVE'
                  where wg.guardian_user_id = viewer.user_id and wg.status = 'ACTIVE' and app_private.is_minor(wu.birthdate))
            ))
      ))))
$$;
drop policy avatars_select_own on storage.objects;
create policy avatars_select_visible on storage.objects for select to authenticated
using(bucket_id = 'avatars' and public.can_read_avatar(name));
revoke all on function public.list_avatar_permissions(), public.set_avatar_permission(uuid,boolean), public.can_read_avatar(text) from public, anon;
grant execute on function public.list_avatar_permissions(), public.set_avatar_permission(uuid,boolean), public.can_read_avatar(text) to authenticated;

-- R1 también protege la retirada del consentimiento/vínculo. Los futuros
-- flujos de baja deben desactivar primero las memberships en su transacción.
create function app_private.preserve_minor_consent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_athlete uuid; v_birthdate date;
begin
    if tg_table_name = 'guardianships' then v_athlete := new.athlete_user_id;
    else select athlete_user_id into v_athlete from public.guardianships where id = new.guardianship_id; end if;
    select birthdate into v_birthdate from public.users where id = v_athlete for update;
    if app_private.is_minor(v_birthdate) then
        if not app_private.has_minor_consent(v_athlete) and exists(select 1 from public.memberships where user_id = v_athlete and role = 'ATHLETE' and status = 'ACTIVE') then
            raise exception using errcode = '23514', message = 'minor_requires_guardian_consent';
        end if;
        if not app_private.has_minor_consent(v_athlete, true) then update public.users set avatar_url = null where id = v_athlete and avatar_url is not null; end if;
    end if;
    return new;
end $$;
create trigger trg_consent_minor_invariant after update on public.consents for each row execute function app_private.preserve_minor_consent();
create trigger trg_guardianship_consent_invariant after update on public.guardianships for each row execute function app_private.preserve_minor_consent();
revoke all on function app_private.preserve_minor_consent() from public, anon, authenticated;
