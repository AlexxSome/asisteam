begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data)
select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid, 'attendance-'||n||'@example.test',
jsonb_build_object('full_name','Deportista '||n,'birthdate',case when n=9 then (app_private.chile_today()-interval '15 years')::date::text else '1990-01-01' end)
from generate_series(1,11) n;
update public.users set id=('30000000-0000-4000-8000-'||lpad((right(auth_user_id::text,12)::int+100)::text,12,'0'))::uuid where email like 'attendance-%@example.test';
-- Simula metadata de avatar previa a retirar consentimiento, sin objeto real.
set local session_replication_role=replica;
update public.users set avatar_url='/profile/avatar/'||auth_user_id::text||'/00000000-0000-4000-8000-000000000001.webp'
where id in ('30000000-0000-4000-8000-000000000103','30000000-0000-4000-8000-000000000109');
set local session_replication_role=origin;
insert into public.groups(id,name,invite_code,created_by) values
('30000000-0000-4000-8000-000000000201','Equipo asistencia','ASIST001','30000000-0000-4000-8000-000000000101'),
('30000000-0000-4000-8000-000000000202','Equipo ajeno','ASIST002','30000000-0000-4000-8000-000000000101');
insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship) values
('30000000-0000-4000-8000-000000000401','30000000-0000-4000-8000-000000000108','30000000-0000-4000-8000-000000000109','Padre');
insert into public.consents(guardianship_id,consent_type,terms_version) values('30000000-0000-4000-8000-000000000401','DATA_PROCESSING_MINOR','v1');
insert into public.memberships(id,user_id,group_id,role,status) values
('30000000-0000-4000-8000-000000000301','30000000-0000-4000-8000-000000000101','30000000-0000-4000-8000-000000000201','ADMIN','ACTIVE'),
('30000000-0000-4000-8000-000000000302','30000000-0000-4000-8000-000000000102','30000000-0000-4000-8000-000000000201','ADMIN','ACTIVE'),
('30000000-0000-4000-8000-000000000303','30000000-0000-4000-8000-000000000103','30000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE'),
('30000000-0000-4000-8000-000000000304','30000000-0000-4000-8000-000000000104','30000000-0000-4000-8000-000000000201','ADMIN','ACTIVE'),
('30000000-0000-4000-8000-000000000314','30000000-0000-4000-8000-000000000104','30000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE'),
('30000000-0000-4000-8000-000000000305','30000000-0000-4000-8000-000000000105','30000000-0000-4000-8000-000000000202','ATHLETE','ACTIVE'),
('30000000-0000-4000-8000-000000000306','30000000-0000-4000-8000-000000000106','30000000-0000-4000-8000-000000000201','ATHLETE','PENDING'),
('30000000-0000-4000-8000-000000000307','30000000-0000-4000-8000-000000000107','30000000-0000-4000-8000-000000000201','ATHLETE','INACTIVE'),
('30000000-0000-4000-8000-000000000309','30000000-0000-4000-8000-000000000109','30000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE'),
('30000000-0000-4000-8000-000000000311','30000000-0000-4000-8000-000000000111','30000000-0000-4000-8000-000000000201','ATHLETE','INVITED');
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values
('30000000-0000-4000-8000-000000000501','30000000-0000-4000-8000-000000000201','b2c3d4e5-0001-4b3c-8d4e-111111111111','Entrenamiento futuro',now()+interval '1 day',now()+interval '1 day 1 hour','30000000-0000-4000-8000-000000000101'),
('30000000-0000-4000-8000-000000000502','30000000-0000-4000-8000-000000000202','b2c3d4e5-0001-4b3c-8d4e-111111111111','Actividad ajena',now(),now()+interval '1 hour','30000000-0000-4000-8000-000000000101');

select ok((select relrowsecurity from pg_class where oid='public.attendance_records'::regclass),'asistencia tiene RLS deny-by-default');
select ok(not has_table_privilege('authenticated','public.attendance_records','SELECT'),'tabla base no abre notas de terceros');
select ok(not has_function_privilege('authenticated','app_private.lock_attendance_activity(uuid)','EXECUTE'),'helper privado no queda ejecutable por cliente');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from public.v_attendance_roster),3::bigint,'roster solo ATHLETE ACTIVE del grupo, incluida membership ATHLETE del multi-rol');
select is((select avatar_url from public.v_attendance_roster where membership_id='30000000-0000-4000-8000-000000000303'),'/profile/avatar/30000000-0000-4000-8000-000000000003/00000000-0000-4000-8000-000000000001.webp','ADMIN puede proyectar avatar adulto sin ejecutar helpers privados');
select is((select avatar_url from public.v_attendance_roster where membership_id='30000000-0000-4000-8000-000000000309'),null::text,'roster oculta avatar de menor sin consentimiento específico');
select is((select count(*) from public.v_attendance_admin),0::bigint,'actividad sin marcar no tiene registros inventados');
select is((public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[{"membership_id":"30000000-0000-4000-8000-000000000303","status":"PRESENT","note":"Nota propia"},{"membership_id":"30000000-0000-4000-8000-000000000314","status":"LATE"},{"membership_id":"30000000-0000-4000-8000-000000000309","status":"ABSENT","note":"Nota del pupilo"}]')->>'created')::int,3,'crea lote transaccional, admite actividad futura');
select is((select count(*) from public.v_attendance_admin),3::bigint,'una convocatoria por membership');
select is((select count(*) from public.v_attendance_admin where recorded_by='30000000-0000-4000-8000-000000000101'),3::bigint,'actor usa public.users.id desacoplado');
select ok((select bool_and(recorded_at is not null) from public.v_attendance_admin),'registra timestamp');
select throws_ok($$insert into public.attendance_records(activity_id) values('30000000-0000-4000-8000-000000000501')$$,'42501',null,'no permite escrituras directas');
select throws_ok($$delete from public.attendance_records$$,'42501',null,'no existe DELETE genérico de cliente');
select throws_ok($$select note from public.attendance_records$$,'42501',null,'cliente usa proyección explícita');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[{"membership_id":"30000000-0000-4000-8000-000000000303","status":"EXCUSED"},{"membership_id":"30000000-0000-4000-8000-000000000305","status":"PRESENT"}]')$$,'PT422','membership_not_athlete_in_group','rechaza lote con una membership ajena');
select is((select status from public.v_attendance_admin where membership_id='30000000-0000-4000-8000-000000000303'),'PRESENT','lote inválido no deja actualizaciones parciales');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[{"membership_id":"30000000-0000-4000-8000-000000000304","status":"PRESENT"}]')$$,'PT422','membership_not_athlete_in_group','multi-rol no permite usar su membership ADMIN');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[{"membership_id":"30000000-0000-4000-8000-000000000306","status":"PRESENT"}]')$$,'PT422','membership_not_athlete_in_group','PENDING no recibe asistencia');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[{"membership_id":"30000000-0000-4000-8000-000000000307","status":"PRESENT"}]')$$,'PT422','membership_not_athlete_in_group','INACTIVE no recibe asistencia');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[{"membership_id":"30000000-0000-4000-8000-000000000311","status":"PRESENT"}]')$$,'PT422','membership_not_athlete_in_group','INVITED no recibe asistencia');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[]')$$,'PT400','invalid_attendance_batch','lote vacío rechazado');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[null]')$$,'PT400','invalid_attendance_batch','fila JSON null rechazada');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[{"membership_id":"invalid","status":"PRESENT"}]')$$,'PT400','invalid_attendance_batch','UUID inválido controlado');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[{"membership_id":"30000000-0000-4000-8000-000000000303","status":null}]')$$,'PT400','invalid_attendance_batch','estado null no elimina registro');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[{"membership_id":"30000000-0000-4000-8000-000000000303","status":"INVALID"}]')$$,'PT400','invalid_attendance_batch','solo cuatro estados');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[{"membership_id":"30000000-0000-4000-8000-000000000303","status":"PRESENT","recorded_by":"30000000-0000-4000-8000-000000000102"}]')$$,'PT400','invalid_attendance_batch','no acepta suplantar actor');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501',jsonb_build_array(jsonb_build_object('membership_id','30000000-0000-4000-8000-000000000303','status','PRESENT','note',repeat('x',501))))$$,'PT400','invalid_attendance_batch','nota máximo 500');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[{"membership_id":"30000000-0000-4000-8000-000000000303","status":"PRESENT"},{"membership_id":"30000000-0000-4000-8000-000000000303","status":"ABSENT"}]')$$,'PT400','duplicate_membership','duplicados no se resuelven silenciosamente');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501',(select jsonb_agg(jsonb_build_object('membership_id',('30000000-0000-4000-8000-'||lpad((n+10000)::text,12,'0')),'status','PRESENT')) from generate_series(1,501)n))$$,'PT400','invalid_attendance_batch','lote de 501 rechazado antes de escribir');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501',(select jsonb_agg(jsonb_build_object('membership_id',('30000000-0000-4000-8000-'||lpad((n+10000)::text,12,'0')),'status','PRESENT')) from generate_series(1,500)n))$$,'PT422','membership_not_athlete_in_group','lote de 500 supera validación de tamaño y valida membresías');

reset role;
create temp table original_record as select id,recorded_at from public.attendance_records where membership_id='30000000-0000-4000-8000-000000000303';
grant select on original_record to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[{"membership_id":"30000000-0000-4000-8000-000000000303","status":"EXCUSED"}]')->>'updated')::int,1,'segundo ADMIN actualiza fila existente');
select is((select id from public.v_attendance_admin where membership_id='30000000-0000-4000-8000-000000000303'),(select id from original_record),'upsert conserva ID');
select is((select note from public.v_attendance_admin where membership_id='30000000-0000-4000-8000-000000000303'),'Nota propia','cambio de estado sin nota conserva nota');
select is((select recorded_by from public.v_attendance_admin where membership_id='30000000-0000-4000-8000-000000000303'),'30000000-0000-4000-8000-000000000102'::uuid,'actualización cambia actor');
select ok((select recorded_at>(select recorded_at from original_record) from public.v_attendance_admin where membership_id='30000000-0000-4000-8000-000000000303'),'actualización cambia momento');
select lives_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[{"membership_id":"30000000-0000-4000-8000-000000000303","status":"PRESENT"},{"membership_id":"30000000-0000-4000-8000-000000000309","status":"PRESENT"}]',true)$$,'marcar todos preserva marcas de otros ADMIN');
select is((select status from public.v_attendance_admin where membership_id='30000000-0000-4000-8000-000000000303'),'EXCUSED','no sobrescribe justificado');
select is((select status from public.v_attendance_admin where membership_id='30000000-0000-4000-8000-000000000309'),'ABSENT','no sobrescribe ausencia');
select lives_ok($$select public.clear_attendance_record('30000000-0000-4000-8000-000000000501','30000000-0000-4000-8000-000000000314')$$,'ADMIN puede desmarcar una convocatoria');
select is((select count(*) from public.v_attendance_admin),2::bigint,'desmarcar no inventa ABSENT ni elimina otros registros');
select is((public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[{"membership_id":"30000000-0000-4000-8000-000000000314","status":"PRESENT"}]',true)->>'created')::int,1,'todos presentes llena solamente sin marcar');

select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.v_attendance_roster),0::bigint,'ATHLETE no lista deportistas ADMIN');
select is((select count(*) from public.v_attendance_admin),0::bigint,'ATHLETE no ve notas ajenas en vista ADMIN');
select is((select count(*) from public.v_attendance_own),1::bigint,'ATHLETE ve solo su registro sin toggle');
select is((select note from public.v_attendance_own),'Nota propia','ATHLETE ve su propia nota');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[]')$$,'PT403','admin_required','permiso se valida antes del payload');
select throws_ok($$select public.clear_attendance_record('30000000-0000-4000-8000-000000000501','30000000-0000-4000-8000-000000000303')$$,'PT403','admin_required','ATHLETE tampoco puede desmarcarse');
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
select is((select count(*) from public.v_attendance_own),1::bigint,'GUARDIAN solo ve registro del pupilo');
select is((select note from public.v_attendance_own),'Nota del pupilo','GUARDIAN ve nota de su pupilo');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[]')$$,'PT403','admin_required','GUARDIAN no escribe');
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000010","role":"authenticated"}',true);
select is((select count(*) from public.v_attendance_own),0::bigint,'ajeno no obtiene registros');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[]')$$,'PT404','activity_not_found','actividad ajena responde 404');
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000999','[]')$$,'PT404','activity_not_found','actividad inexistente responde igual');

reset role;
select throws_ok($$insert into public.attendance_records(activity_id,membership_id,status,recorded_by) values('30000000-0000-4000-8000-000000000501','30000000-0000-4000-8000-000000000305','PRESENT','30000000-0000-4000-8000-000000000101')$$,'23514','membership_not_athlete_in_group','trigger protege incluso escritura privilegiada cruzada');
select throws_ok($$update public.attendance_records set note=repeat('x',501) where membership_id='30000000-0000-4000-8000-000000000303'$$,'23514',null,'constraint protege longitud de notas');
update public.groups set settings='{"athletes_can_view_group_stats":true,"guardians_can_view_group_stats":true}' where id='30000000-0000-4000-8000-000000000201';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.v_attendance_own),1::bigint,'toggle no revela notas de terceros');
reset role;
set local session_replication_role=replica;
update public.users set birthdate=(app_private.chile_today()-interval '18 years')::date where id='30000000-0000-4000-8000-000000000109';
set local session_replication_role=origin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
select is((select count(*) from public.v_attendance_own),0::bigint,'GUARDIAN pierde acceso el día que pupilo cumple 18');
reset role;
update public.memberships set status='INACTIVE' where id='30000000-0000-4000-8000-000000000301';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[]')$$,'PT404','activity_not_found','revocación ADMIN retira acceso inmediatamente');
reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select * from public.v_attendance_admin$$,'42501',null,'anon no consulta asistencia');
select throws_ok($$select public.record_attendance_bulk(null,'[]')$$,'42501',null,'anon no ejecuta RPC');
reset role;
select * from finish();
rollback;
