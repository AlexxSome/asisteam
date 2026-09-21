begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data)
select ('23000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'send-existing-'||n||'@example.test', '{"full_name":"Cuenta existente","birthdate":"1990-01-01"}'::jsonb
from generate_series(1,5) n;
update public.users set id=auth_user_id where email like 'send-existing-%@example.test';
insert into public.groups(id,name,invite_code,created_by)
select ('23000000-0000-4000-8000-'||lpad((n+200)::text,12,'0'))::uuid,
  'Grupo emisión '||n, 'SEND230'||n, '23000000-0000-4000-8000-000000000001'
from generate_series(1,3) n;
insert into public.memberships(user_id,group_id,role,status)
values
('23000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000201','ADMIN','ACTIVE'),
('23000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE'),
('23000000-0000-4000-8000-000000000003','23000000-0000-4000-8000-000000000201','GUARDIAN','ACTIVE'),
('23000000-0000-4000-8000-000000000004','23000000-0000-4000-8000-000000000201','ADMIN','INACTIVE'),
('23000000-0000-4000-8000-000000000005','23000000-0000-4000-8000-000000000202','ADMIN','ACTIVE'),
('23000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000203','ADMIN','ACTIVE');

select ok((select relrowsecurity from pg_class where oid='app_private.invitation_send_limits'::regclass),'contador privado con RLS');
select ok(has_function_privilege('service_role','public.issue_invitation(uuid,uuid,text,text,text,uuid)','execute'),'Edge tiene ejecución');
set local role anon;
select throws_ok($$select public.issue_invitation(null,null,repeat('a',64))$$,'42501',null,'anon no emite por RPC');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.issue_invitation('23000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000201',repeat('a',64),'x@example.test','ATHLETE')$$,'42501',null,'ni ADMIN invoca RPC privilegiada directamente');
select throws_ok($$select * from app_private.invitation_send_limits$$,'42501',null,'cliente no lee ni reinicia contador');
reset role;

select throws_ok($$select public.issue_invitation(null,'23000000-0000-4000-8000-000000000201',repeat('a',64),'x@example.test','ATHLETE')$$,'PT401','authentication_required','actor requerido');
select throws_ok($$select public.issue_invitation('23000000-0000-4000-8000-000000000002','23000000-0000-4000-8000-000000000201',repeat('a',64),'x@example.test','ATHLETE')$$,'PT403','admin_required','ATHLETE no emite');
select throws_ok($$select public.issue_invitation('23000000-0000-4000-8000-000000000003','23000000-0000-4000-8000-000000000201',repeat('a',64),'x@example.test','ATHLETE')$$,'PT403','admin_required','GUARDIAN no emite');
select throws_ok($$select public.issue_invitation('23000000-0000-4000-8000-000000000004','23000000-0000-4000-8000-000000000201',repeat('a',64),'x@example.test','ATHLETE')$$,'PT404','group_not_found','ADMIN INACTIVE no emite');
select throws_ok($$select public.issue_invitation('23000000-0000-4000-8000-000000000005','23000000-0000-4000-8000-000000000201',repeat('a',64),'x@example.test','ATHLETE')$$,'PT404','group_not_found','ADMIN ajeno no enumera grupo');
select throws_ok($$select public.issue_invitation('23000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000201',repeat('a',64),'x@example.test','ADMIN')$$,'PT400','invalid_invitation','SQL también prohíbe invitar ADMIN');
select throws_ok($$select public.issue_invitation('23000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000201','plain-token','x@example.test','ATHLETE')$$,'PT400','invalid_invitation','SQL solo recibe digest SHA-256');
select throws_ok($$select public.issue_invitation('23000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000201',repeat('a',64),'invalid-email','ATHLETE')$$,'PT400','invalid_invitation','SQL valida email');
select is((select count(*) from public.users where email='x@example.test'),0::bigint,'fallos no crean perfiles');
select is((select count(*) from app_private.invitation_send_limits),0::bigint,'rechazos no consumen cuota');

create temp table issued(label text primary key, result jsonb);
insert into issued values('new',public.issue_invitation('23000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000201',repeat('a',64),' New-Person@Example.test ','ATHLETE'));
select is((select status from public.invitations where token=repeat('a',64)),'PENDING','crea invitación PENDING');
select is((select role from public.invitations where token=repeat('a',64)),'ATHLETE','persiste rol dirigido');
select is((select email from public.invitations where token=repeat('a',64)),'new-person@example.test','email normalizado');
select is((select expires_at-created_at from public.invitations where token=repeat('a',64)),interval '7 days','vigencia exacta de siete días');
select is((select account_status from public.users where email='new-person@example.test'),'INVITED','email nuevo crea INVITED');
select is((select auth_user_id from public.users where email='new-person@example.test'),null::uuid,'INVITED no tiene credenciales');
select is((select count(*) from public.memberships m join public.users u on u.id=m.user_id where u.email='new-person@example.test'),0::bigint,'no activa ATHLETE sin aceptación/birthdate');
select ok((select i.invited_user_id=u.id from public.invitations i join public.users u on u.email=i.email where i.token=repeat('a',64)),'referencia perfil creado');

insert into issued values('existing',public.issue_invitation('23000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000201',repeat('b',64),'SEND-EXISTING-2@example.test','GUARDIAN'));
select is((select invited_user_id from public.invitations where token=repeat('b',64)),'23000000-0000-4000-8000-000000000002'::uuid,'reusa identidad existente case-insensitive');
select is((select account_status from public.users where id='23000000-0000-4000-8000-000000000002'),'ACTIVE','no degrada cuenta existente');
select is((select full_name from public.users where id='23000000-0000-4000-8000-000000000002'),'Cuenta existente','no sobrescribe perfil existente');
select is((select count(*) from public.users where lower(email)='send-existing-2@example.test'),1::bigint,'sin duplicados de perfil');

-- Un nonce emitido antes del reenvío nunca habilita el registro antiguo.
select public.prepare_invitation_registration(repeat('a',64),encode(extensions.digest('old-registration-23','sha256'),'hex'),
 'new-person@example.test','{"full_name":"Perfil confirmado","birthdate":"1990-01-01","terms_version":"2026-09-21"}');
insert into issued values('resend',public.issue_invitation('23000000-0000-4000-8000-000000000001',
 '23000000-0000-4000-8000-000000000201',repeat('c',64),p_invitation_id=>(select (result->>'id')::uuid from issued where label='new')));
select is((select status from public.invitations where token=repeat('a',64)),'EXPIRED','anterior queda inválida y conservada');
select is(public.invitation_context(repeat('a',64))->>'error','invitation_expired','preview antiguo rechaza token');
select is((select invited_user_id from public.invitations where token=repeat('a',64)),(select invited_user_id from public.invitations where token=repeat('c',64)),'reenvío conserva destinatario');
select is((select expires_at-created_at from public.invitations where token=repeat('c',64)),interval '7 days','reenvío renueva vigencia');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data)
values('23000000-0000-4000-8000-000000000110','new-person@example.test','{"invitation_registration_nonce":"old-registration-23"}')$$,
 'P0001','invitation_expired','registro preparado no reutiliza token invalidado');
select is((select auth_user_id from public.users where email='new-person@example.test'),null::uuid,'registro antiguo no deja credenciales');
select throws_ok($$select public.issue_invitation('23000000-0000-4000-8000-000000000001',
 '23000000-0000-4000-8000-000000000201',repeat('d',64),p_invitation_id=>(select (result->>'id')::uuid from issued where label='new'))$$,
 'PT404','invitation_not_available','no reenvía fila ya sustituida');
select throws_ok($$select public.issue_invitation('23000000-0000-4000-8000-000000000005',
 '23000000-0000-4000-8000-000000000202',repeat('d',64),p_invitation_id=>(select (result->>'id')::uuid from issued where label='resend'))$$,
 'PT404','invitation_not_available','no reenvía invitación de otro grupo');
select throws_ok($$select public.issue_invitation('23000000-0000-4000-8000-000000000001',
 '23000000-0000-4000-8000-000000000201',repeat('d',64),'attacker@example.test','GUARDIAN',
 (select (result->>'id')::uuid from issued where label='resend'))$$,
 'PT400','invalid_invitation','reenvío no permite cambiar email/rol');
select throws_ok($$select public.issue_invitation('23000000-0000-4000-8000-000000000001',
 '23000000-0000-4000-8000-000000000201',repeat('b',64),p_invitation_id=>(select (result->>'id')::uuid from issued where label='resend'))$$,
 '23505',null,'colisión de token aborta la transacción');
select is((select status from public.invitations where token=repeat('c',64)),'PENDING','colisión no invalida invitación original');
select is((select attempts from app_private.invitation_send_limits where group_id='23000000-0000-4000-8000-000000000201'),3,'reenvío cuenta; fallos transaccionales no cambian cuota');
select is(public.accept_invitation(repeat('b',64),'23000000-0000-4000-8000-000000000002')->>'membership_status','ACTIVE','nuevo token se integra con aceptación existente');
select throws_ok($$select public.issue_invitation('23000000-0000-4000-8000-000000000001',
 '23000000-0000-4000-8000-000000000201',repeat('d',64),p_invitation_id=>(select (result->>'id')::uuid from issued where label='existing'))$$,
 'PT404','invitation_not_available','invitación aceptada no se reenvía');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(id) from public.invitations),3::bigint,'ADMIN ve historial y nuevas invitaciones');
select throws_ok($$select token from public.invitations$$,'42501',null,'ADMIN no obtiene digest');
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(id) from public.invitations),0::bigint,'ATHLETE/GUARDIAN no lee emails invitados');
select set_config('request.jwt.claims','{"sub":"23000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select is((select count(id) from public.invitations),0::bigint,'ADMIN ajeno no lee historial');
reset role;

do $$ begin
  for n in 1..50 loop
    perform public.issue_invitation('23000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000203',
      encode(extensions.digest('quota-'||n,'sha256'),'hex'),'quota-'||n||'@example.test','ATHLETE');
  end loop;
end $$;
select throws_ok($$select public.issue_invitation('23000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000203',
 repeat('e',64),'quota-denied@example.test','ATHLETE')$$,'PT429','invitation_send_rate_limited','envío 51 rechazado');
select throws_ok($$select public.issue_invitation('23000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000203',
 repeat('e',64),p_invitation_id=>(select id from public.invitations where email='quota-1@example.test'))$$,'PT429','invitation_send_rate_limited','reenvío también respeta cuota');
select is((select count(*) from public.users where email='quota-denied@example.test'),0::bigint,'sobre cuota no crea perfil');
select is((select status from public.invitations where email='quota-1@example.test'),'PENDING','sobre cuota no invalida enlace anterior');
update app_private.invitation_send_limits set day=app_private.chile_today()-1 where group_id='23000000-0000-4000-8000-000000000203';
select lives_ok($$select public.issue_invitation('23000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000203',
 repeat('e',64),'quota-next-day@example.test','GUARDIAN')$$,'nuevo día chileno libera cuota');
select is((select attempts from app_private.invitation_send_limits where group_id='23000000-0000-4000-8000-000000000203'),1,'contador diario reiniciado');
select * from finish();
rollback;
