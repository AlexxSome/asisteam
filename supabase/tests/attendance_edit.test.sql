begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data)
select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid, 'attendance-'||n||'@example.test',
jsonb_build_object('full_name','Deportista '||n,'birthdate',case when n=9 then (app_private.chile_today()-interval '15 years')::date::text else '1990-01-01' end)
from generate_series(1,11) n;
update public.users set id=('30000000-0000-4000-8000-'||lpad((right(auth_user_id::text,12)::int+100)::text,12,'0'))::uuid where email like 'attendance-%@example.test';
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
('30000000-0000-4000-8000-000000000501','30000000-0000-4000-8000-000000000201','b2c3d4e5-0001-4b3c-8d4e-111111111111','Entrenamiento pasado',now()-interval '7 days',now()-interval '7 days'+interval '1 hour','30000000-0000-4000-8000-000000000101'),
('30000000-0000-4000-8000-000000000502','30000000-0000-4000-8000-000000000202','b2c3d4e5-0001-4b3c-8d4e-111111111111','Actividad ajena',now(),now()+interval '1 hour','30000000-0000-4000-8000-000000000101');

-- Ingreso anterior a todas las convocatorias elegibles.
update public.memberships set joined_at=now()-interval '30 days'
where group_id='30000000-0000-4000-8000-000000000201';
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by)
select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '30000000-0000-4000-8000-000000000201','b2c3d4e5-0001-4b3c-8d4e-111111111111','Otra actividad',
 now()+days*interval '1 day', now()+days*interval '1 day'+interval '1 hour','30000000-0000-4000-8000-000000000101'
from (values (503,-8),(504,-9),(505,1),(506,-40)) a(n,days);

-- Oráculo canónico sobre proyecciones reales autorizadas (los reportes de
-- HU-ADM-13 aún no existen). joined_at es el ingreso de esta fixture.
create function pg_temp.live_attendance_pct(p_membership_id uuid) returns numeric
language sql as $$
 select round(100.0 * count(*) filter(where r.status in ('PRESENT','LATE'))
   / nullif(count(*) filter(where r.status <> 'EXCUSED'),0),1)
 from (
   select activity_id,membership_id,status from public.v_attendance_admin
   union
   select activity_id,membership_id,status from public.v_attendance_own
 ) r join public.v_group_activities a on a.id=r.activity_id
 where r.membership_id=p_membership_id and a.starts_at <= now()
   and a.starts_at >= now()-interval '30 days'
$$;

select ok(has_function_privilege('authenticated','public.update_attendance_record(uuid,jsonb)','EXECUTE'),'miembros autenticados pueden invocar edición');
select ok(not has_function_privilege('anon','public.update_attendance_record(uuid,jsonb)','EXECUTE'),'anon no puede invocar edición');
select ok((select prosecdef and proconfig=array['search_path=""'] from pg_proc where oid='public.update_attendance_record(uuid,jsonb)'::regprocedure),'RPC definer con search_path fijo');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.record_attendance_bulk('30000000-0000-4000-8000-000000000501','[{"membership_id":"30000000-0000-4000-8000-000000000303","status":"ABSENT","note":"Nota original"},{"membership_id":"30000000-0000-4000-8000-000000000309","status":"ABSENT"}]');
select public.record_attendance_bulk('30000000-0000-4000-8000-000000000503','[{"membership_id":"30000000-0000-4000-8000-000000000303","status":"PRESENT"},{"membership_id":"30000000-0000-4000-8000-000000000309","status":"PRESENT"}]');
select public.record_attendance_bulk('30000000-0000-4000-8000-000000000505','[{"membership_id":"30000000-0000-4000-8000-000000000303","status":"ABSENT"}]');
select public.record_attendance_bulk('30000000-0000-4000-8000-000000000506','[{"membership_id":"30000000-0000-4000-8000-000000000303","status":"ABSENT"}]');
reset role;
update public.attendance_records set recorded_at=now()-interval '6 days' where activity_id='30000000-0000-4000-8000-000000000501';
set local role authenticated;
select set_config('test.record_id',(select id::text from public.v_attendance_admin where activity_id='30000000-0000-4000-8000-000000000501' and membership_id='30000000-0000-4000-8000-000000000303'),true);
select set_config('test.ward_record_id',(select id::text from public.v_attendance_admin where activity_id='30000000-0000-4000-8000-000000000501' and membership_id='30000000-0000-4000-8000-000000000309'),true);
select set_config('test.recorded_at',(select recorded_at::text from public.v_attendance_admin where id=current_setting('test.record_id')::uuid),true);
select is(pg_temp.live_attendance_pct('30000000-0000-4000-8000-000000000303'),50.0,'antes de corregir: 1/2; excluye futuras, preingreso y actividad sin convocatoria');

select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((public.update_attendance_record(current_setting('test.record_id')::uuid,'{"status":"EXCUSED"}')->>'updated')::int,1,'otro ADMIN corrige asistencia de días atrás');
select is((select count(*) from public.v_attendance_admin where id=current_setting('test.record_id')::uuid),1::bigint,'conserva el ID y no duplica el registro');
select is((select note from public.v_attendance_admin where id=current_setting('test.record_id')::uuid),'Nota original','status solo conserva nota omitida');
select is((select recorded_by from public.v_attendance_admin where id=current_setting('test.record_id')::uuid),'30000000-0000-4000-8000-000000000102'::uuid,'actor del editor usa public.users.id');
select ok((select recorded_at > current_setting('test.recorded_at')::timestamptz from public.v_attendance_admin where id=current_setting('test.record_id')::uuid),'corrección actualiza momento');
select is(pg_temp.live_attendance_pct('30000000-0000-4000-8000-000000000303'),100.0,'consulta siguiente ADMIN: ABSENT a EXCUSED cambia 50 a 100');
select public.update_attendance_record(current_setting('test.ward_record_id')::uuid,'{"status":"EXCUSED"}');

-- El primer ADMIN conserva una pantalla anterior; solo envía su nota.
select set_config('test.recorded_at',(select recorded_at::text from public.v_attendance_admin where id=current_setting('test.record_id')::uuid),true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.update_attendance_record(current_setting('test.record_id')::uuid,'{"note":"  Corrección posterior  "}');
select is((select status from public.v_attendance_admin where id=current_setting('test.record_id')::uuid),'EXCUSED','editar solo nota conserva último estado guardado por el otro ADMIN');
select is((select note from public.v_attendance_admin where id=current_setting('test.record_id')::uuid),'Corrección posterior','normaliza nota con la misma regla del upsert');
select is((select recorded_by from public.v_attendance_admin where id=current_setting('test.record_id')::uuid),'30000000-0000-4000-8000-000000000101'::uuid,'editar solo nota actualiza editor');
select ok((select recorded_at > current_setting('test.recorded_at')::timestamptz from public.v_attendance_admin where id=current_setting('test.record_id')::uuid),'editar solo nota actualiza momento');
select public.update_attendance_record(current_setting('test.record_id')::uuid,'{"note":null}');
select is((select note from public.v_attendance_admin where id=current_setting('test.record_id')::uuid),null::text,'nota null elimina explícitamente la nota');
select public.update_attendance_record(current_setting('test.record_id')::uuid,'{"note":" "}');
select is((select note from public.v_attendance_admin where id=current_setting('test.record_id')::uuid),null::text,'nota vacía normaliza a null');
select is((public.record_attendance_bulk('30000000-0000-4000-8000-000000000504','[{"membership_id":"30000000-0000-4000-8000-000000000303","status":"ABSENT"}]')->>'created')::int,1,'alta retroactiva agrega convocatoria antes omitida');
select is(pg_temp.live_attendance_pct('30000000-0000-4000-8000-000000000303'),50.0,'alta retroactiva entra al denominador en consulta siguiente');

select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(pg_temp.live_attendance_pct('30000000-0000-4000-8000-000000000303'),50.0,'ATHLETE consulta datos corregidos y alta sin activar toggle');
select throws_ok($$select public.update_attendance_record(current_setting('test.record_id')::uuid,'{"status":"PRESENT"}')$$,'PT403','admin_required','ATHLETE no edita su registro');
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
select is(pg_temp.live_attendance_pct('30000000-0000-4000-8000-000000000309'),100.0,'GUARDIAN consulta métrica corregida del pupilo sin toggle');
select is(pg_temp.live_attendance_pct('30000000-0000-4000-8000-000000000303'),null::numeric,'GUARDIAN no lee tercero');
select throws_ok($$select public.update_attendance_record(current_setting('test.ward_record_id')::uuid,'{"note":"x"}')$$,'PT403','admin_required','GUARDIAN no edita pupilo');
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select throws_ok($$select public.update_attendance_record(current_setting('test.record_id')::uuid,'{}')$$,'PT404','attendance_record_not_found','otro grupo no enumera registro real');
select throws_ok($$select public.update_attendance_record('30000000-0000-4000-8000-000000000999','{}')$$,'PT404','attendance_record_not_found','registro inexistente responde igual');

select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.update_attendance_record(current_setting('test.record_id')::uuid,null)$$,'PT400','invalid_attendance_changes','parche inválido rechazado: null');
select throws_ok($$select public.update_attendance_record(current_setting('test.record_id')::uuid,'null')$$,'PT400','invalid_attendance_changes','parche inválido rechazado: ''null''');
select throws_ok($$select public.update_attendance_record(current_setting('test.record_id')::uuid,'[]')$$,'PT400','invalid_attendance_changes','parche inválido rechazado: ''[]''');
select throws_ok($$select public.update_attendance_record(current_setting('test.record_id')::uuid,'{}')$$,'PT400','invalid_attendance_changes','parche inválido rechazado: ''{}''');
select throws_ok($$select public.update_attendance_record(current_setting('test.record_id')::uuid,'{"recorded_by":"intruso"}')$$,'PT400','invalid_attendance_changes','parche inválido rechazado: ''{"recorded_by":"intruso"}''');
select throws_ok($$select public.update_attendance_record(current_setting('test.record_id')::uuid,'{"recorded_at":"ayer","note":"x"}')$$,'PT400','invalid_attendance_changes','parche inválido rechazado: ''{"recorded_at":"ayer","note":"x"}''');
select throws_ok($$select public.update_attendance_record(current_setting('test.record_id')::uuid,'{"membership_id":"intruso","note":"x"}')$$,'PT400','invalid_attendance_changes','parche inválido rechazado: ''{"membership_id":"intruso","note":"x"}''');
select throws_ok($$select public.update_attendance_record(current_setting('test.record_id')::uuid,'{"status":null}')$$,'PT400','invalid_attendance_batch','parche inválido rechazado: ''{"status":null}''');
select throws_ok($$select public.update_attendance_record(current_setting('test.record_id')::uuid,'{"status":"INVALID"}')$$,'PT400','invalid_attendance_batch','parche inválido rechazado: ''{"status":"INVALID"}''');
select throws_ok($$select public.update_attendance_record(current_setting('test.record_id')::uuid,'{"note":5}')$$,'PT400','invalid_attendance_batch','parche inválido rechazado: ''{"note":5}''');
select throws_ok($$select public.update_attendance_record(current_setting('test.record_id')::uuid,jsonb_build_object('note',repeat('x',501)))$$,'PT400','invalid_attendance_batch','parche inválido rechazado: jsonb_build_object(''note'',repeat(''x'',501))');

select is((select status from public.v_attendance_admin where id=current_setting('test.record_id')::uuid),'EXCUSED','parches rechazados no mutan estado');
select lives_ok($$select public.update_attendance_record(current_setting('test.record_id')::uuid,jsonb_build_object('status','LATE','note',repeat('x',500)))$$,'acepta ambos campos y nota de 500 caracteres');
select is(pg_temp.live_attendance_pct('30000000-0000-4000-8000-000000000303'),66.7,'LATE cuenta asistencia con redondeo canónico a un decimal');
select public.update_attendance_record(current_setting('test.ward_record_id')::uuid,'{"status":"EXCUSED"}');
select public.update_attendance_record((select id from public.v_attendance_admin where membership_id='30000000-0000-4000-8000-000000000309' and activity_id='30000000-0000-4000-8000-000000000503'),'{"status":"EXCUSED"}');
select is(pg_temp.live_attendance_pct('30000000-0000-4000-8000-000000000309'),null::numeric,'todas EXCUSED quedan Sin datos');
select public.clear_attendance_record('30000000-0000-4000-8000-000000000501','30000000-0000-4000-8000-000000000303');
select throws_ok($$select public.update_attendance_record(current_setting('test.record_id')::uuid,'{"note":"x"}')$$,'PT404','attendance_record_not_found','edición no recrea registro desmarcado por otro ADMIN');
reset role;
update public.memberships set status='INACTIVE' where id='30000000-0000-4000-8000-000000000302';
set local role authenticated;
select throws_ok($$select public.update_attendance_record(current_setting('test.ward_record_id')::uuid,'{"status":"PRESENT"}')$$,'PT404','attendance_record_not_found','revocar ADMIN retira acceso inmediatamente');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.update_attendance_record(current_setting('test.ward_record_id')::uuid,'{"note":"x"}')$$,'PT401','authentication_required','sin identidad autenticada no edita');
reset role;
set local role anon;
select throws_ok($$select public.update_attendance_record(null,'{}')$$,'42501',null,'anon no ejecuta RPC');
reset role;
select * from finish();
rollback;
