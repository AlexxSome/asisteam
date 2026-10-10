begin;
\i packages/db/fixtures/domain.sql

select no_plan();
create function pg_temp.id(n int) returns uuid language sql immutable as $$
  select ('11100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n int) returns text language sql as $$
  select set_config('request.jwt.claims',((jsonb_build_object('role','asisteam_member','sub',pg_temp.id(n))::text)::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true)
$$;
insert into pg_temp.fixture_accounts(id,email,profile_data)
select pg_temp.id(n),'roster111-'||n||'@example.test',jsonb_build_object('full_name','Cuenta '||n,'birthdate','1990-01-01') from generate_series(1,5) n;
update public.users set id=pg_temp.id(right(auth_user_id::text,12)::int+100) where email like 'roster111-%@example.test';
insert into public.groups(id,name,invite_code,created_by) values
(pg_temp.id(201),'Grupo nómina','R1110001',pg_temp.id(101)),
(pg_temp.id(202),'Otro grupo','R1110002',pg_temp.id(105));
insert into app_private.billing_legacy_groups(group_id) values(pg_temp.id(201)),(pg_temp.id(202));
insert into public.memberships(user_id,group_id,role,status) values
(pg_temp.id(101),pg_temp.id(201),'ADMIN','ACTIVE'),
(pg_temp.id(101),pg_temp.id(201),'ATHLETE','ACTIVE'),
(pg_temp.id(102),pg_temp.id(201),'ATHLETE','ACTIVE'),
(pg_temp.id(103),pg_temp.id(201),'GUARDIAN','ACTIVE'),
(pg_temp.id(104),pg_temp.id(201),'COACH','ACTIVE'),
(pg_temp.id(105),pg_temp.id(202),'ADMIN','ACTIVE'),
(pg_temp.id(101),pg_temp.id(202),'COACH','ACTIVE');
with profiles as (
  insert into public.users(full_name,birthdate,account_status)
  select 'Persona '||lpad(n::text,3,'0'),'1990-01-01','MANAGED' from generate_series(1,105) n returning id
) insert into public.memberships(user_id,group_id,role,status) select id,pg_temp.id(201),'ATHLETE','ACTIVE' from profiles;
insert into public.users(id,full_name,birthdate,account_status) values
(pg_temp.id(120),'Zeta remota','1990-01-01','MANAGED'),
(pg_temp.id(121),'Nombre %_ literal','1990-01-01','MANAGED'),
(pg_temp.id(122),'Zeta ajena','1990-01-01','MANAGED'),
(pg_temp.id(123),'Cuenta 1','1990-01-01','MANAGED');
insert into public.memberships(user_id,group_id,role,status) values
(pg_temp.id(120),pg_temp.id(201),'ATHLETE','INACTIVE'),
(pg_temp.id(121),pg_temp.id(201),'ATHLETE','PENDING'),
(pg_temp.id(122),pg_temp.id(202),'ATHLETE','ACTIVE'),
(pg_temp.id(123),pg_temp.id(201),'ATHLETE','ACTIVE');
select ok(not pg_temp.can_execute('asisteam_test_anonymous','public.list_group_members(uuid,text,text,integer,text)','EXECUTE'),'anon no ejecuta búsqueda privada');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='public.list_group_members(uuid,text,text,integer,text)'::regprocedure),'definer con search_path fijo');
set local role asisteam_api;
select set_config('request.jwt.claims',(('{"role":"authenticated","auth_provider":"nest"}')::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select throws_ok($$select public.list_group_members(pg_temp.id(201),p_search=>'Persona')$$,'PT401','authentication_required','sesión requerida también al buscar');
select pg_temp.login(2);
select throws_ok($$select public.list_group_members(pg_temp.id(201),p_search=>'Cuenta')$$,'PT403','admin_required','ATHLETE no accede a PII por búsqueda');
select pg_temp.login(3);
select throws_ok($$select public.list_group_members(pg_temp.id(201),p_search=>'Cuenta')$$,'PT403','admin_required','GUARDIAN no accede a PII por búsqueda');
select pg_temp.login(4);
select throws_ok($$select public.list_group_members(pg_temp.id(201),p_search=>'Cuenta')$$,'PT403','admin_required','COACH no accede a PII por búsqueda');
select pg_temp.login(5);
select throws_ok($$select public.list_group_members(pg_temp.id(201),p_search=>'Cuenta')$$,'PT404','group_not_found','ADMIN ajeno no enumera grupo');
select pg_temp.login(1);
select is((select count(*) from public.list_group_members(pg_temp.id(201),p_search=>'  pErSoNa  ')),50::bigint,'búsqueda normaliza espacios y mayúsculas; página de 50');
select is((select min(total_count) from public.list_group_members(pg_temp.id(201),p_search=>'Persona')),105::bigint,'total se calcula antes del límite');
select is((select count(*) from public.list_group_members(pg_temp.id(201),p_offset=>100,p_search=>'Persona')),5::bigint,'página final busca en conjunto completo');
select is((select full_name from public.list_group_members(pg_temp.id(201),p_search=>'Zeta')),'Zeta remota','encuentra nombre fuera de primera página sin cruzar grupos');
select is((select count(*) from public.list_group_members(pg_temp.id(201),p_role=>'ATHLETE',p_status=>'INACTIVE',p_search=>'Zeta')),1::bigint,'combina nombre, rol y estado');
select is((select count(*) from public.list_group_members(pg_temp.id(201),p_status=>'ACTIVE',p_search=>'Zeta')),0::bigint,'estado se respeta al buscar');
select is((select count(*) from public.list_group_members(pg_temp.id(201),p_search=>'%_')),1::bigint,'comodines se interpretan literalmente');
select is((select count(*) from public.list_group_members(pg_temp.id(201),p_search=>'No existe')),0::bigint,'sin coincidencias devuelve conjunto vacío');
select is((select count(*) from public.list_group_members(pg_temp.id(201),p_offset=>1000,p_search=>'Persona')),0::bigint,'fuera de rango no devuelve filas ajenas');
select throws_ok($$select public.list_group_members(pg_temp.id(201),p_search=>repeat('a',121))$$,'PT400','invalid_member_filters','limita tamaño de búsqueda');
select is((select count(distinct user_id) from public.list_group_members(pg_temp.id(201),p_search=>'Cuenta 1')),2::bigint,'nombres iguales no fusionan personas');
select is((select count(*) from public.list_group_members(pg_temp.id(201),p_search=>'Cuenta 1') where user_id=pg_temp.id(101)),2::bigint,'multirol conserva dos memberships');
select is((select person_roles from public.list_group_members(pg_temp.id(201),p_role=>'ADMIN',p_search=>'Cuenta 1')),
  '[{"role":"ADMIN","status":"ACTIVE"},{"role":"ATHLETE","status":"ACTIVE"}]'::jsonb,'otros roles incluyen los filtrados pero nunca los de otro grupo');
select ok((select is_last_admin from public.list_group_members(pg_temp.id(201),p_role=>'ADMIN',p_search=>'Cuenta 1')),'señala último ADMIN activo');
select ok((select not bool_or(is_last_admin) from public.list_group_members(pg_temp.id(201),p_role=>'ATHLETE')),'la membership ATHLETE del ADMIN no se bloquea');
reset role;
insert into public.memberships(user_id,group_id,role,status) values(pg_temp.id(105),pg_temp.id(201),'ADMIN','INACTIVE');
set local role asisteam_api;
select ok((select is_last_admin from public.list_group_members(pg_temp.id(201),p_role=>'ADMIN',p_status=>'ACTIVE')),'un ADMIN inactivo no elimina bloqueo');
reset role;
update public.memberships set status='ACTIVE' where user_id=pg_temp.id(105) and group_id=pg_temp.id(201) and role='ADMIN';
set local role asisteam_api;
select ok((select not is_last_admin from public.list_group_members(pg_temp.id(201),p_role=>'ADMIN',p_search=>'Cuenta 1')),'otro ADMIN fuera de búsqueda elimina señal de último ADMIN');
select * from finish();
rollback;
