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
-- Fixture previo a suscripciones: conserva la capacidad histórica (sin alterar guards).
insert into app_private.billing_legacy_groups(group_id) select id from public.groups on conflict do nothing;
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
select throws_ok($$select public.review_managed_activation((select id from request_id),true)$$,
 'PT409','activation_request_changed','una solicitud rechazada no se puede aprobar después');
select is((select count(*) from public.list_managed_activation_requests('35000000-0000-4000-8000-000000000201')),
 0::bigint,'la decisión rechazada no vuelve a ofrecerse como pendiente');
reset role;
select ok((select status='REJECTED' and resolved_at is not null and resolved_at >= requested_at and consent_id is null
 from app_private.managed_activation_requests where id=(select id from request_id)),
 'HU-APO-07: rechazo conserva evidencia con timestamp sin otorgar consentimiento');
select is((select count(*) from public.consents where consent_type='ACCOUNT_ACTIVATION_MINOR'),0::bigint,'rechazo no concede consentimiento');
select is((select account_status from public.users where id='35000000-0000-4000-8000-000000000012'),'MANAGED','rechazo conserva MANAGED');
-- Un enlace previo no debe habilitar credenciales después del rechazo.
insert into public.invitations(group_id,email,invited_user_id,role,token,created_by,activation_membership_id)
 values('35000000-0000-4000-8000-000000000201','activation-12@example.test','35000000-0000-4000-8000-000000000012',
 'ATHLETE',repeat('e',64),'35000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000312');
select throws_ok($$select public.prepare_invitation_registration(repeat('e',64),repeat('f',64),'activation-12@example.test',
 '{"managed_claim":true,"terms_version":"2026-09-21"}'::jsonb)$$,
 'PT422','guardian_consent_required','HU-APO-07: el enlace no permite crear contraseña tras el rechazo');
select is((select count(*) from app_private.invitation_registrations where token_hash=repeat('e',64)),0::bigint,
 'rechazo no prepara credenciales');
select is((select count(*) from auth.users where email='activation-12@example.test'),0::bigint,'rechazo conserva ausencia de Auth');
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
select ok((select r.status='APPROVED' and r.resolved_at is not null and r.resolved_at >= r.requested_at
 and c.granted_at=r.resolved_at and c.terms_version='2026-09-21'
 and c.guardianship_id='35000000-0000-4000-8000-000000000401'::uuid
 from app_private.managed_activation_requests r join public.consents c on c.id=r.consent_id
 where r.id=(select id from request_id)), 'HU-APO-07: aprobación vincula timestamp, condiciones y apoderado');
select is((select count(*) from app_private.managed_activation_requests where status='REJECTED' and resolved_at is not null),
 1::bigint,'nueva aprobación conserva el rechazo anterior como histórico');
select is((select auth_user_id from public.users where id='35000000-0000-4000-8000-000000000012'),null::uuid,'consentir no crea credenciales');
select throws_ok($$select public.issue_managed_activation('35000000-0000-4000-8000-000000000004','35000000-0000-4000-8000-000000000201','35000000-0000-4000-8000-000000000312',repeat('a',64))$$,'PT403','activation_sender_required','solo el apoderado autor original despacha solicitud');
select lives_ok($$select public.issue_managed_activation('35000000-0000-4000-8000-000000000002','35000000-0000-4000-8000-000000000201','35000000-0000-4000-8000-000000000312',repeat('a',64))$$,'apoderado autorizado despacha enlace solicitado por ADMIN');
select lives_ok($$select public.issue_managed_activation('35000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000201','35000000-0000-4000-8000-000000000311',repeat('b',64))$$,'ADMIN envía adulto');
select is((select activation_membership_id from public.invitations where token=repeat('a',64)),'35000000-0000-4000-8000-000000000312'::uuid,'activación ligada al historial existente');
select is(public.invitation_context(repeat('a',64))->>'managed_activation','true','preview identifica el propósito de activación del enlace');

-- HU-DEP-07: el titular solo aporta credenciales y condiciones. Ni el perfil
-- ni la autorización se toman de metadatos enviados por el navegador.
create function pg_temp.prepare_claim(n integer, token text, nonce text) returns void language sql as $$
 select public.prepare_invitation_registration(token,encode(extensions.digest(nonce,'sha256'),'hex'),
  'activation-'||n||'@example.test','{"managed_claim":true,"terms_version":"2026-09-21"}'::jsonb)
$$;
create function pg_temp.finish_claim(n integer, nonce text) returns void language sql as $$
 insert into auth.users(id,email,raw_user_meta_data)
 values(('35000000-0000-4000-8000-'||lpad((n+100)::text,12,'0'))::uuid,
  'activation-'||n||'@example.test',jsonb_build_object('invitation_registration_nonce',nonce,
    'full_name','Perfil suplantado','birthdate','1990-01-01'))
$$;
select throws_ok($$select pg_temp.prepare_claim(11,repeat('a',64),'claim-wrong-email')$$,
 'PT404','invitation_not_available','no permite reclamar una cuenta de otro destinatario');
select throws_ok($$select pg_temp.prepare_claim(11,repeat('c',64),'claim-unknown')$$,
 'PT404','invitation_not_available','un token desconocido no prepara credenciales');
select throws_ok($$select public.prepare_invitation_registration(repeat('b',64),repeat('d',64),
 'activation-11@example.test','{"managed_claim":true}'::jsonb)$$,
 'PT400','invalid_registration','reclamo requiere aceptar la versión de condiciones');

create function pg_temp.register_managed(n integer, token text) returns void language plpgsql as $$
declare nonce text := 'activation-test-'||n;
begin
 perform public.prepare_invitation_registration(token,encode(extensions.digest(nonce,'sha256'),'hex'),'activation-'||n||'@example.test',
  jsonb_build_object('full_name','Titular registrado','birthdate',(select birthdate from public.users where email='activation-'||n||'@example.test'),'terms_version','2026-09-21'));
 insert into auth.users(id,email,raw_user_meta_data) values(('35000000-0000-4000-8000-'||lpad((n+100)::text,12,'0'))::uuid,
  'activation-'||n||'@example.test',jsonb_build_object('invitation_registration_nonce',nonce));
end $$;
update public.consents set revoked_at=now() where consent_type='ACCOUNT_ACTIVATION_MINOR';
select throws_ok($$select pg_temp.prepare_claim(12,repeat('a',64),'claim-missing-consent')$$,
 'PT422','guardian_consent_required','informa consentimiento faltante antes de crear Auth');
select throws_ok($$select pg_temp.register_managed(12,repeat('a',64))$$,'P0001','guardian_consent_required','revocar después del envío bloquea credenciales');
select is((select count(*) from auth.users where email='activation-12@example.test'),0::bigint,'Auth revierte ante consentimiento revocado');
select is((select status from public.invitations where token=repeat('a',64)),'PENDING','rechazo no consume token');
insert into public.consents(guardianship_id,consent_type,terms_version,channel)
 values('35000000-0000-4000-8000-000000000401','ACCOUNT_ACTIVATION_MINOR','2026-09-21','IN_APP');
select lives_ok($$select pg_temp.prepare_claim(12,repeat('a',64),'claim-revoked-race')$$,'prepara prueba con autorización vigente');
update public.consents set revoked_at=now() where consent_type='ACCOUNT_ACTIVATION_MINOR' and revoked_at is null;
select throws_ok($$select pg_temp.finish_claim(12,'claim-revoked-race')$$,
 'P0001','guardian_consent_required','la revocación entre preparación y Auth también bloquea credenciales');
select is((select count(*) from auth.users where email='activation-12@example.test'),0::bigint,'la carrera revierte Auth completo');
select public.cancel_invitation_registration(encode(extensions.digest('claim-revoked-race','sha256'),'hex'));
insert into public.consents(guardianship_id,consent_type,terms_version,channel)
 values('35000000-0000-4000-8000-000000000401','ACCOUNT_ACTIVATION_MINOR','2026-09-21','IN_APP');
-- La cuenta puede activarse sin aprobar/reactivar memberships por accidente.
update public.memberships set status='PENDING' where id='35000000-0000-4000-8000-000000000312';
update public.memberships set status='INACTIVE' where id='35000000-0000-4000-8000-000000000311';
truncate original_memberships;
insert into original_memberships select to_jsonb(m) from public.memberships m;
select pg_temp.prepare_claim(12,repeat('a',64),'claim-minor');
select pg_temp.prepare_claim(11,repeat('b',64),'claim-adult');
update public.users set full_name='Perfil vigente del menor',phone='+56912345678'
 where id='35000000-0000-4000-8000-000000000012';
select lives_ok($$select pg_temp.finish_claim(12,'claim-minor')$$,'menor consentido activa cuenta existente');
select lives_ok($$select pg_temp.finish_claim(11,'claim-adult')$$,'adulto activa sin apoderado');
select is((select full_name||':'||phone from public.users where id='35000000-0000-4000-8000-000000000012'),
 'Perfil vigente del menor:+56912345678','conserva perfil vigente aunque ADMIN lo editó después de preparar el reclamo');
select is((select count(*) from app_private.invitation_registrations where token_hash in (repeat('a',64),repeat('b',64))),
 0::bigint,'la aceptación limpia las pruebas efímeras');
select is((select count(*) from public.users where id in ('35000000-0000-4000-8000-000000000011','35000000-0000-4000-8000-000000000012') and account_status='ACTIVE'),2::bigint,'mantiene IDs y activa ambas cuentas');
select results_eq('select to_jsonb(m) from public.memberships m order by m.id','select row from original_memberships order by row->>''id''','todas las memberships, estados y fechas quedan intactos');
select results_eq('select to_jsonb(g) from public.guardianships g order by g.id','select row from original_guardianships order by row->>''id''','guardian conserva vínculo y visibilidad');
select results_eq('select to_jsonb(a) from public.attendance_records a order by a.id','select row from original_attendance order by row->>''id''','historial íntegro sin tocar filas');
select is(public.invitation_registration_result(repeat('a',64),'35000000-0000-4000-8000-000000000112')->>'membership_status','PENDING','Edge obtiene estado real tras Auth');
select is(public.accept_invitation(repeat('a',64),'35000000-0000-4000-8000-000000000112')->>'error','invitation_not_available','token consumido no se reutiliza');
select is(public.invitation_registration_result(repeat('a',64),'35000000-0000-4000-8000-000000000001'),null::jsonb,'resultado no pertenece a otra persona');

select * from finish();
rollback;
