begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data)
select ('57000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'announcements-'||n||'@example.test','{"full_name":"Persona sintética","birthdate":"1990-01-01"}'::jsonb
from generate_series(1,9) n;
update public.users set id=('57000000-0000-4000-8000-'||lpad((right(auth_user_id::text,12)::int+100)::text,12,'0'))::uuid
where email like 'announcements-%@example.test';
insert into public.groups(id,name,invite_code,created_by) values
('57000000-0000-4000-8000-000000000201','Grupo anuncios A','ANN00001','57000000-0000-4000-8000-000000000101'),
('57000000-0000-4000-8000-000000000202','Grupo anuncios B','ANN00002','57000000-0000-4000-8000-000000000102');
insert into app_private.billing_legacy_groups(group_id) select id from public.groups on conflict do nothing;
insert into public.memberships(user_id,group_id,role,status) values
('57000000-0000-4000-8000-000000000101','57000000-0000-4000-8000-000000000201','ADMIN','ACTIVE'),
('57000000-0000-4000-8000-000000000102','57000000-0000-4000-8000-000000000202','ADMIN','ACTIVE'),
('57000000-0000-4000-8000-000000000103','57000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE'),
('57000000-0000-4000-8000-000000000103','57000000-0000-4000-8000-000000000201','COACH','ACTIVE'),
('57000000-0000-4000-8000-000000000104','57000000-0000-4000-8000-000000000201','GUARDIAN','ACTIVE'),
('57000000-0000-4000-8000-000000000105','57000000-0000-4000-8000-000000000201','ADMIN','INACTIVE'),
('57000000-0000-4000-8000-000000000106','57000000-0000-4000-8000-000000000201','ATHLETE','PENDING'),
('57000000-0000-4000-8000-000000000107','57000000-0000-4000-8000-000000000201','COACH','ACTIVE'),
('57000000-0000-4000-8000-000000000108','57000000-0000-4000-8000-000000000202','ATHLETE','ACTIVE'),
('57000000-0000-4000-8000-000000000109','57000000-0000-4000-8000-000000000201','ATHLETE','INVITED');

select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.group_announcements'::regclass,'public.push_tokens'::regclass,'public.announcement_push_preferences'::regclass,'app_private.announcement_push_deliveries'::regclass)),'RLS en todas las tablas nuevas');
select ok(not has_table_privilege('authenticated','public.group_announcements','INSERT,UPDATE,DELETE'),'sin escrituras directas en anuncios');
select ok(not has_column_privilege('authenticated','public.group_announcements','created_by','SELECT'),'no revela identidad del autor ni usuarios');
select ok(not has_column_privilege('authenticated','public.push_tokens','token','SELECT'),'no expone tokens en PostgREST');
select ok(not has_function_privilege('authenticated','public.claim_announcement_push(boolean)','EXECUTE'),'cliente no puede reservar envíos');
select ok(not has_function_privilege('authenticated','public.complete_announcement_push(uuid,uuid,text,text)','EXECUTE'),'cliente no puede falsificar recibos');
select ok(not has_function_privilege('anon','public.publish_group_announcement(uuid,text,text,uuid)','EXECUTE'),'anon no puede publicar');
select ok(not has_function_privilege('authenticated','app_private.require_announcement_admin(uuid)','EXECUTE'),'helper privado sin grant al cliente');

-- Registro y consentimiento separados: registrar un dispositivo no habilita avisos.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select lives_ok($$select public.register_announcement_push_token('ExpoPushToken[athleteSyntheticA]','ANDROID')$$,'registra token propio');
select lives_ok($$select public.register_announcement_push_token('ExpoPushToken[athleteSyntheticB]','IOS')$$,'varios dispositivos');
select is((select count(*) from public.announcement_push_preferences),0::bigint,'opt-in apagado por defecto');
select throws_ok($$select public.register_announcement_push_token('invalid','ANDROID')$$,'PT400','invalid_push_token','rechaza token inválido');
select throws_ok($$select public.register_announcement_push_token('ExpoPushToken[webSyntheticToken]','WEB')$$,'PT400','invalid_push_token','no ofrece Web Push como Expo');
select lives_ok($$select public.set_announcement_push_enabled(true)$$,'consentimiento explícito habilita avisos');
select lives_ok($$select public.register_announcement_push_token('ExpoPushToken[athleteSyntheticA]','ANDROID')$$,'registrar de nuevo es idempotente');
select is((select count(*) from public.push_tokens),2::bigint,'registro repetido no duplica dispositivos');
select throws_ok($$select public.set_announcement_push_enabled(null)$$,'PT400','invalid_push_preference','preferencia no admite null');

select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from public.push_tokens),0::bigint,'ADMIN no lee dispositivos del atleta');
select throws_ok($$select public.register_announcement_push_token('ExpoPushToken[athleteSyntheticA]','ANDROID')$$,'PT409','push_token_unavailable','no roba token activo de tercero');
select lives_ok($$select public.unregister_announcement_push_token('ExpoPushToken[athleteSyntheticA]')$$,'desregistro ajeno no enumera ni afecta');
select lives_ok($$select public.register_announcement_push_token('ExponentPushToken[adminSyntheticToken]','IOS')$$,'acepta formato Exponent');
select lives_ok($$select public.set_announcement_push_enabled(true)$$,'ADMIN opt-in');
select lives_ok($$select public.publish_group_announcement('57000000-0000-4000-8000-000000000201',' Aviso ',' Primera línea
Segunda línea ','57000000-0000-4000-8000-000000000301')$$,'ADMIN publica título y cuerpo');
select set_config('test.announcement_version',(select updated_at::text from public.group_announcements where id='57000000-0000-4000-8000-000000000301'),true);
select is((select title from public.list_group_announcements('57000000-0000-4000-8000-000000000201')),'Aviso','muro normaliza bordes');
select lives_ok($$select public.publish_group_announcement('57000000-0000-4000-8000-000000000201','Aviso',E'Primera línea\nSegunda línea','57000000-0000-4000-8000-000000000301')$$,'reintento de publicar conserva anuncio');
select is((select count(*) from public.group_announcements),1::bigint,'publicación idempotente');
select throws_ok($$select public.publish_group_announcement('57000000-0000-4000-8000-000000000201','Otro','Texto','57000000-0000-4000-8000-000000000301')$$,'PT409','announcement_request_conflict','reuso de ID con otro contenido rechazado');
select throws_ok($$select public.publish_group_announcement('57000000-0000-4000-8000-000000000201',E'\t\n','Texto',gen_random_uuid())$$,'PT400','invalid_announcement','no publica título solo whitespace');
select throws_ok($$select public.publish_group_announcement('57000000-0000-4000-8000-000000000201','Aviso',repeat('x',5001),gen_random_uuid())$$,'PT400','invalid_announcement','límite de cuerpo en servidor');
select throws_ok($$select public.list_group_announcements('57000000-0000-4000-8000-000000000201',0)$$,'PT400','invalid_announcement_page','valida paginación');
reset role;
select is((select count(*) from app_private.announcement_push_deliveries),3::bigint,'tres dispositivos: multirol no duplica destinatarios');

-- Los roles no-ADMIN leen el muro pero no administran, sin depender de toggles.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from public.list_group_announcements('57000000-0000-4000-8000-000000000201')),1::bigint,'ATHLETE/COACH ve el muro con toggles apagados');
select is((select count(*) from public.group_announcements),1::bigint,'RLS tabla base permite solo filas del grupo');
select throws_ok($$select public.publish_group_announcement('57000000-0000-4000-8000-000000000201','Ataque','Texto',gen_random_uuid())$$,'PT403','admin_required','ATHLETE no publica');
select throws_ok($$select public.update_group_announcement('57000000-0000-4000-8000-000000000201','57000000-0000-4000-8000-000000000301','Ataque','Texto',current_setting('test.announcement_version')::timestamptz)$$,'PT403','admin_required','ATHLETE no edita');
select throws_ok($$select public.delete_group_announcement('57000000-0000-4000-8000-000000000201','57000000-0000-4000-8000-000000000301',current_setting('test.announcement_version')::timestamptz)$$,'PT403','admin_required','ATHLETE no elimina');
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*) from public.list_group_announcements('57000000-0000-4000-8000-000000000201')),1::bigint,'GUARDIAN ACTIVE lee muro');
select throws_ok($$select public.publish_group_announcement('57000000-0000-4000-8000-000000000201','Ataque','Texto',gen_random_uuid())$$,'PT403','admin_required','GUARDIAN no publica');
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000007","role":"authenticated"}',true);
select is((select count(*) from public.list_group_announcements('57000000-0000-4000-8000-000000000201')),1::bigint,'COACH ACTIVE lee muro');
select throws_ok($$select public.publish_group_announcement('57000000-0000-4000-8000-000000000201','Ataque','Texto',gen_random_uuid())$$,'PT403','admin_required','COACH no publica');

-- Sin ACTIVE y ajenos: mismo 404, nunca exposición cruzada por identificador.
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select is((select count(*) from public.group_announcements),0::bigint,'INACTIVE no ve anuncios');
select throws_ok($$select public.list_group_announcements('57000000-0000-4000-8000-000000000201')$$,'PT404','group_not_found','ADMIN inactivo sin acceso');
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select is((select count(*) from public.group_announcements),0::bigint,'PENDING no ve anuncios');
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000009","role":"authenticated"}',true);
select is((select count(*) from public.group_announcements),0::bigint,'INVITED no ve anuncios');
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from public.group_announcements),0::bigint,'ADMIN ajeno no ve anuncios');
select throws_ok($$select public.list_group_announcements('57000000-0000-4000-8000-000000000201')$$,'PT404','group_not_found','grupo ajeno anti enumeración');
select throws_ok($$select public.update_group_announcement('57000000-0000-4000-8000-000000000202','57000000-0000-4000-8000-000000000301','Ataque','Texto',now())$$,'PT404','announcement_not_found','no edita anuncio ajeno usando grupo propio');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.list_group_announcements('57000000-0000-4000-8000-000000000201')$$,'PT401','authentication_required','sin identidad 401');

-- Edición concurrente y eliminación lógica.
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.update_group_announcement('57000000-0000-4000-8000-000000000201','57000000-0000-4000-8000-000000000301','Editado','Contenido actualizado',current_setting('test.announcement_version')::timestamptz)$$,'ADMIN edita');
select throws_ok($$select public.update_group_announcement('57000000-0000-4000-8000-000000000201','57000000-0000-4000-8000-000000000301','Perdido','Texto',current_setting('test.announcement_version')::timestamptz)$$,'PT409','announcement_changed','no pierde edición concurrente');
select throws_ok($$select public.delete_group_announcement('57000000-0000-4000-8000-000000000201','57000000-0000-4000-8000-000000000301',current_setting('test.announcement_version')::timestamptz)$$,'PT409','announcement_changed','no borra versión distinta');
select set_config('test.announcement_version',(select updated_at::text from public.group_announcements where id='57000000-0000-4000-8000-000000000301'),true);
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select body from public.list_group_announcements('57000000-0000-4000-8000-000000000201')),'Contenido actualizado','miembro ve edición sin nueva sesión');
reset role;
select is((select count(*) from app_private.announcement_push_deliveries),3::bigint,'editar no duplica ni genera otra notificación');

-- Opt-out invalida pendientes; segundo worker no puede reclamar el mismo envío.
set local role authenticated;
select lives_ok($$select public.set_announcement_push_enabled(false)$$,'opt-out cancela pendientes del atleta');
reset role;
select is((select count(*) from app_private.announcement_push_deliveries where status='CANCELLED'),2::bigint,'canceló sus dos dispositivos');
create temp table claim as select * from public.claim_announcement_push(false);
select is((select count(*) from claim),1::bigint,'solo ADMIN sigue elegible');
select is((select count(*) from public.claim_announcement_push(false)),0::bigint,'leases evitan envío concurrente');
select lives_ok($$select public.complete_announcement_push(delivery_id,claim_token,'accepted','synthetic-ticket') from claim$$,'guarda ticket sin afirmar entrega');
select is((select count(*) from app_private.announcement_push_deliveries where status='AWAITING_RECEIPT'),1::bigint,'ticket espera recibo');
select lives_ok($$select public.complete_announcement_push(delivery_id,claim_token,'accepted','synthetic-ticket') from claim$$,'ack duplicado es inocuo');
select is((select count(*) from public.claim_announcement_push(true)),0::bigint,'espera 15 minutos para consultar recibo');
update app_private.announcement_push_deliveries set next_attempt_at=now() where status='AWAITING_RECEIPT';
create temp table receipts as select * from public.claim_announcement_push(true);
select is((select count(*) from receipts where token is null and ticket_id='synthetic-ticket'),1::bigint,'recibos no requieren exponer token');
select lives_ok($$select public.complete_announcement_push(delivery_id,claim_token,'unregistered') from receipts$$,'DeviceNotRegistered invalida dispositivo');
select is((select count(*) from public.push_tokens where user_id='57000000-0000-4000-8000-000000000101' and is_active),0::bigint,'token inválido no recibirá nuevos envíos');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.delete_group_announcement('57000000-0000-4000-8000-000000000201','57000000-0000-4000-8000-000000000301',current_setting('test.announcement_version')::timestamptz)$$,'ADMIN elimina');
select is((select count(*) from public.list_group_announcements('57000000-0000-4000-8000-000000000201')),0::bigint,'eliminado desaparece del muro');
select is((select count(*) from public.group_announcements),0::bigint,'eliminado tampoco aparece vía tabla/RLS');
reset role;
select is((select count(*) from public.group_announcements where deleted_at is not null),1::bigint,'borrado conserva historial');

-- Revocar membresía y desregistrar un dispositivo después de publicar cancela.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.set_announcement_push_enabled(true);
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.publish_group_announcement('57000000-0000-4000-8000-000000000201','Segundo','Texto','57000000-0000-4000-8000-000000000302');
reset role;
update public.memberships set status='INACTIVE' where user_id='57000000-0000-4000-8000-000000000103';
select is((select count(*) from public.claim_announcement_push(false)),0::bigint,'revocación después de publicar evita enviar');
select is((select count(*) from app_private.announcement_push_deliveries where announcement_id='57000000-0000-4000-8000-000000000302' and status='CANCELLED'),2::bigint,'cancelación persistida en ambos dispositivos');
select set_config('test.previous_push_count',coalesce((select affected_count::text from public.job_runs where job_name='send-announcement-push' and run_date=app_private.chile_today()),'0'),true);
select lives_ok($$select public.record_announcement_push_run(1)$$,'registra ejecución sin PII');
select is((select affected_count from public.job_runs where job_name='send-announcement-push' and run_date=app_private.chile_today()),current_setting('test.previous_push_count')::integer+1,'registro operativo del job');

set local role anon;
select throws_ok($$select title from public.group_announcements$$,'42501',null,'anon no lee anuncios');
reset role;
select * from finish();
rollback;
