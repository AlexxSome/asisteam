-- #112: minimal, authorized onboarding state; pending members do not gain group access.
create function public.list_membership_onboarding(
  p_group_id uuid default null, p_athlete_user_id uuid default null,
  p_membership_id uuid default null, p_offset integer default 0, p_as_guardian boolean default false
) returns table (
  membership_id uuid, athlete_user_id uuid, group_id uuid, group_name text,
  full_name text, membership_status text, account_status text, is_minor boolean,
  guardian_linked boolean, guardian_ready boolean, requires_managed_consent boolean,
  can_consent boolean, relationship text, capacity_block text, total_count bigint
) language plpgsql stable security definer set search_path = '' as $$
declare v_actor uuid := public.auth_user_id(); v_admin boolean := false;
begin
  if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if p_offset is null or p_offset < 0 then raise sqlstate 'PT400' using message = 'invalid_membership_review'; end if;
  if p_group_id is not null then
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    v_admin := public.is_group_admin(p_group_id) and not coalesce(p_as_guardian, false);
  end if;
  return query
  select m.id, u.id, g.id, g.name, u.full_name, m.status, u.account_status,
    app_private.is_minor(u.birthdate),
    exists(select 1 from public.guardianships gs where gs.athlete_user_id = u.id and gs.status = 'ACTIVE'),
    app_private.has_minor_consent(u.id),
    app_private.is_minor(u.birthdate) and e.membership_id is not null and e.activated_at is null,
    m.status = 'PENDING' and own.id is not null and app_private.is_minor(u.birthdate)
      and exists(select 1 from public.users actor where actor.id = v_actor and actor.account_status = 'ACTIVE')
      and ((e.membership_id is not null and e.activated_at is null and e.guardianship_id = own.id)
        or (e.membership_id is null and not app_private.has_minor_consent(u.id))),
    own.relationship,
    case when v_admin and m.status = 'PENDING' then
      case when (select count(*) from public.memberships active_m where active_m.group_id = g.id
        and active_m.role = 'ATHLETE' and active_m.status = 'ACTIVE') >= app_private.group_athlete_limit(g.id)
        then 'subscription_athlete_limit'
      when (select count(*) from public.memberships active_m where active_m.group_id = g.id and active_m.status = 'ACTIVE')
        + 1 + (select count(*) from public.guardianships gs where gs.athlete_user_id = u.id and gs.status = 'ACTIVE'
          and app_private.is_minor(u.birthdate) and not exists(select 1 from public.memberships gm where gm.group_id = g.id
            and gm.user_id = gs.guardian_user_id and gm.role = 'GUARDIAN' and gm.status = 'ACTIVE'))
        > app_private.group_membership_limit(g.id) then 'group_member_limit'
      else null end
    else null end,
    count(*) over ()
  from public.memberships m join public.users u on u.id = m.user_id
  join public.groups g on g.id = m.group_id
  left join app_private.managed_member_enrollments e on e.membership_id = m.id
  left join public.guardianships own on own.athlete_user_id = u.id and own.guardian_user_id = v_actor
    and own.status = 'ACTIVE' and public.is_guardian_of(u.id)
    and exists(select 1 from public.memberships viewer where viewer.group_id = m.group_id
      and viewer.user_id = v_actor and viewer.role = 'GUARDIAN' and viewer.status = 'ACTIVE')
  where m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')
    and (p_athlete_user_id is null or u.id = p_athlete_user_id)
    and (p_membership_id is null or m.id = p_membership_id)
    and ((p_group_id is null and m.user_id = v_actor and m.status = 'PENDING')
      or (m.group_id = p_group_id and ((v_admin and (m.status = 'PENDING' or p_membership_id is not null)) or (not v_admin and own.id is not null))))
  order by g.name, m.created_at, m.id limit 50 offset p_offset;
end $$;
revoke all on function public.list_membership_onboarding(uuid,uuid,uuid,integer,boolean) from public, anon;
grant execute on function public.list_membership_onboarding(uuid,uuid,uuid,integer,boolean) to authenticated;

-- Managed enrollment retains its existing atomic consent + activation RPC.
-- A code enrollment only records consent; ADMIN approval remains mandatory.
create function public.consent_membership_data(p_membership_id uuid, p_accepted boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.auth_user_id(); v_athlete uuid; v_group uuid;
  v_guardianship uuid; v_status text;
begin
  if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if p_accepted is distinct from true then raise sqlstate 'PT422' using message = 'consent_required'; end if;
  if exists(select 1 from app_private.managed_member_enrollments where membership_id = p_membership_id) then
    perform public.consent_managed_member(p_membership_id, p_accepted);
    return 'ACTIVE';
  end if;
  select m.user_id, m.group_id into v_athlete, v_group from public.memberships m
    where m.id = p_membership_id and m.role = 'ATHLETE' and public.is_member(m.group_id)
      and public.is_guardian_of(m.user_id);
  if v_athlete is null then raise sqlstate 'PT404' using message = 'managed_consent_not_found'; end if;
  perform 1 from public.users where id = v_actor and account_status = 'ACTIVE' for update;
  if not found then raise sqlstate 'PT403' using message = 'active_account_required'; end if;
  perform 1 from public.users where id = v_athlete and app_private.is_minor(birthdate) for update;
  if not found then raise sqlstate 'PT404' using message = 'managed_consent_not_found'; end if;
  perform 1 from public.groups where id = v_group for update;
  perform 1 from public.memberships where group_id = v_group and user_id = v_actor
    and role = 'GUARDIAN' and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT404' using message = 'managed_consent_not_found'; end if;
  select id into v_guardianship from public.guardianships where athlete_user_id = v_athlete
    and guardian_user_id = v_actor and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT404' using message = 'managed_consent_not_found'; end if;
  select status into v_status from public.memberships where id = p_membership_id for update;
  if v_status <> 'PENDING' then raise sqlstate 'PT409' using message = 'managed_member_not_pending'; end if;
  if not exists(select 1 from public.consents where guardianship_id = v_guardianship
    and consent_type = 'DATA_PROCESSING_MINOR' and revoked_at is null and granted_at <= now()) then
    insert into public.consents(guardianship_id,consent_type,terms_version,channel,allows_avatar)
      values(v_guardianship,'DATA_PROCESSING_MINOR','2026-09-21','IN_APP',false);
  end if;
  return 'PENDING';
end $$;
revoke all on function public.consent_membership_data(uuid,boolean) from public, anon;
grant execute on function public.consent_membership_data(uuid,boolean) to authenticated;

-- Preserve the existing group list while allowing a ward-specific deep link.
drop function public.list_managed_activation_requests(uuid,integer);
create function public.list_managed_activation_requests(p_group_id uuid, p_offset integer default 0, p_athlete_user_id uuid default null)
returns table(request_id uuid, membership_id uuid, full_name text, relationship text, status text, total_count bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
    if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    return query select r.id, m.id, u.full_name, g.relationship, r.status, count(*) over()
    from app_private.managed_activation_requests r
    join public.memberships m on m.id = r.membership_id
    join public.users u on u.id = m.user_id
    join public.guardianships g on g.athlete_user_id = u.id
    where m.group_id = p_group_id and (p_athlete_user_id is null or u.id = p_athlete_user_id) and u.account_status = 'MANAGED' and u.email = r.email
      and r.status in ('PENDING','APPROVED') and app_private.is_minor(u.birthdate)
      and g.guardian_user_id = public.auth_user_id() and g.status = 'ACTIVE'
      and (r.status = 'PENDING' or exists(select 1 from public.consents c
        where c.id = r.consent_id and c.guardianship_id = g.id and c.revoked_at is null))
      and exists(select 1 from public.memberships a where a.user_id = r.requested_by
        and a.group_id = p_group_id and a.role = 'ADMIN' and a.status = 'ACTIVE')
    order by r.requested_at, r.id limit 50 offset greatest(coalesce(p_offset,0),0);
end $$;

revoke all on function public.list_managed_activation_requests(uuid,integer,uuid) from public, anon;
grant execute on function public.list_managed_activation_requests(uuid,integer,uuid) to authenticated;
