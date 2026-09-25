-- HU-ADM-15 (#34): gestión ADMIN sin borrar personas ni historial.
create function public.list_group_members(p_group_id uuid, p_role text default null,
    p_status text default null, p_offset integer default 0)
returns table(membership_id uuid, full_name text, email text, phone text, birthdate date,
    account_status text, role text, status text, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
    if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_offset is null or p_offset < 0 or p_offset > 5000000
      or (p_role is not null and p_role not in ('ADMIN','ATHLETE','GUARDIAN'))
      or (p_status is not null and p_status not in ('ACTIVE','INACTIVE','PENDING','INVITED')) then
        raise sqlstate 'PT400' using message = 'invalid_member_filters';
    end if;
    return query select m.id, u.full_name, u.email, u.phone, u.birthdate,
      u.account_status, m.role, m.status, count(*) over ()
    from public.memberships m join public.users u on u.id = m.user_id
    where m.group_id = p_group_id and (p_role is null or m.role = p_role)
      and (p_status is null or m.status = p_status)
    order by u.full_name, m.id limit 50 offset p_offset;
end $$;

create function public.update_managed_member(p_group_id uuid, p_membership_id uuid,
    p_full_name text, p_birthdate date, p_email text default null, p_phone text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
    v_actor uuid := public.auth_user_id(); v_user uuid; v_profile public.users%rowtype;
    v_email text := nullif(lower(trim(p_email)), ''); v_pending boolean := false;
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    select user_id into v_user from public.memberships where id = p_membership_id and group_id = p_group_id;
    if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;
    select * into v_profile from public.users where id = v_user for update;
    perform 1 from public.groups where id = p_group_id for update;
    perform 1 from public.memberships where user_id = v_actor and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if v_profile.account_status <> 'MANAGED' then raise sqlstate 'PT403' using message = 'managed_profile_required'; end if;
    if p_full_name is null or length(trim(p_full_name)) not between 2 and 120
      or p_birthdate is null or not isfinite(p_birthdate) or p_birthdate >= app_private.chile_today()
      or extract(year from age(app_private.chile_today(), p_birthdate)) > 110
      or (v_email is not null and (length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
      or (p_phone is not null and p_phone !~ '^\+[1-9][0-9]{7,14}$') then
        raise sqlstate 'PT400' using message = 'invalid_managed_member';
    end if;
    -- La corrección de mayoría de edad conserva la protección multi-grupo de
    -- HU-GEN-04: registra solicitud para el flujo existente de aprobaciones.
    v_pending := app_private.is_minor(v_profile.birthdate) and not app_private.is_minor(p_birthdate)
      and exists(select 1 from public.memberships where user_id = v_user and role = 'ATHLETE' and status in ('ACTIVE','PENDING'));
    if v_pending then
        update public.birthdate_change_requests set status = 'CANCELLED', resolved_at = now()
          where user_id = v_user and status = 'PENDING';
        insert into public.birthdate_change_requests(user_id, old_birthdate, requested_birthdate)
          values(v_user, v_profile.birthdate, p_birthdate);
    end if;
    begin
        update public.users set full_name = trim(p_full_name), email = v_email, phone = p_phone,
          birthdate = case when v_pending then birthdate else p_birthdate end where id = v_user;
    exception when unique_violation then
        raise sqlstate 'PT409' using message = 'managed_email_unavailable';
    when check_violation then
        if sqlerrm = 'minor_requires_guardian_consent' then
            raise sqlstate 'PT422' using message = 'minor_requires_guardian_consent';
        end if;
        raise;
    end;
    return case when v_pending then 'BIRTHDATE_PENDING' else 'UPDATED' end;
end $$;

create function app_private.change_membership_status(p_group_id uuid, p_membership_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_actor uuid := public.auth_user_id(); v_user uuid; v_member public.memberships%rowtype;
    v_birthdate date; v_new_memberships integer := 1;
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    select user_id into v_user from public.memberships where id = p_membership_id and group_id = p_group_id;
    if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;
    -- Personas antes de grupo, como altas y aprobaciones: serializa límites,
    -- consentimiento y sincronización GUARDIAN durante la reactivación.
    perform 1 from public.users u where u.id = v_user or exists(
      select 1 from public.guardianships g where g.status = 'ACTIVE'
        and ((g.athlete_user_id = v_user and g.guardian_user_id = u.id)
          or (g.guardian_user_id = v_user and g.athlete_user_id = u.id))) order by u.id for update;
    select birthdate into v_birthdate from public.users where id = v_user;
    if p_active and app_private.is_minor(v_birthdate) then
        perform 1 from public.users u where exists(select 1 from public.guardianships g
          where g.athlete_user_id = v_user and g.guardian_user_id = u.id and g.status = 'ACTIVE')
          order by u.id for update;
    end if;
    perform 1 from public.groups where id = p_group_id for update;
    perform 1 from public.memberships where user_id = v_actor and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    select * into v_member from public.memberships where id = p_membership_id and group_id = p_group_id for update;
    if v_member.status <> (case when p_active then 'INACTIVE' else 'ACTIVE' end) then
        raise sqlstate 'PT409' using message = 'membership_status_changed';
    end if;
    if not p_active then
        if v_member.role = 'ADMIN' and (select count(*) from public.memberships
          where group_id = p_group_id and role = 'ADMIN' and status = 'ACTIVE') <= 1 then
            raise sqlstate 'PT409' using message = 'LAST_ADMIN';
        end if;
        -- V2: no se corta el acceso a pupilos vigentes. La baja del pupilo
        -- conserva sus vínculos y libera después la baja del apoderado.
        if v_member.role = 'GUARDIAN' and exists(select 1 from public.guardianships g
          join public.users u on u.id = g.athlete_user_id join public.memberships m on m.user_id = u.id
          where g.guardian_user_id = v_user and g.status = 'ACTIVE' and app_private.is_minor(u.birthdate)
            and m.group_id = p_group_id and m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')) then
            raise sqlstate 'PT422' using message = 'guardian_has_active_wards';
        end if;
        update public.memberships set status = 'INACTIVE' where id = p_membership_id;
        return;
    end if;
    if not exists(select 1 from public.memberships where user_id = v_user and group_id = p_group_id and status in ('ACTIVE','PENDING'))
      and (select count(distinct group_id) from public.memberships where user_id = v_user and status in ('ACTIVE','PENDING')) >= 30 then
        raise sqlstate 'PT422' using message = 'user_group_limit';
    end if;
    if v_member.role = 'GUARDIAN' and not exists(select 1 from public.guardianships g
      join public.users u on u.id = g.athlete_user_id join public.memberships m on m.user_id = u.id
      where g.guardian_user_id = v_user and g.status = 'ACTIVE' and app_private.is_minor(u.birthdate)
        and m.group_id = p_group_id and m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')) then
        raise sqlstate 'PT422' using message = 'guardian_requires_active_ward';
    end if;
    if v_member.role = 'ATHLETE' then
        if v_birthdate is null then raise sqlstate 'PT422' using message = 'athlete_birthdate_required'; end if;
        if app_private.is_minor(v_birthdate) then
            if not app_private.has_minor_consent(v_user) then
                raise sqlstate 'PT422' using message = 'minor_requires_guardian_consent';
            end if;
            if exists(select 1 from app_private.managed_member_enrollments
              where membership_id = p_membership_id and activated_at is null) then
                raise sqlstate 'PT422' using message = 'managed_consent_required';
            end if;
            if exists(select 1 from public.guardianships g where g.athlete_user_id = v_user and g.status = 'ACTIVE'
              and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
                and m.group_id = p_group_id and m.status in ('ACTIVE','PENDING'))
              and (select count(distinct m.group_id) from public.memberships m where m.user_id = g.guardian_user_id
                and m.status in ('ACTIVE','PENDING')) >= 30) then
                raise sqlstate 'PT422' using message = 'guardian_group_limit';
            end if;
            v_new_memberships := v_new_memberships + (select count(*) from public.guardianships g
              where g.athlete_user_id = v_user and g.status = 'ACTIVE'
                and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
                  and m.group_id = p_group_id and m.role = 'GUARDIAN' and m.status = 'ACTIVE'));
        end if;
    end if;
    if (select count(*) from public.memberships where group_id = p_group_id and status = 'ACTIVE') + v_new_memberships > 500 then
        raise sqlstate 'PT422' using message = 'group_member_limit';
    end if;
    -- Conserva la fecha original para que los reportes sigan incluyendo todo
    -- su historial. Una incorporación nunca activada inicia su fecha hoy.
    update public.memberships set status = 'ACTIVE', joined_at = coalesce(joined_at, now()) where id = p_membership_id;
end $$;

create function public.deactivate_membership(p_group_id uuid, p_membership_id uuid)
returns void language sql security definer set search_path = '' as $$
    select app_private.change_membership_status(p_group_id, p_membership_id, false)
$$;
create function public.reactivate_membership(p_group_id uuid, p_membership_id uuid)
returns void language sql security definer set search_path = '' as $$
    select app_private.change_membership_status(p_group_id, p_membership_id, true)
$$;
revoke all on function app_private.change_membership_status(uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.list_group_members(uuid,text,text,integer),
    public.update_managed_member(uuid,uuid,text,date,text,text),
    public.deactivate_membership(uuid,uuid), public.reactivate_membership(uuid,uuid) from public, anon, authenticated;
grant execute on function public.list_group_members(uuid,text,text,integer),
    public.update_managed_member(uuid,uuid,text,date,text,text),
    public.deactivate_membership(uuid,uuid), public.reactivate_membership(uuid,uuid) to authenticated;
