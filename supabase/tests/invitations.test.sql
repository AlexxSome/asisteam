begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, email, raw_user_meta_data)
select ('18000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'invite-existing-' || n || '@example.test', '{"full_name":"Cuenta existente","birthdate":"1990-01-01"}'::jsonb
from generate_series(1,3) n;
update public.users set id = auth_user_id where email like 'invite-existing-%@example.test';
insert into public.users(id, full_name, email, birthdate, account_status)
select ('18000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'Perfil invitado', 'invite-new-' || n || '@example.test',
  case when n in (11,12) then app_private.chile_today() - interval '15 years' else date '1990-01-01' end,
  case when n = 12 then 'MANAGED' else 'INVITED' end
from generate_series(10,15) n;
insert into public.groups(id, name, invite_code, created_by)
values ('18000000-0000-4000-8000-000000000201','Grupo de invitación','INVITE18','18000000-0000-4000-8000-000000000001');
insert into public.memberships(user_id,group_id,role,status)
values ('18000000-0000-4000-8000-000000000001','18000000-0000-4000-8000-000000000201','ADMIN','ACTIVE');
insert into public.invitations(group_id,email,invited_user_id,role,token,created_by)
select '18000000-0000-4000-8000-000000000201',email,id,'ATHLETE',md5(n::text)||md5(n::text),'18000000-0000-4000-8000-000000000001'
from generate_series(10,15) n join public.users u on u.id = ('18000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid;
insert into public.invitations(group_id,email,role,token,created_by)
values('18000000-0000-4000-8000-000000000201','INVITE-EXISTING-2@example.test','GUARDIAN',repeat('a',64),'18000000-0000-4000-8000-000000000001');

-- Prepara la misma autorización efímera que Edge; el trigger ignora los
-- campos públicos del registro y consume solo los datos autorizados.
create function pg_temp.registration_metadata(n text, profile jsonb) returns jsonb
language plpgsql as $$
declare v_nonce text := encode(extensions.gen_random_bytes(32),'hex');
begin
    perform public.prepare_invitation_registration(md5(n)||md5(n), encode(extensions.digest(v_nonce,'sha256'),'hex'),
      'invite-new-'||n||'@example.test', profile || jsonb_build_object('terms_version','2026-09-21'));
    return jsonb_build_object('invitation_registration_nonce',v_nonce);
end $$;

select ok((select relrowsecurity from pg_class where oid='public.invitations'::regclass),'RLS en invitaciones');
set local role anon;
select throws_ok($$select id from public.invitations$$,'42501',null,'anon no enumera invitaciones');
select throws_ok($$select public.invitation_context(repeat('a',64))$$,'42501',null,'preview privilegiado no se puede llamar directamente');
select throws_ok($$select public.accept_invitation(repeat('a',64),'18000000-0000-4000-8000-000000000002')$$,'42501',null,'anon no suplanta destinatario por RPC');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"18000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(id) from public.invitations),7::bigint,'ADMIN ve estados de su grupo');
select throws_ok($$select token from public.invitations$$,'42501',null,'ni ADMIN obtiene los hashes de tokens');
select throws_ok($$update public.invitations set status='ACCEPTED'$$,'42501',null,'cliente no cambia estados directamente');
select throws_ok($$select public.accept_invitation(repeat('a',64),'18000000-0000-4000-8000-000000000002')$$,'42501',null,'authenticated no suplanta actor por RPC');
select throws_ok($$select public.prepare_invitation_registration(repeat('a',64),repeat('c',64),'invite-new-14@example.test','{}')$$,'42501',null,'cliente no prepara pruebas de registro');
select throws_ok($$select nonce_hash from app_private.invitation_registrations$$,'42501',null,'cliente no lee pruebas de registro');
select set_config('request.jwt.claims','{"sub":"18000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(id) from public.invitations),0::bigint,'destinatario no enumera invitaciones ni email de terceros');
reset role;

select is(public.accept_invitation(repeat('a',64),'18000000-0000-4000-8000-000000000003')->>'error','invitation_not_available','sesión de otra cuenta rechazada');
select is((select status from public.invitations where token=repeat('a',64)),'PENDING','rechazo no consume token');
select is(public.accept_invitation(repeat('a',64),'18000000-0000-4000-8000-000000000002')->>'membership_status','ACTIVE','cuenta ACTIVE acepta email sin distinguir mayúsculas');
select is((select count(*) from public.users where id='18000000-0000-4000-8000-000000000002'),1::bigint,'cuenta existente no se duplica');
select is((select role from public.memberships where user_id='18000000-0000-4000-8000-000000000002'),'GUARDIAN','rol sale de invitación');
select is(public.accept_invitation(repeat('a',64),'18000000-0000-4000-8000-000000000002')->>'error','invitation_not_available','token aceptado no se reutiliza');

select lives_ok($$insert into auth.users(id,email,raw_user_meta_data)
values('18000000-0000-4000-8000-000000000110','invite-new-10@example.test',
  pg_temp.registration_metadata('10','{"full_name":"Nombre confirmado","birthdate":"1990-01-01"}'))$$,
  'registro invitado vincula Auth y acepta en una transacción');
select is((select account_status from public.users where id='18000000-0000-4000-8000-000000000010'),'ACTIVE','conserva ID y activa el perfil INVITED');
select is((select auth_user_id from public.users where id='18000000-0000-4000-8000-000000000010'),'18000000-0000-4000-8000-000000000110'::uuid,'Auth y perfil siguen desacoplados');
select is((select status from public.memberships where user_id='18000000-0000-4000-8000-000000000010'),'ACTIVE','nueva membership activa');
select is((select status from public.invitations where token=md5('10')||md5('10')),'ACCEPTED','invitación consumida');
select is((select terms_version from public.invitations where token=md5('10')||md5('10')),'2026-09-21','conserva versión de condiciones aceptadas');
select ok((select accepted_at is not null from public.invitations where token=md5('10')||md5('10')),'conserva timestamp de aceptación');

select throws_ok($$insert into auth.users(id,email,raw_user_meta_data)
values('18000000-0000-4000-8000-000000000111','invite-new-11@example.test',
  pg_temp.registration_metadata('11',jsonb_build_object('full_name','Menor invitado','birthdate',(app_private.chile_today()-interval '15 years')::date)))$$,
  'P0001','guardian_consent_required','menor no obtiene credenciales antes del consentimiento');
select is((select count(*) from auth.users where id='18000000-0000-4000-8000-000000000111'),0::bigint,'fallo revierte creación Auth');
select is((select account_status from public.users where id='18000000-0000-4000-8000-000000000011'),'INVITED','fallo conserva perfil INVITED');
select is((select status from public.invitations where token=md5('11')||md5('11')),'PENDING','fallo conserva invitación');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data)
values('18000000-0000-4000-8000-000000000111','invite-new-11@example.test',pg_temp.registration_metadata('11','{"full_name":"Fecha alterada","birthdate":"1990-01-01"}'))$$,
  'P0001','birthdate_confirmation_required','no puede declarar mayoría para saltar consentimiento');
insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship)
values('18000000-0000-4000-8000-000000000301','18000000-0000-4000-8000-000000000002','18000000-0000-4000-8000-000000000011','Madre');
insert into public.consents(guardianship_id,consent_type,terms_version)
values('18000000-0000-4000-8000-000000000301','DATA_PROCESSING_MINOR','v1');
select lives_ok($$insert into auth.users(id,email,raw_user_meta_data)
values('18000000-0000-4000-8000-000000000111','invite-new-11@example.test',
  pg_temp.registration_metadata('11',jsonb_build_object('full_name','Menor invitado','birthdate',(app_private.chile_today()-interval '15 years')::date)))$$,
  'menor con consentimiento vigente activa cuenta');
select is((select status from public.memberships where user_id='18000000-0000-4000-8000-000000000011'),'ACTIVE','R1 satisfecha para la nueva membresía');

insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship)
values('18000000-0000-4000-8000-000000000302','18000000-0000-4000-8000-000000000002','18000000-0000-4000-8000-000000000012','Madre');
insert into public.consents(guardianship_id,consent_type,terms_version)
values('18000000-0000-4000-8000-000000000302','DATA_PROCESSING_MINOR','v1');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data)
values('18000000-0000-4000-8000-000000000112','invite-new-12@example.test',
  pg_temp.registration_metadata('12',jsonb_build_object('full_name','Menor gestionado','birthdate',(app_private.chile_today()-interval '15 years')::date)))$$,
  'P0001','guardian_consent_required','MANAGED menor exige además ACCOUNT_ACTIVATION_MINOR');
insert into public.consents(guardianship_id,consent_type,terms_version)
values('18000000-0000-4000-8000-000000000302','ACCOUNT_ACTIVATION_MINOR','v1');
select lives_ok($$insert into auth.users(id,email,raw_user_meta_data)
values('18000000-0000-4000-8000-000000000112','invite-new-12@example.test',
  pg_temp.registration_metadata('12',jsonb_build_object('full_name','Menor gestionado','birthdate',(app_private.chile_today()-interval '15 years')::date)))$$,
  'MANAGED con ambos consentimientos conserva perfil y activa credenciales');

update public.invitations set created_at=now()-interval '8 days',expires_at=now()-interval '1 day' where token=md5('13')||md5('13');
select is(public.invitation_context(md5('13')||md5('13'))->>'error','invitation_expired','abrir token vencido muestra expiración');
select is((select status from public.invitations where token=md5('13')||md5('13')),'EXPIRED','expiración queda persistida al devolver error');
select is(public.invitation_context(repeat('f',64))->>'error','invitation_not_available','token inexistente no enumera cuentas');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data)
values('18000000-0000-4000-8000-000000000114','invite-new-14@example.test',
  jsonb_build_object('full_name','Ataque','birthdate','1990-01-01','invitation_token_hash',md5('14')||md5('14')))$$,
  '23505',null,'signUp público no reclama perfiles con un token en metadatos');
select is((select auth_user_id from public.users where id='18000000-0000-4000-8000-000000000014'),null::uuid,'perfil no reclamado por metadata pública');
select is((select count(*) from public.memberships where user_id='18000000-0000-4000-8000-000000000014'),0::bigint,'sin aceptación no se crea membership');

select public.prepare_invitation_registration(md5('14')||md5('14'),encode(extensions.digest('synthetic-nonce-14','sha256'),'hex'),
  'invite-new-14@example.test','{"full_name":"Registro autorizado","birthdate":"1990-01-01","terms_version":"2026-09-21"}');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data)
values('18000000-0000-4000-8000-000000000115','invite-new-15@example.test','{"invitation_registration_nonce":"synthetic-nonce-14"}')$$,
  'P0001','invitation_not_available','prueba está ligada al email exacto');
update app_private.invitation_registrations set expires_at=now()-interval '1 second'
  where nonce_hash=encode(extensions.digest('synthetic-nonce-14','sha256'),'hex');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data)
values('18000000-0000-4000-8000-000000000114','invite-new-14@example.test','{"invitation_registration_nonce":"synthetic-nonce-14"}')$$,
  'P0001','invitation_not_available','prueba vencida no autoriza registro');
select public.cancel_invitation_registration(encode(extensions.digest('synthetic-nonce-14','sha256'),'hex'));
select public.prepare_invitation_registration(md5('14')||md5('14'),encode(extensions.digest('synthetic-nonce-new-14','sha256'),'hex'),
  'invite-new-14@example.test','{"full_name":"Registro autorizado","birthdate":"1990-01-01","terms_version":"2026-09-21"}');
select lives_ok($$insert into auth.users(id,email,raw_user_meta_data)
values('18000000-0000-4000-8000-000000000114','invite-new-14@example.test',
  '{"invitation_registration_nonce":"synthetic-nonce-new-14","full_name":"Metadato alterado","birthdate":"2011-01-01"}')$$,
  'prueba válida usa perfil autorizado, no metadatos editables');
select is((select full_name from public.users where id='18000000-0000-4000-8000-000000000014'),'Registro autorizado','datos provienen de preparación privada');
select is((select count(*) from app_private.invitation_registrations where token_hash=md5('14')||md5('14')),0::bigint,'prueba consumida desaparece');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data)
values('18000000-0000-4000-8000-000000000116','invite-new-14@example.test','{"invitation_registration_nonce":"synthetic-nonce-new-14"}')$$,
  '23505',null,'replay tampoco puede duplicar la identidad Auth');

-- Cuenta menor ya ACTIVE: puede aceptar sin habilitar membresía prematuramente.
update public.users set birthdate=(app_private.chile_today()-interval '15 years')::date
where id='18000000-0000-4000-8000-000000000003';
insert into public.invitations(group_id,invited_user_id,role,token,created_by)
values('18000000-0000-4000-8000-000000000201','18000000-0000-4000-8000-000000000003','ATHLETE',repeat('c',64),'18000000-0000-4000-8000-000000000001');
select is(public.accept_invitation(repeat('c',64),'18000000-0000-4000-8000-000000000003')->>'membership_status','PENDING','menor con cuenta existente sin consentimiento queda PENDING');
select is((select joined_at from public.memberships where user_id='18000000-0000-4000-8000-000000000003'),null::timestamptz,'PENDING no anticipa joined_at');

-- A 499 memberships, la incorporación de menor + nuevo GUARDIAN supera 500.
insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship)
values('18000000-0000-4000-8000-000000000303','18000000-0000-4000-8000-000000000015','18000000-0000-4000-8000-000000000003','Madre');
insert into public.consents(guardianship_id,consent_type,terms_version)
values('18000000-0000-4000-8000-000000000303','DATA_PROCESSING_MINOR','v1');
insert into public.users(id,full_name,account_status)
select ('18000000-0000-4000-8000-'||lpad((n+1000)::text,12,'0'))::uuid,'Fixture cupo','MANAGED'
from generate_series(1,499-(select count(*)::int from public.memberships where group_id='18000000-0000-4000-8000-000000000201' and status='ACTIVE')) n;
insert into public.memberships(user_id,group_id,role,status)
select id,'18000000-0000-4000-8000-000000000201','GUARDIAN','ACTIVE' from public.users where full_name='Fixture cupo';
insert into public.invitations(group_id,invited_user_id,role,token,created_by)
values('18000000-0000-4000-8000-000000000201','18000000-0000-4000-8000-000000000003','ATHLETE',repeat('d',64),'18000000-0000-4000-8000-000000000001');
select is(public.accept_invitation(repeat('d',64),'18000000-0000-4000-8000-000000000003')->>'error','group_member_limit','cupo incluye membership GUARDIAN derivada');
select is((select status from public.invitations where token=repeat('d',64)),'PENDING','cupo insuficiente conserva invitación');

select ok(public.consume_invitation_attempt(repeat('b',64)),'primer intento permitido');
select ok(bool_and(public.consume_invitation_attempt(repeat('b',64)))) from generate_series(2,10);
select ok(not public.consume_invitation_attempt(repeat('b',64)),'undécimo intento rechazado');
update app_private.invitation_attempts set attempts=array[now()-interval '61 minutes'] where key=repeat('b',64);
select ok(public.consume_invitation_attempt(repeat('b',64)),'ventana móvil libera intentos antiguos');

select * from finish();
rollback;
