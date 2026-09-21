begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, email, raw_user_meta_data)
select ('17000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'groups-' || n || '@example.test', '{"full_name":"Persona de prueba","birthdate":"1990-01-01"}'::jsonb
from generate_series(1,4) n;
-- Identidades desacopladas: auth.uid() no es public.users.id.
update public.users set id = ('17000000-0000-4000-8000-' || lpad((right(auth_user_id::text, 12)::int + 100)::text,12,'0'))::uuid
where email like 'groups-%@example.test';
insert into public.groups(id, name, invite_code, created_by)
select ('17000000-0000-4000-8000-' || lpad((n+200)::text,12,'0'))::uuid,
       'Equipo ' || n, 'MULTI00' || n, '17000000-0000-4000-8000-000000000102'
from generate_series(1,6) n;
insert into public.memberships(user_id, group_id, role, status) values
('17000000-0000-4000-8000-000000000101','17000000-0000-4000-8000-000000000201','ADMIN','ACTIVE'),
('17000000-0000-4000-8000-000000000101','17000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE'),
('17000000-0000-4000-8000-000000000101','17000000-0000-4000-8000-000000000202','ATHLETE','ACTIVE'),
('17000000-0000-4000-8000-000000000101','17000000-0000-4000-8000-000000000202','ADMIN','INACTIVE'),
('17000000-0000-4000-8000-000000000101','17000000-0000-4000-8000-000000000203','ATHLETE','PENDING'),
('17000000-0000-4000-8000-000000000101','17000000-0000-4000-8000-000000000204','ATHLETE','INVITED'),
('17000000-0000-4000-8000-000000000101','17000000-0000-4000-8000-000000000205','ATHLETE','INACTIVE'),
('17000000-0000-4000-8000-000000000102','17000000-0000-4000-8000-000000000206','ADMIN','ACTIVE'),
('17000000-0000-4000-8000-000000000103','17000000-0000-4000-8000-000000000202','GUARDIAN','ACTIVE');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select results_eq($$select id from public.v_my_groups order by id$$,
  $$select id from (values('17000000-0000-4000-8000-000000000201'::uuid),('17000000-0000-4000-8000-000000000202'::uuid)) expected(id)$$,
  'solo grupos ACTIVE, sin duplicados por multi-rol');
select is((select roles from public.v_my_groups where name='Equipo 1'),array['ADMIN','ATHLETE'],'conserva ambos roles propios');
select is((select roles from public.v_my_groups where name='Equipo 2'),array['ATHLETE'],'un ADMIN INACTIVE no aporta permisos');
select is((select count(*) from public.v_group_detail),2::bigint,'detalle se limita a los mismos grupos');
select is((select invite_code from public.v_group_detail where name='Equipo 1'),'MULTI001','ADMIN accede al código de su grupo');
select isnt((select settings from public.v_group_detail where name='Equipo 1'),null::jsonb,'ADMIN accede a settings');
select is((select invite_code from public.v_group_detail where name='Equipo 2'),null::text,'ser ADMIN de A no revela el código de B');
select is((select settings from public.v_group_detail where name='Equipo 2'),null::jsonb,'ATHLETE no recibe settings aunque sea ADMIN en A');
select is((select count(*) from public.v_group_detail where id='17000000-0000-4000-8000-000000000206'),0::bigint,'V6: grupo ajeno no visible por ID directo');
select is((select count(*) from public.v_group_detail where id='17000000-0000-4000-8000-000000000999'),0::bigint,'ID inexistente produce la misma ausencia');
select is((select count(*) from public.v_group_detail where id in ('17000000-0000-4000-8000-000000000203','17000000-0000-4000-8000-000000000204','17000000-0000-4000-8000-000000000205')),0::bigint,'PENDING/INVITED/INACTIVE no acceden a detalles');
select throws_ok($$select invite_code from public.groups$$,'42501',null,'tabla base no permite saltar la proyección');
select is((select count(*) from public.users),1::bigint,'V5: vistas no abren perfiles de terceros');
select ok(not has_table_privilege('authenticated', 'public.v_group_detail', 'UPDATE'), 'vista no concede privilegio UPDATE');
select throws_ok($$update public.v_group_detail set name='Ataque'$$,'55000',null,'vista no permite escritura');
select throws_ok($$update public.memberships set role='ADMIN'$$,'42501',null,'cliente no puede elevar roles');

select set_config('request.jwt.claims','{"sub":"17000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select roles from public.v_my_groups),array['GUARDIAN'],'GUARDIAN solo recibe su rol, no el de otros miembros');
select is((select invite_code from public.v_group_detail),null::text,'GUARDIAN no recibe código');
select is((select settings from public.v_group_detail),null::jsonb,'GUARDIAN no recibe settings');
select set_config('request.jwt.claims','{"sub":"17000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*) from public.v_my_groups),0::bigint,'cuenta sin membresías obtiene lista vacía');
select is((select count(*) from public.v_group_detail),0::bigint,'cuenta sin membresías no obtiene detalle');

reset role;
update public.memberships set status='INACTIVE'
where user_id='17000000-0000-4000-8000-000000000101' and role='ADMIN';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select roles from public.v_my_groups where name='Equipo 1'),array['ATHLETE'],'revocar ADMIN actualiza roles inmediatamente');
select is((select invite_code from public.v_group_detail where name='Equipo 1'),null::text,'revocar ADMIN oculta código inmediatamente');
reset role;
update public.memberships set status='INACTIVE'
where user_id='17000000-0000-4000-8000-000000000101' and group_id='17000000-0000-4000-8000-000000000201';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"17000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from public.v_group_detail where name='Equipo 1'),0::bigint,'revocar última membresía retira el grupo');
select is((select count(*) from public.v_my_groups),1::bigint,'revocación no afecta al otro grupo');

reset role;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select id from public.v_my_groups$$,'42501',null,'anon no enumera grupos');
select throws_ok($$select id from public.v_group_detail$$,'42501',null,'anon no accede al detalle');
reset role;
select * from finish();
rollback;
