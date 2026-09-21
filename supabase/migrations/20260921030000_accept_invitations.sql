-- HU-GEN-06 (#18): aceptación de una invitación ya emitida. La emisión y
-- el reenvío por ADMIN pertenecen a sus historias; el token persistido es SHA-256.
create table public.invitations (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict,
    email text,
    role text not null check (role in ('ATHLETE', 'GUARDIAN')),
    token text not null unique check (token ~ '^[0-9a-f]{64}$'),
    invited_user_id uuid references public.users(id) on delete restrict,
    status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','EXPIRED')),
    expires_at timestamptz not null default (now() + interval '7 days'),
    created_by uuid not null references public.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    accepted_at timestamptz,
    terms_version text,
    check (email is not null or invited_user_id is not null),
    check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);
alter table public.invitations enable row level security;
revoke all on public.invitations from public, anon, authenticated;
-- ADMIN consulta estado, nunca el digest utilizable por el backend.
grant select(id, group_id, email, role, invited_user_id, status, expires_at, created_by, created_at, accepted_at)
    on public.invitations to authenticated;
create policy invitations_select_admin on public.invitations for select to authenticated
    using (public.is_group_admin(group_id));

-- GoTrue inserta auth.users ANTES de guardar app_metadata de Admin API.
-- Una prueba aleatoria preparada solo por Edge autoriza ese INSERT concreto.
-- No es suficiente enviar un token de invitación en user_metadata público.
create table app_private.invitation_registrations (
    nonce_hash text primary key check (nonce_hash ~ '^[0-9a-f]{64}$'),
    token_hash text not null references public.invitations(token) on delete cascade,
    email text not null,
    registration jsonb not null,
    expires_at timestamptz not null default now() + interval '2 minutes'
);
revoke all on app_private.invitation_registrations from public, anon, authenticated;
alter table app_private.invitation_registrations enable row level security;

create function public.prepare_invitation_registration(p_token_hash text, p_nonce_hash text, p_email text, p_registration jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
    delete from app_private.invitation_registrations where expires_at <= now();
    insert into app_private.invitation_registrations(nonce_hash, token_hash, email, registration)
    values(p_nonce_hash, p_token_hash, lower(p_email), p_registration);
end $$;
create function public.cancel_invitation_registration(p_nonce_hash text) returns void
language sql security definer set search_path = '' as $$
    delete from app_private.invitation_registrations where nonce_hash = p_nonce_hash
$$;

-- Contador compartido entre instancias Edge, con IP hasheada y retención breve.
create table app_private.invitation_attempts (
    key text primary key check (key ~ '^[0-9a-f]{64}$'),
    attempts timestamptz[] not null,
    updated_at timestamptz not null default now()
);
create index on app_private.invitation_attempts(updated_at);
alter table app_private.invitation_attempts enable row level security;
revoke all on app_private.invitation_attempts from public, anon, authenticated;
create function public.consume_invitation_attempt(p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_attempts timestamptz[];
begin
    if p_key is null or p_key !~ '^[0-9a-f]{64}$' then return false; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_key, 18));
    delete from app_private.invitation_attempts where updated_at < now() - interval '1 day';
    select array(select t from unnest(a.attempts) t where t > now() - interval '1 hour')
      into v_attempts from app_private.invitation_attempts a where key = p_key;
    v_attempts := coalesce(v_attempts, '{}'::timestamptz[]);
    if cardinality(v_attempts) >= 10 then return false; end if;
    insert into app_private.invitation_attempts(key, attempts) values(p_key, array_append(v_attempts, now()))
    on conflict(key) do update set attempts = excluded.attempts, updated_at = now();
    return true;
end $$;

-- Solo Edge puede obtener el destinatario; la respuesta pública es una
-- proyección explícita que no revela email ni existencia de cuenta.
create function public.invitation_context(p_token_hash text) returns jsonb
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
      'email', coalesce(v_inv.email, v_user.email), 'account_status', v_user.account_status);
end $$;

create function app_private.accept_invitation(p_token_hash text, p_auth_user_id uuid, p_registration jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_inv public.invitations%rowtype; v_user public.users%rowtype;
    v_auth_email text; v_birthdate date; v_status text; v_membership public.memberships%rowtype;
    v_new_memberships integer;
begin
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

create function public.accept_invitation(p_token_hash text, p_auth_user_id uuid) returns jsonb
language sql security definer set search_path = '' as $$
    select app_private.accept_invitation(p_token_hash, p_auth_user_id)
$$;

-- Auth administra la contraseña. Su INSERT + trigger forman UNA transacción:
-- cualquier fallo de aceptación revierte también las credenciales nuevas.
-- La autorización efímera solo puede ser preparada por Edge (service_role).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_registration app_private.invitation_registrations%rowtype;
begin
    if new.raw_user_meta_data ? 'invitation_registration_nonce' then
        select * into v_registration from app_private.invitation_registrations
          where nonce_hash = encode(extensions.digest(new.raw_user_meta_data ->> 'invitation_registration_nonce', 'sha256'), 'hex')
          and email = lower(new.email) and expires_at > now() for update;
        if not found then raise exception using errcode = 'P0001', message = 'invitation_not_available'; end if;
        v_result := app_private.accept_invitation(v_registration.token_hash, new.id, v_registration.registration);
        if v_result ? 'error' then raise exception using errcode = 'P0001', message = v_result ->> 'error'; end if;
        delete from app_private.invitation_registrations where nonce_hash = v_registration.nonce_hash;
    else
        insert into public.users(auth_user_id, full_name, email, phone, birthdate, account_status)
        values(new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
          new.email, nullif(trim(new.raw_user_meta_data ->> 'phone'), ''), nullif(new.raw_user_meta_data ->> 'birthdate', '')::date, 'ACTIVE');
    end if;
    return new;
end $$;

revoke all on function app_private.accept_invitation(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.invitation_context(text), public.consume_invitation_attempt(text), public.accept_invitation(text, uuid)
    from public, anon, authenticated;
grant execute on function public.invitation_context(text), public.consume_invitation_attempt(text), public.accept_invitation(text, uuid) to service_role;
revoke all on function public.prepare_invitation_registration(text,text,text,jsonb), public.cancel_invitation_registration(text) from public, anon, authenticated;
grant execute on function public.prepare_invitation_registration(text,text,text,jsonb), public.cancel_invitation_registration(text) to service_role;
