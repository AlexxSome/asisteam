begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, email, raw_user_meta_data)
select ('27000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'activities-' || n || '@example.test',
       jsonb_build_object('full_name', 'Persona ' || n, 'birthdate',
         case when n = 5 then (app_private.chile_today() - interval '15 years')::date::text else '1990-01-01' end)
from generate_series(1,8) n;
-- Garantiza que la RPC no confunda la identidad Auth con el perfil de dominio.
update public.users set id = ('27000000-0000-4000-8000-' || lpad((right(auth_user_id::text,12)::int + 100)::text,12,'0'))::uuid
where email like 'activities-%@example.test';
insert into public.groups(id, name, invite_code, created_by)
select ('27000000-0000-4000-8000-' || lpad((n+200)::text,12,'0'))::uuid,
       'Equipo actividades ' || n, 'ACT0000' || n, '27000000-0000-4000-8000-000000000101'
from generate_series(1,3) n;
insert into public.guardianships(id, guardian_user_id, athlete_user_id, relationship)
values('27000000-0000-4000-8000-000000000401', '27000000-0000-4000-8000-000000000104', '27000000-0000-4000-8000-000000000105', 'Madre');
insert into public.consents(guardianship_id, consent_type, terms_version)
values('27000000-0000-4000-8000-000000000401', 'DATA_PROCESSING_MINOR', 'v1');
insert into public.memberships(user_id, group_id, role, status) values
('27000000-0000-4000-8000-000000000101','27000000-0000-4000-8000-000000000201','ADMIN','ACTIVE'),
('27000000-0000-4000-8000-000000000102','27000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE'),
('27000000-0000-4000-8000-000000000105','27000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE'),
('27000000-0000-4000-8000-000000000106','27000000-0000-4000-8000-000000000201','GUARDIAN','ACTIVE'),
('27000000-0000-4000-8000-000000000107','27000000-0000-4000-8000-000000000201','ATHLETE','PENDING'),
('27000000-0000-4000-8000-000000000108','27000000-0000-4000-8000-000000000201','ADMIN','INACTIVE'),
('27000000-0000-4000-8000-000000000101','27000000-0000-4000-8000-000000000203','ATHLETE','ACTIVE');
insert into public.activity_types(id, group_id, name, is_active) values
('27000000-0000-4000-8000-000000000301','27000000-0000-4000-8000-000000000201','Amistoso',true),
('27000000-0000-4000-8000-000000000302','27000000-0000-4000-8000-000000000201','Desactivado',false),
('27000000-0000-4000-8000-000000000303','27000000-0000-4000-8000-000000000202','Privado',true);
insert into public.activities(id, group_id, activity_type_id, title, starts_at, ends_at, created_by) values
('27000000-0000-4000-8000-000000000501','27000000-0000-4000-8000-000000000201','b2c3d4e5-0001-4b3c-8d4e-111111111111','Entrenamiento','2026-07-07T22:30Z','2026-07-08T00:00Z','27000000-0000-4000-8000-000000000101'),
('27000000-0000-4000-8000-000000000502','27000000-0000-4000-8000-000000000202','b2c3d4e5-0003-4b3c-8d4e-333333333333','Actividad ajena','2026-07-07T22:30Z','2026-07-08T00:00Z','27000000-0000-4000-8000-000000000101');

select ok((select relrowsecurity from pg_class where oid='public.activities'::regclass),'activities tiene RLS');
select ok((select relrowsecurity from pg_class where oid='public.activity_types'::regclass),'activity_types tiene RLS');
select is((select count(*) from public.activity_types where group_id is null),4::bigint,'exactamente cuatro tipos de sistema');
select throws_ok($$update public.activity_types set is_active=false where group_id is null$$,'23514','system_activity_type_immutable','no se desactivan tipos de sistema');
select throws_ok($$delete from public.activity_types where name='MEETING'$$,'23514','system_activity_type_immutable','no se eliminan tipos de sistema');
select throws_ok($$insert into public.activity_types(name) values('OTRO')$$,'23514','system_activity_type_immutable','no se crean tipos de sistema adicionales');
select throws_ok($$insert into public.activity_types(group_id,name) values('27000000-0000-4000-8000-000000000201','amistoso')$$,'23505',null,'nombres personalizados únicos sin distinguir mayúsculas');
select throws_ok($$update public.activities set activity_type_id='27000000-0000-4000-8000-000000000303' where id='27000000-0000-4000-8000-000000000501'$$,'23514','invalid_activity_type','trigger impide tipo de otro grupo');
select throws_ok($$update public.activities set ends_at=starts_at where id='27000000-0000-4000-8000-000000000501'$$,'23514',null,'constraint impide fin igual al inicio');
select throws_ok($$update public.activities set ends_at=starts_at+interval '25 hours' where id='27000000-0000-4000-8000-000000000501'$$,'23514',null,'constraint limita duración a 24 horas');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"27000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from public.v_activity_types where is_active),5::bigint,'selector ADMIN: 4 de sistema y personalizado activo del grupo');
select is((select count(*) from public.v_group_activities),1::bigint,'ADMIN ve solo actividades de sus grupos');
select is((select starts_at at time zone 'UTC' from public.v_group_activities),timestamp '2026-07-07 22:30','inicio persistido en UTC');
select is((select starts_at at time zone 'America/Santiago' from public.v_group_activities),timestamp '2026-07-07 18:30','hora chilena original se conserva');
select lives_ok($$select public.create_activity('27000000-0000-4000-8000-000000000201','27000000-0000-4000-8000-000000000301','  Creada por ADMIN  ','2026-07-08T22:30Z','2026-07-09T00:00Z','Detalle','Cancha 2')$$,'ADMIN crea actividad puntual con tipo propio');
select is((select title from public.v_group_activities where activity_type_name='Amistoso'),'Creada por ADMIN','RPC normaliza título');
select is((select location from public.v_group_activities where activity_type_name='Amistoso'),'Cancha 2','lugar queda disponible en la proyección');
select throws_ok($$select public.create_activity('27000000-0000-4000-8000-000000000201','b2c3d4e5-0001-4b3c-8d4e-111111111111','Inválida','2026-07-08T22:30Z','2026-07-08T22:30Z')$$,'PT422','invalid_date_range','RPC rechaza fin igual a inicio');
select throws_ok($$select public.create_activity('27000000-0000-4000-8000-000000000201','b2c3d4e5-0001-4b3c-8d4e-111111111111','Inválida','2026-07-08T22:30Z','2026-07-08T21:30Z')$$,'PT422','invalid_date_range','RPC rechaza fin anterior');
select throws_ok($$select public.create_activity('27000000-0000-4000-8000-000000000201','b2c3d4e5-0001-4b3c-8d4e-111111111111','Inválida','2026-07-08T22:30Z','2026-07-09T22:31Z')$$,'PT422','invalid_date_range','RPC rechaza duración mayor de 24 horas');
select throws_ok($$select public.create_activity('27000000-0000-4000-8000-000000000201','b2c3d4e5-0001-4b3c-8d4e-111111111111','Inválida','2026-07-08T22:30Z','infinity')$$,'PT422','invalid_date_range','RPC rechaza fecha infinita');
select throws_ok($$select public.create_activity('27000000-0000-4000-8000-000000000201','27000000-0000-4000-8000-000000000302','Inválida','2026-07-08T22:30Z','2026-07-09T00:00Z')$$,'PT422','invalid_activity_type','tipo inactivo no se puede seleccionar');
select throws_ok($$select public.create_activity('27000000-0000-4000-8000-000000000201','27000000-0000-4000-8000-000000000303','Inválida','2026-07-08T22:30Z','2026-07-09T00:00Z')$$,'PT422','invalid_activity_type','tipo ajeno rechazado sin revelar datos');
select throws_ok($$select public.create_activity('27000000-0000-4000-8000-000000000201',null,'Inválida','2026-07-08T22:30Z','2026-07-09T00:00Z')$$,'PT422','invalid_activity_type','tipo requerido');
select throws_ok($$select public.create_activity('27000000-0000-4000-8000-000000000201','b2c3d4e5-0001-4b3c-8d4e-111111111111','  ','2026-07-08T22:30Z','2026-07-09T00:00Z')$$,'PT400','invalid_activity','validación de título también en servidor');
select throws_ok($$select public.create_activity('27000000-0000-4000-8000-000000000203','b2c3d4e5-0001-4b3c-8d4e-111111111111','Inválida','2026-07-08T22:30Z','2026-07-09T00:00Z')$$,'PT403','admin_required','ADMIN de otro grupo no concede escritura');
select throws_ok($$select id from public.activities$$,'42501',null,'cliente no salta vista de actividades');
select throws_ok($$insert into public.activities(title) values('Ataque')$$,'42501',null,'inserción directa bloqueada');
select throws_ok($$update public.activities set title='Ataque'$$,'42501',null,'edición directa bloqueada');
select throws_ok($$update public.activity_types set group_id=null$$,'42501',null,'cliente no convierte tipos propios en tipos de sistema');
select ok(not has_table_privilege('authenticated','public.v_group_activities','INSERT'),'vista no habilita escrituras');
select is((select count(*) from public.users),1::bigint,'la nueva API no expone perfiles de terceros');

select set_config('request.jwt.claims','{"sub":"27000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.v_group_activities),2::bigint,'ATHLETE ve actividad creada con toggles desactivados');
select throws_ok($$select public.create_activity('27000000-0000-4000-8000-000000000201','b2c3d4e5-0001-4b3c-8d4e-111111111111','Inválida','2026-07-08T22:30Z','2026-07-09T00:00Z')$$,'PT403','admin_required','ATHLETE no crea actividades');
select set_config('request.jwt.claims','{"sub":"27000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*) from public.v_group_activities),2::bigint,'GUARDIAN ve actividades del grupo del pupilo vigente');
select throws_ok($$select public.create_activity('27000000-0000-4000-8000-000000000201','b2c3d4e5-0001-4b3c-8d4e-111111111111','Inválida','2026-07-08T22:30Z','2026-07-09T00:00Z')$$,'PT403','admin_required','GUARDIAN no crea actividades');
select set_config('request.jwt.claims','{"sub":"27000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.v_group_activities),0::bigint,'ajeno no enumera actividades');
select throws_ok($$select public.create_activity('27000000-0000-4000-8000-000000000201','b2c3d4e5-0001-4b3c-8d4e-111111111111','Inválida','2026-07-08T22:30Z','2026-07-09T00:00Z')$$,'PT404','group_not_found','grupo ajeno responde 404');
select throws_ok($$select public.create_activity('27000000-0000-4000-8000-000000000999','b2c3d4e5-0001-4b3c-8d4e-111111111111','Inválida','2026-07-08T22:30Z','2026-07-09T00:00Z')$$,'PT404','group_not_found','grupo inexistente responde igual');
select set_config('request.jwt.claims','{"sub":"27000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select is((select count(*) from public.v_group_activities),0::bigint,'GUARDIAN sin pupilo vigente no accede');
select set_config('request.jwt.claims','{"sub":"27000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select is((select count(*) from public.v_group_activities),0::bigint,'PENDING no accede');
select set_config('request.jwt.claims','{"sub":"27000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
select is((select count(*) from public.v_group_activities),0::bigint,'ADMIN INACTIVE no accede');

reset role;
select is((select created_by from public.activities where title='Creada por ADMIN'),'27000000-0000-4000-8000-000000000101'::uuid,'created_by usa perfil y no auth.uid');
-- Simula el cumpleaños antes de ejecutarse el job; no depende de su puntualidad.
set local session_replication_role = replica;
update public.users set birthdate=(app_private.chile_today() - interval '18 years')::date where id='27000000-0000-4000-8000-000000000105';
set local session_replication_role = origin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"27000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*) from public.v_group_activities),0::bigint,'pupilo adulto pierde visibilidad incluso antes del job');
select is((select count(*) from public.v_activity_types where group_id is not null),0::bigint,'pupilo adulto tampoco concede tipos del grupo');
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select id from public.v_group_activities$$,'42501',null,'anon no accede a actividades');
select throws_ok($$select id from public.v_activity_types$$,'42501',null,'anon no enumera tipos');
select throws_ok($$select public.create_activity(null,null,null,null,null)$$,'42501',null,'anon no ejecuta RPC');
reset role;
select * from finish();
rollback;
