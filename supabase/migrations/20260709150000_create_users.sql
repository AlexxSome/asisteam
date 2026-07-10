-- M1 · Autenticación y registro — perfil public.users (HU-GEN-01, issue #13)
-- Fuentes: docs/04-modelo-de-datos.md §2.1 (columnas, constraints y unique),
-- docs/06-arquitectura-y-stack.md (desacople public.users ↔ auth.users) y
-- docs/07-api-y-backend.md §2.1/§6 (signUp + trigger de perfil, helper).
--
-- Nota de arquitectura: a diferencia del DDL genérico de docs/04, aquí NO
-- existe columna password_hash — las credenciales viven exclusivamente en
-- auth.users (Supabase Auth). El vínculo es auth_user_id, FK opcional:
-- NULL en cuentas MANAGED/INVITED que aún no tienen credenciales.

create extension if not exists pgcrypto;

create table public.users (
    id             uuid primary key default gen_random_uuid(),
    auth_user_id   uuid unique references auth.users (id) on delete set null,
    full_name      text not null,
    email          text,
    phone          text,
    birthdate      date,
    avatar_url     text,
    account_status text not null default 'ACTIVE'
                   check (account_status in ('ACTIVE', 'INVITED', 'MANAGED')),
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    constraint users_email_required_unless_managed
        check (account_status = 'MANAGED' or email is not null)
);

comment on table public.users is
    'Perfiles de personas (ADMIN/ATHLETE/GUARDIAN por membresía). Desacoplada de auth.users para soportar cuentas MANAGED sin credenciales.';
comment on column public.users.auth_user_id is
    'FK opcional a auth.users: NULL mientras la cuenta no tiene credenciales (MANAGED/INVITED).';

-- Email único case-insensitive; múltiples NULL permitidos (cuentas MANAGED).
create unique index uq_users_email on public.users (lower(email)) where email is not null;

-- Trigger genérico de updated_at (docs/04-modelo-de-datos.md §1).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

create trigger trg_users_updated_at
    before update on public.users
    for each row execute function public.set_updated_at();

-- Helper de RLS: id de perfil del usuario autenticado (docs/07 §6.1).
create or replace function public.auth_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select id from public.users where auth_user_id = auth.uid();
$$;

-- Trigger de perfil (docs/07 §2.1): al registrarse vía Supabase Auth se crea
-- la fila de perfil con account_status ACTIVE, copiando los metadatos del
-- signUp. Si el email ya existe en public.users (única lower(email)), el
-- registro completo falla — los flujos de claim INVITED/MANAGED (HU-GEN-06,
-- HU-ADM-16) vincularán perfiles existentes vía Edge Function, no aquí.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.users (auth_user_id, full_name, email, phone, birthdate, account_status)
    values (
        new.id,
        coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
        new.email,
        nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
        nullif(new.raw_user_meta_data ->> 'birthdate', '')::date,
        'ACTIVE'
    );
    return new;
end;
$$;

create trigger trg_on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- RLS deny-by-default (docs/07 §7.1): sin política = sin acceso.
alter table public.users enable row level security;

-- V1: cada usuario lee su propio perfil completo. Los perfiles de terceros
-- se servirán solo por vistas de columnas explícitas (v_member_profiles y
-- afines, docs/07 §6.4) — prohibido SELECT * de users hacia no-ADMIN.
create policy users_select_own
    on public.users
    for select
    to authenticated
    using (auth_user_id = (select auth.uid()));

-- Privilegios PostgREST: el GRANT abre la tabla y RLS filtra las filas.
-- anon queda sin privilegios (deny duro: docs/07 §7.1 A01 — la anon key
-- solo permite auth y RPC públicas). Los writes de clientes siguen
-- bloqueados para authenticated: no hay política de INSERT/UPDATE/DELETE.
grant select on public.users to authenticated;

-- La edición del perfil propio (PATCH /users/me) llega con HU-GEN-04 (#16).
