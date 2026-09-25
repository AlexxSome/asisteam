begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data)
select ('35000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'activation-'||n||'@example.test','{"full_name":"Persona adulta","birthdate":"1990-01-01"}'::jsonb
from generate_series(1,4) n;
update public.users set id=auth_user_id where email like 'activation-%@example.test';
insert into public.users(id,full_name,email,birthdate,account_status)
select ('35000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Persona gestionada',
 case when n=13 then null else 'activation-'||n||'@example.test' end,
 case when n=12 then app_private.chile_today()-interval '15 years' else date '1990-01-01' end,'MANAGED'
from generate_series(11,14) n;
insert into public.groups(id,name,invite_code,created_by) values
 ('35000000-0000-4000-8000-000000000201','Grupo activación','ACTIVA35','35000000-0000-4000-8000-000000000001'),
 ('35000000-0000-4000-8000-000000000202','Grupo externo','ACTIVB35','35000000-0000-4000-8000-000000000003');
insert into public.memberships(id,user_id,group_id,role,status,joined_at) values
 ('35000000-0000-4000-8000-000000000301','35000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000201','ADMIN','ACTIVE',now()),
 ('35000000-0000-4000-8000-000000000303','35000000-0000-4000-8000-000000000003','35000000-0000-4000-8000-000000000202','ADMIN','ACTIVE',now()),
 ('35000000-0000-4000-8000-000000000304','35000000-0000-4000-8000-000000000004','35000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE',now()),
 ('35000000-0000-4000-8000-000000000311','35000000-0000-4000-8000-000000000011','35000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE',now()-interval '90 days'),
 ('35000000-0000-4000-8000-000000000312','35000000-0000-4000-8000-000000000012','35000000-0000-4000-8000-000000000201','ATHLETE','PENDING',null),
 ('35000000-0000-4000-8000-000000000313','35000000-0000-4000-8000-000000000013','35000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE',now()),
 ('35000000-0000-4000-8000-000000000314','35000000-0000-4000-8000-000000000014','35000000-0000-4000-8000-000000000202','ATHLETE','ACTIVE',now()),
 ('35000000-0000-4000-8000-000000000315','35000000-0000-4000-8000-000000000011','35000000-0000-4000-8000-000000000202','ATHLETE','INACTIVE',now()-interval '100 days');
insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship) values
 ('35000000-0000-4000-8000-000000000401','35000000-0000-4000-8000-000000000002','35000000-0000-4000-8000-000000000012','Tutor');
insert into public.consents(guardianship_id,consent_type,terms_version)
 values('35000000-0000-4000-8000-000000000401','DATA_PROCESSING_MINOR','2026-09-21');
update public.memberships set status='ACTIVE',joined_at=now()-interval '60 days' where id='35000000-0000-4000-8000-000000000312';
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values
 ('35000000-0000-4000-8000-000000000501','35000000-0000-4000-8000-000000000201','b2c3d4e5-0001-4b3c-8d4e-111111111111','Entrenamiento anterior',now()-interval '2 days',now()-interval '47 hours','35000000-0000-4000-8000-000000000001');
insert into public.attendance_records(activity_id,membership_id,status,recorded_by)
 select '35000000-0000-4000-8000-000000000501',id,'PRESENT','35000000-0000-4000-8000-000000000001' from public.memberships
 where id in ('35000000-0000-4000-8000-000000000311','35000000-0000-4000-8000-000000000312');
create temp table original_memberships as select to_jsonb(m) row from public.memberships m;
create temp table original_guardianships as select to_jsonb(g) row from public.guardianships g;
create temp table original_attendance as select to_jsonb(a) row from public.attendance_records a;

select ok((select relrowsecurity from pg_class where oid='app_private.managed_activation_requests'::regclass),'solicitudes privadas con RLS');
set local role anon;
select throws_ok($$select public.request_managed_activation(null,null)$$,'42501',null,'anon no inicia activaciones');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"35000000-0000-4000-8000-000000000003"}',true);
select throws_ok($$select public.request_managed_activation('35000000-0000-4000-8000-000000000201','35000000-0000-4000-8000-000000000311')$$,'PT404','group_not_found','ADMIN externo no activa');
select set_config('request.jwt.claims','{"sub":"35000000-0000-4000-8000-000000000004"}',true);
select throws_ok($$select public.request_managed_activation('35000000-0000-4000-8000-000000000201','35000000-0000-4000-8000-000000000311')$$,'PT403','admin_required','ATHLETE no activa');
select throws_ok($$select * from app_private.managed_activation_requests$$,'42501',null,'cliente no enumera solicitudes');
select throws_ok($$select public.issue_managed_activation(null,null,null,repeat('a',64))$$,'42501',null,'cliente no suplanta actor de Edge');
select set_config('request.jwt.claims','{"sub":"35000000-0000-4000-8000-000000000001"}',true);
select throws_ok($$select public.request_managed_activation('35000000-0000-4000-8000-000000000201','35000000-0000-4000-8000-000000000314')$$,'PT404','membership_not_found','ID de otro grupo no sirve');
select throws_ok($$select public.request_managed_activation('35000000-0000-4000-8000-000000000201','35000000-0000-4000-8000-000000000313')$$,'PT422','managed_email_required','exige email antes de empezar');
select throws_ok($$select public.update_managed_member('35000000-0000-4000-8000-000000000201','35000000-0000-4000-8000-000000000313','Persona gestionada','1990-01-01','activation-11@example.test')$$,'PT409','managed_email_unavailable','email debe ser único');
select is(public.request_managed_activation('35000000-0000-4000-8000-000000000201','35000000-0000-4000-8000-000000000311'),'READY','adulto puede recibir enlace');
select is(public.request_managed_activation('35000000-0000-4000-8000-000000000201','35000000-0000-4000-8000-000000000312'),'CONSENT_PENDING','tratamiento de datos no autoriza credenciales');
select is(public.request_managed_activation('35000000-0000-4000-8000-000000000201','35000000-0000-4000-8000-000000000312'),'CONSENT_PENDING','doble clic no duplica solicitud');
select is((select count(*) from public.list_managed_activation_requests('35000000-0000-4000-8000-000000000201')),0::bigint,'ADMIN no ve solicitud como apoderado');
reset role;
create temp table request_id as select id from app_private.managed_activation_requests;
select is((select count(*) from request_id),1::bigint,'una sola solicitud pendiente');
select throws_ok($$select public.issue_invitation('35000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000201',repeat('a',64),'activation-12@example.test','ATHLETE')$$,'PT422','guardian_consent_required','envío genérico tampoco elude consentimiento');
select is((select count(*) from public.invitations where invited_user_id='35000000-0000-4000-8000-000000000012'),0::bigint,'rechazo no emite token');
grant select on request_id to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"35000000-0000-4000-8000-000000000001"}',true);
select throws_ok($$select public.review_managed_activation((select id from request_id),true)$$,'PT404','activation_request_not_found','ADMIN no consiente por el apoderado');
select set_config('request.jwt.claims','{"sub":"35000000-0000-4000-8000-000000000002"}',true);
select is((select count(*) from public.list_managed_activation_requests('35000000-0000-4000-8000-000000000201')),1::bigint,'apoderado vigente ve solicitud');
select ok((select to_jsonb(r) - array['request_id','membership_id','full_name','relationship','status','total_count']='{}'::jsonb
 from public.list_managed_activation_requests('35000000-0000-4000-8000-000000000201') r),'proyección no expone PII');
select lives_ok($$select public.review_managed_activation((select id from request_id),false)$$,'puede rechazar');
reset role;
select is((select count(*) from public.consents where consent_type='ACCOUNT_ACTIVATION_MINOR'),0::bigint,'rechazo no concede consentimiento');
select is((select account_status from public.users where id='35000000-0000-4000-8000-000000000012'),'MANAGED','rechazo conserva MANAGED');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"35000000-0000-4000-8000-000000000001"}',true);
select public.request_managed_activation('35000000-0000-4000-8000-000000000201','35000000-0000-4000-8000-000000000312');
reset role;
truncate request_id;
insert into request_id select id from app_private.managed_activation_requests where status='PENDING';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"35000000-0000-4000-8000-000000000002"}',true);
select lives_ok($$select public.review_managed_activation((select id from request_id),true)$$,'apoderado autoriza activación');
select lives_ok($$select public.review_managed_activation((select id from request_id),true)$$,'reintento es idempotente');
reset role;
select is((select count(*) from public.consents where consent_type='ACCOUNT_ACTIVATION_MINOR'),1::bigint,'no duplica evidencia');
select is((select channel from public.consents where consent_type='ACCOUNT_ACTIVATION_MINOR'),'IN_APP','evidencia identifica canal autenticado');
select is((select auth_user_id from public.users where id='35000000-0000-4000-8000-000000000012'),null::uuid,'consentir no crea credenciales');
select throws_ok($$select public.issue_managed_activation('35000000-0000-4000-8000-000000000004','35000000-0000-4000-8000-000000000201','35000000-0000-4000-8000-000000000312',repeat('a',64))$$,'PT403','activation_sender_required','solo el apoderado autor original despacha solicitud');
select lives_ok($$select public.issue_managed_activation('35000000-0000-4000-8000-000000000002','35000000-0000-4000-8000-000000000201','35000000-0000-4000-8000-000000000312',repeat('a',64))$$,'apoderado autorizado despacha enlace solicitado por ADMIN');
select lives_ok($$select public.issue_managed_activation('35000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000201','35000000-0000-4000-8000-000000000311',repeat('b',64))$$,'ADMIN envía adulto');
select is((select activation_membership_id from public.invitations where token=repeat('a',64)),'35000000-0000-4000-8000-000000000312'::uuid,'activación ligada al historial existente');

create function pg_temp.register_managed(n integer, token text) returns void language plpgsql as $$
declare nonce text := 'activation-test-'||n;
begin
 perform public.prepare_invitation_registration(token,encode(extensions.digest(nonce,'sha256'),'hex'),'activation-'||n||'@example.test',
  jsonb_build_object('full_name','Titular registrado','birthdate',(select birthdate from public.users where email='activation-'||n||'@example.test'),'terms_version','2026-09-21'));
 insert into auth.users(id,email,raw_user_meta_data) values(('35000000-0000-4000-8000-'||lpad((n+100)::text,12,'0'))::uuid,
  'activation-'||n||'@example.test',jsonb_build_object('invitation_registration_nonce',nonce));
end $$;
update public.consents set revoked_at=now() where consent_type='ACCOUNT_ACTIVATION_MINOR';
select throws_ok($$select pg_temp.register_managed(12,repeat('a',64))$$,'P0001','guardian_consent_required','revocar después del envío bloquea credenciales');
select is((select count(*) from auth.users where email='activation-12@example.test'),0::bigint,'Auth revierte ante consentimiento revocado');
select is((select status from public.invitations where token=repeat('a',64)),'PENDING','rechazo no consume token');
insert into public.consents(guardianship_id,consent_type,terms_version,channel)
 values('35000000-0000-4000-8000-000000000401','ACCOUNT_ACTIVATION_MINOR','2026-09-21','IN_APP');
-- La cuenta puede activarse sin aprobar/reactivar memberships por accidente.
update public.memberships set status='PENDING' where id='35000000-0000-4000-8000-000000000312';
update public.memberships set status='INACTIVE' where id='35000000-0000-4000-8000-000000000311';
truncate original_memberships;
insert into original_memberships select to_jsonb(m) from public.memberships m;
select lives_ok($$select pg_temp.register_managed(12,repeat('a',64))$$,'menor consentido activa cuenta existente');
select lives_ok($$select pg_temp.register_managed(11,repeat('b',64))$$,'adulto activa sin apoderado');
select is((select count(*) from public.users where id in ('35000000-0000-4000-8000-000000000011','35000000-0000-4000-8000-000000000012') and account_status='ACTIVE'),2::bigint,'mantiene IDs y activa ambas cuentas');
select results_eq('select to_jsonb(m) from public.memberships m order by m.id','select row from original_memberships order by row->>''id''','todas las memberships, estados y fechas quedan intactos');
select results_eq('select to_jsonb(g) from public.guardianships g order by g.id','select row from original_guardianships order by row->>''id''','guardian conserva vínculo y visibilidad');
select results_eq('select to_jsonb(a) from public.attendance_records a order by a.id','select row from original_attendance order by row->>''id''','historial íntegro sin tocar filas');
select is(public.invitation_registration_result(repeat('a',64),'35000000-0000-4000-8000-000000000112')->>'membership_status','PENDING','Edge obtiene estado real tras Auth');
select is(public.accept_invitation(repeat('a',64),'35000000-0000-4000-8000-000000000112')->>'error','invitation_not_available','token consumido no se reutiliza');
select is(public.invitation_registration_result(repeat('a',64),'35000000-0000-4000-8000-000000000001'),null::jsonb,'resultado no pertenece a otra persona');

select * from finish();
rollback;
