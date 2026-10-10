begin;
\i packages/db/fixtures/domain.sql

select no_plan();
create function pg_temp.id(n integer) returns uuid language sql immutable as $$
  select ('55000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
insert into pg_temp.fixture_accounts(id,email,profile_data)
select pg_temp.id(n), 'coach-'||n||'@example.test', jsonb_build_object('full_name','Persona '||n,'birthdate','1990-01-01')
from generate_series(1,8) n;
update public.users set id=pg_temp.id(right(auth_user_id::text,12)::int+100)
where email like 'coach-%@example.test';
insert into public.groups(id,name,invite_code,created_by,created_at) values
(pg_temp.id(201),'Grupo entrenadores','COACH001',pg_temp.id(101),now()-interval '60 days'),
(pg_temp.id(202),'Grupo ajeno','COACH002',pg_temp.id(104),now()-interval '60 days');
-- Fixture previo a suscripciones: conserva la capacidad histórica (sin alterar guards).
insert into app_private.billing_legacy_groups(group_id) select id from public.groups on conflict do nothing;
insert into public.memberships(id,user_id,group_id,role,status,joined_at) values
(pg_temp.id(301),pg_temp.id(101),pg_temp.id(201),'ADMIN','ACTIVE',now()-interval '30 days'),
(pg_temp.id(302),pg_temp.id(102),pg_temp.id(201),'ATHLETE','ACTIVE',now()-interval '30 days'),
(pg_temp.id(303),pg_temp.id(103),pg_temp.id(201),'ATHLETE','ACTIVE',now()-interval '30 days'),
(pg_temp.id(304),pg_temp.id(104),pg_temp.id(202),'ADMIN','ACTIVE',now()-interval '30 days'),
(pg_temp.id(305),pg_temp.id(105),pg_temp.id(201),'GUARDIAN','ACTIVE',now()-interval '30 days'),
(pg_temp.id(306),pg_temp.id(106),pg_temp.id(201),'ATHLETE','PENDING',null),
(pg_temp.id(307),pg_temp.id(107),pg_temp.id(201),'COACH','INACTIVE',now()-interval '30 days'),
(pg_temp.id(308),pg_temp.id(108),pg_temp.id(201),'COACH','ACTIVE',now()-interval '30 days');
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values
(pg_temp.id(501),pg_temp.id(201),'b2c3d4e5-0001-4b3c-8d4e-111111111111','Actividad pasada',now()-interval '1 day',now()-interval '23 hours',pg_temp.id(101)),
(pg_temp.id(502),pg_temp.id(202),'b2c3d4e5-0001-4b3c-8d4e-111111111111','Actividad ajena',now()-interval '1 day',now()-interval '23 hours',pg_temp.id(104));
insert into public.attendance_records(id,activity_id,membership_id,status,note,recorded_by) values
(pg_temp.id(601),pg_temp.id(501),pg_temp.id(303),'ABSENT','Nota privada administrativa',pg_temp.id(101));
select ok(not pg_temp.can_execute('asisteam_test_anonymous','public.assign_member_coach(uuid,uuid)','EXECUTE'),'anon no puede asignar rol');
select ok(not has_table_privilege('asisteam_member','app_private.attendance_report_counts','SELECT'),'detalle diario privado no tiene acceso cliente');
set local role asisteam_api;
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.id(101-100),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select set_config('test.coach_id', public.assign_member_coach(pg_temp.id(201),pg_temp.id(302))::text,true);
select is(public.assign_member_coach(pg_temp.id(201),pg_temp.id(302))::text,current_setting('test.coach_id'),'asignación idempotente conserva ID');
select is((select count(*) from public.list_group_members(pg_temp.id(201),'COACH')),2::bigint+1,'ADMIN puede filtrar COACH incluidos inactivos');
select throws_ok($$select public.assign_member_coach(pg_temp.id(201),pg_temp.id(306))$$,'PT409','membership_status_changed','no delega a un pendiente');
select throws_ok($$select public.assign_member_coach(pg_temp.id(201),pg_temp.id(304))$$,'PT404','membership_not_found','no asigna por una membership de otro grupo');
reset role;
select is((select role from public.memberships where id=pg_temp.id(302)),'ATHLETE','conserva rol deportista');
select is((select count(*) from public.memberships where user_id=pg_temp.id(102) and group_id=pg_temp.id(201)),2::bigint,'multirol usa dos filas');
select is((select count(*) from public.attendance_records where membership_id=current_setting('test.coach_id')::uuid),0::bigint,'no convoca por el rol COACH');
-- Verificar COACH puro, sin depender del permiso ATHLETE.
update public.memberships set status='INACTIVE' where id=pg_temp.id(302);
set local role asisteam_api;
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.id(2),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select is((select roles from public.v_my_groups where id=pg_temp.id(201)),array['COACH'],'COACH puro descubre su grupo');
select is((select count(*) from public.v_group_activities),1::bigint,'solo ve actividades de su grupo');
select is((select count(*) from public.v_attendance_roster),1::bigint,'nómina contiene únicamente ATHLETE ACTIVE');
select is((select note from public.v_attendance_operator where id=pg_temp.id(601)),null::text,'operador no ve nota de tercero');
select is((select count(*) from public.v_attendance_admin),0::bigint,'vista ADMIN no se abre a COACH');
select is((select count(*) from public.v_group_attendance_report),0::bigint,'detalle diario ADMIN no se abre a COACH');
select is((select count(*) from public.v_attendance_own),0::bigint,'COACH no recibe notas por vista propia');
select is((select count(*) from public.users where id=pg_temp.id(103)),0::bigint,'no recibe perfil de terceros');
select is((select invite_code from public.v_group_detail where id=pg_temp.id(201)),null::text,'código de invitación sigue privado');
select is((select settings from public.v_group_detail where id=pg_temp.id(201)),null::jsonb,'configuración sigue privada');
select is((select can_view_group_stats from public.v_group_detail where id=pg_temp.id(201)),true,'reportes no dependen de toggles');
select is((public.update_attendance_record(pg_temp.id(601),'{"status":"LATE"}')#>>'{records,0,note}'),null::text,'corregir estado no devuelve nota');
select is((select status from public.v_attendance_operator where id=pg_temp.id(601)),'LATE','corrige asistencia histórica');
select is((public.record_attendance_bulk(pg_temp.id(501),jsonb_build_array(jsonb_build_object('membership_id',pg_temp.id(303),'status','EXCUSED')),true)#>>'{records,0,note}'),null::text,'todos presentes no filtra notas existentes');
select throws_ok($$select public.update_attendance_record(pg_temp.id(601),'{"note":"intrusión"}')$$,'PT403','attendance_notes_admin_required','no escribe notas');
select throws_ok($$select public.record_attendance_bulk(pg_temp.id(501),jsonb_build_array(jsonb_build_object('membership_id',pg_temp.id(303),'status','PRESENT','note',null)))$$,'PT403','attendance_notes_admin_required','ni null permite borrar nota vía lote');
select throws_ok($$select public.clear_attendance_record(pg_temp.id(501),pg_temp.id(303))$$,'PT403','attendance_clear_admin_required','no borra la nota mediante desmarcado');
select is((public.get_group_attendance_report(pg_temp.id(201),'season')#>>'{totals,attendance_pct}')::numeric,100.0,'reporte incluye cambios del entrenador');
select is((public.get_group_stats(pg_temp.id(201))#>>'{totals,late}')::int,1,'estadísticas disponibles con ambos toggles apagados');
select ok(not (public.get_group_attendance_report(pg_temp.id(201),'season')::text ~ 'Nota privada|email|phone|birthdate|recorded_by'),'reporte agregado sin PII ni notas');
select throws_ok($$select public.get_group_attendance_report(pg_temp.id(202),'season')$$,'PT404','group_not_found','reportes aislados por grupo');
select throws_ok($$select public.record_attendance_bulk(pg_temp.id(502),'[]')$$,'PT404','activity_not_found','asistencia aislada por grupo');
select throws_ok($$select public.list_group_members(pg_temp.id(201))$$,'PT403','admin_required','COACH no gestiona integrantes');
select throws_ok($$select public.assign_member_coach(pg_temp.id(201),pg_temp.id(303))$$,'PT403','admin_required','COACH no delega permisos');
select throws_ok($$select public.deactivate_membership(pg_temp.id(201),pg_temp.id(303))$$,'PT403','admin_required','COACH no desactiva integrantes');
select throws_ok($$select public.update_group_settings(pg_temp.id(201),'{"athletes_can_view_group_stats":true}')$$,'PT403','admin_required','COACH no configura el grupo');
select throws_ok($$select public.create_activity(pg_temp.id(201),'b2c3d4e5-0001-4b3c-8d4e-111111111111','Nueva actividad',now(),now()+interval '1 hour')$$,'PT403','admin_required','COACH no administra actividades');
reset role;
select throws_ok($$select public.issue_invitation(pg_temp.id(2),pg_temp.id(201),repeat('a',64),'target@example.test','ATHLETE')$$,'PT403','admin_required','Edge no puede emitir invitación a nombre de COACH');
select is((select note from public.attendance_records where id=pg_temp.id(601)),'Nota privada administrativa','todos los cambios conservan la nota almacenada');
select is((select recorded_by from public.attendance_records where id=pg_temp.id(601)),pg_temp.id(102),'autor real queda registrado');
-- Multirol ADMIN+COACH conserva permisos administrativos y sus notas.
insert into public.memberships(user_id,group_id,role,status,joined_at) values(pg_temp.id(108),pg_temp.id(201),'ADMIN','ACTIVE',now());
set local role asisteam_api;
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.id(8),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select is((select note from public.v_attendance_operator where id=pg_temp.id(601)),'Nota privada administrativa','ADMIN+COACH mantiene lectura de notas');
select lives_ok($$select public.update_attendance_record(pg_temp.id(601),'{"note":"Corrección ADMIN"}')$$,'ADMIN+COACH mantiene edición de notas');
select lives_ok($$select public.deactivate_membership(pg_temp.id(201),current_setting('test.coach_id')::uuid)$$,'revoca COACH con transición existente');
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.id(2),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select is((select count(*) from public.v_attendance_operator),0::bigint,'revocación retira lectura inmediatamente');
select throws_ok($$select public.record_attendance_bulk(pg_temp.id(501),'[]')$$,'PT404','activity_not_found','revocación retira escritura');
select throws_ok($$select public.get_group_attendance_report(pg_temp.id(201))$$,'PT404','group_not_found','revocación retira reportes');
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.id(8),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select lives_ok($$select public.reactivate_membership(pg_temp.id(201),current_setting('test.coach_id')::uuid)$$,'reactiva rol sin duplicar su fila');
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.id(2),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select lives_ok($$select public.record_attendance_bulk(pg_temp.id(501),jsonb_build_array(jsonb_build_object('membership_id',pg_temp.id(303),'status','EXCUSED')))$$,'rol reactivado vuelve a operar');
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.id(3),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select throws_ok($$select public.update_attendance_record(pg_temp.id(601),'{"status":"PRESENT"}')$$,'PT403','admin_required','ATHLETE no obtiene permisos operativos');
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.id(5),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select throws_ok($$select public.update_attendance_record(pg_temp.id(601),'{"status":"PRESENT"}')$$,'PT403','admin_required','GUARDIAN no obtiene permisos operativos');
select set_config('request.jwt.claims',(('{"role":"authenticated","auth_provider":"nest"}')::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select throws_ok($$select public.assign_member_coach(pg_temp.id(201),pg_temp.id(303))$$,'PT401','authentication_required','sin identidad no asigna');
reset role;
select * from finish();
rollback;
