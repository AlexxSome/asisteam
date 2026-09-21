-- HU-ADM-06 (#25): registro directo del ADMIN, sin credenciales ni consentimiento implícito.
create function public.create_guardianship(
    p_group_id uuid, p_athlete_user_id uuid, p_full_name text, p_email text, p_relationship text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_actor uuid := public.auth_user_id();
    v_guardian uuid;
    v_guardianship uuid;
    v_birthdate date;
    v_email text := lower(trim(p_email));
    v_groups uuid[];
    v_group uuid;
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not exists(select 1 from public.users where id = v_actor and account_status = 'ACTIVE') then
        raise sqlstate 'PT403' using message = 'active_account_required';
    end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_full_name is null or length(trim(p_full_name)) not between 2 and 120
      or p_relationship is null or length(trim(p_relationship)) not between 2 and 40
      or v_email is null or length(v_email) > 254
      or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
        raise sqlstate 'PT400' using message = 'invalid_guardianship';
    end if;
    if not exists(select 1 from public.memberships where group_id = p_group_id
      and user_id = p_athlete_user_id and role = 'ATHLETE' and status in ('ACTIVE','PENDING')) then
        raise sqlstate 'PT404' using message = 'athlete_not_found';
    end if;
    -- Se resuelve por email sin ofrecer búsquedas globales ni sobrescribir perfiles.
    insert into public.users(full_name,email,account_status)
    values(trim(p_full_name),v_email,'INVITED')
    on conflict (lower(email)) where email is not null do nothing;
    select id into v_guardian from public.users where lower(email) = v_email for update;
    if v_guardian = p_athlete_user_id then raise sqlstate 'PT422' using message = 'invalid_guardian'; end if;
    -- Orden compartido con aceptación/consentimiento: personas antes de grupos.
    select birthdate into v_birthdate from public.users where id = p_athlete_user_id for update;
    if not app_private.is_minor(v_birthdate) then
        raise sqlstate 'PT422' using message = 'guardian_only_for_minor';
    end if;
    if exists(select 1 from public.guardianships where guardian_user_id = v_guardian and athlete_user_id = p_athlete_user_id) then
        raise sqlstate 'PT409' using message = 'guardianship_already_exists';
    end if;
    -- El vínculo es global: incluye el grupo solicitado y los grupos activos del pupilo (CB-02).
    select array_agg(id order by id) into v_groups from (
        select p_group_id as id union select group_id from public.memberships
        where user_id = p_athlete_user_id and role = 'ATHLETE' and status = 'ACTIVE'
    ) target_groups;
    perform 1 from public.groups where id = any(v_groups) order by id for update;
    perform 1 from public.memberships where user_id = v_actor and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    perform 1 from public.memberships where user_id = p_athlete_user_id and group_id = p_group_id
      and role = 'ATHLETE' and status in ('ACTIVE','PENDING') for share;
    if not found then raise sqlstate 'PT404' using message = 'athlete_not_found'; end if;
    if (select count(*) from (
        select group_id from public.memberships where user_id = v_guardian and status in ('ACTIVE','PENDING')
        union select unnest(v_groups)
    ) guardian_groups) > 30 then
        raise sqlstate 'PT422' using message = 'guardian_group_limit';
    end if;
    foreach v_group in array v_groups loop
        if not exists(select 1 from public.memberships where user_id = v_guardian
          and group_id = v_group and role = 'GUARDIAN' and status = 'ACTIVE')
          and (select count(*) from public.memberships where group_id = v_group and status = 'ACTIVE') >= 500 then
            raise sqlstate 'PT422' using message = 'group_member_limit';
        end if;
        insert into public.memberships(user_id,group_id,role,status,joined_at)
        values(v_guardian,v_group,'GUARDIAN','ACTIVE',now())
        on conflict(user_id,group_id,role) do update set status = 'ACTIVE',
          joined_at = coalesce(public.memberships.joined_at,excluded.joined_at)
        where public.memberships.status <> 'ACTIVE';
    end loop;
    begin
        insert into public.guardianships(guardian_user_id,athlete_user_id,relationship)
        values(v_guardian,p_athlete_user_id,trim(p_relationship)) returning id into v_guardianship;
    exception when unique_violation then
        raise sqlstate 'PT409' using message = 'guardianship_already_exists';
    end;
    return v_guardianship;
end $$;

-- Selector ADMIN acotado al grupo, con proyección mínima y páginas de 50.
create function public.list_guardianship_athletes(p_group_id uuid, p_search text default '', p_offset integer default 0)
returns table(user_id uuid, full_name text, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
    if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if length(coalesce(p_search,'')) > 120 or coalesce(p_offset,0) < 0 then
        raise sqlstate 'PT400' using message = 'invalid_guardianship';
    end if;
    return query select u.id, u.full_name, count(*) over ()
    from public.memberships m join public.users u on u.id = m.user_id
    where m.group_id = p_group_id and m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')
      and app_private.is_minor(u.birthdate)
      and strpos(lower(u.full_name),lower(trim(coalesce(p_search,'')))) > 0
    order by u.full_name,u.id limit 50 offset coalesce(p_offset,0);
end $$;

revoke all on function public.create_guardianship(uuid,uuid,text,text,text), public.list_guardianship_athletes(uuid,text,integer) from public, anon;
grant execute on function public.create_guardianship(uuid,uuid,text,text,text), public.list_guardianship_athletes(uuid,text,integer) to authenticated;
