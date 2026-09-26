-- HU-DEP-07 (#43): reclamo con credenciales propias y perfil existente.
-- La vista previa pública proyecta solo el propósito del enlace, grupo y rol.
create or replace function public.invitation_context(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_inv public.invitations%rowtype; v_user public.users%rowtype; v_name text;
begin
    select * into v_inv from public.invitations where token = p_token_hash for update;
    if not found then return jsonb_build_object('error', 'invitation_not_available'); end if;
    if v_inv.status = 'PENDING' and v_inv.expires_at <= now() then
        update public.invitations set status = 'EXPIRED' where id = v_inv.id;
        v_inv.status := 'EXPIRED';
    end if;
    if v_inv.status = 'EXPIRED' then return jsonb_build_object('error', 'invitation_expired'); end if;
    if v_inv.status <> 'PENDING' then return jsonb_build_object('error', 'invitation_not_available'); end if;
    select * into v_user from public.users
      where (v_inv.invited_user_id is not null and id = v_inv.invited_user_id)
         or (v_inv.invited_user_id is null and lower(email) = lower(v_inv.email));
    select name into v_name from public.groups where id = v_inv.group_id;
    return jsonb_build_object('group_id', v_inv.group_id, 'group_name', v_name, 'role', v_inv.role,
      'email', coalesce(v_inv.email, v_user.email), 'account_status', v_user.account_status,
      'managed_activation', v_inv.activation_membership_id is not null);
end $$;

-- El control previo permite informar que falta consentimiento sin crear Auth.
-- La aceptación vuelve a verificarlo en el trigger transaccional: la prueba
-- efímera no habilita credenciales si el consentimiento cambia después.
create or replace function public.prepare_invitation_registration(
    p_token_hash text, p_nonce_hash text, p_email text, p_registration jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare v_user public.users%rowtype; v_inv public.invitations%rowtype;
begin
    -- Auth bloquea primero su prueba efímera; limpiarlas antes de bloquear
    -- usuarios evita invertir ese orden durante una expiración concurrente.
    delete from app_private.invitation_registrations where expires_at <= now();
    if p_registration -> 'managed_claim' = 'true'::jsonb then
        -- Mismo orden de bloqueo que emisión y aceptación de activaciones.
        select * into v_user from public.users where id = (
          select invited_user_id from public.invitations where token = p_token_hash
            and activation_membership_id is not null
        ) for update;
        select * into v_inv from public.invitations where token = p_token_hash for update;
        if v_user.id is null or v_inv.id is null or v_inv.status <> 'PENDING'
          or v_inv.expires_at <= now() or v_user.account_status <> 'MANAGED'
          or v_user.auth_user_id is not null
          or lower(v_inv.email) is distinct from lower(p_email)
          or lower(v_user.email) is distinct from lower(p_email) then
            raise sqlstate 'PT404' using message = 'invitation_not_available';
        end if;
        if coalesce(p_registration ->> 'terms_version', '') <> '2026-09-21' then
            raise sqlstate 'PT400' using message = 'invalid_registration';
        end if;
        if app_private.is_minor(v_user.birthdate) and (
          not app_private.has_minor_consent(v_user.id)
          or not app_private.has_account_activation_consent(v_user.id)
        ) then raise sqlstate 'PT422' using message = 'guardian_consent_required'; end if;
    end if;
    insert into app_private.invitation_registrations(nonce_hash, token_hash, email, registration)
    values(p_nonce_hash, p_token_hash, lower(p_email), p_registration);
end $$;

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

    -- HU-DEP-07: resolver el perfil vigente en la misma transacción de Auth.
    -- El titular únicamente elige sus credenciales y acepta las condiciones.
    if p_registration -> 'managed_claim' = 'true'::jsonb then
        if v_inv.activation_membership_id is null or v_user.account_status <> 'MANAGED' then
            return jsonb_build_object('error', 'invitation_not_available');
        end if;
        p_registration := jsonb_build_object('full_name', v_user.full_name,
          'birthdate', v_user.birthdate, 'phone', v_user.phone,
          'terms_version', p_registration ->> 'terms_version');
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

-- CREATE OR REPLACE conserva los permisos service_role existentes.
