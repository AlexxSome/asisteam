begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,raw_user_meta_data)
select ('25000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'guardian25-' || n || '@example.test', jsonb_build_object('full_name','Persona ' || n,'birthdate','1990-01-01')
from generate_series(1,4) n;
update public.users set id = ('25000000-0000-4000-8000-' || lpad((right(auth_user_id::text,12)::int+100)::text,12,'0'))::uuid
where email like 'guardian25-%@example.test';
insert into public.users(id,full_name,birthdate,account_status,email) values
('25000000-0000-4000-8000-000000000111','Menor pendiente',(app_private.chile_today()-interval '15 years')::date,'MANAGED','minor25@example.test'),
('25000000-0000-4000-8000-000000000112','Menor otro grupo',(app_private.chile_today()-interval '16 years')::date,'MANAGED',null),
('25000000-0000-4000-8000-000000000113','Hoy cumple 18',(app_private.chile_today()-interval '18 years')::date,'MANAGED',null);
insert into public.groups(id,name,invite_code,created_by) values
('25000000-0000-4000-8000-000000000201','Club principal','GRD25001','25000000-0000-4000-8000-000000000101'),
('25000000-0000-4000-8000-000000000202','Club ajeno','GRD25002','25000000-0000-4000-8000-000000000104');
insert into public.memberships(user_id,group_id,role,status) values
('25000000-0000-4000-8000-000000000101','25000000-0000-4000-8000-000000000201','ADMIN','ACTIVE'),
('25000000-0000-4000-8000-000000000102','25000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE'),
('25000000-0000-4000-8000-000000000104','25000000-0000-4000-8000-000000000202','ADMIN','ACTIVE'),
('25000000-0000-4000-8000-000000000111','25000000-0000-4000-8000-000000000201','ATHLETE','PENDING'),
('25000000-0000-4000-8000-000000000112','25000000-0000-4000-8000-000000000202','ATHLETE','PENDING'),
('25000000-0000-4000-8000-000000000113','25000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE');
select ok(not has_function_privilege('anon','public.create_guardianship(uuid,uuid,text,text,text)','EXECUTE'),'anon no registra vínculos');
select ok(not has_function_privilege('anon','public.list_guardianship_athletes(uuid,text,integer)','EXECUTE'),'anon no ve selector');
select ok(not has_table_privilege('authenticated','public.guardianships','INSERT'),'sin INSERT directo en guardianships');
select ok(not has_table_privilege('authenticated','public.memberships','INSERT'),'sin INSERT directo en memberships');
select ok((select relrowsecurity from pg_class where oid='public.guardianships'::regclass),'guardianships conserva RLS');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid='public.create_guardianship(uuid,uuid,text,text,text)'::regprocedure),'RPC fija search_path');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.create_guardianship('25000000-0000-4000-8000-000000000201','25000000-0000-4000-8000-000000000111','Tutor','new25@example.test','Padre')$$,'PT401','authentication_required','requiere sesión');
select throws_ok($$select * from public.list_guardianship_athletes('25000000-0000-4000-8000-000000000201')$$,'PT401','authentication_required','selector requiere sesión');
select set_config('request.jwt.claims','{"sub":"25000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select public.create_guardianship('25000000-0000-4000-8000-000000000201','25000000-0000-4000-8000-000000000111','Tutor','new25@example.test','Padre')$$,'PT404','group_not_found','ADMIN de otro grupo no vincula');
select throws_ok($$select * from public.list_guardianship_athletes('25000000-0000-4000-8000-000000000201')$$,'PT404','group_not_found','V6 selector no enumera otros grupos');
select set_config('request.jwt.claims','{"sub":"25000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.create_guardianship('25000000-0000-4000-8000-000000000201','25000000-0000-4000-8000-000000000111','Tutor','new25@example.test','Padre')$$,'PT403','admin_required','ATHLETE no vincula');
select throws_ok($$select * from public.list_guardianship_athletes('25000000-0000-4000-8000-000000000201')$$,'PT403','admin_required','V5 ATHLETE no lee selector');
select set_config('request.jwt.claims','{"sub":"25000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from public.list_guardianship_athletes('25000000-0000-4000-8000-000000000201')),1::bigint,'selector incluye solo menores del grupo');
select is((select count(*) from public.list_guardianship_athletes('25000000-0000-4000-8000-000000000201','PENDIENTE')),1::bigint,'busca nombre sin distinguir mayúsculas');
select ok((select to_jsonb(a) - array['user_id','full_name','total_count']='{}'::jsonb from public.list_guardianship_athletes('25000000-0000-4000-8000-000000000201') a),'selector proyecta solo ID/nombre/conteo');
select throws_ok($$select public.create_guardianship('25000000-0000-4000-8000-000000000201','25000000-0000-4000-8000-000000000112','Tutor','new25@example.test','Padre')$$,'PT404','athlete_not_found','no usa pupilo de otro grupo');
select throws_ok($$select public.create_guardianship('25000000-0000-4000-8000-000000000201',gen_random_uuid(),'Tutor','new25@example.test','Padre')$$,'PT404','athlete_not_found','pupilo inexistente responde igual');
select throws_ok($$select public.create_guardianship('25000000-0000-4000-8000-000000000201','25000000-0000-4000-8000-000000000113','Tutor','rollback25@example.test','Padre')$$,'PT422','guardian_only_for_minor','rechaza desde cumpleaños 18 en Chile');
select throws_ok($$select public.create_guardianship('25000000-0000-4000-8000-000000000201','25000000-0000-4000-8000-000000000111','Tutor','minor25@example.test','Padre')$$,'PT422','invalid_guardian','rechaza auto-vínculo');
select throws_ok($$select public.create_guardianship('25000000-0000-4000-8000-000000000201','25000000-0000-4000-8000-000000000111','Tutor','bad-email','Padre')$$,'PT400','invalid_guardianship','valida email en BD');
select throws_ok($$select public.create_guardianship('25000000-0000-4000-8000-000000000201','25000000-0000-4000-8000-000000000111','Tutor','new25@example.test',' ')$$,'PT400','invalid_guardianship','valida relationship en BD');
select set_config('test.guardianship',public.create_guardianship('25000000-0000-4000-8000-000000000201','25000000-0000-4000-8000-000000000111',' Nueva tutora ',' NEW25@Example.test ',' Madre ')::text,true);
select throws_ok($$select public.create_guardianship('25000000-0000-4000-8000-000000000201','25000000-0000-4000-8000-000000000111','No sobrescribir','new25@example.test','Tutor')$$,'PT409','guardianship_already_exists','informa duplicado');
select lives_ok($$select public.create_guardianship('25000000-0000-4000-8000-000000000201','25000000-0000-4000-8000-000000000111','No sobrescribir','guardian25-3@example.test','Padre')$$,'reutiliza cuenta existente');
reset role;
select is((select count(*) from public.users where email='rollback25@example.test'),0::bigint,'rechazo revierte perfil nuevo');
select is((select count(*) from auth.users where email='new25@example.test'),0::bigint,'registro no crea credenciales');
select ok((select account_status='INVITED' and auth_user_id is null and full_name='Nueva tutora' from public.users where email='new25@example.test'),'cuenta nueva INVITED con nombre normalizado');
select is((select full_name from public.users where email='guardian25-3@example.test'),'Persona 3','no sobrescribe perfil existente');
select is((select relationship from public.guardianships where id=current_setting('test.guardianship')::uuid),'Madre','normaliza relación');
select is((select count(*) from public.guardianships g join public.users u on u.id=g.guardian_user_id where u.email='new25@example.test'),1::bigint,'duplicado no crea otra fila');
select is((select count(*) from public.memberships m join public.users u on u.id=m.user_id where u.email in ('new25@example.test','guardian25-3@example.test') and m.group_id='25000000-0000-4000-8000-000000000201' and m.role='GUARDIAN' and m.status='ACTIVE'),2::bigint,'crea membership GUARDIAN por registro directo ADMIN');
select is((select status from public.memberships where user_id='25000000-0000-4000-8000-000000000111'),'PENDING','vínculo no activa al menor');
select is((select count(*) from public.consents where guardianship_id=current_setting('test.guardianship')::uuid),0::bigint,'vínculo no fabrica consentimiento');
select throws_ok($$update public.memberships set status='ACTIVE' where user_id='25000000-0000-4000-8000-000000000111'$$,'23514','minor_requires_guardian_consent','R1 protege activación sin consentimiento');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"25000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select * from public.list_guardianship_athletes('25000000-0000-4000-8000-000000000201')$$,'PT403','admin_required','V5 GUARDIAN no lee selector de terceros');
select throws_ok($$select public.create_guardianship('25000000-0000-4000-8000-000000000201','25000000-0000-4000-8000-000000000111','Tutor','more25@example.test','Tutor')$$,'PT403','admin_required','GUARDIAN no registra otros apoderados');
reset role;

-- Activa fixture con evidencia; el siguiente vínculo debe sincronizar ambos grupos.
insert into public.consents(guardianship_id,consent_type,terms_version) values(current_setting('test.guardianship')::uuid,'DATA_PROCESSING_MINOR','test');
update public.memberships set status='ACTIVE' where user_id='25000000-0000-4000-8000-000000000111';
insert into public.memberships(user_id,group_id,role,status) values('25000000-0000-4000-8000-000000000111','25000000-0000-4000-8000-000000000202','ATHLETE','ACTIVE');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"25000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.create_guardianship('25000000-0000-4000-8000-000000000201','25000000-0000-4000-8000-000000000111','Tutor global','global25@example.test','Tutor')$$,'vincula pupilo activo multi-grupo');
reset role;
select is((select count(*) from public.memberships m join public.users u on u.id=m.user_id where u.email='global25@example.test' and m.role='GUARDIAN' and m.status='ACTIVE'),2::bigint,'CB-02: GUARDIAN en ambos grupos del pupilo');

-- La capacidad del otro grupo también se verifica y aborta toda la operación.
with profiles as (
  insert into public.users(full_name,birthdate,account_status)
  select 'Capacidad sintética','1990-01-01','MANAGED' from generate_series(1,500-(select count(*)::int from public.memberships where group_id='25000000-0000-4000-8000-000000000202' and status='ACTIVE')) returning id
) insert into public.memberships(user_id,group_id,role,status) select id,'25000000-0000-4000-8000-000000000202','ATHLETE','ACTIVE' from profiles;
set local role authenticated;
select throws_ok($$select public.create_guardianship('25000000-0000-4000-8000-000000000201','25000000-0000-4000-8000-000000000111','Sin cupo','capacity25@example.test','Tutor')$$,'PT422','group_member_limit','no supera capacidad de otro grupo del pupilo');
reset role;
select is((select count(*) from public.users where email='capacity25@example.test'),0::bigint,'capacidad revierte perfil y vínculo completos');

-- Paginación real: no excluye silenciosamente al deportista número 51.
with profiles as (
 insert into public.users(full_name,birthdate,account_status)
 select 'Menor página '||lpad(n::text,3,'0'),(app_private.chile_today()-interval '14 years')::date,'MANAGED' from generate_series(1,51) n returning id
) insert into public.memberships(user_id,group_id,role,status) select id,'25000000-0000-4000-8000-000000000201','ATHLETE','PENDING' from profiles;
set local role authenticated;
select is((select count(*) from public.list_guardianship_athletes('25000000-0000-4000-8000-000000000201','Menor página')),50::bigint,'selector limita a 50');
select is((select full_name from public.list_guardianship_athletes('25000000-0000-4000-8000-000000000201','Menor página',50)),'Menor página 051','segunda página accesible');
select is((select total_count from public.list_guardianship_athletes('25000000-0000-4000-8000-000000000201','Menor página',50)),51::bigint,'total de resultados para navegar');
select * from finish();
rollback;
