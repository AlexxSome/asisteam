begin;
\i packages/db/fixtures/domain.sql

select no_plan();
create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
  select ('47000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create or replace function app_private.chile_today() returns date language sql stable set search_path = '' as $$ select date '2026-09-28' $$;
insert into pg_temp.fixture_accounts(id,email,profile_data)
select pg_temp.uid(n),'history47-'||n||'@example.test',jsonb_build_object('full_name','Adulto '||n,'birthdate','1990-01-01') from generate_series(1,4)n;
update public.users set id=pg_temp.uid(right(auth_user_id::text,12)::int+100) where email like 'history47-%@example.test';
insert into public.users(id,full_name,birthdate,account_status,email,phone)
select pg_temp.uid(n),'Pupilo '||n,'2008-09-29','MANAGED',null,'+56911111111' from generate_series(111,115)n;
insert into public.groups(id,name,invite_code,created_by,created_at)
select pg_temp.uid(n),'Club '||n,'HST47'||(n-200)::text||'00',pg_temp.uid(101),'2026-01-01T12:00Z' from generate_series(201,203)n;
-- Fixture previo a suscripciones: conserva la capacidad histórica (sin alterar guards).
insert into app_private.billing_legacy_groups(group_id) select id from public.groups on conflict do nothing;
insert into public.memberships(user_id,group_id,role,status)
select pg_temp.uid(101),pg_temp.uid(n),'ADMIN','ACTIVE' from generate_series(201,203)n;
insert into public.memberships(id,user_id,group_id,role,status,joined_at)
select pg_temp.uid(300+n),pg_temp.uid(n),pg_temp.uid(201),'ATHLETE','PENDING','2026-03-01T03:00Z' from generate_series(111,115)n;
insert into public.memberships(id,user_id,group_id,role,status,joined_at) values
(pg_temp.uid(421),pg_temp.uid(111),pg_temp.uid(202),'ATHLETE','PENDING','2026-03-01T03:00Z'),
(pg_temp.uid(431),pg_temp.uid(111),pg_temp.uid(203),'ATHLETE','PENDING','2026-03-01T03:00Z');
insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship)
select pg_temp.uid(500+n),pg_temp.uid(case when n=113 then 103 else 102 end),pg_temp.uid(n),'Tutor' from generate_series(111,115)n;
insert into public.consents(guardianship_id,consent_type,terms_version)
select pg_temp.uid(500+n),'DATA_PROCESSING_MINOR','test' from generate_series(111,115)n;
update public.memberships set status='ACTIVE',joined_at='2026-03-01T03:00Z' where role='ATHLETE' and user_id<>pg_temp.uid(114) and group_id in (pg_temp.uid(201),pg_temp.uid(202),pg_temp.uid(203));
-- ADMIN+GUARDIAN+ATHLETE no amplía el historial del pupilo a terceros.
insert into public.memberships(user_id,group_id,role,status,joined_at) values
(pg_temp.uid(102),pg_temp.uid(201),'ADMIN','ACTIVE','2026-03-01T03:00Z'),
(pg_temp.uid(102),pg_temp.uid(201),'ATHLETE','ACTIVE','2026-03-01T03:00Z'),
(pg_temp.uid(102),pg_temp.uid(203),'ADMIN','ACTIVE','2026-03-01T03:00Z');
update public.memberships set status='INACTIVE' where user_id=pg_temp.uid(102) and group_id=pg_temp.uid(203) and role='GUARDIAN';
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by)
select pg_temp.uid(700+n),pg_temp.uid(201),'b2c3d4e5-0001-4b3c-8d4e-111111111111','Actividad '||n,
'2026-03-01T15:00Z'::timestamptz+(n-1)*interval '1 day','2026-03-01T16:00Z'::timestamptz+(n-1)*interval '1 day',pg_temp.uid(101) from generate_series(1,11)n;
insert into public.attendance_records(id,activity_id,membership_id,status,note,recorded_by)
select pg_temp.uid(800+n),pg_temp.uid(700+n),pg_temp.uid(411),case when n<=6 then 'PRESENT' when n=7 then 'LATE' when n<=9 then 'ABSENT' else 'EXCUSED' end,'Nota del pupilo',pg_temp.uid(101) from generate_series(1,10)n;
insert into public.attendance_records(activity_id,membership_id,status,note,recorded_by) values
(pg_temp.uid(701),pg_temp.uid(412),'ABSENT','Nota del segundo pupilo',pg_temp.uid(101)),
(pg_temp.uid(701),pg_temp.uid(413),'ABSENT','Nota secreta de tercero',pg_temp.uid(101));
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by)
select pg_temp.uid(n),pg_temp.uid(201),'b2c3d4e5-0001-4b3c-8d4e-111111111111','Límite '||n,d,d+interval '1 hour',pg_temp.uid(101)
from (values (720,'2026-02-28T15:00Z'::timestamptz),(721,now()+interval '1 day'),(722,'2026-04-05T02:30Z'::timestamptz),(723,'2026-04-05T03:30Z'::timestamptz),(724,'2026-04-05T04:00Z'::timestamptz),(725,'2026-09-06T03:59Z'::timestamptz),(726,'2026-09-06T04:00Z'::timestamptz))x(n,d);
insert into public.attendance_records(activity_id,membership_id,status,note,recorded_by)
select pg_temp.uid(n),pg_temp.uid(411),'PRESENT','Nota del pupilo',pg_temp.uid(101) from generate_series(720,726)n;
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values
(pg_temp.uid(750),pg_temp.uid(202),'b2c3d4e5-0001-4b3c-8d4e-111111111111','Segundo grupo','2026-03-01T15:00Z','2026-03-01T16:00Z',pg_temp.uid(101));
insert into public.attendance_records(activity_id,membership_id,status,note,recorded_by) values
(pg_temp.uid(750),pg_temp.uid(421),'ABSENT','Nota segundo grupo',pg_temp.uid(101));
create function pg_temp.history(p_period text default 'month',p_from date default '2026-03-01',p_to date default null,p_page integer default 1,p_size integer default 50)
returns jsonb language sql as $$ select public.get_ward_attendance_history(pg_temp.uid(201),pg_temp.uid(111),p_period,p_from,p_to,'{}',p_page,p_size) $$;
set local role asisteam_api;
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.uid(2),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select is(pg_temp.history()->'totals','{"convened":10,"present":6,"late":1,"absent":2,"excused":1,"attendance_pct":77.8,"late_rate":14.3}'::jsonb,'métrica canónica independiente de toggles y sin convocar ausencias');
select is(pg_temp.history()->>'membership_id',pg_temp.uid(411)::text,'elige membership ATHLETE del pupilo');
select is(pg_temp.history()->'records'->0->>'title','Actividad 10','orden descendente');
select is(pg_temp.history()->'records'->0->>'note','Nota del pupilo','nota del pupilo visible');
select ok(not (pg_temp.history()::text like '%segundo pupilo%' or pg_temp.history()::text like '%secreta%'),'ni notas ni registros de otro pupilo o terceros');
select is((select count(*) from public.v_ward_attendance_history where group_id=pg_temp.uid(201) and athlete_user_id=pg_temp.uid(111)),15::bigint,'vista excluye futuras, preingreso y sin registro');
select is((select count(*) from public.v_ward_attendance_history where athlete_user_id=pg_temp.uid(113)),0::bigint,'ADMIN+GUARDIAN no abre terceros en la vista');
select is(pg_temp.history(p_page=>2,p_size=>3)->'totals',pg_temp.history()->'totals','totales no dependen de página');
select is(pg_temp.history(p_page=>2,p_size=>3)->'records'->0->>'title','Actividad 7','paginación estable');
select is(pg_temp.history('week','2026-03-04')->'totals'->>'convened','7','semana chilena lunes a domingo');
select is(pg_temp.history('custom','2026-03-09','2026-03-10')->'totals'->>'convened','2','rango incluye extremos');
select is(pg_temp.history('custom','2026-03-10','2026-03-10')->'totals'->'attendance_pct','null'::jsonb,'solo justificados no produce cero');
select is(pg_temp.history('month','2026-05-01')->'totals'->'attendance_pct','null'::jsonb,'sin convocatorias da null');
select is(pg_temp.history('season')->'totals'->>'convened','15','temporada excluye futuro y preingreso');
select is(pg_temp.history('custom','2026-04-04','2026-04-04')->'totals'->>'convened','2','día chileno de 25 horas');
select is(pg_temp.history('custom','2026-04-05','2026-04-05')->'totals'->>'convened','1','fin del día exclusivo');
select is(pg_temp.history('custom','2026-09-06','2026-09-06')->'totals'->>'convened','1','día chileno de 23 horas');
select is(public.get_ward_attendance_history(pg_temp.uid(202),pg_temp.uid(111),'month','2026-03-01')->'totals'->>'attendance_pct','0.0','pupilo en dos grupos mantiene métricas separadas');
select is(public.get_ward_attendance_history(pg_temp.uid(201),pg_temp.uid(112),'month','2026-03-01')->'totals'->>'convened','1','segundo pupilo tiene su historial');
select is(public.get_ward_attendance_history(pg_temp.uid(201),pg_temp.uid(115),'month','2026-03-01')->'totals'->>'convened','0','pupilo sin asistencia tiene historial vacío válido');
select throws_ok($$select public.get_ward_attendance_history(pg_temp.uid(201),pg_temp.uid(113))$$,'PT404','attendance_history_not_found','tercero no vinculado devuelve 404');
select throws_ok($$select public.get_ward_attendance_history(pg_temp.uid(201),pg_temp.uid(999))$$,'PT404','attendance_history_not_found','inexistente devuelve igual 404');
select throws_ok($$select public.get_ward_attendance_history(pg_temp.uid(203),pg_temp.uid(111))$$,'PT404','attendance_history_not_found','otro rol ACTIVE no sustituye GUARDIAN ACTIVE');
select throws_ok($$select public.get_ward_attendance_history(pg_temp.uid(999),pg_temp.uid(111))$$,'PT404','attendance_history_not_found','grupo inexistente devuelve igual 404');
select throws_ok($$select public.get_ward_attendance_history(pg_temp.uid(201),pg_temp.uid(114))$$,'PT404','attendance_history_not_found','PENDING invisible en historial');
select throws_ok($$select pg_temp.history('custom')$$,'PT400','invalid_report_filters','rango incompleto');
select throws_ok($$select pg_temp.history(p_size=>101)$$,'PT400','invalid_report_filters','máximo 100 por página');
select throws_ok($$select pg_temp.history(p_page=>0)$$,'PT400','invalid_report_filters','página inválida');
select throws_ok($$select public.get_ward_attendance_history(pg_temp.uid(201),pg_temp.uid(111),p_activity_type_ids=>array[pg_temp.uid(999)])$$,'PT400','invalid_report_activity_type','tipo desconocido no amplía consulta');
select throws_ok($$select phone from public.v_ward_attendance_history$$,'42703',null,'vista no contiene PII');
select throws_ok($$select note from public.attendance_records$$,'42501',null,'tabla base conserva bloqueo');
reset role;
update public.groups set settings='{"athletes_can_view_group_stats":true,"guardians_can_view_group_stats":true}' where id=pg_temp.uid(201);
update public.attendance_records set status='PRESENT',note='Corregida' where id=pg_temp.uid(808);
set local role asisteam_api;
select is(pg_temp.history()->'totals'->>'attendance_pct','88.9','corrección se refleja en siguiente lectura');
select is(pg_temp.history()->'records'->2->>'note','Corregida','nota actualizada sin cache');
select is((select count(*) from public.v_ward_attendance_history where athlete_user_id=pg_temp.uid(113)),0::bigint,'toggles activos no exponen terceros');
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.uid(1),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select throws_ok($$select pg_temp.history()$$,'PT404','attendance_history_not_found','ADMIN puro no consulta como apoderado');
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.uid(4),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select throws_ok($$select pg_temp.history()$$,'PT404','attendance_history_not_found','ajeno sin membresía devuelve 404');
select set_config('request.jwt.claims',((jsonb_build_object('sub',pg_temp.uid(2),'role','asisteam_member')::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
reset role;
update public.memberships set status='INACTIVE' where id=pg_temp.uid(411);
set local role asisteam_api;
select throws_ok($$select pg_temp.history()$$,'PT404','attendance_history_not_found','baja ATHLETE retira acceso sin cambiar sesión');
select is((select count(*) from public.v_ward_attendance_history where group_id=pg_temp.uid(201) and athlete_user_id=pg_temp.uid(111)),0::bigint,'vista retira historia de ATHLETE inactivo');
reset role;
update public.memberships set status='ACTIVE' where id=pg_temp.uid(411);
insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship) values (pg_temp.uid(619),pg_temp.uid(103),pg_temp.uid(111),'Tutor');
insert into public.consents(guardianship_id,consent_type,terms_version) values (pg_temp.uid(619),'DATA_PROCESSING_MINOR','test');
update public.guardianships set status='INACTIVE',deactivated_at=now() where id=pg_temp.uid(611);
set local role asisteam_api;
select throws_ok($$select pg_temp.history()$$,'PT404','attendance_history_not_found','revocar vínculo retira acceso sin cambiar sesión');
reset role;
update public.guardianships set status='ACTIVE',deactivated_at=null where id=pg_temp.uid(611);
create or replace function app_private.chile_today() returns date language sql stable set search_path = '' as $$ select date '2026-09-29' $$;
set local role asisteam_api;
select throws_ok($$select pg_temp.history()$$,'PT404','attendance_history_not_found','cumple 18: pierde acceso aun antes de ejecutar job');
select is((select count(*) from public.v_ward_attendance_history),0::bigint,'vista reevalúa edad en todas las filas');
select set_config('request.jwt.claims',(('{"role":"authenticated","auth_provider":"nest"}')::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select throws_ok($$select pg_temp.history()$$,'PT401','authentication_required','sin identidad no obtiene historial');
reset role;
set local role asisteam_test_anonymous;
select throws_ok($$select public.get_ward_attendance_history(null,null)$$,'42501',null,'anon sin execute');
select throws_ok($$select * from public.v_ward_attendance_history$$,'42501',null,'anon sin select');
reset role;
select * from finish();
rollback;
