begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data)
select ('28000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'weekly-' || n || '@example.test',
  '{"full_name":"Persona semanal","birthdate":"1990-01-01"}'::jsonb from generate_series(1,4) n;
update public.users set id = ('28000000-0000-4000-8000-' || lpad((right(auth_user_id::text,12)::int + 100)::text,12,'0'))::uuid
where email like 'weekly-%@example.test';
insert into public.groups(id,name,invite_code,created_by) values
('28000000-0000-4000-8000-000000000201','Equipo semanal','WEEK0001','28000000-0000-4000-8000-000000000101'),
('28000000-0000-4000-8000-000000000202','Equipo ajeno','WEEK0002','28000000-0000-4000-8000-000000000103');
insert into public.memberships(id,user_id,group_id,role,status) values
('28000000-0000-4000-8000-000000000301','28000000-0000-4000-8000-000000000101','28000000-0000-4000-8000-000000000201','ADMIN','ACTIVE'),
('28000000-0000-4000-8000-000000000302','28000000-0000-4000-8000-000000000102','28000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE'),
('28000000-0000-4000-8000-000000000303','28000000-0000-4000-8000-000000000103','28000000-0000-4000-8000-000000000202','ADMIN','ACTIVE'),
('28000000-0000-4000-8000-000000000304','28000000-0000-4000-8000-000000000104','28000000-0000-4000-8000-000000000201','ADMIN','INACTIVE');

create function pg_temp.create_weekly(p_rule jsonb, p_start timestamptz default '2026-08-26T22:30Z', p_end timestamptz default '2026-08-27T00:00Z') returns uuid
language sql as $$select public.create_activity('28000000-0000-4000-8000-000000000201','b2c3d4e5-0001-4b3c-8d4e-111111111111','Serie semanal',p_start,p_end,p_recurrence_rule=>p_rule)$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"28000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('test.weekly_root',pg_temp.create_weekly('{"freq":"WEEKLY","by_weekday":["TU","TH"],"until":"2026-09-10"}')::text,true);
select is((select count(*) from public.v_group_activities),5::bigint,'materializa solo días seleccionados, incluyendo término');
select is((select min(starts_at) from public.v_group_activities),'2026-08-27T22:30Z'::timestamptz,'si inicio no coincide, primera ocurrencia es siguiente día seleccionado');
select is((select max(starts_at) from public.v_group_activities),'2026-09-10T21:30Z'::timestamptz,'DST cambia UTC, conserva 18:30 de Chile');
select is((select count(distinct (starts_at at time zone 'America/Santiago')::time) from public.v_group_activities),1::bigint,'todas las semanas mantienen horario local');
select is((select count(distinct recurrence_rule) from public.v_group_activities),1::bigint,'regla se copia en cada fila');
select is((select count(*) from public.v_group_activities where recurrence_source_id=current_setting('test.weekly_root')::uuid),4::bigint,'hijas referencian raíz');
select is((select recurrence_source_id from public.v_group_activities where id=current_setting('test.weekly_root')::uuid),null::uuid,'raíz con source null');

select throws_ok($$select pg_temp.create_weekly('{"freq":"MONTHLY","by_weekday":["TU"],"until":"2026-09-10"}')$$,'PT400','invalid_recurrence','solo semanal');
select throws_ok($$select pg_temp.create_weekly('{"freq":"WEEKLY","by_weekday":[],"until":"2026-09-10"}')$$,'PT400','invalid_recurrence','días requeridos');
select throws_ok($$select pg_temp.create_weekly('{"freq":"WEEKLY","by_weekday":["TU","TU"],"until":"2026-09-10"}')$$,'PT400','invalid_recurrence','días únicos');
select throws_ok($$select pg_temp.create_weekly('{"freq":"WEEKLY","by_weekday":[null],"until":"2026-09-10"}')$$,'PT400','invalid_recurrence','valida tipos JSON');
select throws_ok($$select pg_temp.create_weekly('{"freq":"WEEKLY","by_weekday":["TU"],"until":"2026-02-30"}')$$,'PT400','invalid_recurrence','fecha inexistente');
select throws_ok($$select pg_temp.create_weekly('{"freq":"WEEKLY","by_weekday":["TU"],"until":"2027-03-01"}')$$,'PT422','recurrence_limit_exceeded','horizonte máximo 26 semanas');
select throws_ok($$select pg_temp.create_weekly('{"freq":"WEEKLY","by_weekday":["MO","TU","WE","TH","FR","SA","SU"],"until":"2027-06-03"}','2027-01-04T21:30Z','2027-01-04T23:00Z')$$,'PT422','recurrence_limit_exceeded','rechaza 151 instancias');
select throws_ok($$select pg_temp.create_weekly('{"freq":"WEEKLY","by_weekday":["TU"],"until":"2026-08-26"}')$$,'PT422','invalid_recurrence','rechaza período sin ocurrencias');
select throws_ok($$select pg_temp.create_weekly('{"freq":"WEEKLY","by_weekday":["SU"],"until":"2026-09-06"}','2026-08-30T04:30Z','2026-08-30T05:30Z')$$,'PT422','invalid_local_datetime','hora inexistente de primavera revierte serie completa');
select throws_ok($$select pg_temp.create_weekly('{"freq":"WEEKLY","by_weekday":["SA"],"until":"2026-04-04"}','2026-03-29T02:30Z','2026-03-29T04:30Z')$$,'PT422','invalid_local_datetime','hora repetida de otoño no se elige silenciosamente');
select is((select count(*) from public.v_group_activities),5::bigint,'ningún fallo deja inserciones parciales');
select lives_ok($$select pg_temp.create_weekly('{"freq":"WEEKLY","by_weekday":["MO","TU","WE","TH","FR","SA","SU"],"until":"2027-06-02"}','2027-01-04T21:30Z','2027-01-04T23:00Z')$$,'permite exactamente 150 instancias');

reset role;
-- Serie relativa a now(): pasada, futura editable, futura con asistencia y otra futura.
select throws_ok($$update public.activities set recurrence_rule='{}' where id=current_setting('test.weekly_root')::uuid$$,'23514',null,'constraint rechaza regla sin frecuencia incluso en escritura privilegiada');
select throws_ok($$update public.activities set recurrence_rule='{"freq":null}' where id=current_setting('test.weekly_root')::uuid$$,'23514',null,'NULL JSON no evade constraint');
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by,recurrence_rule,recurrence_source_id)
select ('28000000-0000-4000-8000-'||lpad((n+500)::text,12,'0'))::uuid,
 '28000000-0000-4000-8000-000000000201','b2c3d4e5-0001-4b3c-8d4e-111111111111','Original',
 ((now() at time zone 'America/Santiago')::date + (n-1)*7-1 + time '18:30') at time zone 'America/Santiago',
 ((now() at time zone 'America/Santiago')::date + (n-1)*7-1 + time '20:00') at time zone 'America/Santiago',
 '28000000-0000-4000-8000-000000000101','{"freq":"WEEKLY","by_weekday":["MO"],"until":"2027-01-01"}',
 case when n=1 then null else '28000000-0000-4000-8000-000000000501'::uuid end
from generate_series(1,4) n;
insert into public.attendance_records(activity_id,membership_id,status,recorded_by) values
('28000000-0000-4000-8000-000000000503','28000000-0000-4000-8000-000000000302','PRESENT','28000000-0000-4000-8000-000000000101');
create function pg_temp.edit_weekly(p_id uuid,p_scope text,p_title text default 'Editada') returns integer
language sql as $$select public.update_activity('28000000-0000-4000-8000-000000000201',p_id,'b2c3d4e5-0001-4b3c-8d4e-111111111111',p_title,
 (select starts_at from public.v_group_activities where id=p_id),(select ends_at from public.v_group_activities where id=p_id),p_scope=>p_scope)$$;
set local role authenticated;
select is(pg_temp.edit_weekly('28000000-0000-4000-8000-000000000501','series'),2,'serie solo edita futuras sin asistencia');
select is((select title from public.v_group_activities where id='28000000-0000-4000-8000-000000000501'),'Original','pasada intacta');
select is((select title from public.v_group_activities where id='28000000-0000-4000-8000-000000000503'),'Original','con asistencia intacta');
select is(pg_temp.edit_weekly('28000000-0000-4000-8000-000000000504','series','Desde aquí'),1,'desde una ocurrencia no modifica anteriores futuras');
select is((select title from public.v_group_activities where id='28000000-0000-4000-8000-000000000502'),'Editada','futura anterior al ancla intacta');
select is(pg_temp.edit_weekly('28000000-0000-4000-8000-000000000501','single','Puntual'),1,'edición puntual pasada permitida');
select is((select title from public.v_group_activities where id='28000000-0000-4000-8000-000000000504'),'Desde aquí','edición puntual no cambia hermana');
select throws_ok($$select public.delete_activity('28000000-0000-4000-8000-000000000201','28000000-0000-4000-8000-000000000503')$$,'PT409','attendance_confirmation_required','eliminar asistencia requiere confirmación adicional');
select is(public.delete_activity('28000000-0000-4000-8000-000000000201','28000000-0000-4000-8000-000000000501'),1,'borrar raíz elimina solo raíz');
select is((select recurrence_source_id from public.v_group_activities where id='28000000-0000-4000-8000-000000000502'),null::uuid,'primera sobreviviente es nueva raíz');
select is((select recurrence_source_id from public.v_group_activities where id='28000000-0000-4000-8000-000000000504'),'28000000-0000-4000-8000-000000000502'::uuid,'hermanas conservan identidad de serie');
select is(public.delete_activity('28000000-0000-4000-8000-000000000201','28000000-0000-4000-8000-000000000502','series',true),2,'eliminar serie siempre conserva asistencia aunque se envíe confirmación');
select is((select count(*) from public.v_group_activities where id='28000000-0000-4000-8000-000000000503'),1::bigint,'ocurrencia con asistencia sobrevive');
select throws_ok($$select pg_temp.edit_weekly('28000000-0000-4000-8000-000000000503','series')$$,'PT409','no_editable_occurrences','serie sin elegibles avisa conflicto');
select is(public.delete_activity('28000000-0000-4000-8000-000000000201','28000000-0000-4000-8000-000000000503','single',true),1,'confirmación explícita permite borrar ocurrencia con asistencia');
reset role;
select is((select count(*) from public.attendance_records where activity_id='28000000-0000-4000-8000-000000000503'),0::bigint,'solo se borra asistencia explícitamente confirmada');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"28000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select pg_temp.create_weekly('{"freq":"WEEKLY","by_weekday":["TU"],"until":"2026-09-10"}')$$,'PT403','admin_required','ATHLETE no crea series');
select throws_ok($$select pg_temp.edit_weekly(current_setting('test.weekly_root')::uuid,'series')$$,'PT403','admin_required','ATHLETE no edita serie');
select throws_ok($$select public.delete_activity('28000000-0000-4000-8000-000000000201',current_setting('test.weekly_root')::uuid)$$,'PT403','admin_required','ATHLETE no elimina');
select set_config('request.jwt.claims','{"sub":"28000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.v_group_activities),0::bigint,'ADMIN ajeno no enumera series');
select throws_ok($$select pg_temp.edit_weekly(current_setting('test.weekly_root')::uuid,'single')$$,'PT404','activity_not_found','ADMIN ajeno no edita');
select throws_ok($$select public.delete_activity('28000000-0000-4000-8000-000000000202',current_setting('test.weekly_root')::uuid)$$,'PT404','activity_not_found','ID de otro grupo con grupo propio no permite eliminar');
select set_config('request.jwt.claims','{"sub":"28000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select public.delete_activity('28000000-0000-4000-8000-000000000201',current_setting('test.weekly_root')::uuid)$$,'PT404','activity_not_found','ADMIN inactivo sin acceso');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.delete_activity('28000000-0000-4000-8000-000000000201',current_setting('test.weekly_root')::uuid)$$,'PT401','authentication_required','sesión requerida');
reset role;
select ok(not has_function_privilege('anon','public.delete_activity(uuid,uuid,text,boolean)','EXECUTE'),'anon no ejecuta eliminación');
select ok(not has_function_privilege('authenticated','app_private.create_single_activity(uuid,uuid,text,timestamptz,timestamptz,text,text)','EXECUTE'),'helper privado no puede saltar RPC');
select ok(not has_table_privilege('authenticated','public.activities','UPDATE'),'escritura directa sigue cerrada');
select * from finish();
rollback;
