-- HU-ADM-01 (#20): creación atómica y segundo rol del ADMIN que entrena.
create function public.create_group(
    p_name text, p_sport text, p_description text default null, p_logo_url text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_user_id uuid := public.auth_user_id();
    v_status text;
    v_id uuid;
    v_code text;
begin
    if v_user_id is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    -- Serializa altas del mismo usuario, incluido accept_invitation, para el límite de grupos.
    select account_status into v_status from public.users where id = v_user_id for update;
    if v_status is distinct from 'ACTIVE' then raise sqlstate 'PT403' using message = 'active_account_required'; end if;
    if p_name is null or length(trim(p_name)) not between 3 and 80
       or p_sport is null or length(trim(p_sport)) not between 2 and 50
       or (nullif(trim(p_logo_url), '') is not null and trim(p_logo_url) !~ '^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$') then
        raise sqlstate 'PT400' using message = 'invalid_group';
    end if;
    if (select count(distinct group_id) from public.memberships
        where user_id = v_user_id and status in ('ACTIVE', 'PENDING')) >= 30 then
        raise sqlstate 'PT422' using message = 'user_group_limit';
    end if;
    -- 8 caracteres alfanuméricos desde bytes aleatorios. UNIQUE arbitra colisiones.
    for attempt in 1..10 loop
        v_code := translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/', 'AZ');
        insert into public.groups(name, sport, description, logo_url, invite_code, created_by)
        values(trim(p_name), trim(p_sport), nullif(trim(p_description), ''),
               nullif(trim(p_logo_url), ''), v_code, v_user_id)
        on conflict (invite_code) do nothing returning id into v_id;
        exit when v_id is not null;
    end loop;
    if v_id is null then raise sqlstate 'PT409' using message = 'invite_code_unavailable'; end if;
    insert into public.memberships(user_id, group_id, role, status, joined_at)
    values(v_user_id, v_id, 'ADMIN', 'ACTIVE', now());
    return v_id;
end $$;

create function public.join_group_as_athlete(p_group_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_user_id uuid := public.auth_user_id();
    v_status text;
    v_birthdate date;
    v_id uuid;
    v_membership_status text;
    v_new_memberships integer := 1;
begin
    if v_user_id is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    select account_status, birthdate into v_status, v_birthdate from public.users where id = v_user_id for update;
    if v_status is distinct from 'ACTIVE' then raise sqlstate 'PT403' using message = 'active_account_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    perform 1 from public.groups where id = p_group_id for update;
    perform 1 from public.memberships where user_id = v_user_id and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    select id, status into v_id, v_membership_status from public.memberships
      where user_id = v_user_id and group_id = p_group_id and role = 'ATHLETE';
    if v_membership_status = 'ACTIVE' then return v_id; end if;
    -- Aprobar/reactivar membresías existentes pertenece a sus RPC específicas.
    if v_id is not null then raise sqlstate 'PT409' using message = 'membership_already_exists'; end if;
    if v_birthdate is null then raise sqlstate 'PT422' using message = 'athlete_birthdate_required'; end if;
    if app_private.is_minor(v_birthdate) then
        if not app_private.has_minor_consent(v_user_id) then
            raise sqlstate 'PT422' using message = 'minor_requires_guardian_consent';
        end if;
        -- Las altas automáticas también respetan el límite de grupos del apoderado.
        perform 1 from public.users u where exists(select 1 from public.guardianships g
          where g.guardian_user_id = u.id and g.athlete_user_id = v_user_id and g.status = 'ACTIVE')
          order by u.id for update;
        if exists(select 1 from public.guardianships g where g.athlete_user_id = v_user_id and g.status = 'ACTIVE'
          and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
            and m.group_id = p_group_id and m.status in ('ACTIVE', 'PENDING'))
          and (select count(distinct m.group_id) from public.memberships m
            where m.user_id = g.guardian_user_id and m.status in ('ACTIVE', 'PENDING')) >= 30) then
            raise sqlstate 'PT422' using message = 'guardian_group_limit';
        end if;
        -- El trigger canónico agrega también las membresías GUARDIAN.
        v_new_memberships := v_new_memberships + (select count(*) from public.guardianships g
          where g.athlete_user_id = v_user_id and g.status = 'ACTIVE'
            and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
              and m.group_id = p_group_id and m.role = 'GUARDIAN' and m.status = 'ACTIVE'));
    end if;
    if (select count(*) from public.memberships where group_id = p_group_id and status = 'ACTIVE') + v_new_memberships > 500 then
        raise sqlstate 'PT422' using message = 'group_member_limit';
    end if;
    insert into public.memberships(user_id, group_id, role, status, joined_at)
    values(v_user_id, p_group_id, 'ATHLETE', 'ACTIVE', now()) returning id into v_id;
    return v_id;
end $$;

revoke all on function public.create_group(text,text,text,text), public.join_group_as_athlete(uuid) from public, anon;
grant execute on function public.create_group(text,text,text,text), public.join_group_as_athlete(uuid) to authenticated;
