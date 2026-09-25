-- HU-ADM-16 (#35): claim de cuenta, separado del alta/reactivación de membresías.
alter table public.invitations add column activation_membership_id uuid
    references public.memberships(id) on delete restrict;
-- Los enlaces pendientes emitidos antes de esta migración también conservan
-- la membresía existente cuando su destinatario reclama la cuenta.
update public.invitations i set activation_membership_id = m.id
from public.memberships m join public.users u on u.id = m.user_id
where i.invited_user_id = u.id and i.group_id = m.group_id and i.role = 'ATHLETE'
  and m.role = 'ATHLETE' and u.account_status = 'MANAGED' and i.status = 'PENDING';

-- Evidencia de solicitud y decisión; solo RPC con proyección mínima.
create table app_private.managed_activation_requests (
    id uuid primary key default gen_random_uuid(),
    membership_id uuid not null references public.memberships(id) on delete restrict,
    requested_by uuid not null references public.users(id) on delete restrict,
    email text not null,
    status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','CANCELLED')),
    consent_id uuid references public.consents(id) on delete restrict,
    requested_at timestamptz not null default now(),
    resolved_at timestamptz
);
create unique index on app_private.managed_activation_requests(membership_id) where status = 'PENDING';
alter table app_private.managed_activation_requests enable row level security;
revoke all on app_private.managed_activation_requests from public, anon, authenticated;

create function app_private.has_account_activation_consent(p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
    select exists(select 1 from public.guardianships g join public.consents c on c.guardianship_id = g.id
      where g.athlete_user_id = p_user_id and g.status = 'ACTIVE'
        and c.consent_type = 'ACCOUNT_ACTIVATION_MINOR' and c.terms_version = '2026-09-21'
        and c.revoked_at is null and c.granted_at <= now())
$$;
revoke all on function app_private.has_account_activation_consent(uuid) from public, anon, authenticated;

create function public.request_managed_activation(p_group_id uuid, p_membership_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_user public.users%rowtype; v_user_id uuid; v_actor uuid := public.auth_user_id();
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    select user_id into v_user_id from public.memberships
      where id = p_membership_id and group_id = p_group_id and role = 'ATHLETE';
    if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;
    select * into v_user from public.users where id = v_user_id for update;
    perform 1 from public.groups where id = p_group_id for update;
    perform 1 from public.memberships where group_id = p_group_id and user_id = v_actor
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if v_user.account_status <> 'MANAGED' or v_user.auth_user_id is not null then
        raise sqlstate 'PT409' using message = 'managed_account_required';
    end if;
    if v_user.email is null then raise sqlstate 'PT422' using message = 'managed_email_required'; end if;
    if not app_private.is_minor(v_user.birthdate) then return 'READY'; end if;
    if not app_private.has_minor_consent(v_user.id) then
        raise sqlstate 'PT422' using message = 'minor_requires_guardian_consent';
    end if;
    if app_private.has_account_activation_consent(v_user.id) then return 'READY'; end if;
    update app_private.managed_activation_requests set status = 'CANCELLED', resolved_at = now()
      where membership_id = p_membership_id and status = 'PENDING' and email <> v_user.email;
    insert into app_private.managed_activation_requests(membership_id,requested_by,email)
    values(p_membership_id,v_actor,v_user.email)
    on conflict(membership_id) where status = 'PENDING' do nothing;
    return 'CONSENT_PENDING';
end $$;

create function public.list_managed_activation_requests(p_group_id uuid, p_offset integer default 0)
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
    where m.group_id = p_group_id and u.account_status = 'MANAGED' and u.email = r.email
      and r.status in ('PENDING','APPROVED') and app_private.is_minor(u.birthdate)
      and g.guardian_user_id = public.auth_user_id() and g.status = 'ACTIVE'
      and (r.status = 'PENDING' or exists(select 1 from public.consents c
        where c.id = r.consent_id and c.guardianship_id = g.id and c.revoked_at is null))
      and exists(select 1 from public.memberships a where a.user_id = r.requested_by
        and a.group_id = p_group_id and a.role = 'ADMIN' and a.status = 'ACTIVE')
    order by r.requested_at, r.id limit 50 offset greatest(coalesce(p_offset,0),0);
end $$;

create function public.review_managed_activation(p_request_id uuid, p_accepted boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
    v_actor uuid := public.auth_user_id(); v_request app_private.managed_activation_requests%rowtype;
    v_user public.users%rowtype; v_user_id uuid; v_group uuid; v_guardianship uuid; v_consent uuid;
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if p_accepted is null then raise sqlstate 'PT400' using message = 'invalid_activation_request'; end if;
    select m.user_id, m.group_id into v_user_id, v_group
      from app_private.managed_activation_requests r join public.memberships m on m.id = r.membership_id
      where r.id = p_request_id and public.is_member(m.group_id) and public.is_guardian_of(m.user_id);
    if not found then raise sqlstate 'PT404' using message = 'activation_request_not_found'; end if;
    select * into v_user from public.users where id = v_user_id for update;
    perform 1 from public.groups where id = v_group for update;
    select * into v_request from app_private.managed_activation_requests where id = p_request_id for update;
    select id into v_guardianship from public.guardianships where athlete_user_id = v_user_id
      and guardian_user_id = v_actor and status = 'ACTIVE' for share;
    if not found or not public.is_member(v_group) or not app_private.is_minor(v_user.birthdate)
      or not exists(select 1 from public.users where id = v_actor and account_status = 'ACTIVE') then
        raise sqlstate 'PT404' using message = 'activation_request_not_found';
    end if;
    if v_request.status not in ('PENDING','APPROVED') or v_request.email is distinct from v_user.email
      or v_user.account_status <> 'MANAGED' or not exists(select 1 from public.memberships
        where user_id = v_request.requested_by and group_id = v_group and role = 'ADMIN' and status = 'ACTIVE') then
        raise sqlstate 'PT409' using message = 'activation_request_changed';
    end if;
    if v_request.status = 'APPROVED' then
        if not p_accepted or not exists(select 1 from public.consents where id = v_request.consent_id
          and guardianship_id = v_guardianship and revoked_at is null) then
            raise sqlstate 'PT409' using message = 'activation_request_changed';
        end if;
    elsif p_accepted then
        if not app_private.has_minor_consent(v_user_id) then
            raise sqlstate 'PT422' using message = 'minor_requires_guardian_consent';
        end if;
        insert into public.consents(guardianship_id,consent_type,terms_version,channel)
        values(v_guardianship,'ACCOUNT_ACTIVATION_MINOR','2026-09-21','IN_APP') returning id into v_consent;
        update app_private.managed_activation_requests set status = 'APPROVED', consent_id = v_consent, resolved_at = now()
          where id = p_request_id;
    else
        update app_private.managed_activation_requests set status = 'REJECTED', resolved_at = now() where id = p_request_id;
    end if;
    return jsonb_build_object('group_id',v_group,'membership_id',v_request.membership_id);
end $$;

revoke all on function public.request_managed_activation(uuid,uuid),
    public.list_managed_activation_requests(uuid,integer), public.review_managed_activation(uuid,boolean) from public, anon;
grant execute on function public.request_managed_activation(uuid,uuid),
    public.list_managed_activation_requests(uuid,integer), public.review_managed_activation(uuid,boolean) to authenticated;

create or replace function public.issue_invitation(
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
    v_profile public.users%rowtype;
    v_activation_membership uuid;
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
        -- Las activaciones bloquean primero la persona y luego el token,
        -- igual que aceptación; así reenvío y claim no se interbloquean.
        perform 1 from public.users where id = (select invited_user_id from public.invitations
          where id = p_invitation_id and group_id = p_group_id and activation_membership_id is not null) for update;
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
    select * into v_profile from public.users where id = v_user_id for update;
    if v_profile.account_status = 'MANAGED' then
        select id into v_activation_membership from public.memberships
          where user_id = v_user_id and group_id = p_group_id and role = 'ATHLETE';
        if v_activation_membership is null or v_role <> 'ATHLETE' then
            raise sqlstate 'PT404' using message = 'membership_not_found';
        end if;
        if v_profile.email is null then raise sqlstate 'PT422' using message = 'managed_email_required'; end if;
        if v_email is distinct from lower(v_profile.email) then
            raise sqlstate 'PT409' using message = 'activation_request_changed';
        end if;
        if app_private.is_minor(v_profile.birthdate) and (not app_private.has_minor_consent(v_user_id)
          or not app_private.has_account_activation_consent(v_user_id)) then
            raise sqlstate 'PT422' using message = 'guardian_consent_required';
        end if;
        update public.invitations set status = 'EXPIRED'
          where invited_user_id = v_user_id and activation_membership_id is not null and status = 'PENDING';
    elsif p_invitation_id is not null and v_invitation.activation_membership_id is not null then
        raise sqlstate 'PT409' using message = 'managed_account_required';
    end if;
    if p_invitation_id is not null then
        update public.invitations set status = 'EXPIRED' where id = p_invitation_id;
    end if;
    insert into public.invitations(group_id, email, role, token, invited_user_id, created_by, created_at, expires_at, activation_membership_id)
    values(p_group_id, v_email, v_role, p_token_hash, v_user_id, v_actor, now(), now() + interval '7 days', v_activation_membership)
    returning * into v_invitation;
    insert into app_private.invitation_send_limits(group_id, day, attempts)
    values(p_group_id, v_day, coalesce(v_attempts, 0) + 1)
    on conflict(group_id) do update set day = excluded.day, attempts = excluded.attempts;
    select name into v_group_name from public.groups where id = p_group_id;
    -- Respuesta solo para Edge. Nunca exponer email/ID/estado de la cuenta.
    return jsonb_build_object('id', v_invitation.id, 'status', v_invitation.status,
      'expires_at', v_invitation.expires_at, 'email', v_email, 'role', v_role, 'group_name', v_group_name);
end $$;


-- Edge valida el JWT. Un apoderado únicamente despacha la invitación ya
-- solicitada por un ADMIN vigente y cuyo consentimiento acaba de registrar.
create function public.issue_managed_activation(p_auth_user_id uuid, p_group_id uuid,
    p_membership_id uuid, p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_issuer_auth uuid; v_user public.users%rowtype; v_user_id uuid;
begin
    select id into v_actor from public.users where auth_user_id = p_auth_user_id and account_status = 'ACTIVE';
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not exists(select 1 from public.memberships where group_id = p_group_id and user_id = v_actor and status = 'ACTIVE') then
        raise sqlstate 'PT404' using message = 'group_not_found';
    end if;
    select user_id into v_user_id from public.memberships where id = p_membership_id and group_id = p_group_id and role = 'ATHLETE';
    if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 23));
    select * into v_user from public.users where id = v_user_id for update;
    if exists(select 1 from public.memberships where group_id = p_group_id and user_id = v_actor and role = 'ADMIN' and status = 'ACTIVE') then
        v_issuer_auth := p_auth_user_id;
    else
        select issuer.auth_user_id into v_issuer_auth from app_private.managed_activation_requests r
        join public.consents c on c.id = r.consent_id
        join public.guardianships g on g.id = c.guardianship_id
        join public.users issuer on issuer.id = r.requested_by and issuer.account_status = 'ACTIVE'
        where r.membership_id = p_membership_id and r.status = 'APPROVED' and r.email = v_user.email
          and g.guardian_user_id = v_actor and g.athlete_user_id = v_user_id and g.status = 'ACTIVE'
          and app_private.is_minor(v_user.birthdate) and c.revoked_at is null
          and c.consent_type = 'ACCOUNT_ACTIVATION_MINOR' and c.terms_version = '2026-09-21'
          and exists(select 1 from public.memberships a where a.user_id = r.requested_by
            and a.group_id = p_group_id and a.role = 'ADMIN' and a.status = 'ACTIVE')
        order by r.resolved_at desc limit 1;
        if v_issuer_auth is null then raise sqlstate 'PT403' using message = 'activation_sender_required'; end if;
    end if;
    if v_user.account_status <> 'MANAGED' or v_user.auth_user_id is not null then
        raise sqlstate 'PT409' using message = 'managed_account_required';
    end if;
    if v_user.email is null then raise sqlstate 'PT422' using message = 'managed_email_required'; end if;
    return public.issue_invitation(v_issuer_auth,p_group_id,p_token_hash,v_user.email,'ATHLETE');
end $$;
revoke all on function public.issue_managed_activation(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.issue_managed_activation(uuid,uuid,uuid,text) to service_role;

create or replace function app_private.accept_invitation(p_token_hash text, p_auth_user_id uuid, p_registration jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_inv public.invitations%rowtype; v_user public.users%rowtype;
    v_auth_email text; v_birthdate date; v_status text; v_membership public.memberships%rowtype;
    v_new_memberships integer;
begin
    perform 1 from public.users where id = (select invited_user_id from public.invitations
      where token = p_token_hash and activation_membership_id is not null) for update;
    select * into v_inv from public.invitations where token = p_token_hash for update;
    if not found then return jsonb_build_object('error', 'invitation_not_available'); end if;
    if v_inv.status = 'PENDING' and v_inv.expires_at <= now() then
        update public.invitations set status = 'EXPIRED' where id = v_inv.id;
        return jsonb_build_object('error', 'invitation_expired');
    end if;
    if v_inv.status = 'EXPIRED' then return jsonb_build_object('error', 'invitation_expired'); end if;
    if v_inv.status <> 'PENDING' then return jsonb_build_object('error', 'invitation_not_available'); end if;
    select email into v_auth_email from auth.users where id = p_auth_user_id;
    select * into v_user from public.users
      where (v_inv.invited_user_id is not null and id = v_inv.invited_user_id)
         or (v_inv.invited_user_id is null and lower(email) = lower(v_inv.email)) for update;
    if v_user.id is null or v_auth_email is null
      or lower(v_auth_email) is distinct from lower(coalesce(v_inv.email, v_user.email))
      or (v_user.email is not null and lower(v_user.email) <> lower(v_auth_email)) then
        return jsonb_build_object('error', 'invitation_not_available');
    end if;

    if p_registration is null then
        if v_user.auth_user_id is distinct from p_auth_user_id or v_user.account_status <> 'ACTIVE' then
            return jsonb_build_object('error', 'invitation_not_available');
        end if;
        v_birthdate := v_user.birthdate;
    else
        if v_user.auth_user_id is not null or v_user.account_status not in ('INVITED','MANAGED') then
            return jsonb_build_object('error', 'invitation_not_available');
        end if;
        v_birthdate := (p_registration ->> 'birthdate')::date;
        if v_birthdate is null or v_birthdate >= app_private.chile_today()
          or extract(year from age(app_private.chile_today(), v_birthdate)) > 110
          or length(trim(p_registration ->> 'full_name')) not between 2 and 120
          or coalesce(p_registration ->> 'terms_version', '') <> '2026-09-21' then
            return jsonb_build_object('error', 'invalid_registration');
        end if;
        -- Una fecha precargada por ADMIN no se puede cambiar para eludir R1.
        if v_user.birthdate is not null and v_user.birthdate <> v_birthdate then
            return jsonb_build_object('error', 'birthdate_confirmation_required');
        end if;
        if app_private.is_minor(v_birthdate) and (not app_private.has_minor_consent(v_user.id)
          or (v_user.account_status = 'MANAGED' and not exists (
            select 1 from public.guardianships g join public.consents c on c.guardianship_id = g.id
            where g.athlete_user_id = v_user.id and g.status = 'ACTIVE'
              and c.consent_type = 'ACCOUNT_ACTIVATION_MINOR' and c.revoked_at is null and c.granted_at <= now()
          ))) then return jsonb_build_object('error', 'guardian_consent_required'); end if;
    end if;
    if v_inv.role = 'ATHLETE' and v_birthdate is null then
        return jsonb_build_object('error', 'athlete_birthdate_required');
    end if;
    if v_inv.activation_membership_id is not null then
        if p_registration is null or v_user.account_status <> 'MANAGED' then
            return jsonb_build_object('error','invitation_not_available');
        end if;
        if app_private.is_minor(v_birthdate) and not app_private.has_account_activation_consent(v_user.id) then
            return jsonb_build_object('error','guardian_consent_required');
        end if;
        select * into v_membership from public.memberships where id = v_inv.activation_membership_id
          and user_id = v_user.id and group_id = v_inv.group_id and role = 'ATHLETE';
        if not found then return jsonb_build_object('error','invitation_not_available'); end if;
        -- CB-06: actualizar solo la cuenta; ninguna membresía/vínculo/asistencia
        -- se inserta, reactiva ni modifica (incluido joined_at y updated_at).
        update public.users set auth_user_id = p_auth_user_id, account_status = 'ACTIVE', email = v_auth_email,
          full_name = trim(p_registration ->> 'full_name'), phone = nullif(trim(p_registration ->> 'phone'),'')
          where id = v_user.id;
        update public.invitations set status = 'ACCEPTED', accepted_at = now(),
          terms_version = p_registration ->> 'terms_version' where id = v_inv.id;
        return jsonb_build_object('group_id',v_inv.group_id,'membership_status',v_membership.status);
    end if;
    v_status := case when v_inv.role = 'ATHLETE' and app_private.is_minor(v_birthdate)
      and not app_private.has_minor_consent(v_user.id) then 'PENDING' else 'ACTIVE' end;
    perform 1 from public.groups where id = v_inv.group_id for update;
    select * into v_membership from public.memberships
      where user_id = v_user.id and group_id = v_inv.group_id and role = v_inv.role;
    v_new_memberships := case when coalesce(v_membership.status, '') <> 'ACTIVE' and v_status = 'ACTIVE' then 1 else 0 end;
    if v_inv.role = 'ATHLETE' and v_status = 'ACTIVE' and app_private.is_minor(v_birthdate) then
        -- El trigger canónico incorpora también a los apoderados del menor.
        v_new_memberships := v_new_memberships + (select count(*) from public.guardianships g
          where g.athlete_user_id = v_user.id and g.status = 'ACTIVE'
            and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
              and m.group_id = v_inv.group_id and m.role = 'GUARDIAN' and m.status = 'ACTIVE'));
    end if;
    if (select count(*) from public.memberships where group_id = v_inv.group_id and status = 'ACTIVE') + v_new_memberships > 500 then
        return jsonb_build_object('error', 'group_member_limit');
    end if;
    if not exists(select 1 from public.memberships where user_id = v_user.id and group_id = v_inv.group_id and status in ('ACTIVE','PENDING'))
      and (select count(distinct group_id) from public.memberships where user_id = v_user.id and status in ('ACTIVE','PENDING')) >= 30 then
        return jsonb_build_object('error', 'user_group_limit');
    end if;
    if p_registration is not null then
        update public.users set auth_user_id = p_auth_user_id, account_status = 'ACTIVE', email = v_auth_email,
          full_name = trim(p_registration ->> 'full_name'), birthdate = v_birthdate,
          phone = nullif(trim(p_registration ->> 'phone'), '') where id = v_user.id;
    end if;
    insert into public.memberships(user_id, group_id, role, status, joined_at)
      values(v_user.id, v_inv.group_id, v_inv.role, v_status, case when v_status = 'ACTIVE' then now() end)
    on conflict(user_id, group_id, role) do update set status = excluded.status,
      joined_at = coalesce(public.memberships.joined_at, excluded.joined_at);
    update public.invitations set status = 'ACCEPTED', accepted_at = now(), invited_user_id = v_user.id,
      terms_version = p_registration ->> 'terms_version' where id = v_inv.id;
    return jsonb_build_object('group_id', v_inv.group_id, 'membership_status', v_status);
end $$;


-- Resultado tras el INSERT atómico de Auth: permite responder el estado real
-- conservado, incluso si la membresía quedó INACTIVE mientras se usaba el link.
create function public.invitation_registration_result(p_token_hash text, p_auth_user_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
    select jsonb_build_object('group_id',i.group_id,'membership_status',m.status)
    from public.invitations i join public.users u on u.id = i.invited_user_id
    join public.memberships m on m.user_id = u.id and m.group_id = i.group_id and m.role = i.role
    where i.token = p_token_hash and i.status = 'ACCEPTED' and u.auth_user_id = p_auth_user_id
$$;
revoke all on function public.invitation_registration_result(text,uuid) from public, anon, authenticated;
grant execute on function public.invitation_registration_result(text,uuid) to service_role;
