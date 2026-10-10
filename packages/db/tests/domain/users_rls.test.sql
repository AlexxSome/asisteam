-- pgTAP: estructura, trigger de perfil y RLS de public.users (issue #13).
-- Se ejecuta con `pnpm --filter @asisteam/db test` sobre el stack local.
begin;
\i packages/db/fixtures/domain.sql



select plan(14);

-- Estructura
select has_table('public', 'users', 'existe public.users');
select col_is_pk('public', 'users', 'id', 'id es la PK');
select has_column('public', 'users', 'auth_user_id', 'existe el desacople auth_user_id');
select has_index('public', 'users', 'uq_users_email', 'email único case-insensitive');
select has_trigger('public', 'users', 'trg_users_updated_at', 'trigger de updated_at');
select has_function('public', 'auth_user_id', 'helper auth_user_id()');
select has_function('app_private', 'auth_operation', 'frontera nativa crea sujeto y perfil');
select ok(
    (select relrowsecurity from pg_class where oid = 'public.users'::regclass),
    'RLS habilitado en public.users'
);
select policies_are(
    'public', 'users',
    array['users_select_own', 'users_update_own'],
    'lectura y edición limitadas al perfil propio'
);

-- Trigger de perfil: registrar en pg_temp.fixture_accounts crea el perfil ACTIVE.
insert into pg_temp.fixture_accounts (id, email, profile_data)
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
insert into pg_temp.fixture_accounts (id, email, profile_data)
values (
    '00000000-0000-4000-8000-00000000000b',
    'benjamin@example.cl',
    '{"full_name": "Benjamín Rojas", "birthdate": "1996-08-02"}'::jsonb
);

-- RLS: el usuario A solo ve su propia fila.
set local role asisteam_api;
select set_config('request.jwt.claims',(('{"sub": "00000000-0000-4000-8000-00000000000a", "role": "authenticated"}')::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);

select results_eq(
    'select auth_user_id from public.users',
    $$values ('00000000-0000-4000-8000-00000000000a'::uuid)$$,
    'authenticated solo ve su propio perfil (V1)'
);

-- anon no tiene privilegios sobre la tabla (deny duro, docs/07 §7.1 A01).
set local role asisteam_test_anonymous;
select set_config('request.jwt.claims',(('{"role": "anon"}')::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);

select throws_ok(
    'select count(*) from public.users',
    '42501',
    null,
    'anon no tiene privilegios sobre users'
);

reset role;

select * from finish();

rollback;
