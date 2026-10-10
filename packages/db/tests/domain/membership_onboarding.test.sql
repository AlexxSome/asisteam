begin;
\i packages/db/fixtures/domain.sql

select no_plan();
create function pg_temp.uid(n integer) returns uuid language sql as $$
 select ('11200000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
create or replace function app_private.chile_today() returns date language sql stable set search_path = '' as $$ select date '2026-10-04' $$;
insert into pg_temp.fixture_accounts(id,email,profile_data)
select pg_temp.uid(n), 'onboarding112-'||n||'@example.test',
 jsonb_build_object('full_name','Persona '||n,'birthdate',case when n=3 then '2012-01-01' else '1990-01-01' end)
from generate_series(1,5) n;
update public.users set id=pg_temp.uid(right(auth_user_id::text,12)::integer+100) where email like 'onboarding112-%@example.test';
insert into public.groups(id,name,invite_code,created_by) values
 (pg_temp.uid(201),'Club visible','ONBD0001',pg_temp.uid(101)),
 (pg_temp.uid(202),'Club ajeno','ONBD0002',pg_temp.uid(101));
insert into app_private.billing_legacy_groups(group_id) values(pg_temp.uid(201)),(pg_temp.uid(202));
insert into public.memberships(id,user_id,group_id,role,status) values
 (pg_temp.uid(301),pg_temp.uid(101),pg_temp.uid(201),'ADMIN','ACTIVE'),
 (pg_temp.uid(302),pg_temp.uid(101),pg_temp.uid(202),'ADMIN','ACTIVE'),
 (pg_temp.uid(303),pg_temp.uid(103),pg_temp.uid(201),'ATHLETE','PENDING'),
 (pg_temp.uid(304),pg_temp.uid(103),pg_temp.uid(202),'ATHLETE','PENDING'),
 (pg_temp.uid(305),pg_temp.uid(102),pg_temp.uid(201),'GUARDIAN','ACTIVE'),
 (pg_temp.uid(306),pg_temp.uid(105),pg_temp.uid(201),'GUARDIAN','ACTIVE');
select ok(not pg_temp.can_execute('asisteam_test_anonymous','public.list_membership_onboarding(uuid,uuid,uuid,integer,boolean)','EXECUTE'),'anon no lee estado');
select ok(not pg_temp.can_execute('asisteam_test_anonymous','public.consent_membership_data(uuid,boolean)','EXECUTE'),'anon no consiente');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid='public.list_membership_onboarding(uuid,uuid,uuid,integer,boolean)'::regprocedure),'search_path fijo');
set local role asisteam_api;
select set_config('request.jwt.claims',(('{"role":"authenticated","auth_provider":"nest"}')::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select throws_ok($$select public.list_membership_onboarding()$$,'PT401','authentication_required','requiere sesión');
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.uid(3),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select is((select count(*) from public.list_membership_onboarding()),2::bigint,'propio PENDING persiste sin parámetros de URL');
select ok((select bool_and(not guardian_linked and not guardian_ready and capacity_block is null and relationship is null) from public.list_membership_onboarding()),'pendiente propio solo recibe estado mínimo');
select is((select count(*) from public.v_my_groups),0::bigint,'pendiente no gana acceso al grupo');
select throws_ok($$select public.list_membership_onboarding(pg_temp.uid(201))$$,'PT404','group_not_found','no abre detalle del grupo por ser pendiente');
select is((select count(*) from public.list_membership_onboarding(p_athlete_user_id=>pg_temp.uid(104))),0::bigint,'no enumera otras personas');
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.uid(4),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select is((select count(*) from public.list_membership_onboarding()),0::bigint,'extraño no ve solicitudes');
select throws_ok($$select public.list_membership_onboarding(pg_temp.uid(201))$$,'PT404','group_not_found','grupo ajeno no visible');
reset role;
insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship) values(pg_temp.uid(401),pg_temp.uid(102),pg_temp.uid(103),'Tutor');
set local role asisteam_api;
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.uid(5),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select is((select count(*) from public.list_membership_onboarding(pg_temp.uid(201))),0::bigint,'otro apoderado del mismo grupo no ve pupilos ajenos');
select throws_ok($$select public.consent_membership_data(pg_temp.uid(303),true)$$,'PT404','managed_consent_not_found','otro apoderado no consiente');
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.uid(1),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select throws_ok($$select public.consent_membership_data(pg_temp.uid(303),true)$$,'PT404','managed_consent_not_found','ADMIN no reemplaza al apoderado');
select is((select count(*) from public.list_membership_onboarding(pg_temp.uid(201),p_as_guardian=>true)),0::bigint,'contexto apoderado no hereda visibilidad ADMIN');
select ok((select guardian_linked and not guardian_ready and not can_consent from public.list_membership_onboarding(pg_temp.uid(201))),'ADMIN distingue vínculo de consentimiento');
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.uid(2),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select is((select count(*) from public.list_membership_onboarding(pg_temp.uid(201),pg_temp.uid(103))),1::bigint,'pupilo y grupo exactos');
select ok((select can_consent and not requires_managed_consent from public.list_membership_onboarding(pg_temp.uid(201),pg_temp.uid(103))),'código solicita consentimiento sin activación implícita');
select ok((select to_jsonb(s)-array['membership_id','athlete_user_id','group_id','group_name','full_name','membership_status','account_status','is_minor','guardian_linked','guardian_ready','requires_managed_consent','can_consent','relationship','capacity_block','total_count']='{}'::jsonb from public.list_membership_onboarding(pg_temp.uid(201)) s),'no proyecta email teléfono fecha nacimiento ni apoderados ajenos');
select throws_ok($$select public.list_membership_onboarding(pg_temp.uid(202),pg_temp.uid(103))$$,'PT404','group_not_found','mismo pupilo en grupo ajeno no visible');
select throws_ok($$select public.consent_membership_data(pg_temp.uid(304),true)$$,'PT404','managed_consent_not_found','no consiente en grupo ajeno');
select throws_ok($$select public.consent_membership_data(pg_temp.uid(303),false)$$,'PT422','consent_required','requiere consentimiento explícito');
select is(public.consent_membership_data(pg_temp.uid(303),true),'PENDING','código queda esperando ADMIN');
select is(public.consent_membership_data(pg_temp.uid(303),true),'PENDING','reintento idempotente');
select ok((select guardian_ready and not can_consent from public.list_membership_onboarding(pg_temp.uid(201))),'consentimiento registrado cambia el siguiente paso');
reset role;
select is((select status from public.memberships where id=pg_temp.uid(303)),'PENDING','no activa desde consentimiento por código');
select is((select count(*) from public.consents where guardianship_id=pg_temp.uid(401)),1::bigint,'no duplica evidencia');
select ok((select consent_type='DATA_PROCESSING_MINOR' and not allows_avatar from public.consents where guardianship_id=pg_temp.uid(401)),'datos separados de imagen y cuenta propia');
set local role asisteam_api;
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.uid(1),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select lives_ok($$select public.approve_membership(pg_temp.uid(201),pg_temp.uid(303))$$,'ADMIN conserva aprobación por código');
select set_config('test.managed112',public.create_managed_member(pg_temp.uid(201),'Menor gestionado','2015-01-01',null,'{"full_name":"Tutor","email":"onboarding112-2@example.test","relationship":"Tutor","authorized":true}')::text,true);
select ok((select requires_managed_consent and not can_consent from public.list_membership_onboarding(pg_temp.uid(201))),'alta gestionada requiere apoderado designado');
reset role;
delete from app_private.billing_legacy_groups where group_id=pg_temp.uid(201);
set local role asisteam_api;
select ok((select capacity_block='subscription_athlete_limit' from public.list_membership_onboarding(pg_temp.uid(201))),'ADMIN conoce bloqueo de capacidad antes de activar');
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.uid(2),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select ok((select bool_and(capacity_block is null) from public.list_membership_onboarding(pg_temp.uid(201))),'no ADMIN no recibe detalle de facturación');
select throws_ok($$select public.consent_membership_data((current_setting('test.managed112')::jsonb->>'membership_id')::uuid,true)$$,'PT422','subscription_athlete_limit','gestionado conserva guard de capacidad y transacción');
reset role;
insert into app_private.billing_legacy_groups(group_id) values(pg_temp.uid(201));
set local role asisteam_api;
select is(public.consent_membership_data((current_setting('test.managed112')::jsonb->>'membership_id')::uuid,true),'ACTIVE','gestionado conserva activación por consentimiento');
reset role;
select ok((select u.account_status='MANAGED' and m.status='ACTIVE' from public.memberships m join public.users u on u.id=m.user_id where m.id=(current_setting('test.managed112')::jsonb->>'membership_id')::uuid),'membresía activa distinta de cuenta propia');
-- La mayoría de edad cierra visibilidad inmediatamente aun antes del job.
create or replace function app_private.chile_today() returns date language sql stable set search_path = '' as $$ select date '2034-01-01' $$;
set local role asisteam_api;
select is((select count(*) from public.list_membership_onboarding(pg_temp.uid(201))),0::bigint,'ex apoderado no ve estado ni historial del adulto');
select throws_ok($$select public.consent_membership_data(pg_temp.uid(304),true)$$,'PT404','managed_consent_not_found','ex apoderado no consiente');
select * from finish();
rollback;
