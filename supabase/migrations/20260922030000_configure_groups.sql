-- HU-ADM-02 (#21): los miembros pueden identificar su grupo, pero solo un
-- ADMIN vigente puede editar los cuatro campos públicos o rotar el código.
-- La proyección de detalles sigue siendo el único acceso a los demás campos.
grant select(id) on public.groups to authenticated;
grant update(name, sport, description, logo_url) on public.groups to authenticated;

create policy groups_select_member on public.groups for select to authenticated
using (public.is_member(id));
create policy groups_update_admin on public.groups for update to authenticated
using (public.is_member(id)) with check (public.is_group_admin(id));

alter table public.groups add constraint groups_sport_format
check (sport is null or length(trim(sport)) between 2 and 50);
alter table public.groups add constraint groups_logo_url_format
check (logo_url is null or logo_url = '' or logo_url ~ '^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$');

create function public.rotate_invite_code(p_group_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
    v_old_code text;
    v_new_code text;
begin
    if public.auth_user_id() is null then
        raise sqlstate 'PT401' using message = 'authentication_required';
    end if;
    if not public.is_member(p_group_id) then
        raise sqlstate 'PT404' using message = 'group_not_found';
    end if;
    -- La membresía queda bloqueada hasta completar la rotación; una
    -- revocación concurrente no puede intercalarse después de este control.
    perform 1 from public.memberships
    where user_id = public.auth_user_id() and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then
        raise sqlstate 'PT403' using message = 'admin_required';
    end if;
    select invite_code into v_old_code from public.groups where id = p_group_id for update;
    if v_old_code is null then
        raise sqlstate 'PT404' using message = 'group_not_found';
    end if;
    for attempt in 1..10 loop
        v_new_code := translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/', 'AZ');
        if v_new_code = v_old_code then continue; end if;
        begin
            update public.groups set invite_code = v_new_code where id = p_group_id;
            return v_new_code;
        exception when unique_violation then
            -- Un código emitido a otro grupo durante la rotación se reintenta.
        end;
    end loop;
    raise sqlstate 'PT409' using message = 'invite_code_unavailable';
end $$;

revoke all on function public.rotate_invite_code(uuid) from public, anon;
grant execute on function public.rotate_invite_code(uuid) to authenticated;
