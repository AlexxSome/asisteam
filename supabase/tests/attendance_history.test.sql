begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.uid(n integer) returns uuid language sql immutable as $$ select ('39000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
insert into auth.users(id,email,raw_user_meta_data)
select pg_temp.uid(n), 'history-'||n||'@example.test', jsonb_build_object('full_name','Deportista '||n,'birthdate','1990-01-01') from generate_series(1,9)n;
update public.users set id=pg_temp.uid(right(auth_user_id::text,12)::int+100) where email like 'history-%@example.test';
insert into public.groups(id,name,invite_code,created_by,created_at) values
(pg_temp.uid(201),'Historial A','HIST0001',pg_temp.uid(101),'2026-01-01T12:00Z'),
(pg_temp.uid(202),'Historial B','HIST0002',pg_temp.uid(105),'2026-01-01T12:00Z'),
(pg_temp.uid(203),'Historial ajeno','HIST0003',pg_temp.uid(105),'2026-01-01T12:00Z');
insert into public.memberships(id,user_id,group_id,role,status,joined_at)
select pg_temp.uid(mid),pg_temp.uid(uid),pg_temp.uid(gid),role,status,'2026-03-01T03:00Z'
from (values (301,101,201,'ADMIN','ACTIVE'),(302,102,201,'ATHLETE','ACTIVE'),(303,103,201,'ATHLETE','ACTIVE'),
(304,104,201,'ADMIN','ACTIVE'),(314,104,201,'ATHLETE','ACTIVE'),(305,105,202,'ADMIN','ACTIVE'),
(306,106,201,'ATHLETE','PENDING'),(307,107,201,'ATHLETE','INVITED'),(308,108,201,'ATHLETE','ACTIVE'),
(309,109,201,'GUARDIAN','ACTIVE'),(312,102,202,'ATHLETE','ACTIVE'),(315,105,203,'ADMIN','ACTIVE'))x(mid,uid,gid,role,status);
insert into public.activity_types(id,group_id,name,color,is_active) values
(pg_temp.uid(601),pg_temp.uid(201),'Preparación especial','#123456',true),
(pg_temp.uid(602),pg_temp.uid(202),'Tipo ajeno','#654321',true);
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by)
select pg_temp.uid(500+n),pg_temp.uid(201),case when n in (7,8) then 'b2c3d4e5-0003-4b3c-8d4e-333333333333'::uuid else 'b2c3d4e5-0001-4b3c-8d4e-111111111111'::uuid end,
'Actividad '||n,timestamptz '2026-03-01T15:00Z'+(n-1)*interval '1 day',timestamptz '2026-03-01T16:00Z'+(n-1)*interval '1 day',pg_temp.uid(101)
from generate_series(1,11)n;
insert into public.attendance_records(id,activity_id,membership_id,status,note,recorded_by)
select pg_temp.uid(700+n),pg_temp.uid(500+n),pg_temp.uid(302),case when n<=6 then 'PRESENT' when n=7 then 'LATE' when n<=9 then 'ABSENT' else 'EXCUSED' end,
case when n=1 then 'Nota propia' else null end,pg_temp.uid(101) from generate_series(1,10)n;
insert into public.attendance_records(id,activity_id,membership_id,status,note,recorded_by) values
(pg_temp.uid(730),pg_temp.uid(501),pg_temp.uid(303),'ABSENT','Nota secreta de otra persona',pg_temp.uid(101)),
(pg_temp.uid(731),pg_temp.uid(501),pg_temp.uid(314),'LATE','Nota multirol',pg_temp.uid(101));
-- Preingreso, futura y límites de ambos cambios de hora en Chile.
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by)
select pg_temp.uid(n),pg_temp.uid(201),pg_temp.uid(601),'Actividad límite '||n,d,d+interval '1 hour',pg_temp.uid(101)
from (values (520,timestamptz '2026-02-28T15:00Z'),(521,now()+interval '1 day'),
(522,timestamptz '2026-04-05T02:30Z'),(523,timestamptz '2026-04-05T03:30Z'),(524,timestamptz '2026-04-05T04:00Z'),
(525,timestamptz '2026-09-06T03:59Z'),(526,timestamptz '2026-09-06T04:00Z'))x(n,d);
insert into public.attendance_records(id,activity_id,membership_id,status,recorded_by)
select pg_temp.uid(800+n),pg_temp.uid(n),pg_temp.uid(302),'PRESENT',pg_temp.uid(101) from generate_series(520,526)n;
update public.activity_types set is_active=false where id=pg_temp.uid(601);
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values
(pg_temp.uid(550),pg_temp.uid(202),'b2c3d4e5-0001-4b3c-8d4e-111111111111','Otro grupo','2026-03-01T15:00Z','2026-03-01T16:00Z',pg_temp.uid(105));
insert into public.attendance_records(activity_id,membership_id,status,note,recorded_by) values
(pg_temp.uid(550),pg_temp.uid(312),'ABSENT','Mi nota en otro grupo',pg_temp.uid(105));

create function pg_temp.history(p_period text default 'month',p_from date default '2026-03-01',p_to date default null,p_types uuid[] default '{}',p_page integer default 1,p_size integer default 50)
returns jsonb language sql as $$ select public.get_my_attendance_history(pg_temp.uid(201),p_period,p_from,p_to,p_types,p_page,p_size) $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"39000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(pg_temp.history()->'totals','{"convened":10,"present":6,"late":1,"absent":2,"excused":1,"attendance_pct":77.8,"late_rate":14.3}'::jsonb,'métrica canónica completa y actividad sin registro no cuenta');
select is(pg_temp.history()->>'membership_id',pg_temp.uid(302)::text,'identidad desacoplada resuelve membership propia');
select is(pg_temp.history()->'records'->0->>'title','Actividad 10','historial descendente');
select is(pg_temp.history()->'records'->9->>'note','Nota propia','muestra nota propia');
select ok(not (pg_temp.history()::text like '%Nota secreta%'),'no expone nota de otro deportista');
select is((select count(*) from public.v_athlete_attendance_history where group_id=pg_temp.uid(201)),15::bigint,'vista excluye futura, preingreso y otros deportistas');
select is((select count(*) from public.v_athlete_attendance_history where membership_id=pg_temp.uid(303)),0::bigint,'filtrar ID ajeno no abre su historial');
select is((select count(*) from public.v_athlete_attendance_history where group_id=pg_temp.uid(203)),0::bigint,'vista aísla grupos ajenos');
select is(pg_temp.history(p_page=>2,p_size=>3)->'totals',pg_temp.history()->'totals','totales independientes de página');
select is(pg_temp.history(p_page=>2,p_size=>3)->'records'->0->>'title','Actividad 7','paginación estable por fecha e ID');
select is(jsonb_array_length(pg_temp.history(p_page=>100)->'records'),0,'página fuera de rango vacía conserva total');
select is(pg_temp.history('week','2026-03-04')->'period'->>'from','2026-03-02','semana inicia lunes');
select is(pg_temp.history('week','2026-03-04')->'period'->>'to','2026-03-08','semana termina domingo');
select is(pg_temp.history('week','2026-03-04')->'totals'->>'convened','7','semana filtra lista y total');
select is(jsonb_array_length(pg_temp.history('week','2026-03-04')->'records'),7,'lista semanal coherente');
select is(pg_temp.history('custom','2026-03-09','2026-03-10')->'totals'->>'convened','2','rango incluye ambos días');
select is(pg_temp.history('custom','2026-03-10','2026-03-10')->'totals'->'attendance_pct','null'::jsonb,'solo justificados produce null');
select is(pg_temp.history('month','2026-05-01')->'totals'->>'convened','0','sin datos no fabrica ausencias');
select is(pg_temp.history('month','2026-05-01')->'totals'->'attendance_pct','null'::jsonb,'vacío no es cero por ciento');
select is(pg_temp.history('season',null)->'totals'->>'convened','15','temporada incluye historia válida sin futuras ni preingreso');
select is(pg_temp.history('season',null)->'period'->>'from','2026-01-01','temporada inicia creación grupo');
select is(pg_temp.history(p_types=>array['b2c3d4e5-0003-4b3c-8d4e-333333333333'::uuid])->'totals'->>'convened','2','tipo filtra convocadas');
select is(pg_temp.history('custom','2026-04-04','2026-04-04',array[pg_temp.uid(601)])->'totals'->>'convened','2','día de 25 horas incluye ambas 23:30, tipo inactivo consultable');
select is(pg_temp.history('custom','2026-04-05','2026-04-05')->'totals'->>'convened','1','extremo final del día anterior exclusivo');
select is(pg_temp.history('custom','2026-09-06','2026-09-06')->'totals'->>'convened','1','día de 23 horas arranca en primera hora existente');
select is(public.get_my_attendance_history(pg_temp.uid(202),'month','2026-03-01')->'totals'->>'convened','1','mismo usuario en otro grupo mantiene totales separados');
select throws_ok($$select public.get_my_attendance_history(pg_temp.uid(203))$$,'PT404','attendance_history_not_found','grupo ajeno no se enumera');
select throws_ok($$select public.get_my_attendance_history(pg_temp.uid(999))$$,'PT404','attendance_history_not_found','inexistente responde igual que ajeno');
select throws_ok($$select pg_temp.history('custom')$$,'PT400','invalid_report_filters','rango incompleto');
select throws_ok($$select pg_temp.history('custom','2026-03-10','2026-03-01')$$,'PT400','invalid_report_filters','rango invertido');
select throws_ok($$select pg_temp.history('invalid')$$,'PT400','invalid_report_filters','período inválido');
select throws_ok($$select pg_temp.history(p_page=>0)$$,'PT400','invalid_report_filters','página inválida');
select throws_ok($$select pg_temp.history(p_size=>101)$$,'PT400','invalid_report_filters','máximo 100');
select throws_ok($$select pg_temp.history(p_types=>array[pg_temp.uid(602)])$$,'PT400','invalid_report_activity_type','rechaza tipo ajeno');
select throws_ok($$select pg_temp.history(p_types=>array[null::uuid])$$,'PT400','invalid_report_activity_type','rechaza tipo null');
select throws_ok($$select pg_temp.history('month','infinity')$$,'PT400','invalid_report_filters','fecha infinita inválida');
select throws_ok($$select note from public.attendance_records$$,'42501',null,'tabla base conserva bloqueo a lecturas directas');

reset role;
update public.groups set settings='{"athletes_can_view_group_stats":true,"guardians_can_view_group_stats":true}' where id=pg_temp.uid(201);
set local role authenticated;
select is(pg_temp.history()->'totals'->>'convened','10','toggle activo no amplía historial');
select set_config('request.jwt.claims','{"sub":"39000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is(pg_temp.history()->'totals'->>'convened','1','ADMIN+ATHLETE solo consulta su asistencia propia');
select is(pg_temp.history()->'records'->0->>'note','Nota multirol','multirol no recoge registros ajenos');
select is((select count(*) from public.v_athlete_attendance_history),1::bigint,'multirol restringido también en vista directa');
select set_config('request.jwt.claims','{"sub":"39000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
select is(pg_temp.history()->'totals'->>'convened','0','deportista recién ingresado devuelve historial vacío válido');
select set_config('request.jwt.claims','{"sub":"39000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select throws_ok($$select pg_temp.history()$$,'PT404','attendance_history_not_found','PENDING no accede');
select set_config('request.jwt.claims','{"sub":"39000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select throws_ok($$select pg_temp.history()$$,'PT404','attendance_history_not_found','INVITED no accede');
select set_config('request.jwt.claims','{"sub":"39000000-0000-4000-8000-000000000009","role":"authenticated"}',true);
select throws_ok($$select pg_temp.history()$$,'PT404','attendance_history_not_found','GUARDIAN sin ATHLETE no obtiene historial propio');
select set_config('request.jwt.claims','{"sub":"39000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select pg_temp.history()$$,'PT404','attendance_history_not_found','ADMIN sin ATHLETE no recibe historial de tercero');
select lives_ok($$select public.update_attendance_record(pg_temp.uid(708),'{"status":"PRESENT","note":"Corregida"}')$$,'ADMIN corrige asistencia');
select set_config('request.jwt.claims','{"sub":"39000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(pg_temp.history()->'totals'->>'attendance_pct','88.9','corrección actualiza totales sin cache');
select is(pg_temp.history()->'records'->2->>'note','Corregida','corrección actualiza nota propia');
reset role;
update public.memberships set status='INACTIVE' where id=pg_temp.uid(314);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"39000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select pg_temp.history()$$,'PT404','attendance_history_not_found','revocación ATHLETE retira historial aunque conserve ADMIN');
select is((select count(*) from public.v_athlete_attendance_history),0::bigint,'vista reevalúa revocación');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select pg_temp.history()$$,'PT401','authentication_required','sin identidad no consulta');
reset role;
set local role anon;
select throws_ok($$select public.get_my_attendance_history(null)$$,'42501',null,'anon sin execute');
select throws_ok($$select * from public.v_athlete_attendance_history$$,'42501',null,'anon sin select');
reset role;
select * from finish();
rollback;
