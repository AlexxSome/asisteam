-- HU-GEN-08 (#59): contrato de perfiles para OAuth. El linking remoto de
-- Google/Apple se valida con cuentas de prueba según docs/07 §2.1.
begin;
\i packages/db/fixtures/domain.sql

select no_plan();

insert into pg_temp.fixture_accounts(id, email, provider_info, profile_data) values
('59000000-0000-4000-8000-000000000001', 'social-google@example.test', '{"provider":"google","providers":["google"]}', '{"full_name":"Persona Google","email_verified":true}'),
('59000000-0000-4000-8000-000000000002', 'social-apple@privaterelay.appleid.com', '{"provider":"apple","providers":["apple"]}', '{"email_verified":true}'),
('59000000-0000-4000-8000-000000000003', 'social-existing@example.test', '{"provider":"email","providers":["email"]}', '{"full_name":"Nombre conservado","birthdate":"1990-01-01"}');

select is((select account_status from public.users where auth_user_id='59000000-0000-4000-8000-000000000001'), 'ACTIVE', 'Google nuevo crea perfil ACTIVE');
select is((select full_name from public.users where auth_user_id='59000000-0000-4000-8000-000000000001'), 'Persona Google', 'conserva nombre del proveedor');
select is((select birthdate from public.users where auth_user_id='59000000-0000-4000-8000-000000000001'), null::date, 'no inventa fecha de nacimiento');
select is((select account_status from public.users where auth_user_id='59000000-0000-4000-8000-000000000002'), 'ACTIVE', 'Apple sin nombre crea perfil ACTIVE');
select is((select full_name from public.users where auth_user_id='59000000-0000-4000-8000-000000000002'), 'social-apple', 'nombre provisional usa el fallback existente');

-- Cuando Auth vincula identidades al mismo UUID, el perfil y su historia
-- se mantienen. No se pretende simular aquí la verificación del proveedor.
insert into pg_temp.fixture_social_identities(provider_id, user_id, identity_data, provider) values
('google-sub-59', '59000000-0000-4000-8000-000000000003', '{"email":"social-existing@example.test","email_verified":true,"sub":"google-sub-59"}', 'google'),
('apple-sub-59', '59000000-0000-4000-8000-000000000003', '{"email":"social-existing@example.test","email_verified":true,"sub":"apple-sub-59"}', 'apple');
select is((select count(*) from public.users where lower(email)='social-existing@example.test'), 1::bigint, 'agregar identidades no crea otro perfil');
select is((select full_name from public.users where auth_user_id='59000000-0000-4000-8000-000000000003'), 'Nombre conservado', 'login social no sobrescribe nombre existente');
select is((select birthdate from public.users where auth_user_id='59000000-0000-4000-8000-000000000003'), date '1990-01-01', 'login social conserva birthdate existente');
select throws_ok($$insert into pg_temp.fixture_accounts(id,email) values('59000000-0000-4000-8000-000000000004','SOCIAL-EXISTING@example.test')$$,
  '23505', 'duplicate key value violates unique constraint "uq_users_email"', 'la unicidad impide duplicar perfiles por mayúsculas');

insert into public.users(full_name,email,account_status) values
('Gestionada','social-managed@example.test','MANAGED'), ('Invitada','social-invited@example.test','INVITED');
select throws_ok($$insert into pg_temp.fixture_accounts(id,email,provider_info) values('59000000-0000-4000-8000-000000000005','social-managed@example.test','{"provider":"google"}')$$,
  '23505', 'duplicate key value violates unique constraint "uq_users_email"', 'OAuth no reclama MANAGED por coincidencia de email');
select throws_ok($$insert into pg_temp.fixture_accounts(id,email,provider_info) values('59000000-0000-4000-8000-000000000006','social-invited@example.test','{"provider":"apple"}')$$,
  '23505', 'duplicate key value violates unique constraint "uq_users_email"', 'OAuth no salta aceptación de invitaciones');
select is((select count(*) from pg_temp.fixture_accounts where id in ('59000000-0000-4000-8000-000000000005','59000000-0000-4000-8000-000000000006')), 0::bigint, 'colisión revierte también credenciales Auth');

set local role asisteam_api;
select set_config('request.jwt.claims',(('{"sub":"59000000-0000-4000-8000-000000000001","role":"authenticated","auth_provider":"nest"}')::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select is((select count(*) from public.users), 1::bigint, 'sesión social solo lee perfil propio por RLS');
select is((select count(*) from public.v_my_groups), 0::bigint, 'cuenta social nueva llega sin membresías al onboarding');
select public.create_group('Club social', 'Fútbol');
select throws_ok($$select public.join_group_as_athlete((select id from public.v_my_groups limit 1))$$,
  'PT422', 'athlete_birthdate_required', 'OAuth no evita birthdate obligatorio para ATHLETE');
reset role;

select * from finish();
rollback;
