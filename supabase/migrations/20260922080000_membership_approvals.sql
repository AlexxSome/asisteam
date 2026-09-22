-- HU-ADM-07 (#26): revisión ADMIN de incorporaciones pendientes (INT-06).
-- Revisar una membership no debe reactivar apoderados en otros grupos del
-- pupilo. Crear un vínculo global conserva la sincronización multi-grupo.
create or replace function app_private.sync_guardian_memberships() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_membership uuid;
begin
    if tg_table_name = 'memberships' then
        if new.status <> 'ACTIVE' then return new; end if;
        v_user := new.user_id;
        v_membership := new.id;
    else v_user := new.athlete_user_id; end if;
    insert into public.memberships(user_id, group_id, role, status, joined_at)
    select distinct g.guardian_user_id, m.group_id, 'GUARDIAN', 'ACTIVE', now()
    from public.guardianships g join public.memberships m on m.user_id = g.athlete_user_id
    join public.users u on u.id = g.athlete_user_id
    where g.athlete_user_id = v_user and g.status = 'ACTIVE' and app_private.is_minor(u.birthdate)
      and m.role = 'ATHLETE' and m.status = 'ACTIVE' and (v_membership is null or m.id = v_membership)
    on conflict(user_id, group_id, role) do update set status = 'ACTIVE', joined_at = coalesce(public.memberships.joined_at, excluded.joined_at)
    where public.memberships.status <> 'ACTIVE';
    return new;
end $$;

-- La proyección anterior se conserva para el resumen de inicio del grupo.
create function public.list_pending_memberships(p_group_id uuid, p_offset integer default 0)
returns table(membership_id uuid, full_name text, is_minor boolean,
    guardian_linked boolean, guardian_ready boolean, requires_managed_consent boolean, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
    if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_offset is null or p_offset < 0 then raise sqlstate 'PT400' using message = 'invalid_membership_review'; end if;
    return query select m.id, u.full_name, app_private.is_minor(u.birthdate),
      exists(select 1 from public.guardianships g where g.athlete_user_id = u.id and g.status = 'ACTIVE'),
      app_private.has_minor_consent(u.id),
      app_private.is_minor(u.birthdate) and exists(select 1 from app_private.managed_member_enrollments e
        where e.membership_id = m.id and e.activated_at is null), count(*) over ()
    from public.memberships m join public.users u on u.id = m.user_id
    where m.group_id = p_group_id and m.role = 'ATHLETE' and m.status = 'PENDING'
    order by m.created_at, m.id limit 50 offset p_offset;
end $$;

create function app_private.review_pending_membership(p_group_id uuid, p_membership_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_actor uuid := public.auth_user_id();
    v_athlete uuid;
    v_birthdate date;
    v_status text;
    v_new_memberships integer := 1;
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not exists(select 1 from public.users where id = v_actor and account_status = 'ACTIVE') then
        raise sqlstate 'PT403' using message = 'active_account_required';
    end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_approve is null then raise sqlstate 'PT400' using message = 'invalid_membership_review'; end if;
    select user_id into v_athlete from public.memberships
      where id = p_membership_id and group_id = p_group_id and role = 'ATHLETE';
    if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;

    -- Personas antes de grupos: serializa el límite global de cada apoderado.
    -- Vínculos/consentimientos también bloquean el perfil del pupilo; R1 se
    -- revalida por el trigger incluso frente a una revocación concurrente.
    perform 1 from public.users u where u.id = v_athlete or (p_approve and exists(
      select 1 from public.guardianships g where g.athlete_user_id = v_athlete
        and g.guardian_user_id = u.id and g.status = 'ACTIVE')) order by u.id for update;
    select birthdate into v_birthdate from public.users where id = v_athlete;
    -- Recoge también cualquier vínculo confirmado mientras se esperaba al perfil.
    if p_approve and app_private.is_minor(v_birthdate) then
        perform 1 from public.users u where exists(select 1 from public.guardianships g
          where g.athlete_user_id = v_athlete and g.guardian_user_id = u.id and g.status = 'ACTIVE')
          order by u.id for update;
    end if;
    perform 1 from public.groups where id = p_group_id for update;
    perform 1 from public.memberships where user_id = v_actor and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    select status into v_status from public.memberships
      where id = p_membership_id and group_id = p_group_id and role = 'ATHLETE' for update;
    if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;
    if v_status <> 'PENDING' then raise sqlstate 'PT409' using message = 'membership_not_pending'; end if;

    if not p_approve then
        update public.memberships set status = 'INACTIVE' where id = p_membership_id;
        return;
    end if;
    if v_birthdate is null then raise sqlstate 'PT422' using message = 'athlete_birthdate_required'; end if;
    if app_private.is_minor(v_birthdate) then
        if not exists(select 1 from public.guardianships where athlete_user_id = v_athlete and status = 'ACTIVE') then
            raise sqlstate 'PT422' using message = 'minor_requires_guardian';
        end if;
        if not app_private.has_minor_consent(v_athlete) then
            raise sqlstate 'PT422' using message = 'minor_requires_guardian_consent';
        end if;
        -- HU-ADM-05: el alta MANAGED ya tiene aprobación ADMIN. La ratificación
        -- del apoderado designado debe seguir su flujo consent_managed_member.
        if exists(select 1 from app_private.managed_member_enrollments
          where membership_id = p_membership_id and activated_at is null) then
            raise sqlstate 'PT422' using message = 'managed_consent_required';
        end if;
        if exists(select 1 from public.guardianships g where g.athlete_user_id = v_athlete and g.status = 'ACTIVE'
          and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
            and m.group_id = p_group_id and m.status in ('ACTIVE','PENDING'))
          and (select count(distinct m.group_id) from public.memberships m where m.user_id = g.guardian_user_id
            and m.status in ('ACTIVE','PENDING')) >= 30) then
            raise sqlstate 'PT422' using message = 'guardian_group_limit';
        end if;
        v_new_memberships := v_new_memberships + (select count(*) from public.guardianships g
          where g.athlete_user_id = v_athlete and g.status = 'ACTIVE'
            and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
              and m.group_id = p_group_id and m.role = 'GUARDIAN' and m.status = 'ACTIVE'));
    end if;
    if (select count(*) from public.memberships where group_id = p_group_id and status = 'ACTIVE') + v_new_memberships > 500 then
        raise sqlstate 'PT422' using message = 'group_member_limit';
    end if;
    -- El trigger canónico sincroniza GUARDIAN. La fecha de ingreso empieza aquí;
    -- no se crean convocatorias ni se arrastran ausencias del período pendiente.
    update public.memberships set status = 'ACTIVE', joined_at = now() where id = p_membership_id;
end $$;

create function public.approve_membership(p_group_id uuid, p_membership_id uuid)
returns void language sql security definer set search_path = '' as $$
    select app_private.review_pending_membership(p_group_id, p_membership_id, true)
$$;
create function public.reject_pending_membership(p_group_id uuid, p_membership_id uuid)
returns void language sql security definer set search_path = '' as $$
    select app_private.review_pending_membership(p_group_id, p_membership_id, false)
$$;

revoke all on function app_private.review_pending_membership(uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.list_pending_memberships(uuid,integer), public.approve_membership(uuid,uuid),
    public.reject_pending_membership(uuid,uuid) from public, anon, authenticated;
grant execute on function public.list_pending_memberships(uuid,integer), public.approve_membership(uuid,uuid),
    public.reject_pending_membership(uuid,uuid) to authenticated;
