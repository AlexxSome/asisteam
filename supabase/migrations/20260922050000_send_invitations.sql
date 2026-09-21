-- HU-ADM-04 (#23): emisión dirigida por Edge. Cada reenvío conserva la fila
-- anterior como EXPIRED y crea otra, evitando mover las pruebas de registro
-- ligadas al token antiguo. No se crean credenciales ni membresías al emitir.
create table app_private.invitation_send_limits (
    group_id uuid primary key references public.groups(id) on delete cascade,
    day date not null,
    attempts integer not null check (attempts between 1 and 50)
);
alter table app_private.invitation_send_limits enable row level security;
revoke all on app_private.invitation_send_limits from public, anon, authenticated;

create index idx_invitations_group_created on public.invitations(group_id, created_at desc, id desc);

create function public.issue_invitation(
    p_auth_user_id uuid, p_group_id uuid, p_token_hash text,
    p_email text default null, p_role text default null, p_invitation_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_actor uuid;
    v_invitation public.invitations%rowtype;
    v_email text;
    v_role text;
    v_user_id uuid;
    v_group_name text;
    v_day date := app_private.chile_today();
    v_attempts integer;
begin
    -- El actor procede del JWT validado por Auth en Edge, no del payload web.
    select id into v_actor from public.users
      where auth_user_id = p_auth_user_id and account_status = 'ACTIVE';
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not exists(select 1 from public.memberships where group_id = p_group_id
      and user_id = v_actor and status = 'ACTIVE') then
        raise sqlstate 'PT404' using message = 'group_not_found';
    end if;
    perform 1 from public.memberships where group_id = p_group_id and user_id = v_actor
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
        raise sqlstate 'PT400' using message = 'invalid_invitation';
    end if;

    -- Compartido entre instancias Edge; no toma el lock de groups que usa
    -- aceptación después de bloquear la invitación. Incluye los reenvíos.
    perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 23));
    if p_invitation_id is not null then
        if p_email is not null or p_role is not null then
            raise sqlstate 'PT400' using message = 'invalid_invitation';
        end if;
        select * into v_invitation from public.invitations
          where id = p_invitation_id and group_id = p_group_id for update;
        if not found or v_invitation.status <> 'PENDING' then
            raise sqlstate 'PT404' using message = 'invitation_not_available';
        end if;
        v_email := v_invitation.email;
        v_role := v_invitation.role;
        v_user_id := v_invitation.invited_user_id;
        if v_email is null then
            select email into v_email from public.users where id = v_user_id;
        end if;
    else
        v_email := p_email;
        v_role := p_role;
    end if;
    v_email := lower(btrim(v_email));
    if v_email is null or length(v_email) > 254
      or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or v_role is null or v_role not in ('ATHLETE', 'GUARDIAN') then
        raise sqlstate 'PT400' using message = 'invalid_invitation';
    end if;

    select case when day = v_day then attempts else 0 end into v_attempts
      from app_private.invitation_send_limits where group_id = p_group_id;
    if coalesce(v_attempts, 0) >= 50 then
        raise sqlstate 'PT429' using message = 'invitation_send_rate_limited';
    end if;

    if v_user_id is null then
        -- UNIQUE(lower(email)) arbitra dos grupos invitando simultáneamente.
        insert into public.users(full_name, email, account_status)
        values('Persona invitada', v_email, 'INVITED')
        on conflict (lower(email)) where email is not null do nothing
        returning id into v_user_id;
        if v_user_id is null then
            select id into v_user_id from public.users where lower(email) = v_email;
        end if;
    end if;
    if p_invitation_id is not null then
        update public.invitations set status = 'EXPIRED' where id = p_invitation_id;
    end if;
    insert into public.invitations(group_id, email, role, token, invited_user_id, created_by, created_at, expires_at)
    values(p_group_id, v_email, v_role, p_token_hash, v_user_id, v_actor, now(), now() + interval '7 days')
    returning * into v_invitation;
    insert into app_private.invitation_send_limits(group_id, day, attempts)
    values(p_group_id, v_day, coalesce(v_attempts, 0) + 1)
    on conflict(group_id) do update set day = excluded.day, attempts = excluded.attempts;
    select name into v_group_name from public.groups where id = p_group_id;
    -- Respuesta solo para Edge. Nunca exponer email/ID/estado de la cuenta.
    return jsonb_build_object('id', v_invitation.id, 'status', v_invitation.status,
      'expires_at', v_invitation.expires_at, 'email', v_email, 'role', v_role, 'group_name', v_group_name);
end $$;

revoke all on function public.issue_invitation(uuid,uuid,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.issue_invitation(uuid,uuid,text,text,text,uuid) to service_role;
