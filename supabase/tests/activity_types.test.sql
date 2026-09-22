begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data)
select ('29000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'activity-types-' || n || '@example.test', '{"full_name":"Persona sintética","birthdate":"1990-01-01"}'::jsonb
from generate_series(1,6) n;
update public.users set id=('29000000-0000-4000-8000-' || lpad((right(auth_user_id::text,12)::int+100)::text,12,'0'))::uuid
where email like 'activity-types-%@example.test';
insert into public.groups(id,name,invite_code,created_by)
select ('29000000-0000-4000-8000-' || lpad((n+200)::text,12,'0'))::uuid,
  'Grupo tipos ' || n,'TYPES00' || n,'29000000-0000-4000-8000-000000000101'
from generate_series(1,3) n;
insert into public.memberships(user_id,group_id,role,status) values
('29000000-0000-4000-8000-000000000101','29000000-0000-4000-8000-000000000201','ADMIN','ACTIVE'),
('29000000-0000-4000-8000-000000000101','29000000-0000-4000-8000-000000000202','ADMIN','ACTIVE'),
('29000000-0000-4000-8000-000000000102','29000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE'),
('29000000-0000-4000-8000-000000000103','29000000-0000-4000-8000-000000000201','GUARDIAN','ACTIVE'),
('29000000-0000-4000-8000-000000000104','29000000-0000-4000-8000-000000000203','ADMIN','ACTIVE'),
('29000000-0000-4000-8000-000000000105','29000000-0000-4000-8000-000000000201','ADMIN','INACTIVE'),
('29000000-0000-4000-8000-000000000106','29000000-0000-4000-8000-000000000201','ATHLETE','PENDING');

select ok((select relrowsecurity from pg_class where oid='public.activity_types'::regclass),'RLS sigue activa');
select ok(not has_column_privilege('authenticated','public.activity_types','id','INSERT'),'cliente no elige UUID');
select ok(not has_column_privilege('authenticated','public.activity_types','group_id','UPDATE'),'grupo inmutable incluso siendo ADMIN de ambos');
select ok(not has_column_privilege('authenticated','public.activity_types','id','UPDATE'),'identidad inmutable');
select ok(not has_table_privilege('authenticated','public.activity_types','DELETE'),'borrado físico no concedido');
select ok(not has_table_privilege('authenticated','public.v_activity_types','UPDATE'),'vista de lectura no permite escrituras');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"29000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$insert into public.activity_types(group_id,name,color) values('29000000-0000-4000-8000-000000000201','  Amistoso  ','#123abc')$$,'ADMIN crea tipo por columnas concedidas');
select set_config('test.type_id',(select id::text from public.activity_types where name='Amistoso'),true);
select is((select count(*) from public.v_activity_types where is_active and group_id='29000000-0000-4000-8000-000000000201'),1::bigint,'tipo disponible para selector de grupo');
select throws_ok($$insert into public.activity_types(group_id,name,color) values('29000000-0000-4000-8000-000000000201',' AMISTOSO ','#123ABC')$$,'23505',null,'unicidad ignora mayúsculas y espacios externos');
select lives_ok($$insert into public.activity_types(group_id,name,color) values('29000000-0000-4000-8000-000000000202','Amistoso','#123ABC')$$,'mismo nombre permitido en otro grupo');
select throws_ok($$insert into public.activity_types(group_id,name,color) values('29000000-0000-4000-8000-000000000203','Ajeno','#123ABC')$$,'42501',null,'ADMIN de A no crea tipos de C');
select throws_ok($$insert into public.activity_types(group_id,name,color) values('29000000-0000-4000-8000-000000000201',' ','#123ABC')$$,'23514',null,'nombre vacío rechazado en DB');
select throws_ok($$insert into public.activity_types(group_id,name,color) values('29000000-0000-4000-8000-000000000201',repeat('x',41),'#123ABC')$$,'23514',null,'límite de nombre en DB');
select throws_ok($$insert into public.activity_types(group_id,name,color) values('29000000-0000-4000-8000-000000000201','Color inválido','red')$$,'23514',null,'color no hex rechazado en DB');
select throws_ok($$insert into public.activity_types(group_id,name,color) values(null,'Sistema falso','#123ABC')$$,'23514','system_activity_type_immutable','no se agregan tipos de sistema');
with changed as (update public.activity_types set name='Ataque',color='#000000',is_active=false where group_id is null returning id)
select is((select count(*) from changed),0::bigint,'ADMIN no edita ni desactiva sistemas');
select throws_ok($$update public.activity_types set group_id='29000000-0000-4000-8000-000000000202' where id=current_setting('test.type_id')::uuid$$,'42501',null,'no se traslada tipo a otro grupo propio');
select throws_ok($$delete from public.activity_types where id=current_setting('test.type_id')::uuid$$,'42501',null,'no se elimina tipo');
select set_config('test.activity_id',public.create_activity('29000000-0000-4000-8000-000000000201',current_setting('test.type_id')::uuid,'Actividad histórica','2026-07-07T22:30Z','2026-07-08T00:00Z')::text,true);
reset role;
insert into public.attendance_records(activity_id,membership_id,status,recorded_by)
select current_setting('test.activity_id')::uuid,id,'PRESENT','29000000-0000-4000-8000-000000000101'
from public.memberships where user_id='29000000-0000-4000-8000-000000000102';
set local role authenticated;
with changed as (update public.activity_types set name='Amistoso actualizado',color='#ABCDEF',is_active=false where id=current_setting('test.type_id')::uuid returning id)
select is((select count(*) from changed),1::bigint,'ADMIN edita y desactiva tipo en uso');
select is((select count(*) from public.v_activity_types where id=current_setting('test.type_id')::uuid and is_active),0::bigint,'selector activo excluye desactivado');
select is((select activity_type_name from public.v_group_activities where id=current_setting('test.activity_id')::uuid),'Amistoso actualizado','histórico conserva referencia y nombre');
select is((select activity_type_color from public.v_group_activities where id=current_setting('test.activity_id')::uuid),'#ABCDEF','histórico conserva color');
select is((select count(*) from public.v_attendance_admin where activity_id=current_setting('test.activity_id')::uuid),1::bigint,'asistencia permanece intacta');
select throws_ok($$select public.create_activity('29000000-0000-4000-8000-000000000201',current_setting('test.type_id')::uuid,'Nueva actividad','2026-07-07T22:30Z','2026-07-08T00:00Z')$$,'PT422','invalid_activity_type','RPC rechaza tipo recién desactivado');
select lives_ok($$select public.update_activity('29000000-0000-4000-8000-000000000201',current_setting('test.activity_id')::uuid,current_setting('test.type_id')::uuid,'Histórica editada','2026-07-07T22:30Z','2026-07-08T00:00Z')$$,'editar actividad existente conserva tipo desactivado');
select throws_ok($$insert into public.activity_types(group_id,name,color) values('29000000-0000-4000-8000-000000000201','Amistoso actualizado','#123ABC')$$,'23505',null,'nombre desactivado sigue reservado');

-- Cada rol no autorizado intenta escritura directamente, sin pasar por la UI.
select set_config('request.jwt.claims','{"sub":"29000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$insert into public.activity_types(group_id,name,color) values('29000000-0000-4000-8000-000000000201','Ataque','#123ABC')$$,'42501',null,'ATHLETE no crea');
with changed as (update public.activity_types set is_active=true where id=current_setting('test.type_id')::uuid returning id)
select is((select count(*) from changed),0::bigint,'ATHLETE no reactiva ni edita');
select is((select count(*) from public.v_activity_types where id=current_setting('test.type_id')::uuid),1::bigint,'miembro aún lee tipo histórico desactivado');
select set_config('request.jwt.claims','{"sub":"29000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$insert into public.activity_types(group_id,name,color) values('29000000-0000-4000-8000-000000000201','Ataque','#123ABC')$$,'42501',null,'GUARDIAN no crea');
with changed as (update public.activity_types set is_active=true where id=current_setting('test.type_id')::uuid returning id)
select is((select count(*) from changed),0::bigint,'GUARDIAN no edita');
select set_config('request.jwt.claims','{"sub":"29000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*) from public.activity_types where group_id='29000000-0000-4000-8000-000000000201'),0::bigint,'tabla base no revela tipos ajenos');
with changed as (update public.activity_types set name='Ataque' where id=current_setting('test.type_id')::uuid returning id)
select is((select count(*) from changed),0::bigint,'ADMIN ajeno no edita');
select set_config('request.jwt.claims','{"sub":"29000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select throws_ok($$insert into public.activity_types(group_id,name,color) values('29000000-0000-4000-8000-000000000201','Ataque','#123ABC')$$,'42501',null,'ADMIN INACTIVE no crea');
with changed as (update public.activity_types set is_active=true where id=current_setting('test.type_id')::uuid returning id)
select is((select count(*) from changed),0::bigint,'ADMIN INACTIVE no edita');
select set_config('request.jwt.claims','{"sub":"29000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select throws_ok($$insert into public.activity_types(group_id,name,color) values('29000000-0000-4000-8000-000000000201','Ataque','#123ABC')$$,'42501',null,'PENDING no crea');
with changed as (update public.activity_types set is_active=true where id=current_setting('test.type_id')::uuid returning id)
select is((select count(*) from changed),0::bigint,'PENDING no edita');
reset role;
set local role anon;
select throws_ok($$select id from public.activity_types$$,'42501',null,'anon no lee');
select throws_ok($$insert into public.activity_types(group_id,name,color) values('29000000-0000-4000-8000-000000000201','Ataque','#123ABC')$$,'42501',null,'anon no crea');
reset role;
select is((select count(*) from public.activity_types where group_id is null and is_active),4::bigint,'los cuatro tipos de sistema permanecen activos');
select * from finish();
rollback;
