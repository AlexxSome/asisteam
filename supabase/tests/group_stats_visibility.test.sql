begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.uid(n integer) returns uuid language sql immutable as $$
  select ('33000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.actor(n integer) returns text language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.uid(n),'role','authenticated')::text,true)
$$;
insert into auth.users(id,email,raw_user_meta_data)
select pg_temp.uid(n), 'visibility-'||n||'@example.test',
  jsonb_build_object('full_name','Persona '||n,'birthdate','1990-01-01') from generate_series(1,10) n;
update public.users set id=pg_temp.uid(right(auth_user_id::text,12)::int+100), phone='+56912345678'
where email like 'visibility-%@example.test';
update public.users set birthdate=(app_private.chile_today()-interval '12 years')::date where id=pg_temp.uid(108);
insert into public.groups(id,name,invite_code,created_by) values
(pg_temp.uid(201),'Visibilidad Uno','VISIB001',pg_temp.uid(101)),
(pg_temp.uid(202),'Visibilidad Dos','VISIB002',pg_temp.uid(105));
insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship) values
(pg_temp.uid(401),pg_temp.uid(103),pg_temp.uid(108),'Madre'),
(pg_temp.uid(402),pg_temp.uid(104),pg_temp.uid(108),'Padre');
insert into public.consents(guardianship_id,consent_type,terms_version,channel) values
(pg_temp.uid(401),'DATA_PROCESSING_MINOR','test','IN_APP');
insert into public.memberships(id,user_id,group_id,role,status,joined_at)
select pg_temp.uid(mid),pg_temp.uid(uid),pg_temp.uid(gid),role,status,'2026-03-01T00:00Z'
from (values (301,101,201,'ADMIN','ACTIVE'),(302,102,201,'ATHLETE','ACTIVE'),
(304,104,201,'ATHLETE','ACTIVE'),(305,105,202,'ADMIN','ACTIVE'),
(306,106,201,'ATHLETE','ACTIVE'),(307,107,201,'ATHLETE','PENDING'),
(308,108,201,'ATHLETE','ACTIVE'),(309,109,201,'ATHLETE','ACTIVE'),
(310,110,201,'ATHLETE','INVITED'),(312,102,202,'ATHLETE','ACTIVE')) v(mid,uid,gid,role,status);
update public.memberships set status='INACTIVE' where id=pg_temp.uid(306);
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by)
select pg_temp.uid(500+n),pg_temp.uid(201),'b2c3d4e5-0001-4b3c-8d4e-111111111111',
  'Actividad privada '||n,'2026-03-01T12:00Z'::timestamptz+n*interval '1 day',
  '2026-03-01T13:00Z'::timestamptz+n*interval '1 day',pg_temp.uid(101) from generate_series(1,10) n;
insert into public.attendance_records(activity_id,membership_id,status,note,recorded_by)
select pg_temp.uid(500+n),pg_temp.uid(302),case when n<=6 then 'PRESENT' when n=7 then 'LATE' when n<=9 then 'ABSENT' else 'EXCUSED' end,
  'Nota privada del deportista',pg_temp.uid(101) from generate_series(1,10) n;
insert into public.attendance_records(activity_id,membership_id,status,note,recorded_by) values
(pg_temp.uid(501),pg_temp.uid(308),'PRESENT','Nota privada del pupilo',pg_temp.uid(101));
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values
(pg_temp.uid(511),pg_temp.uid(201),'b2c3d4e5-0001-4b3c-8d4e-111111111111','Futura',now()+interval '1 day',now()+interval '2 days',pg_temp.uid(101)),
(pg_temp.uid(512),pg_temp.uid(201),'b2c3d4e5-0001-4b3c-8d4e-111111111111','Preingreso','2026-02-01T12:00Z','2026-02-01T13:00Z',pg_temp.uid(101));
insert into public.attendance_records(activity_id,membership_id,status,recorded_by) values
(pg_temp.uid(511),pg_temp.uid(302),'ABSENT',pg_temp.uid(101)),(pg_temp.uid(512),pg_temp.uid(302),'ABSENT',pg_temp.uid(101));

create function pg_temp.stats(p_page int default 1,p_size int default 50) returns jsonb language sql as $$
  select public.get_group_stats(pg_temp.uid(201),p_page,p_size)
$$;
create function pg_temp.change(p_changes jsonb) returns jsonb language sql as $$
  select public.update_group_settings(pg_temp.uid(201),p_changes)
$$;
select is((select settings from public.groups where id=pg_temp.uid(201)),
  '{"athletes_can_view_group_stats":false,"guardians_can_view_group_stats":false}'::jsonb,'ambos toggles nacen false');
select ok(not has_column_privilege('authenticated','public.groups','settings','UPDATE'),'settings solo vía RPC');
select ok(not has_column_privilege('authenticated','public.groups','settings_updated_by','UPDATE'),'no se puede falsificar autor');
select ok(not has_function_privilege('anon','public.get_group_stats(uuid,integer,integer)','EXECUTE'),'anon sin acceso a RPC');
select ok((select reloptions @> array['security_barrier=true'] from pg_class where oid='public.v_group_stats_members'::regclass),'vista con barrera de seguridad');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='v_group_stats_members'),
  array['group_id','membership_id','full_name','avatar_url','convened','present','late','absent','excused','attendance_pct','late_rate'],'V5: lista exhaustiva de columnas seguras');
select ok((select bool_and(prosecdef and proconfig=array['search_path=""']) from pg_proc where oid in
  ('public.get_group_stats(uuid,integer,integer)'::regprocedure,'public.update_group_settings(uuid,jsonb)'::regprocedure)), 'RPC definer con search_path fijo');

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select pg_temp.stats()$$,'PT401','authentication_required','lectura exige identidad');
select throws_ok($$select pg_temp.change('{}')$$,'PT401','authentication_required','cambio exige identidad');
select pg_temp.actor(1);
select lives_ok($$select pg_temp.stats()$$,'ADMIN tiene vista previa con toggles apagados');
select throws_ok($$select pg_temp.change('{}')$$,'PT400','invalid_group_settings','rechaza vacío');
select throws_ok($$select pg_temp.change(null)$$,'PT400','invalid_group_settings','rechaza NULL');
select throws_ok($$select pg_temp.change('[]')$$,'PT400','invalid_group_settings','rechaza array');
select throws_ok($$select pg_temp.change('{"athletes_can_view_group_stats":"true"}')$$,'PT400','invalid_group_settings','rechaza string booleano');
select throws_ok($$select pg_temp.change('{"athletes_can_view_group_stats":null}')$$,'PT400','invalid_group_settings','rechaza null booleano');
select throws_ok($$select pg_temp.change('{"invite_code":"ATTACK01"}')$$,'PT400','invalid_group_settings','rechaza claves extra');
select throws_ok($$select public.update_group_settings(pg_temp.uid(202),'{"athletes_can_view_group_stats":true}')$$,'PT404','group_not_found','ADMIN A no configura B');
select throws_ok($$select pg_temp.stats(0)$$,'PT400','invalid_report_filters','valida página');
select throws_ok($$select pg_temp.stats(1,101)$$,'PT400','invalid_report_filters','máximo 100 filas');
select is(jsonb_array_length(pg_temp.stats()->'members'),4,'solo atletas activos; incluye sin convocatorias');
select is((select value->>'attendance_pct' from jsonb_array_elements(pg_temp.stats()->'members') where value->>'membership_id'=pg_temp.uid(302)::text),'77.8','métrica canónica excluye futura y preingreso');
select is((select value->'attendance_pct' from jsonb_array_elements(pg_temp.stats()->'members') where value->>'membership_id'=pg_temp.uid(309)::text),'null'::jsonb,'sin convocatorias es null');
select is(pg_temp.stats(2,1)->'totals',pg_temp.stats()->'totals','totales no dependen de paginación');
select is(pg_temp.stats()#>>'{totals,attendance_pct}','80.0','totales calculados sobre conteos');

-- Combinación deportistas=false, apoderados=false: consulta en la misma sesión.
select pg_temp.actor(1);
select pg_temp.change('{"athletes_can_view_group_stats":false,"guardians_can_view_group_stats":false}');
select pg_temp.actor(2);
select is((select count(*) from public.v_group_stats_members where group_id=pg_temp.uid(201)),0::bigint,'ATHLETE respeta toggles false/false');
select is((select can_view_group_stats from public.v_group_detail where id=pg_temp.uid(201)),false,'permiso efectivo ATHLETE false/false');
select throws_ok($$select pg_temp.stats()$$,'PT403','group_stats_disabled','RPC deniega ATHLETE false/false');
select pg_temp.actor(3);
select is((select count(*) from public.v_group_stats_members where group_id=pg_temp.uid(201)),0::bigint,'GUARDIAN respeta toggles false/false');
select is((select can_view_group_stats from public.v_group_detail where id=pg_temp.uid(201)),false,'permiso efectivo GUARDIAN false/false');
select throws_ok($$select pg_temp.stats()$$,'PT403','group_stats_disabled','RPC deniega GUARDIAN false/false');
select pg_temp.actor(4);
select is((select count(*) from public.v_group_stats_members where group_id=pg_temp.uid(201)),0::bigint,'multirol respeta toggles false/false');
select is((select can_view_group_stats from public.v_group_detail where id=pg_temp.uid(201)),false,'permiso efectivo multirol false/false');
select throws_ok($$select pg_temp.stats()$$,'PT403','group_stats_disabled','RPC deniega multirol false/false');

-- Combinación deportistas=true, apoderados=false: consulta en la misma sesión.
select pg_temp.actor(1);
select pg_temp.change('{"athletes_can_view_group_stats":true,"guardians_can_view_group_stats":false}');
select pg_temp.actor(2);
select is((select count(*) from public.v_group_stats_members where group_id=pg_temp.uid(201)),4::bigint,'ATHLETE respeta toggles true/false');
select is((select can_view_group_stats from public.v_group_detail where id=pg_temp.uid(201)),true,'permiso efectivo ATHLETE true/false');
select lives_ok($$select pg_temp.stats()$$,'RPC permite ATHLETE true/false');
select pg_temp.actor(3);
select is((select count(*) from public.v_group_stats_members where group_id=pg_temp.uid(201)),0::bigint,'GUARDIAN respeta toggles true/false');
select is((select can_view_group_stats from public.v_group_detail where id=pg_temp.uid(201)),false,'permiso efectivo GUARDIAN true/false');
select throws_ok($$select pg_temp.stats()$$,'PT403','group_stats_disabled','RPC deniega GUARDIAN true/false');
select pg_temp.actor(4);
select is((select count(*) from public.v_group_stats_members where group_id=pg_temp.uid(201)),4::bigint,'multirol respeta toggles true/false');
select is((select can_view_group_stats from public.v_group_detail where id=pg_temp.uid(201)),true,'permiso efectivo multirol true/false');
select lives_ok($$select pg_temp.stats()$$,'RPC permite multirol true/false');

-- Combinación deportistas=false, apoderados=true: consulta en la misma sesión.
select pg_temp.actor(1);
select pg_temp.change('{"athletes_can_view_group_stats":false,"guardians_can_view_group_stats":true}');
select pg_temp.actor(2);
select is((select count(*) from public.v_group_stats_members where group_id=pg_temp.uid(201)),0::bigint,'ATHLETE respeta toggles false/true');
select is((select can_view_group_stats from public.v_group_detail where id=pg_temp.uid(201)),false,'permiso efectivo ATHLETE false/true');
select throws_ok($$select pg_temp.stats()$$,'PT403','group_stats_disabled','RPC deniega ATHLETE false/true');
select pg_temp.actor(3);
select is((select count(*) from public.v_group_stats_members where group_id=pg_temp.uid(201)),4::bigint,'GUARDIAN respeta toggles false/true');
select is((select can_view_group_stats from public.v_group_detail where id=pg_temp.uid(201)),true,'permiso efectivo GUARDIAN false/true');
select lives_ok($$select pg_temp.stats()$$,'RPC permite GUARDIAN false/true');
select pg_temp.actor(4);
select is((select count(*) from public.v_group_stats_members where group_id=pg_temp.uid(201)),4::bigint,'multirol respeta toggles false/true');
select is((select can_view_group_stats from public.v_group_detail where id=pg_temp.uid(201)),true,'permiso efectivo multirol false/true');
select lives_ok($$select pg_temp.stats()$$,'RPC permite multirol false/true');

-- Combinación deportistas=true, apoderados=true: consulta en la misma sesión.
select pg_temp.actor(1);
select pg_temp.change('{"athletes_can_view_group_stats":true,"guardians_can_view_group_stats":true}');
select pg_temp.actor(2);
select is((select count(*) from public.v_group_stats_members where group_id=pg_temp.uid(201)),4::bigint,'ATHLETE respeta toggles true/true');
select is((select can_view_group_stats from public.v_group_detail where id=pg_temp.uid(201)),true,'permiso efectivo ATHLETE true/true');
select lives_ok($$select pg_temp.stats()$$,'RPC permite ATHLETE true/true');
select pg_temp.actor(3);
select is((select count(*) from public.v_group_stats_members where group_id=pg_temp.uid(201)),4::bigint,'GUARDIAN respeta toggles true/true');
select is((select can_view_group_stats from public.v_group_detail where id=pg_temp.uid(201)),true,'permiso efectivo GUARDIAN true/true');
select lives_ok($$select pg_temp.stats()$$,'RPC permite GUARDIAN true/true');
select pg_temp.actor(4);
select is((select count(*) from public.v_group_stats_members where group_id=pg_temp.uid(201)),4::bigint,'multirol respeta toggles true/true');
select is((select can_view_group_stats from public.v_group_detail where id=pg_temp.uid(201)),true,'permiso efectivo multirol true/true');
select lives_ok($$select pg_temp.stats()$$,'RPC permite multirol true/true');

select pg_temp.actor(2);
select is((select count(*) from public.v_attendance_own where group_id=pg_temp.uid(201) and note='Nota privada del deportista'),10::bigint,'V1 conserva lo propio');
select lives_ok($$select to_jsonb(v) from public.v_group_stats_members v$$,'lectura directa evalúa todas las columnas con rol authenticated');
select is((select count(*) from public.v_attendance_admin),0::bigint,'V5 no abre detalle ADMIN');
select is((select count(email) from public.users where id=pg_temp.uid(108)),0::bigint,'V5 no expone contacto en tabla base');
select throws_ok($$select pg_temp.change('{"athletes_can_view_group_stats":false}')$$,'PT403','admin_required','ATHLETE no configura toggles');
select is((select settings from public.v_group_detail where id=pg_temp.uid(201)),null::jsonb,'no revela settings al miembro');
select is((select settings_updated_by_name from public.v_group_detail where id=pg_temp.uid(201)),null::text,'no revela autor al miembro');
select is((select count(*) from public.v_group_stats_members where group_id=pg_temp.uid(202)),0::bigint,'toggle de A no habilita B incluso siendo miembro');
select pg_temp.actor(3);
select is((select count(*) from public.v_attendance_own where note='Nota privada del pupilo'),1::bigint,'V2 conserva el pupilo sin revelar terceros');
select throws_ok($$select pg_temp.change('{"guardians_can_view_group_stats":false}')$$,'PT403','admin_required','GUARDIAN no configura');
select pg_temp.actor(5);
select is((select count(*) from public.v_group_stats_members where group_id=pg_temp.uid(201)),0::bigint,'ADMIN de B no lee A');
select throws_ok($$select pg_temp.stats()$$,'PT404','group_not_found','ajeno recibe 404');
select pg_temp.actor(6);
select throws_ok($$select pg_temp.stats()$$,'PT404','group_not_found','inactivo sin acceso');
select pg_temp.actor(7);
select throws_ok($$select pg_temp.stats()$$,'PT404','group_not_found','pendiente sin acceso');
select pg_temp.actor(10);
select throws_ok($$select pg_temp.stats()$$,'PT404','group_not_found','invitado sin acceso');

-- Un cambio parcial conserva el otro toggle y registra al ADMIN autenticado.
select pg_temp.actor(1);
select is(pg_temp.change('{"athletes_can_view_group_stats":false}'),
 '{"athletes_can_view_group_stats":false,"guardians_can_view_group_stats":true}'::jsonb,'PATCH conserva el otro toggle');
select is((select settings_updated_by_name from public.v_group_detail where id=pg_temp.uid(201)),'Persona 1','autor visible al ADMIN');
select isnt((select settings_updated_at from public.v_group_detail where id=pg_temp.uid(201)),null::timestamptz,'fecha registrada');
select pg_temp.actor(2);
select throws_ok($$select pg_temp.stats()$$,'PT403','group_stats_disabled','revocación inmediata sin nueva sesión');
select is((select count(*) from public.v_attendance_own where note='Nota privada del deportista'),10::bigint,'revocación del toggle conserva V1');
reset role;
select is((select settings_updated_by from public.groups where id=pg_temp.uid(201)),pg_temp.uid(101),'autor real no enviado por el cliente');
-- Simula el avance del calendario al cumpleaños, sin depender del job diario.
set local session_replication_role=replica;
update public.users set birthdate=(app_private.chile_today()-interval '18 years')::date where id=pg_temp.uid(108);
set local session_replication_role=origin;
set local role authenticated;
select pg_temp.actor(3);
select throws_ok($$select pg_temp.stats()$$,'PT403','group_stats_disabled','apoderado pierde agregado al cumplir 18 el único pupilo');
reset role;
update public.memberships set status='INACTIVE' where id=pg_temp.uid(301);
set local role authenticated;
select pg_temp.actor(1);
select throws_ok($$select pg_temp.change('{"athletes_can_view_group_stats":true}')$$,'PT404','group_not_found','ADMIN revocado no configura');
reset role;
set local role anon;
select throws_ok($$select full_name from public.v_group_stats_members$$,'42501',null,'anon no lee vista');
reset role;
select * from finish();
rollback;
