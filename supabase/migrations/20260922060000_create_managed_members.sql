-- HU-ADM-05 (#24): alta atómica sin crear credenciales en Supabase Auth.
-- Evidencia de declaración ADMIN, separada del consentimiento del apoderado.
create table app_private.managed_member_enrollments (
    membership_id uuid primary key references public.memberships(id) on delete restrict,
    guardianship_id uuid not null references public.guardianships(id) on delete restrict,
    declared_by uuid not null references public.users(id) on delete restrict,
    declared_at timestamptz not null default now(),
    activated_at timestamptz
);
alter table app_private.managed_member_enrollments enable row level security;
revoke all on app_private.managed_member_enrollments from public, anon, authenticated;

create function public.create_managed_member(
    p_group_id uuid, p_full_name text, p_birthdate date, p_email text default null, p_guardian jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_actor uuid := public.auth_user_id();
    v_user uuid;
    v_membership uuid;
    v_guardian uuid;
    v_guardianship uuid;
    v_guardian_email text;
    v_minor boolean := app_private.is_minor(p_birthdate);
    v_email text := nullif(lower(trim(p_email)), '');
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not exists(select 1 from public.users where id = v_actor and account_status = 'ACTIVE') then
        raise sqlstate 'PT403' using message = 'active_account_required';
    end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_full_name is null or length(trim(p_full_name)) not between 2 and 120
      or p_birthdate is null or p_birthdate >= app_private.chile_today()
      or extract(year from age(app_private.chile_today(), p_birthdate)) > 110
      or (v_email is not null and (length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then
        raise sqlstate 'PT400' using message = 'invalid_managed_member';
    end if;
    if v_minor then
        v_guardian_email := lower(trim(p_guardian ->> 'email'));
        if p_guardian is null or jsonb_typeof(p_guardian) <> 'object'
          or not (p_guardian ?& array['full_name','email','relationship','authorized'])
          or p_guardian - array['full_name','email','relationship','authorized'] <> '{}'::jsonb
          or p_guardian -> 'authorized' is distinct from 'true'::jsonb
          or length(trim(coalesce(p_guardian ->> 'full_name',''))) not between 2 and 120
          or length(trim(coalesce(p_guardian ->> 'relationship',''))) not between 2 and 40
          or v_guardian_email is null or length(v_guardian_email) > 254
          or v_guardian_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
          or v_guardian_email = v_email then
            raise sqlstate 'PT422' using message = 'invalid_guardian';
        end if;
        -- Identidad por email; nunca se aceptan IDs de terceros desde el cliente.
        -- El perfil existente se conserva y no se expone en la respuesta.
        insert into public.users(full_name, email, account_status)
        values(trim(p_guardian ->> 'full_name'), v_guardian_email, 'INVITED')
        on conflict (lower(email)) where email is not null do nothing;
        select id into v_guardian from public.users where lower(email) = v_guardian_email for update;
    elsif p_guardian is not null then
        raise sqlstate 'PT400' using message = 'invalid_guardian';
    end if;
    -- Mismo orden que la aceptación de invitaciones: persona, luego grupo.
    perform 1 from public.groups where id = p_group_id for update;
    perform 1 from public.memberships where user_id = v_actor and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if (select count(*) from public.memberships where group_id = p_group_id and status = 'ACTIVE') >= 500 then
        raise sqlstate 'PT422' using message = 'group_member_limit';
    end if;
    begin
        insert into public.users(full_name, birthdate, email, account_status)
        values(trim(p_full_name), p_birthdate, v_email, 'MANAGED') returning id into v_user;
    exception when unique_violation then
        raise sqlstate 'PT409' using message = 'managed_email_unavailable';
    end;
    if v_minor then
        insert into public.guardianships(guardian_user_id, athlete_user_id, relationship)
        values(v_guardian, v_user, trim(p_guardian ->> 'relationship')) returning id into v_guardianship;
    end if;
    insert into public.memberships(user_id, group_id, role, status, joined_at)
    values(v_user, p_group_id, 'ATHLETE', case when v_minor then 'PENDING' else 'ACTIVE' end,
      case when v_minor then null else now() end) returning id into v_membership;
    if v_minor then
        insert into app_private.managed_member_enrollments(membership_id,guardianship_id,declared_by)
        values(v_membership,v_guardianship,v_actor);
    end if;
    return jsonb_build_object('membership_id', v_membership, 'membership_status', case when v_minor then 'PENDING' else 'ACTIVE' end);
end $$;

revoke all on function public.create_managed_member(uuid,text,date,text,jsonb) from public, anon;
grant execute on function public.create_managed_member(uuid,text,date,text,jsonb) to authenticated;

create function public.list_managed_member_consents(p_group_id uuid, p_offset integer default 0)
returns table(membership_id uuid, full_name text, relationship text, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
    if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    return query select m.id, u.full_name, g.relationship, count(*) over ()
    from app_private.managed_member_enrollments e
    join public.memberships m on m.id = e.membership_id
    join public.users u on u.id = m.user_id
    join public.guardianships g on g.id = e.guardianship_id
    where m.group_id = p_group_id and m.status = 'PENDING' and e.activated_at is null
      and g.guardian_user_id = public.auth_user_id() and g.status = 'ACTIVE'
      and app_private.is_minor(u.birthdate)
    order by e.declared_at, m.id limit 50 offset greatest(coalesce(p_offset,0),0);
end $$;

-- La declaración del ADMIN no crea consents. Solo el apoderado autenticado
-- puede otorgarlo; la activación y su evidencia se confirman juntas.
create function public.consent_managed_member(p_membership_id uuid, p_accepted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_actor uuid := public.auth_user_id();
    v_enrollment app_private.managed_member_enrollments%rowtype;
    v_athlete uuid;
    v_group uuid;
    v_status text;
    v_new_memberships integer;
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if p_accepted is distinct from true then raise sqlstate 'PT422' using message = 'consent_required'; end if;
    select m.user_id, m.group_id into v_athlete, v_group
    from app_private.managed_member_enrollments e
    join public.memberships m on m.id = e.membership_id
    join public.guardianships g on g.id = e.guardianship_id
    where m.id = p_membership_id and g.guardian_user_id = v_actor and g.status = 'ACTIVE'
      and public.is_member(m.group_id) and public.is_guardian_of(m.user_id);
    if v_athlete is null then raise sqlstate 'PT404' using message = 'managed_consent_not_found'; end if;
    perform 1 from public.users where id = v_actor and account_status = 'ACTIVE' for update;
    if not found then raise sqlstate 'PT403' using message = 'active_account_required'; end if;
    perform 1 from public.users where id = v_athlete for update;
    perform 1 from public.groups where id = v_group for update;
    select * into v_enrollment from app_private.managed_member_enrollments
      where membership_id = p_membership_id for update;
    perform 1 from public.guardianships where id = v_enrollment.guardianship_id
      and guardian_user_id = v_actor and status = 'ACTIVE' for share;
    if not found or not public.is_member(v_group) or not public.is_guardian_of(v_athlete) then
        raise sqlstate 'PT404' using message = 'managed_consent_not_found';
    end if;
    select status into v_status from public.memberships where id = p_membership_id for update;
    if v_enrollment.activated_at is not null and v_status = 'ACTIVE' then return; end if;
    if v_status <> 'PENDING' or v_enrollment.activated_at is not null then
        raise sqlstate 'PT409' using message = 'managed_member_not_pending';
    end if;
    v_new_memberships := 1 + (select count(*) from public.guardianships g
      where g.athlete_user_id = v_athlete and g.status = 'ACTIVE'
        and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
          and m.group_id = v_group and m.role = 'GUARDIAN' and m.status = 'ACTIVE'));
    if (select count(*) from public.memberships where group_id = v_group and status = 'ACTIVE') + v_new_memberships > 500 then
        raise sqlstate 'PT422' using message = 'group_member_limit';
    end if;
    if exists(select 1 from public.guardianships g where g.athlete_user_id = v_athlete and g.status = 'ACTIVE'
      and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
        and m.group_id = v_group and m.status in ('ACTIVE','PENDING'))
      and (select count(distinct group_id) from public.memberships where user_id = g.guardian_user_id
        and status in ('ACTIVE','PENDING')) >= 30) then
        raise sqlstate 'PT422' using message = 'guardian_group_limit';
    end if;
    insert into public.consents(guardianship_id,consent_type,terms_version,channel,allows_avatar)
    values(v_enrollment.guardianship_id,'DATA_PROCESSING_MINOR','2026-09-21','IN_APP',false);
    update public.memberships set status = 'ACTIVE', joined_at = now() where id = p_membership_id;
    update app_private.managed_member_enrollments set activated_at = now() where membership_id = p_membership_id;
end $$;

revoke all on function public.list_managed_member_consents(uuid,integer), public.consent_managed_member(uuid,boolean) from public, anon;
grant execute on function public.list_managed_member_consents(uuid,integer), public.consent_managed_member(uuid,boolean) to authenticated;
