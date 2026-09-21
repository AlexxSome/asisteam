begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data)
select ('16000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'profile-' || n || '@example.test', jsonb_build_object('full_name','Persona ' || n,'birthdate',
    case when n in (4,7) then (current_date - interval '16 years')::date else date '1990-01-01' end)
from generate_series(1,7) n;
update public.users set id = auth_user_id where email like 'profile-%@example.test';
insert into public.groups(id,name,invite_code,created_by) values
('16000000-0000-4000-8000-000000000101','Grupo Uno','GRUPO001','16000000-0000-4000-8000-000000000001'),
('16000000-0000-4000-8000-000000000102','Grupo Dos','GRUPO002','16000000-0000-4000-8000-000000000002'),
('16000000-0000-4000-8000-000000000103','Grupo Tres','GRUPO003','16000000-0000-4000-8000-000000000006');
insert into public.memberships(user_id,group_id,role,status,joined_at) values
('16000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000101','ADMIN','ACTIVE',now()),
('16000000-0000-4000-8000-000000000002','16000000-0000-4000-8000-000000000102','ADMIN','ACTIVE',now()),
('16000000-0000-4000-8000-000000000006','16000000-0000-4000-8000-000000000103','ADMIN','ACTIVE',now());
select throws_ok($$insert into public.memberships(user_id,group_id,role,status) values('16000000-0000-4000-8000-000000000004','16000000-0000-4000-8000-000000000101','ATHLETE','ACTIVE')$$,
  '23514','minor_requires_guardian_consent','R1: no se activa un menor sin apoderado y consentimiento');
insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship) values
('16000000-0000-4000-8000-000000000201','16000000-0000-4000-8000-000000000005','16000000-0000-4000-8000-000000000004','Madre');
insert into public.consents(id,guardianship_id,consent_type,terms_version,channel,allows_avatar) values
('16000000-0000-4000-8000-000000000301','16000000-0000-4000-8000-000000000201','DATA_PROCESSING_MINOR','2026-09-21','IN_APP',true);
insert into public.memberships(user_id,group_id,role,status) values
('16000000-0000-4000-8000-000000000004','16000000-0000-4000-8000-000000000101','ATHLETE','ACTIVE'),
('16000000-0000-4000-8000-000000000004','16000000-0000-4000-8000-000000000102','ATHLETE','PENDING');
select is((select count(*) from public.memberships where user_id='16000000-0000-4000-8000-000000000005' and role='GUARDIAN' and status='ACTIVE'),1::bigint,'se crea membresía GUARDIAN en el grupo activo del pupilo');
select throws_ok($$delete from public.consents where id='16000000-0000-4000-8000-000000000301'$$,'23514','consent_history_required','consentimientos conservan evidencia');
select throws_ok($$update public.consents set allows_avatar=false where id='16000000-0000-4000-8000-000000000301'$$,'23514','consent_append_only','no se sobrescribe la cláusula de imagen consentida');
select throws_ok($$update public.consents set revoked_at=now() where id='16000000-0000-4000-8000-000000000301'$$,'23514','minor_requires_guardian_consent','retirar consentimiento no deja activa a una membership menor sin respaldo');
select throws_ok($$update public.guardianships set status='INACTIVE' where id='16000000-0000-4000-8000-000000000201'$$,'23514','minor_requires_guardian','no se desvincula el último apoderado de un menor');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select lives_ok($$update public.users set full_name='Nombre Nuevo',phone='+56912345678',birthdate='1991-01-01' where id='16000000-0000-4000-8000-000000000003'$$,'adulto edita su perfil');
select is((select full_name from public.users),'Nombre Nuevo','cambios persisten en la fila global');
select throws_ok($$update public.users set email='atacante@example.test'$$,'42501',null,'email inmutable en API');
select throws_ok($$update public.users set auth_user_id=null$$,'42501',null,'identidad no editable');
select throws_ok($$update public.users set account_status='MANAGED'$$,'42501',null,'estado de cuenta no editable');
select throws_ok($$update public.users set full_name='A'$$,'23514','invalid_full_name','nombre se valida en DB');
select throws_ok($$update public.users set phone='12345678'$$,'23514','invalid_phone','teléfono E.164 en DB');
select throws_ok($$update public.users set birthdate=current_date + 1$$,'23514','invalid_birthdate','fecha futura bloqueada');
select throws_ok($$update public.users set birthdate='1800-01-01'$$,'23514','invalid_birthdate','edad excesiva bloqueada');
select throws_ok($$update public.users set avatar_url='https://externo.test/tracker.png'$$,'23514','invalid_avatar','no se admiten imágenes de terceros');
select lives_ok($$update public.users set full_name='Intruso' where id='16000000-0000-4000-8000-000000000004'$$,'RLS filtra escrituras contra otro usuario');
select is((select count(*) from public.users),1::bigint,'V5: solo perfil propio visible');
select is((select count(*) from public.list_birthdate_reviews()),0::bigint,'no ADMIN no ve revisiones');
select throws_ok($$insert into public.memberships(user_id,group_id,role,status) values('16000000-0000-4000-8000-000000000003','16000000-0000-4000-8000-000000000101','ADMIN','ACTIVE')$$,'42501',null,'cliente no puede concederse ADMIN');
select ok(public.can_upload_avatar(),'adulto puede subir avatar');
select throws_ok($$insert into storage.objects(bucket_id,name) values('avatars','16000000-0000-4000-8000-000000000004/otro.png')$$,'42501',null,'Storage no permite escribir en carpeta ajena');
select lives_ok($$insert into storage.objects(bucket_id,name) values('avatars','16000000-0000-4000-8000-000000000003/propio.png')$$,'Storage permite carpeta propia');

select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select full_name from public.users),'Persona 4','el ataque no cambió al menor');
select ok(public.can_upload_avatar(),'menor con cláusula de foto vigente puede subir');
select lives_ok($$insert into storage.objects(bucket_id,name) values('avatars','16000000-0000-4000-8000-000000000004/16000000-0000-4000-8000-000000000901.png')$$,'menor consentido sube a su carpeta');
update public.users set avatar_url='/profile/avatar/16000000-0000-4000-8000-000000000004/16000000-0000-4000-8000-000000000901.png';
select is((select count(*) from storage.objects where bucket_id='avatars'),1::bigint,'Storage aísla al propietario');
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select ok(public.can_read_avatar('16000000-0000-4000-8000-000000000004/16000000-0000-4000-8000-000000000901.png'),'ADMIN del grupo puede leer avatar actual');
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select ok(not public.can_read_avatar('16000000-0000-4000-8000-000000000004/16000000-0000-4000-8000-000000000901.png'),'ADMIN de otro grupo no lee foto');
select throws_ok($$select public.set_avatar_permission('16000000-0000-4000-8000-000000000201',true)$$,'P0002','guardianship_not_found','nadie puede consentir por otro apoderado');
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select is((select count(*) from public.list_avatar_permissions()),1::bigint,'apoderado consulta cláusula de imagen de su pupilo');
select lives_ok($$select public.set_avatar_permission('16000000-0000-4000-8000-000000000201',false)$$,'apoderado retira cláusula de imagen');
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select ok(not public.can_upload_avatar(),'permiso retirado impide nuevas fotos');
select is((select count(*) from storage.objects where bucket_id='avatars'),0::bigint,'foto histórica tampoco se puede leer después de retirar permiso');
select is((select avatar_url from public.users),null::text,'retirar foto limpia avatar_url');
select is((select count(*) from public.memberships where role='ATHLETE' and status='ACTIVE'),1::bigint,'retirar foto conserva consentimiento general y membresía');
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select lives_ok($$select public.set_avatar_permission('16000000-0000-4000-8000-000000000201',true)$$,'apoderado autoriza nuevamente sin borrar evidencia');
select is((select count(*) from public.consents),3::bigint,'cada decisión conserva historial de consentimiento');
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$update public.users set birthdate='1990-01-01'$$,'P0001','birthdate_admin_confirmation_required','PATCH directo no evita aprobación');
select throws_ok($$update public.users set birthdate=null$$,'23514','athlete_birthdate_required','NULL no evita protección de menores');
select set_config('test.request',public.request_birthdate_change('1990-01-01')::text,true);
select is(public.request_birthdate_change('1990-01-01')::text,current_setting('test.request'),'doble envío es idempotente');
select is((select count(*) from public.birthdate_change_requests where status='PENDING'),1::bigint,'solicitud persiste');

select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select is((select count(*) from public.list_birthdate_reviews()),0::bigint,'ADMIN de grupo ajeno no enumera solicitudes');
select throws_ok($$select public.review_birthdate_change(current_setting('test.request')::uuid,'16000000-0000-4000-8000-000000000101',true)$$,'P0002','request_not_found','ADMIN ajeno no aprueba');
select is((select count(*) from public.birthdate_change_requests),0::bigint,'solicitudes privadas fuera del RPC proyectado');

select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from public.list_birthdate_reviews()),1::bigint,'ADMIN ve únicamente la revisión de su grupo');
select is(public.review_birthdate_change(current_setting('test.request')::uuid,'16000000-0000-4000-8000-000000000101',true),'PENDING','primer grupo no aplica cambio global');
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select ok((select birthdate from public.users) > ((now() at time zone 'America/Santiago')::date - interval '18 years')::date,'fecha menor se conserva hasta última aprobación');

select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select ok(public.is_guardian_of('16000000-0000-4000-8000-000000000004'),'apoderado conserva visibilidad mientras está pendiente');
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.review_birthdate_change(current_setting('test.request')::uuid,'16000000-0000-4000-8000-000000000102',true),'APPLIED','también requiere grupo PENDING; última aprobación aplica');
select throws_ok($$select public.review_birthdate_change(current_setting('test.request')::uuid,'16000000-0000-4000-8000-000000000102',true)$$,'P0002','request_not_found','no se reutiliza aprobación consumida');
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select ok(not public.is_guardian_of('16000000-0000-4000-8000-000000000004'),'V3: apoderado pierde acceso inmediatamente');
reset role;
select is((select birthdate from public.users where id='16000000-0000-4000-8000-000000000004'),date '1990-01-01','fecha global aplicada');
select is((select status from public.guardianships where id='16000000-0000-4000-8000-000000000201'),'INACTIVE','vínculo histórico conservado e inactivo');
select is((select count(*) from public.consents where id='16000000-0000-4000-8000-000000000301'),1::bigint,'evidencia de consentimiento conservada');
select is((select status from public.memberships where user_id='16000000-0000-4000-8000-000000000005' and role='GUARDIAN'),'INACTIVE','GUARDIAN sin otros pupilos se desactiva');

-- Nuevos grupos y pérdida del rol ADMIN mientras la solicitud está pendiente.
insert into public.memberships(user_id,group_id,role,status) values
('16000000-0000-4000-8000-000000000007','16000000-0000-4000-8000-000000000101','ATHLETE','PENDING'),
('16000000-0000-4000-8000-000000000007','16000000-0000-4000-8000-000000000102','ATHLETE','PENDING'),
('16000000-0000-4000-8000-000000000007','16000000-0000-4000-8000-000000000101','ADMIN','ACTIVE');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select ok(not public.can_upload_avatar(),'menor sin consentimiento no puede subir avatar');
select throws_ok($$insert into storage.objects(bucket_id,name) values('avatars','16000000-0000-4000-8000-000000000007/foto.png')$$,'42501',null,'Storage también bloquea al menor sin consentimiento');
select set_config('test.request2',public.request_birthdate_change('1992-01-01')::text,true);
select throws_ok($$select public.review_birthdate_change(current_setting('test.request2')::uuid,'16000000-0000-4000-8000-000000000101',true)$$,'P0002','request_not_found','ADMIN menor no puede autoaprobar');
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.review_birthdate_change(current_setting('test.request2')::uuid,'16000000-0000-4000-8000-000000000101',true),'PENDING','solicitud nueva conserva guardia');
reset role;
insert into public.memberships(user_id,group_id,role,status) values('16000000-0000-4000-8000-000000000007','16000000-0000-4000-8000-000000000103','ATHLETE','PENDING');
update public.memberships set status='INACTIVE' where user_id='16000000-0000-4000-8000-000000000001' and role='ADMIN';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.review_birthdate_change(current_setting('test.request2')::uuid,'16000000-0000-4000-8000-000000000102',true),'PENDING','nuevo grupo y ADMIN revocado impiden aplicar');
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select is(public.review_birthdate_change(current_setting('test.request2')::uuid,'16000000-0000-4000-8000-000000000103',true),'PENDING','aprobación de ADMIN revocado no cuenta');
reset role;
update public.memberships set status='ACTIVE' where user_id='16000000-0000-4000-8000-000000000001' and role='ADMIN';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.review_birthdate_change(current_setting('test.request2')::uuid,'16000000-0000-4000-8000-000000000101',false),'REJECTED','ADMIN puede rechazar conservando fecha original');
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select set_config('test.request3',public.request_birthdate_change('1993-01-01')::text,true);
select lives_ok($$update public.users set birthdate=(current_date - interval '15 years')::date$$,'corregir dentro de minoría de edad no requiere aprobación');
select is((select status from public.birthdate_change_requests where id=current_setting('test.request3')::uuid),'CANCELLED','cambiar fecha invalida solicitud anterior');

-- Simula una solicitud creada antes del cumpleaños 18, revisada después.
reset role;
update public.users set birthdate=((now() at time zone 'America/Santiago')::date - interval '18 years')::date where id='16000000-0000-4000-8000-000000000003';
insert into public.memberships(user_id,group_id,role,status) values('16000000-0000-4000-8000-000000000003','16000000-0000-4000-8000-000000000101','ATHLETE','PENDING');
insert into public.birthdate_change_requests(id,user_id,old_birthdate,requested_birthdate)
select '16000000-0000-4000-8000-000000000401',id,birthdate,'1990-01-01' from public.users where id='16000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"16000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.review_birthdate_change('16000000-0000-4000-8000-000000000401','16000000-0000-4000-8000-000000000101',true),'APPLIED','cumpleaños durante espera no bloquea aprobación');
reset role;
select is((select status from public.birthdate_change_requests where id='16000000-0000-4000-8000-000000000401'),'APPLIED','solicitud se cierra aun cuando ya cumplió 18');

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select public.request_birthdate_change('1990-01-01')$$,'42501',null,'anon no solicita cambios');
select throws_ok($$select public.list_birthdate_reviews()$$,'42501',null,'anon no consulta revisiones');
select is((select count(*) from storage.objects where bucket_id='avatars'),0::bigint,'avatar no tiene acceso anónimo');
reset role;
select is((select public from storage.buckets where id='avatars'),false,'bucket privado');
select is((select file_size_limit from storage.buckets where id='avatars'),2097152::bigint,'límite real de 2 MB');
select * from finish();
rollback;
