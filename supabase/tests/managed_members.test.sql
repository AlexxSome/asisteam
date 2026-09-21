begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data)
select ('24000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'managed-' || n || '@example.test', jsonb_build_object('full_name','Persona ' || n,'birthdate','1990-01-01')
from generate_series(1,4) n;
update public.users set id = ('24000000-0000-4000-8000-' || lpad((right(auth_user_id::text,12)::int+100)::text,12,'0'))::uuid
where email like 'managed-%@example.test';
insert into public.groups(id,name,invite_code,created_by)
values('24000000-0000-4000-8000-000000000201','Club MANAGED','MNGD0001','24000000-0000-4000-8000-000000000101');
insert into public.memberships(user_id,group_id,role,status)
values('24000000-0000-4000-8000-000000000101','24000000-0000-4000-8000-000000000201','ADMIN','ACTIVE'),
('24000000-0000-4000-8000-000000000102','24000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE');

select ok(not has_function_privilege('anon','public.create_managed_member(uuid,text,date,text,jsonb)','EXECUTE'), 'anon no puede crear MANAGED');
select ok(not has_function_privilege('anon','public.consent_managed_member(uuid,boolean)','EXECUTE'), 'anon no otorga consentimiento');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.create_managed_member('24000000-0000-4000-8000-000000000201','Adulto','1990-01-01')$$,'PT401','authentication_required','requiere identidad');
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.create_managed_member('24000000-0000-4000-8000-000000000201','Adulto','1990-01-01')$$,'PT404','group_not_found','grupo ajeno no visible');
select throws_ok($$select public.create_managed_member(gen_random_uuid(),'Adulto','1990-01-01')$$,'PT404','group_not_found','grupo inexistente responde igual');
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.create_managed_member('24000000-0000-4000-8000-000000000201','Adulto','1990-01-01')$$,'PT403','admin_required','ATHLETE no crea perfiles');
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.create_managed_member('24000000-0000-4000-8000-000000000201','A','1990-01-01')$$,'PT400','invalid_managed_member','valida nombre en RPC');
select throws_ok($$select public.create_managed_member('24000000-0000-4000-8000-000000000201','Adulto',null)$$,'PT400','invalid_managed_member','fecha obligatoria');
select throws_ok($$select public.create_managed_member('24000000-0000-4000-8000-000000000201','Adulto',(now() at time zone 'America/Santiago')::date)$$,'PT400','invalid_managed_member','fecha pasada según Chile');
select throws_ok($$select public.create_managed_member('24000000-0000-4000-8000-000000000201','Adulto','1990-01-01','no-email')$$,'PT400','invalid_managed_member','valida email');
select throws_ok($$select public.create_managed_member('24000000-0000-4000-8000-000000000201','Adulto','1990-01-01','MANAGED-3@example.test')$$,'PT409','managed_email_unavailable','no reclama cuentas existentes');
select set_config('test.managed',public.create_managed_member('24000000-0000-4000-8000-000000000201',' Adulto gestionado ','1990-01-01')::text,true);
select is(current_setting('test.managed')::jsonb->>'membership_status','ACTIVE','adulto ACTIVE inmediato');
select is((select count(*) from public.v_attendance_roster where membership_id=(current_setting('test.managed')::jsonb->>'membership_id')::uuid),1::bigint,'MANAGED aparece en asistencia');
select is((select full_name from public.v_attendance_roster where membership_id=(current_setting('test.managed')::jsonb->>'membership_id')::uuid),'Adulto gestionado','nombre normalizado');
select lives_ok($$select public.create_managed_member('24000000-0000-4000-8000-000000000201','Otro adulto','1990-01-01','  ')$$,'múltiples emails NULL');
select lives_ok($$select public.create_managed_member('24000000-0000-4000-8000-000000000201','Adulto email','1990-01-01',' ADULTO@Example.test ')$$,'email opcional se normaliza');
select throws_ok($$insert into public.users(full_name,account_status) values('Ataque','MANAGED')$$,'42501',null,'no hay acceso directo a tabla users');
reset role;
select is((select count(*) from auth.users where email like 'managed-%@example.test'),4::bigint,'altas no crean credenciales');
select ok((select u.auth_user_id is null and u.account_status='MANAGED' and u.email is null from public.users u join public.memberships m on m.user_id=u.id where m.id=(current_setting('test.managed')::jsonb->>'membership_id')::uuid),'perfil MANAGED sin Auth ni email');
select is((select email from public.users where full_name='Adulto email'),'adulto@example.test','email normalizado en base');

-- Un error posterior al perfil revierte toda el alta.
create function pg_temp.reject_managed_membership() returns trigger language plpgsql as $$
begin raise sqlstate 'PT422' using message='test_membership_failure'; end $$;
create trigger test_managed_membership before insert on public.memberships for each row execute function pg_temp.reject_managed_membership();
set local role authenticated;
select throws_ok($$select public.create_managed_member('24000000-0000-4000-8000-000000000201','Debe revertirse','1990-01-01')$$,'PT422','test_membership_failure','fallo membership aborta alta');
reset role;
drop trigger test_managed_membership on public.memberships;
select is((select count(*) from public.users where full_name='Debe revertirse'),0::bigint,'sin perfiles huérfanos');

-- Menores: declaración del ADMIN no equivale al consentimiento del apoderado.
select set_config('test.minor_birthdate',(app_private.chile_today()-interval '15 years')::date::text,true);
set local role authenticated;
select throws_ok($$select public.create_managed_member('24000000-0000-4000-8000-000000000201','Menor sin vínculo',current_setting('test.minor_birthdate')::date)$$,'PT422','invalid_guardian','menor exige apoderado en mismo flujo');
select throws_ok($$select public.create_managed_member('24000000-0000-4000-8000-000000000201','Menor sin autorización',current_setting('test.minor_birthdate')::date,null,'{"full_name":"Apoderado","email":"managed-3@example.test","relationship":"Tutor","authorized":false}')$$,'PT422','invalid_guardian','declaración ADMIN obligatoria');
select set_config('test.minor',public.create_managed_member('24000000-0000-4000-8000-000000000201','Menor pendiente',current_setting('test.minor_birthdate')::date,null,'{"full_name":"No sobrescribir","email":"managed-3@example.test","relationship":"Tutor","authorized":true}')::text,true);
select is(current_setting('test.minor')::jsonb->>'membership_status','PENDING','menor PENDING hasta consentimiento');
select is((select count(*) from public.v_attendance_roster where membership_id=(current_setting('test.minor')::jsonb->>'membership_id')::uuid),0::bigint,'pendiente no aparece en asistencia');
select throws_ok($$select public.consent_managed_member((current_setting('test.minor')::jsonb->>'membership_id')::uuid,true)$$,'PT404','managed_consent_not_found','ADMIN no consiente por otro apoderado');
select is((select count(*) from public.list_managed_member_consents('24000000-0000-4000-8000-000000000201')),0::bigint,'ADMIN no ve consentimiento ajeno');
reset role;
select is((select count(*) from public.consents c join app_private.managed_member_enrollments e on e.guardianship_id=c.guardianship_id where e.membership_id=(current_setting('test.minor')::jsonb->>'membership_id')::uuid),0::bigint,'declaración no fabrica consents');
select is((select declared_by from app_private.managed_member_enrollments where membership_id=(current_setting('test.minor')::jsonb->>'membership_id')::uuid),'24000000-0000-4000-8000-000000000101'::uuid,'evidencia ADMIN separada');
select is((select full_name from public.users where id='24000000-0000-4000-8000-000000000103'),'Persona 3','no sobrescribe apoderado existente');
select is((select count(*) from public.memberships where user_id='24000000-0000-4000-8000-000000000103'),0::bigint,'vincular no abre grupo antes de aceptar invitación');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.list_managed_member_consents('24000000-0000-4000-8000-000000000201')$$,'PT404','group_not_found','V6: destinatario sin membership no ve grupo');
select throws_ok($$select public.consent_managed_member((current_setting('test.minor')::jsonb->>'membership_id')::uuid,true)$$,'PT404','managed_consent_not_found','sin aceptar invitación no puede consentir');
reset role;
-- Equivale al paso existente de aceptación de invitación GUARDIAN.
insert into public.memberships(user_id,group_id,role,status,joined_at)
values('24000000-0000-4000-8000-000000000103','24000000-0000-4000-8000-000000000201','GUARDIAN','ACTIVE',now()),
('24000000-0000-4000-8000-000000000104','24000000-0000-4000-8000-000000000201','GUARDIAN','ACTIVE',now());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*) from public.list_managed_member_consents('24000000-0000-4000-8000-000000000201')),0::bigint,'otro GUARDIAN no ve pupilo');
select throws_ok($$select public.consent_managed_member((current_setting('test.minor')::jsonb->>'membership_id')::uuid,true)$$,'PT404','managed_consent_not_found','otro GUARDIAN no puede consentir');
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select full_name from public.list_managed_member_consents('24000000-0000-4000-8000-000000000201')),'Menor pendiente','destinatario ve solo su pupilo');
select throws_ok($$select public.consent_managed_member((current_setting('test.minor')::jsonb->>'membership_id')::uuid,false)$$,'PT422','consent_required','checkbox explícito requerido');
select throws_ok($$update public.memberships set status='ACTIVE' where id=(current_setting('test.minor')::jsonb->>'membership_id')::uuid$$,'42501',null,'cliente no activa directamente');
select throws_ok($$select * from app_private.managed_member_enrollments$$,'42501',null,'evidencia ADMIN no se expone');
select lives_ok($$select public.consent_managed_member((current_setting('test.minor')::jsonb->>'membership_id')::uuid,true)$$,'apoderado consiente y activa');
select lives_ok($$select public.consent_managed_member((current_setting('test.minor')::jsonb->>'membership_id')::uuid,true)$$,'reintento idempotente');
select is((select count(*) from public.list_managed_member_consents('24000000-0000-4000-8000-000000000201')),0::bigint,'activado sale de pendientes');
reset role;
select is((select status from public.memberships where id=(current_setting('test.minor')::jsonb->>'membership_id')::uuid),'ACTIVE','consentimiento activa ATHLETE');
select ok((select joined_at is not null from public.memberships where id=(current_setting('test.minor')::jsonb->>'membership_id')::uuid),'joined_at se fija al activar');
select is((select count(*) from public.consents c join app_private.managed_member_enrollments e on e.guardianship_id=c.guardianship_id where e.membership_id=(current_setting('test.minor')::jsonb->>'membership_id')::uuid),1::bigint,'reintento no duplica consentimiento');
select ok((select c.consent_type='DATA_PROCESSING_MINOR' and c.channel='IN_APP' and c.terms_version='2026-09-21' and not c.allows_avatar and c.revoked_at is null from public.consents c join app_private.managed_member_enrollments e on e.guardianship_id=c.guardianship_id where e.membership_id=(current_setting('test.minor')::jsonb->>'membership_id')::uuid),'evidencia versionada sin foto ni activación de credenciales');
select ok((select u.account_status='MANAGED' and u.auth_user_id is null from public.users u join public.memberships m on m.user_id=u.id where m.id=(current_setting('test.minor')::jsonb->>'membership_id')::uuid),'consentimiento no crea cuenta Auth del menor');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from public.v_attendance_roster where membership_id=(current_setting('test.minor')::jsonb->>'membership_id')::uuid),1::bigint,'menor consentido aparece en asistencia');

select * from finish();
rollback;
