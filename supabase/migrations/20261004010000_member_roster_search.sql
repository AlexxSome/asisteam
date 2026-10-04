-- #111: búsqueda global ADMIN antes de paginar; cada rol conserva su membership.
drop function public.list_group_members(uuid,text,text,integer);
create function public.list_group_members(p_group_id uuid, p_role text default null,
    p_status text default null, p_offset integer default 0, p_search text default null)
returns table(membership_id uuid, full_name text, email text, phone text, birthdate date,
    account_status text, role text, status text, total_count bigint,
    user_id uuid, person_roles jsonb, is_last_admin boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
    if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_offset is null or p_offset < 0 or p_offset > 5000000
      or (p_role is not null and p_role not in ('ADMIN','ATHLETE','GUARDIAN','COACH'))
      or (p_status is not null and p_status not in ('ACTIVE','INACTIVE','PENDING','INVITED'))
      or length(trim(p_search)) > 120 then
        raise sqlstate 'PT400' using message = 'invalid_member_filters';
    end if;
    return query select m.id, u.full_name, u.email, u.phone, u.birthdate,
      u.account_status, m.role, m.status, count(*) over (), u.id,
      (select jsonb_agg(jsonb_build_object('role', other.role, 'status', other.status) order by other.role)
       from public.memberships other where other.user_id = m.user_id and other.group_id = p_group_id),
      m.role = 'ADMIN' and m.status = 'ACTIVE' and not exists (
        select 1 from public.memberships admin_member where admin_member.group_id = p_group_id
          and admin_member.role = 'ADMIN' and admin_member.status = 'ACTIVE' and admin_member.id <> m.id
      )
    from public.memberships m join public.users u on u.id = m.user_id
    where m.group_id = p_group_id and (p_role is null or m.role = p_role)
      and (p_status is null or m.status = p_status)
      -- position treats %, _ and backslash literally; users are searching names.
      and (nullif(trim(p_search), '') is null or position(lower(trim(p_search)) in lower(u.full_name)) > 0)
    order by u.full_name, u.id, m.role, m.id limit 50 offset p_offset;
end $$;
revoke all on function public.list_group_members(uuid,text,text,integer,text) from public, anon, authenticated;
grant execute on function public.list_group_members(uuid,text,text,integer,text) to authenticated;
