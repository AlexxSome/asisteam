begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data)
select ('32000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid, 'report-'||n||'@example.test',
jsonb_build_object('full_name','Persona '||n,'birthdate','1990-01-01') from generate_series(1,10) n;
update public.users set id=('32000000-0000-4000-8000-'||lpad((right(auth_user_id::text,12)::int+100)::text,12,'0'))::uuid where email like 'report-%@example.test';
insert into public.groups(id,name,invite_code,created_by,created_at) values
('32000000-0000-4000-8000-000000000201','Equipo reportes','REPORT01','32000000-0000-4000-8000-000000000101','2026-01-01T12:00Z'),
('32000000-0000-4000-8000-000000000202','Equipo ajeno','REPORT02','32000000-0000-4000-8000-000000000109','2026-01-01T12:00Z'),
('32000000-0000-4000-8000-000000000203','Equipo vacío','REPORT03','32000000-0000-4000-8000-000000000101','2026-01-01T12:00Z');
insert into public.memberships(id,user_id,group_id,role,status,joined_at)
select ('32000000-0000-4000-8000-'||lpad(mid::text,12,'0'))::uuid,
('32000000-0000-4000-8000-'||lpad(uid::text,12,'0'))::uuid,
('32000000-0000-4000-8000-'||lpad(gid::text,12,'0'))::uuid,role,status,'2026-03-01T03:00Z'
from (values (301,101,201,'ADMIN','ACTIVE'),(311,101,201,'ATHLETE','ACTIVE'),
(302,102,201,'ATHLETE','ACTIVE'),(303,103,201,'ATHLETE','ACTIVE'),(304,104,201,'ATHLETE','ACTIVE'),
(305,105,201,'ATHLETE','ACTIVE'),(306,106,201,'ATHLETE','PENDING'),(307,107,201,'ATHLETE','INVITED'),
(308,108,201,'GUARDIAN','ACTIVE'),(309,109,202,'ADMIN','ACTIVE'),(310,110,201,'ADMIN','INACTIVE'),
(312,102,202,'ATHLETE','ACTIVE'),(313,101,203,'ADMIN','ACTIVE')) x(mid,uid,gid,role,status);
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by)
select ('32000000-0000-4000-8000-'||lpad((500+n)::text,12,'0'))::uuid,'32000000-0000-4000-8000-000000000201',
case when n in (6,7) then 'b2c3d4e5-0003-4b3c-8d4e-333333333333'::uuid else 'b2c3d4e5-0001-4b3c-8d4e-111111111111'::uuid end,
'Actividad '||n, timestamptz '2026-03-01T15:00Z'+n*interval '1 day',timestamptz '2026-03-01T16:00Z'+n*interval '1 day','32000000-0000-4000-8000-000000000101'
from generate_series(1,9) n;
insert into public.attendance_records(activity_id,membership_id,status,recorded_by)
select ('32000000-0000-4000-8000-'||lpad((500+n)::text,12,'0'))::uuid,'32000000-0000-4000-8000-000000000302',
case when n<=5 then 'PRESENT' when n=6 then 'LATE' when n=7 then 'ABSENT' else 'EXCUSED' end,'32000000-0000-4000-8000-000000000101'
from generate_series(1,8) n;
insert into public.attendance_records(activity_id,membership_id,status,recorded_by) values
('32000000-0000-4000-8000-000000000501','32000000-0000-4000-8000-000000000311','PRESENT','32000000-0000-4000-8000-000000000101'),
('32000000-0000-4000-8000-000000000501','32000000-0000-4000-8000-000000000303','EXCUSED','32000000-0000-4000-8000-000000000101'),
('32000000-0000-4000-8000-000000000501','32000000-0000-4000-8000-000000000304','ABSENT','32000000-0000-4000-8000-000000000101');
update public.memberships set status='INACTIVE' where id='32000000-0000-4000-8000-000000000304';
-- Preingreso y futura precargados deben excluirse incluso de temporada.
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by)
select ('32000000-0000-4000-8000-'||n)::uuid,'32000000-0000-4000-8000-000000000201','b2c3d4e5-0001-4b3c-8d4e-111111111111',
'Excluida',d,d+interval '1 hour','32000000-0000-4000-8000-000000000101'
from (values ('000000000510',timestamptz '2026-02-20T12:00Z'),('000000000511',now()+interval '1 day')) a(n,d);
insert into public.attendance_records(activity_id,membership_id,status,recorded_by)
select ('32000000-0000-4000-8000-'||n)::uuid,'32000000-0000-4000-8000-000000000302','ABSENT','32000000-0000-4000-8000-000000000101'
from (values ('000000000510'),('000000000511')) a(n);

create function pg_temp.report(p_period text default 'month', p_from date default '2026-03-15', p_to date default null,
 p_types uuid[] default '{}', p_inactive boolean default false, p_page int default 1, p_size int default 50, p_sort text default 'attendance') returns jsonb
language sql as $$select public.get_group_attendance_report('32000000-0000-4000-8000-000000000201',p_period,p_from,p_to,p_types,p_inactive,p_page,p_size,p_sort)$$;
create function pg_temp.athlete(p_report jsonb, p_mid text default '32000000-0000-4000-8000-000000000302') returns jsonb
language sql as $$select value from jsonb_array_elements(p_report->'by_athlete') where value->>'membership_id'=p_mid$$;

select ok((select prosecdef and proconfig=array['search_path=""'] from pg_proc where oid='public.get_group_attendance_report(uuid,text,date,date,uuid[],boolean,integer,integer,text)'::regprocedure),'RPC definer con search_path fijo');
select ok((select reloptions @> array['security_barrier=true'] from pg_class where oid='public.v_group_attendance_report'::regclass),'vista con barrera de seguridad');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(pg_temp.athlete(pg_temp.report()) - array['membership_id','full_name','membership_status'],
'{"convened":8,"present":5,"late":1,"absent":1,"excused":1,"attendance_pct":85.7,"late_rate":16.7}'::jsonb,'HU-ADM-13: 8 convocadas y 85.7 con 1 atraso');
select is(jsonb_array_length(pg_temp.report()->'by_athlete'),4,'solo ATHLETE ACTIVE; excluye pendientes, invitados e inactivos');
select is(pg_temp.athlete(pg_temp.report(),'32000000-0000-4000-8000-000000000311')->>'convened','1','ADMIN doble rol usa solo su membership ATHLETE');
select is(pg_temp.athlete(pg_temp.report(),'32000000-0000-4000-8000-000000000303')->'attendance_pct','null'::jsonb,'solo EXCUSED es Sin datos');
select is(pg_temp.athlete(pg_temp.report(),'32000000-0000-4000-8000-000000000305')->'attendance_pct','null'::jsonb,'sin convocatorias mantiene fila Sin datos');
select is(pg_temp.report()#>>'{totals,attendance_pct}','87.5','total calculado sobre conteos: 7/8, no promedio');
select is(pg_temp.report()#>>'{totals,average_attendance_pct}','92.9','promedio excluye deportistas Sin datos');
select is(pg_temp.report()#>>'{totals,activities}','9','total de actividades del período incluye actividad sin registro');
select is(pg_temp.report()#>>'{by_athlete,0,membership_id}','32000000-0000-4000-8000-000000000311','orden porcentaje descendente, Sin datos al final');
select is(jsonb_array_length(pg_temp.report(p_inactive=>true)->'by_athlete'),5,'filtro agrega inactivo preservando historial');
select is(pg_temp.athlete(pg_temp.report(p_inactive=>true),'32000000-0000-4000-8000-000000000304')->>'membership_status','INACTIVE','inactivo queda marcado');
select is(pg_temp.report(p_size=>1,p_page=>2)#>>'{by_athlete,0,membership_id}','32000000-0000-4000-8000-000000000302','paginación estable');
select is(pg_temp.report(p_size=>1,p_page=>2)#>>'{totals,convened}','10','totales independientes de página');
select is(pg_temp.athlete(pg_temp.report(p_types=>array['b2c3d4e5-0003-4b3c-8d4e-333333333333'::uuid]))->>'attendance_pct','50.0','COMPETITION solo incluye 1 LATE y 1 ABSENT');
select is(pg_temp.athlete(pg_temp.report(p_types=>array['b2c3d4e5-0003-4b3c-8d4e-333333333333'::uuid,'b2c3d4e5-0001-4b3c-8d4e-111111111111'::uuid]))->>'convened','8','multiselección combina tipos');
select is(pg_temp.athlete(pg_temp.report('season',null))->>'convened','8','temporada excluye futuras y preingreso');
select is(pg_temp.report('season',null)#>>'{period,from}','2026-01-01','temporada inicia en creación');
select is(pg_temp.report('week','2026-03-08')#>>'{period,from}','2026-03-02','semana comienza lunes');
select is(pg_temp.report('week','2026-03-08')#>>'{period,to}','2026-03-08','semana termina domingo');
select is(pg_temp.athlete(pg_temp.report('custom','2026-03-07','2026-03-07'))->>'convened','1','rango incluye ambos días, incluso un solo día');
select is(pg_temp.report('month','2026-03-01')->'period',pg_temp.report('month','2026-03-31')->'period','fecha ancla conserva mes completo');
select is(public.get_group_attendance_report('32000000-0000-4000-8000-000000000203')->>'has_activities','false','grupo sin actividades permite CTA');
select is(public.get_group_attendance_report('32000000-0000-4000-8000-000000000203')#>'{totals,attendance_pct}','null'::jsonb,'grupo vacío no inventa porcentaje');
select throws_ok($$select pg_temp.report('custom','2026-03-09','2026-03-01')$$,'PT400','invalid_report_filters','rechaza rango invertido');
select throws_ok($$select pg_temp.report('custom',null,null)$$,'PT400','invalid_report_filters','custom requiere extremos');
select throws_ok($$select pg_temp.report('year')$$,'PT400','invalid_report_filters','rechaza período desconocido');
select throws_ok($$select pg_temp.report(p_size=>101)$$,'PT400','invalid_report_filters','paginación máximo 100');
select throws_ok($$select pg_temp.report(p_types=>array[null::uuid])$$,'PT400','invalid_report_activity_type','rechaza tipo null');
select throws_ok($$select pg_temp.report(p_types=>array['32000000-0000-4000-8000-000000000999'::uuid])$$,'PT400','invalid_report_activity_type','tipo no visible o inexistente tiene mismo error');

-- Una corrección se refleja en la siguiente consulta, sin cache ni duplicados.
select public.update_attendance_record((select id from public.v_attendance_admin where activity_id='32000000-0000-4000-8000-000000000507' and membership_id='32000000-0000-4000-8000-000000000302'),'{"status":"EXCUSED"}');
select is(pg_temp.athlete(pg_temp.report())->>'attendance_pct','100.0','corregir ABSENT a EXCUSED recalcula al instante');
select is(pg_temp.athlete(pg_temp.report())->>'convened','8','corrección no duplica convocatoria');

reset role;
-- Ambas 23:30 del cambio de otoño pertenecen al mismo día chileno. En
-- primavera no existe 00:00: el día comienza a las 01:00 (04:00 UTC).
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by)
select ('32000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'32000000-0000-4000-8000-000000000201',
'b2c3d4e5-0001-4b3c-8d4e-111111111111','Borde Chile',d,d+interval '15 minutes','32000000-0000-4000-8000-000000000101'
from (values (520,timestamptz '2026-04-05T02:30Z'),(521,timestamptz '2026-04-05T03:30Z'),(522,timestamptz '2026-04-05T04:00Z'),
(523,timestamptz '2026-09-06T03:59Z'),(524,timestamptz '2026-09-06T04:00Z'),(525,timestamptz '2026-09-07T03:00Z')) a(n,d);
insert into public.attendance_records(activity_id,membership_id,status,recorded_by)
select ('32000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'32000000-0000-4000-8000-000000000302','PRESENT','32000000-0000-4000-8000-000000000101'
from generate_series(520,525) n;
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values
('32000000-0000-4000-8000-000000000530','32000000-0000-4000-8000-000000000202','b2c3d4e5-0001-4b3c-8d4e-111111111111','Otro grupo','2026-03-02T15:00Z','2026-03-02T16:00Z','32000000-0000-4000-8000-000000000109');
insert into public.attendance_records(activity_id,membership_id,status,recorded_by) values
('32000000-0000-4000-8000-000000000530','32000000-0000-4000-8000-000000000312','ABSENT','32000000-0000-4000-8000-000000000109');
insert into public.activity_types(id,group_id,name) values
('32000000-0000-4000-8000-000000000601','32000000-0000-4000-8000-000000000201','Histórico'),
('32000000-0000-4000-8000-000000000602','32000000-0000-4000-8000-000000000202','Privado');
update public.activities set activity_type_id='32000000-0000-4000-8000-000000000601' where id='32000000-0000-4000-8000-000000000520';
update public.activity_types set is_active=false where id='32000000-0000-4000-8000-000000000601';
set local role authenticated;
select is(pg_temp.athlete(pg_temp.report('custom','2026-04-04','2026-04-04'))->>'convened','2','otoño cuenta ambas horas repetidas en su fecha Chile');
select is(pg_temp.athlete(pg_temp.report('custom','2026-04-05','2026-04-05'))->>'convened','1','medianoche de otoño delimita día siguiente');
select is(pg_temp.athlete(pg_temp.report('custom','2026-09-06','2026-09-06'))->>'convened','1','primavera incluye 01:00, excluye noche anterior y siguiente');
select is(pg_temp.report('custom','2026-09-06','2026-09-06')#>>'{totals,activities}','1','KPI usa los mismos límites UTC de Chile');
select is(pg_temp.athlete(pg_temp.report('week','2026-09-06'))->>'convened','2','semana con DST excluye lunes siguiente');
select is(pg_temp.athlete(pg_temp.report('custom','2026-04-01','2026-04-30',array['32000000-0000-4000-8000-000000000601'::uuid]))->>'convened','1','tipo inactivo conserva historia filtrable');
select is(pg_temp.athlete(pg_temp.report())->>'convened','8','misma persona en otro grupo no mezcla registros');
select throws_ok($$select pg_temp.report(p_types=>array['32000000-0000-4000-8000-000000000602'::uuid])$$,'PT400','invalid_report_activity_type','tipo ajeno usa mismo error que inexistente');

-- V5/V6: no se conceden filas ni agregados de ADMIN a otros roles o grupos.
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.v_group_attendance_report),0::bigint,'ATHLETE no lee vista ADMIN');
select throws_ok($$select pg_temp.report()$$,'PT403','admin_required','ATHLETE no ejecuta reporte ADMIN');
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000008","role":"authenticated"}',true);
select throws_ok($$select pg_temp.report()$$,'PT403','admin_required','GUARDIAN no ejecuta reporte ADMIN');
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000009","role":"authenticated"}',true);
select throws_ok($$select pg_temp.report()$$,'PT404','group_not_found','ADMIN ajeno no enumera grupo');
select is((select count(*) from public.v_group_attendance_report where group_id='32000000-0000-4000-8000-000000000201'),0::bigint,'vista aísla grupos');
select set_config('request.jwt.claims','{"sub":"32000000-0000-4000-8000-000000000010","role":"authenticated"}',true);
select throws_ok($$select pg_temp.report()$$,'PT404','group_not_found','ADMIN INACTIVE pierde acceso');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select pg_temp.report()$$,'PT401','authentication_required','sin identidad no ejecuta');
reset role;
set local role anon;
select throws_ok($$select public.get_group_attendance_report(null)$$,'42501',null,'anon sin EXECUTE');
select throws_ok($$select * from public.v_group_attendance_report$$,'42501',null,'anon sin SELECT');
reset role;
select * from finish();
rollback;
