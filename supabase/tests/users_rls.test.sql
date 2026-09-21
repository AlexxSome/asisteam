-- pgTAP: estructura, trigger de perfil y RLS de public.users (issue #13).
-- Se ejecuta con `pnpm supabase test db` sobre el stack local.
begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- Estructura
select has_table('public', 'users', 'existe public.users');
select col_is_pk('public', 'users', 'id', 'id es la PK');
select has_column('public', 'users', 'auth_user_id', 'existe el desacople auth_user_id');
select has_index('public', 'users', 'uq_users_email', 'email único case-insensitive');
select has_trigger('public', 'users', 'trg_users_updated_at', 'trigger de updated_at');
select has_function('public', 'auth_user_id', 'helper auth_user_id()');
select has_function('public', 'handle_new_user', 'trigger de perfil handle_new_user()');
select ok(
    (select relrowsecurity from pg_class where oid = 'public.users'::regclass),
    'RLS habilitado en public.users'
);
select policies_are(
    'public', 'users',
    array['users_select_own', 'users_update_own'],
    'lectura y edición limitadas al perfil propio'
);

-- Trigger de perfil: registrar en auth.users crea el perfil ACTIVE.
insert into auth.users (id, email, raw_user_meta_data)
values (
    '00000000-0000-4000-8000-00000000000a',
    'martina@example.cl',
    '{"full_name": "Martina Pérez", "birthdate": "1994-03-15"}'::jsonb
);

select is(
    (select full_name from public.users where email = 'martina@example.cl'),
    'Martina Pérez',
    'el trigger copia full_name desde los metadatos del signUp'
);
select is(
    (select account_status from public.users where email = 'martina@example.cl'),
    'ACTIVE',
    'la cuenta nace ACTIVE (criterio 1 de HU-GEN-01)'
);
select is(
    (select birthdate from public.users where email = 'martina@example.cl'),
    date '1994-03-15',
    'el trigger copia birthdate'
);

-- Segundo usuario para probar aislamiento.
insert into auth.users (id, email, raw_user_meta_data)
values (
    '00000000-0000-4000-8000-00000000000b',
    'benjamin@example.cl',
    '{"full_name": "Benjamín Rojas", "birthdate": "1996-08-02"}'::jsonb
);

-- RLS: el usuario A solo ve su propia fila.
set local role authenticated;
select set_config(
    'request.jwt.claims',
    '{"sub": "00000000-0000-4000-8000-00000000000a", "role": "authenticated"}',
    true
);

select results_eq(
    'select auth_user_id from public.users',
    $$values ('00000000-0000-4000-8000-00000000000a'::uuid)$$,
    'authenticated solo ve su propio perfil (V1)'
);

-- anon no tiene privilegios sobre la tabla (deny duro, docs/07 §7.1 A01).
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select throws_ok(
    'select count(*) from public.users',
    '42501',
    'permission denied for table users',
    'anon no tiene privilegios sobre users'
);

reset role;

select * from finish();

rollback;
