-- HU-ADM-03 (#22): el código incorpora exclusivamente ATHLETE. El menor
-- espera apoderado/consentimiento y aprobación ADMIN antes de estar ACTIVE.
create table app_private.join_code_attempts (
    user_id uuid primary key references public.users(id) on delete cascade,
    attempts timestamptz[] not null,
    updated_at timestamptz not null default now()
);
alter table app_private.join_code_attempts enable row level security;
revoke all on app_private.join_code_attempts from public, anon, authenticated;

create function public.join_group_by_code(p_invite_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_user_id uuid := public.auth_user_id();
    v_account_status text;
    v_birthdate date;
    v_attempts timestamptz[];
    v_group_id uuid;
    v_group_name text;
    v_sport text;
    v_membership_id uuid;
    v_status text;
    v_joined_at timestamptz;
begin
    if v_user_id is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    -- El perfil bloqueado serializa incorporaciones simultáneas del mismo usuario.
    select account_status, birthdate into v_account_status, v_birthdate
      from public.users where id = v_user_id for update;
    if v_account_status is distinct from 'ACTIVE' then
        raise sqlstate 'PT403' using message = 'active_account_required';
    end if;
    select array(select attempt from unnest(a.attempts) attempt
                 where attempt > now() - interval '15 minutes')
      into v_attempts from app_private.join_code_attempts a where a.user_id = v_user_id;
    v_attempts := coalesce(v_attempts, '{}'::timestamptz[]);
    if cardinality(v_attempts) >= 10 then
        raise sqlstate 'PT429' using message = 'join_rate_limited';
    end if;
    insert into app_private.join_code_attempts(user_id, attempts, updated_at)
    values(v_user_id, array_append(v_attempts, now()), now())
    on conflict(user_id) do update set attempts = excluded.attempts, updated_at = excluded.updated_at;

    -- Los errores esperados se devuelven: una excepción revertiría también
    -- el contador y permitiría probar códigos sin límite.
    if p_invite_code is null or btrim(p_invite_code) !~ '^[A-Za-z0-9]{8}$' then
        return jsonb_build_object('error', jsonb_build_object('code', 'invalid_invite_code',
          'message', 'Código no válido', 'details', '{}'::jsonb));
    end if;
    -- FOR UPDATE arbitra una rotación concurrente antes de aceptar el código.
    select id, name, sport into v_group_id, v_group_name, v_sport
      from public.groups where invite_code = btrim(p_invite_code) for update;
    if v_group_id is null then
        return jsonb_build_object('error', jsonb_build_object('code', 'invalid_invite_code',
          'message', 'Código no válido', 'details', '{}'::jsonb));
    end if;
    if exists(select 1 from public.memberships where user_id = v_user_id
      and group_id = v_group_id and role = 'ATHLETE') then
        return jsonb_build_object('error', jsonb_build_object('code', 'membership_already_exists',
          'message', 'Ya perteneces a este grupo como deportista', 'details', '{}'::jsonb));
    end if;
    if v_birthdate is null then
        return jsonb_build_object('error', jsonb_build_object('code', 'athlete_birthdate_required',
          'message', 'Completa tu fecha de nacimiento en Mi perfil', 'details', '{}'::jsonb));
    end if;
    if not exists(select 1 from public.memberships where user_id = v_user_id
      and group_id = v_group_id and status in ('ACTIVE', 'PENDING'))
      and (select count(distinct group_id) from public.memberships
           where user_id = v_user_id and status in ('ACTIVE', 'PENDING')) >= 30 then
        return jsonb_build_object('error', jsonb_build_object('code', 'user_group_limit',
          'message', 'Ya alcanzaste el límite de 30 grupos', 'details', '{}'::jsonb));
    end if;

    if app_private.is_minor(v_birthdate) then
        v_status := 'PENDING';
    else
        v_status := 'ACTIVE';
        v_joined_at := now();
        if (select count(*) from public.memberships where group_id = v_group_id
          and status = 'ACTIVE') >= 500 then
            return jsonb_build_object('error', jsonb_build_object('code', 'group_member_limit',
              'message', 'Este grupo alcanzó el límite de 500 membresías activas', 'details', '{}'::jsonb));
        end if;
    end if;
    insert into public.memberships(user_id, group_id, role, status, joined_at)
    values(v_user_id, v_group_id, 'ATHLETE', v_status, v_joined_at)
    returning id into v_membership_id;
    return jsonb_build_object(
      'membership', jsonb_build_object('id', v_membership_id, 'group_id', v_group_id,
        'role', 'ATHLETE', 'status', v_status, 'joined_at', v_joined_at),
      'group', jsonb_build_object('name', v_group_name, 'sport', v_sport)
    ) || case when v_status = 'PENDING' then
      jsonb_build_object('pending_reason', 'minor_requires_guardian_and_admin_approval')
    else '{}'::jsonb end;
end $$;

create function public.list_pending_athletes(p_group_id uuid)
returns table(membership_id uuid, full_name text, is_minor boolean, guardian_ready boolean, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
    if public.auth_user_id() is null then
        raise sqlstate 'PT401' using message = 'authentication_required';
    end if;
    if not public.is_member(p_group_id) then
        raise sqlstate 'PT404' using message = 'group_not_found';
    end if;
    if not public.is_group_admin(p_group_id) then
        raise sqlstate 'PT403' using message = 'admin_required';
    end if;
    return query
      select m.id, u.full_name, app_private.is_minor(u.birthdate),
        app_private.has_minor_consent(u.id), count(*) over ()
      from public.memberships m join public.users u on u.id = m.user_id
      where m.group_id = p_group_id and m.role = 'ATHLETE' and m.status = 'PENDING'
      order by m.created_at, m.id limit 100;
end $$;

revoke all on function public.join_group_by_code(text), public.list_pending_athletes(uuid) from public, anon;
grant execute on function public.join_group_by_code(text), public.list_pending_athletes(uuid) to authenticated;
