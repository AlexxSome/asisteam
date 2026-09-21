begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, email, raw_user_meta_data)
select ('21000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'configure-groups-' || n || '@example.test',
       '{"full_name":"Persona de prueba","birthdate":"1990-01-01"}'::jsonb
from generate_series(1,4) n;
update public.users set id = ('21000000-0000-4000-8000-' || lpad((right(auth_user_id::text, 12)::int + 100)::text,12,'0'))::uuid
where email like 'configure-groups-%@example.test';
insert into public.groups(id, name, sport, invite_code, created_by) values
('21000000-0000-4000-8000-000000000201','Equipo Uno','Tenis','CONFIG01','21000000-0000-4000-8000-000000000101'),
('21000000-0000-4000-8000-000000000202','Equipo Dos','Fútbol','CONFIG02','21000000-0000-4000-8000-000000000103');
insert into public.memberships(user_id, group_id, role, status) values
('21000000-0000-4000-8000-000000000101','21000000-0000-4000-8000-000000000201','ADMIN','ACTIVE'),
('21000000-0000-4000-8000-000000000102','21000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE'),
('21000000-0000-4000-8000-000000000103','21000000-0000-4000-8000-000000000202','ADMIN','ACTIVE');

select ok((select relrowsecurity from pg_class where oid = 'public.groups'::regclass), 'RLS permanece activa');
select ok(has_column_privilege('authenticated', 'public.groups', 'name', 'UPDATE'), 'ADMIN puede editar columnas públicas');
select ok(not has_column_privilege('authenticated', 'public.groups', 'invite_code', 'UPDATE'), 'cliente no puede elegir código');
select ok(not has_column_privilege('authenticated', 'public.groups', 'settings', 'UPDATE'), 'cliente no puede cambiar toggles con PATCH');
select ok(not has_column_privilege('authenticated', 'public.groups', 'invite_code', 'SELECT'), 'tabla base no revela códigos');
select ok(not has_function_privilege('anon','public.rotate_invite_code(uuid)','EXECUTE'), 'anon no puede rotar');

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.rotate_invite_code('21000000-0000-4000-8000-000000000201')$$,
  'PT401','authentication_required','RPC exige identidad');
select set_config('request.jwt.claims','{"sub":"21000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from public.groups), 1::bigint, 'SELECT id solo ve grupos propios');
select throws_ok($$select invite_code from public.groups$$,'42501',null,'ni ADMIN lee código directamente de tabla base');
select throws_ok($$update public.groups set invite_code='ATAQUE01' where id='21000000-0000-4000-8000-000000000201'$$,
  '42501',null,'código no se cambia con PATCH');
select throws_ok($$update public.groups set settings='{}' where id='21000000-0000-4000-8000-000000000201'$$,
  '42501',null,'toggles no se cambian con PATCH');
select throws_ok($$update public.groups set sport='x' where id='21000000-0000-4000-8000-000000000201'$$,
  '23514',null,'la base impide deportes demasiado cortos');
select throws_ok($$update public.groups set logo_url='javascript:alert(1)' where id='21000000-0000-4000-8000-000000000201'$$,
  '23514',null,'la base impide logos que no sean HTTP/HTTPS');
with updated as (update public.groups set name='Club Editado', sport='Natación',
  description='Nueva descripción', logo_url='https://example.test/logo.png'
  where id='21000000-0000-4000-8000-000000000201' returning id)
select is((select count(*) from updated), 1::bigint, 'ADMIN actualiza los cuatro campos por PostgREST/RLS');
select is((select name from public.v_group_detail where id='21000000-0000-4000-8000-000000000201'),
  'Club Editado','ADMIN ve el nombre nuevo');
with updated as (update public.groups set name='Ataque'
  where id='21000000-0000-4000-8000-000000000202' returning id)
select is((select count(*) from updated), 0::bigint, 'ADMIN de A no edita grupo B');
select set_config('test.old_code',(select invite_code from public.v_group_detail where id='21000000-0000-4000-8000-000000000201'),true);
select set_config('test.new_code',public.rotate_invite_code('21000000-0000-4000-8000-000000000201'),true);
select matches(current_setting('test.new_code'),'^[A-Za-z0-9]{8}$','nuevo código tiene formato canónico');
select isnt(current_setting('test.new_code'),current_setting('test.old_code'),'rotación cambia código');
select is((select invite_code from public.v_group_detail where id='21000000-0000-4000-8000-000000000201'),
  current_setting('test.new_code'),'ADMIN ve nuevo código de inmediato');

select set_config('request.jwt.claims','{"sub":"21000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select name from public.v_group_detail),'Club Editado','ATHLETE ve cambios del grupo');
select is((select sport from public.v_group_detail),'Natación','ATHLETE ve deporte nuevo');
select is((select description from public.v_group_detail),'Nueva descripción','ATHLETE ve descripción nueva');
select is((select logo_url from public.v_group_detail),'https://example.test/logo.png','ATHLETE ve logo nuevo');
select is((select invite_code from public.v_group_detail),null::text,'ATHLETE no ve código nuevo');
select throws_ok($$update public.groups set name='Ataque'
  where id='21000000-0000-4000-8000-000000000201'$$,
  '42501',null,'ATHLETE recibe 403 al modificar grupo por PostgREST');
select throws_ok($$select public.rotate_invite_code('21000000-0000-4000-8000-000000000201')$$,
  'PT403','admin_required','ATHLETE recibe 403 en endpoint de rotación');

select set_config('request.jwt.claims','{"sub":"21000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select public.rotate_invite_code('21000000-0000-4000-8000-000000000201')$$,
  'PT404','group_not_found','ajeno recibe 404 sin enumerar grupo');
select is((select count(*) from public.v_group_detail),0::bigint,'ajeno no ve detalle');

reset role;
select is((select count(*) from public.groups where invite_code=current_setting('test.old_code')),0::bigint,
  'código anterior deja de identificar grupo inmediatamente');
select is((select id from public.groups where invite_code=current_setting('test.new_code')),
  '21000000-0000-4000-8000-000000000201'::uuid,'nuevo código identifica grupo');
select is((select name from public.groups where id='21000000-0000-4000-8000-000000000202'),
  'Equipo Dos','aislamiento entre grupos conserva datos');
select * from finish();
rollback;
