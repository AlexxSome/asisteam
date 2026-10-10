-- #107: evidencia propia, append-only, idempotencia y separación de R1.
begin;
\i packages/db/fixtures/domain.sql

select no_plan();

insert into pg_temp.fixture_accounts(id,email,profile_data) values
('10700000-0000-4000-8000-000000000001','107-email@example.test',
 '{"full_name":"Registro explícito","birthdate":"1990-01-01","account_terms":{"accepted":true,"version":"2026-09-21"}}'),
('10700000-0000-4000-8000-000000000002','107-legacy@example.test','{"full_name":"Sin evidencia","birthdate":"1990-01-01"}'),
('10700000-0000-4000-8000-000000000003','107-minor@example.test',
 '{"full_name":"Menor","birthdate":"2015-01-01","account_terms":{"accepted":true,"version":"2026-09-21"}}');
insert into pg_temp.fixture_accounts(id,email,provider_info,profile_data) values
('10700000-0000-4000-8000-000000000004','107-oauth@example.test','{"provider":"google"}',
 '{"full_name":"OAuth","account_terms":{"accepted":true,"version":"2026-09-21"}}');

select is((select count(*) from public.account_consents c join public.users u on u.id=c.user_id
  where u.auth_user_id='10700000-0000-4000-8000-000000000001' and c.channel='EMAIL_SIGNUP' and c.terms_version='2026-09-21' and c.granted_at=now()),
  1::bigint,'email registra versión y timestamp del servidor en la transacción');
select is((select count(*) from public.account_consents c join public.users u on u.id=c.user_id
  where u.auth_user_id in ('10700000-0000-4000-8000-000000000002','10700000-0000-4000-8000-000000000004')),
  0::bigint,'sin evidencia y OAuth no se aceptan automáticamente');
update pg_temp.fixture_accounts set profile_data='{"account_terms":{"accepted":true,"version":"2026-09-21"}}'
  where id='10700000-0000-4000-8000-000000000002';
select is((select count(*) from public.account_consents c join public.users u on u.id=c.user_id
  where u.auth_user_id='10700000-0000-4000-8000-000000000002'),0::bigint,'editar metadata no fabrica aceptación histórica');
select throws_ok($$insert into pg_temp.fixture_accounts(id,email,profile_data) values
 ('10700000-0000-4000-8000-000000000005','107-false@example.test','{"account_terms":{"accepted":false,"version":"2026-09-21"}}')$$,
 'PT400','account_terms_required','rechaza aceptación falsa desde Auth');
select throws_ok($$insert into pg_temp.fixture_accounts(id,email,profile_data) values
 ('10700000-0000-4000-8000-000000000005','107-old@example.test','{"account_terms":{"accepted":true,"version":"1900-01-01"}}')$$,
 'PT400','account_terms_version_changed','rechaza versión desactualizada desde Auth');
select is((select count(*) from pg_temp.fixture_accounts where id='10700000-0000-4000-8000-000000000005'),0::bigint,'fallo revierte también credenciales');
select is((select count(*) from public.users where auth_user_id='10700000-0000-4000-8000-000000000005'),0::bigint,'fallo revierte también perfil');

set local role asisteam_test_anonymous;
select throws_ok($$select * from public.account_consents$$,'42501',null,'anon no lee evidencia');
select throws_ok($$select public.accept_account_terms(true,'2026-09-21')$$,'42501',null,'anon no otorga aceptación');
reset role;
set local role asisteam_api;
select set_config('request.jwt.claims',(('{"sub":"10700000-0000-4000-8000-000000000001","role":"authenticated","auth_provider":"nest"}')::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select is((select count(*) from public.account_consents),1::bigint,'RLS solo muestra evidencia propia');
select is(public.has_account_consent(),true,'consulta propia reconoce la versión vigente');
select throws_ok($$insert into public.account_consents(user_id,terms_version,channel) values(public.auth_user_id(),'2026-09-21','IN_APP')$$,
 '42501',null,'cliente no inserta evidencia directa');
select throws_ok($$update public.account_consents set granted_at=now()$$,'42501',null,'cliente no cambia fecha');
select throws_ok($$delete from public.account_consents$$,'42501',null,'cliente no borra historia');
select throws_ok($$select app_private.record_account_consent(public.auth_user_id(),'2026-09-21','INVITATION')$$,
 '42501',null,'cliente no elige canal ni sujeto vía helper privado');
select throws_ok($$select public.accept_account_terms(false,'2026-09-21')$$,'PT400','account_terms_required','RPC exige true');
select throws_ok($$select public.accept_account_terms(null,'2026-09-21')$$,'PT400','account_terms_required','RPC rechaza NULL');
select throws_ok($$select public.accept_account_terms(true,'1900-01-01')$$,'PT400','account_terms_version_changed','RPC valida versión');
select throws_ok($$select public.accept_account_terms(true,null)$$,'PT400','account_terms_version_changed','RPC rechaza versión NULL');
select is(public.accept_account_terms(true,'2026-09-21'),(select id from public.account_consents),'reintento devuelve misma evidencia');
select is((select channel from public.account_consents),'EMAIL_SIGNUP','reintento conserva canal original');
select is((select granted_at from public.account_consents),now(),'reintento conserva fecha original');
select set_config('request.jwt.claims',(('{"sub":"10700000-0000-4000-8000-000000000004","role":"authenticated","auth_provider":"nest"}')::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select is(public.has_account_consent(),false,'OAuth requiere aceptación explícita');
select is((select count(*) from public.account_consents),0::bigint,'OAuth no ve evidencia ajena');
select lives_ok($$select public.accept_account_terms(true,'2026-09-21')$$,'OAuth acepta autenticado');
select is(public.has_account_consent(),true,'OAuth puede continuar tras aceptar');
select is((select channel from public.account_consents),'IN_APP','canal del onboarding lo elige servidor');
select set_config('request.jwt.claims',(('{}')::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select throws_ok($$select public.accept_account_terms(true,'2026-09-21')$$,'PT401','authentication_required','sin identidad no registra');
reset role;

select throws_ok($$update public.account_consents set terms_version='changed'$$,'PT409','account_consent_immutable','ni el propietario SQL sobrescribe evidencia');
select throws_ok($$delete from public.account_consents$$,'PT409','account_consent_immutable','evidencia append-only');
insert into public.groups(id,name,invite_code,created_by)
select '10700000-0000-4000-8000-000000000100','Club consentimiento','CONS0107',id from public.users
where auth_user_id='10700000-0000-4000-8000-000000000001';
select throws_ok($$insert into public.memberships(user_id,group_id,role,status)
 select id,'10700000-0000-4000-8000-000000000100','ATHLETE','ACTIVE' from public.users
 where auth_user_id='10700000-0000-4000-8000-000000000003'$$,
 '23514',null,'aceptación de cuenta no satisface R1 para un menor');
select is((select count(*) from public.consents c join public.guardianships g on g.id=c.guardianship_id
 join public.users u on u.id=g.athlete_user_id where u.auth_user_id='10700000-0000-4000-8000-000000000003'),
 0::bigint,'no otorga consentimiento de tratamiento, activación ni imagen');

select * from finish();
rollback;
