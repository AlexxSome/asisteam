-- #107: aceptación de la cuenta separada de los consentimientos del apoderado.
-- Sin backfill: ni una cuenta existente ni un login OAuth prueban aceptación.
create table public.account_consents (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.users(id) on delete restrict,
    terms_version text not null check (length(trim(terms_version)) > 0),
    granted_at timestamptz not null default now(),
    channel text not null check (channel in ('EMAIL_SIGNUP', 'INVITATION', 'IN_APP')),
    unique(user_id, terms_version)
);
alter table public.account_consents enable row level security;
revoke all on public.account_consents from public, anon, authenticated;
grant select on public.account_consents to authenticated;
create policy account_consents_select_own on public.account_consents for select to authenticated
    using (user_id = (select public.auth_user_id()));

create function app_private.protect_account_consent() returns trigger
language plpgsql set search_path = '' as $$
begin
    raise sqlstate 'PT409' using message = 'account_consent_immutable';
end $$;
create trigger trg_account_consent_history before update or delete on public.account_consents
    for each row execute function app_private.protect_account_consent();

-- La versión corresponde al snapshot público /legal/2026-09-21. Cualquier
-- cambio requiere nuevo snapshot + nueva migración, sin sobrescribir evidencia.
create function app_private.account_terms_version() returns text
language sql immutable set search_path = '' as $$ select '2026-09-21'::text $$;

create function app_private.record_account_consent(p_user_id uuid, p_terms_version text, p_channel text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
    if p_terms_version is distinct from app_private.account_terms_version() then
        raise sqlstate 'PT400' using message = 'account_terms_version_changed';
    end if;
    if p_channel is null or p_channel not in ('EMAIL_SIGNUP','INVITATION','IN_APP') then
        raise sqlstate 'PT400' using message = 'invalid_consent_channel';
    end if;
    perform 1 from public.users where id = p_user_id and account_status = 'ACTIVE' and auth_user_id is not null for update;
    if not found then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    insert into public.account_consents(user_id, terms_version, channel)
        values(p_user_id, p_terms_version, p_channel)
        on conflict(user_id, terms_version) do nothing;
    select id into v_id from public.account_consents where user_id = p_user_id and terms_version = p_terms_version;
    return v_id;
end $$;

create function public.accept_account_terms(p_accepted boolean, p_terms_version text) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if p_accepted is distinct from true then raise sqlstate 'PT400' using message = 'account_terms_required'; end if;
    return app_private.record_account_consent(public.auth_user_id(), p_terms_version, 'IN_APP');
end $$;

create function public.has_account_consent() returns boolean
language sql stable security definer set search_path = '' as $$
    select exists(select 1 from public.account_consents c join public.users u on u.id = c.user_id
        where u.auth_user_id = auth.uid() and u.account_status = 'ACTIVE'
          and c.terms_version = app_private.account_terms_version());
$$;
revoke all on function app_private.protect_account_consent(), app_private.account_terms_version(),
    app_private.record_account_consent(uuid,text,text) from public, anon, authenticated;
revoke all on function public.accept_account_terms(boolean,text), public.has_account_consent() from public, anon;
grant execute on function public.accept_account_terms(boolean,text), public.has_account_consent() to authenticated;

-- Perfil, aceptación de invitación y evidencia se confirman en la misma
-- transacción de Auth. La prueba efímera procede solo de Edge/service_role.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_registration app_private.invitation_registrations%rowtype; v_user_id uuid;
begin
    if new.raw_user_meta_data ? 'invitation_registration_nonce' then
        select * into v_registration from app_private.invitation_registrations
          where nonce_hash = encode(extensions.digest(new.raw_user_meta_data ->> 'invitation_registration_nonce', 'sha256'), 'hex')
          and email = lower(new.email) and expires_at > now() for update;
        if not found then raise exception using errcode = 'P0001', message = 'invitation_not_available'; end if;
        v_result := app_private.accept_invitation(v_registration.token_hash, new.id, v_registration.registration);
        if v_result ? 'error' then raise exception using errcode = 'P0001', message = v_result ->> 'error'; end if;
        select id into v_user_id from public.users where auth_user_id = new.id;
        perform app_private.record_account_consent(v_user_id, v_registration.registration ->> 'terms_version', 'INVITATION');
        delete from app_private.invitation_registrations where nonce_hash = v_registration.nonce_hash;
    else
        insert into public.users(auth_user_id, full_name, email, phone, birthdate, account_status)
        values(new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
          new.email, nullif(trim(new.raw_user_meta_data ->> 'phone'), ''), nullif(new.raw_user_meta_data ->> 'birthdate', '')::date, 'ACTIVE')
        returning id into v_user_id;
        -- Un perfil OAuth/provisionado puede existir antes del onboarding.
        -- Metadata del proveedor y cambios posteriores de metadata no son aceptación.
        if coalesce(new.raw_app_meta_data ->> 'provider', 'email') = 'email'
          and new.raw_user_meta_data ? 'account_terms' then
            if (new.raw_user_meta_data #> '{account_terms,accepted}') is distinct from 'true'::jsonb then
                raise sqlstate 'PT400' using message = 'account_terms_required';
            end if;
            perform app_private.record_account_consent(v_user_id, new.raw_user_meta_data #>> '{account_terms,version}', 'EMAIL_SIGNUP');
        end if;
    end if;
    return new;
end $$;
