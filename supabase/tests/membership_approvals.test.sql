begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,email,raw_user_meta_data)
select ('26000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'review26-'||n||'@example.test',jsonb_build_object('full_name','Persona '||n,'birthdate','1990-01-01')
from generate_series(1,6) n;
update public.users set id=('26000000-0000-4000-8000-'||lpad((right(auth_user_id::text,12)::int+100)::text,12,'0'))::uuid
where email like 'review26-%@example.test';
insert into public.users(id,full_name,birthdate,account_status)
select ('26000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Pendiente '||n,
  (app_private.chile_today()-case when n=115 then interval '20 years' when n=116 then interval '18 years' else interval '15 years' end)::date,'MANAGED'
from generate_series(111,120) n;
insert into public.groups(id,name,invite_code,created_by) values
('26000000-0000-4000-8000-000000000201','Club principal','REV26001','26000000-0000-4000-8000-000000000101'),
('26000000-0000-4000-8000-000000000202','Club ajeno','REV26002','26000000-0000-4000-8000-000000000104');
insert into public.memberships(user_id,group_id,role,status,joined_at) values
('26000000-0000-4000-8000-000000000101','26000000-0000-4000-8000-000000000201','ADMIN','ACTIVE',now()),
('26000000-0000-4000-8000-000000000102','26000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE',now()),
('26000000-0000-4000-8000-000000000103','26000000-0000-4000-8000-000000000201','GUARDIAN','ACTIVE',now()),
('26000000-0000-4000-8000-000000000104','26000000-0000-4000-8000-000000000202','ADMIN','ACTIVE',now()),
('26000000-0000-4000-8000-000000000105','26000000-0000-4000-8000-000000000201','ADMIN','INACTIVE',null);
insert into public.memberships(id,user_id,group_id,role,status,created_at)
select ('26000000-0000-4000-8000-'||lpad((n+200)::text,12,'0'))::uuid,
  ('26000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'26000000-0000-4000-8000-000000000201','ATHLETE','PENDING',now()-interval '10 days'
from generate_series(111,120) n;
insert into public.memberships(id,user_id,group_id,role,status) values
('26000000-0000-4000-8000-000000000399','26000000-0000-4000-8000-000000000112','26000000-0000-4000-8000-000000000202','ATHLETE','PENDING');
insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship,status)
select ('26000000-0000-4000-8000-'||lpad((n+400)::text,12,'0'))::uuid,
  ('26000000-0000-4000-8000-'||lpad((case when n=114 then 106 when n=119 then 105 when n=120 then 104 else 103 end)::text,12,'0'))::uuid,
  ('26000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Tutor',case when n=117 then 'INACTIVE' else 'ACTIVE' end
from unnest(array[112,113,114,117,118,119,120]) n;
insert into public.consents(guardianship_id,consent_type,terms_version,granted_at,revoked_at)
select ('26000000-0000-4000-8000-'||lpad((n+400)::text,12,'0'))::uuid,'DATA_PROCESSING_MINOR','test',
  now()-interval '2 days',case when n=113 then now()-interval '1 day' end
from unnest(array[113,114,117,118,119,120]) n;
insert into app_private.managed_member_enrollments(membership_id,guardianship_id,declared_by)
values('26000000-0000-4000-8000-000000000318','26000000-0000-4000-8000-000000000518','26000000-0000-4000-8000-000000000101');

-- Historial independiente en otro grupo: no debe ser reactivado por la revisión.
insert into public.memberships(user_id,group_id,role,status)
values('26000000-0000-4000-8000-000000000114','26000000-0000-4000-8000-000000000202','ATHLETE','ACTIVE');
update public.memberships set status='INACTIVE' where user_id='26000000-0000-4000-8000-000000000106'
  and group_id='26000000-0000-4000-8000-000000000202' and role='GUARDIAN';

select ok(not has_function_privilege('anon','public.list_pending_memberships(uuid,integer)','EXECUTE'),'anon no ve pendientes');
select ok(not has_function_privilege('anon','public.approve_membership(uuid,uuid)','EXECUTE'),'anon no aprueba');
select ok(not has_function_privilege('anon','public.reject_pending_membership(uuid,uuid)','EXECUTE'),'anon no rechaza');
select ok(not has_function_privilege('authenticated','app_private.review_pending_membership(uuid,uuid,boolean)','EXECUTE'),'helper privado cerrado');
select ok(not has_table_privilege('authenticated','public.memberships','UPDATE'),'no permite cambiar status por PostgREST');
select ok((select relrowsecurity from pg_class where oid='public.memberships'::regclass),'memberships conserva RLS');
select ok((select bool_and(proconfig @> array['search_path=""']) from pg_proc where oid in
  ('public.list_pending_memberships(uuid,integer)'::regprocedure,'public.approve_membership(uuid,uuid)'::regprocedure,
   'public.reject_pending_membership(uuid,uuid)'::regprocedure,'app_private.review_pending_membership(uuid,uuid,boolean)'::regprocedure)),'todas las funciones fijan search_path');

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000314')$$,'PT401','authentication_required','requiere sesión');
select throws_ok($$select * from public.list_pending_memberships('26000000-0000-4000-8000-000000000201')$$,'PT401','authentication_required','listado requiere sesión');
select set_config('request.jwt.claims','{"sub":"26000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000314')$$,'PT404','group_not_found','ADMIN ajeno no aprueba');
select throws_ok($$select public.reject_pending_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000314')$$,'PT404','group_not_found','ADMIN ajeno no rechaza');
select throws_ok($$select * from public.list_pending_memberships('26000000-0000-4000-8000-000000000201')$$,'PT404','group_not_found','V6 impide listar otro grupo');
select set_config('request.jwt.claims','{"sub":"26000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000314')$$,'PT403','admin_required','ATHLETE no aprueba');
select throws_ok($$select public.reject_pending_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000314')$$,'PT403','admin_required','ATHLETE no rechaza');
select throws_ok($$select * from public.list_pending_memberships('26000000-0000-4000-8000-000000000201')$$,'PT403','admin_required','V5 impide a ATHLETE leer terceros');
select set_config('request.jwt.claims','{"sub":"26000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000312')$$,'PT403','admin_required','GUARDIAN no aprueba su pupilo');
select throws_ok($$select public.reject_pending_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000312')$$,'PT403','admin_required','GUARDIAN no rechaza');
select throws_ok($$select * from public.list_pending_memberships('26000000-0000-4000-8000-000000000201')$$,'PT403','admin_required','V5 impide a GUARDIAN ver terceros');
select set_config('request.jwt.claims','{"sub":"26000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000314')$$,'PT404','group_not_found','ADMIN inactivo no aprueba');

select set_config('request.jwt.claims','{"sub":"26000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from public.list_pending_memberships('26000000-0000-4000-8000-000000000201')),10::bigint,'solo ATHLETE PENDING del grupo');
select ok((select bool_and(to_jsonb(m)-array['membership_id','full_name','is_minor','guardian_linked','guardian_ready','requires_managed_consent','total_count']='{}'::jsonb)
  from public.list_pending_memberships('26000000-0000-4000-8000-000000000201') m),'proyección mínima sin nacimiento/contacto/datos de apoderados');
select ok((select is_minor and guardian_linked and not guardian_ready from public.list_pending_memberships('26000000-0000-4000-8000-000000000201') where membership_id='26000000-0000-4000-8000-000000000312'),'distingue vínculo y consentimiento');
select ok((select not is_minor from public.list_pending_memberships('26000000-0000-4000-8000-000000000201') where membership_id='26000000-0000-4000-8000-000000000316'),'cumpleaños 18 según Chile es adulto');
select ok((select requires_managed_consent from public.list_pending_memberships('26000000-0000-4000-8000-000000000201') where membership_id='26000000-0000-4000-8000-000000000318'),'MANAGED muestra su ratificación pendiente');
select throws_ok($$select * from public.list_pending_memberships('26000000-0000-4000-8000-000000000201',-1)$$,'PT400','invalid_membership_review','offset negativo inválido');
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000399')$$,'PT404','membership_not_found','no aprueba membership de otro grupo');
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201',gen_random_uuid())$$,'PT404','membership_not_found','inexistente responde igual');
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201',(select id from public.memberships where user_id=public.auth_user_id() and role='ADMIN'))$$,'PT404','membership_not_found','no cambia otros roles');
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000311')$$,'PT422','minor_requires_guardian','sin apoderado no aprueba');
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000312')$$,'PT422','minor_requires_guardian_consent','vínculo sin consentimiento no aprueba');
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000313')$$,'PT422','minor_requires_guardian_consent','revocado no aprueba');
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000317')$$,'PT422','minor_requires_guardian','vínculo inactivo con consentimiento no aprueba');
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000318')$$,'PT422','managed_consent_required','ADMIN no sustituye ratificación de alta MANAGED');
select is((select count(*) from public.v_attendance_roster where membership_id='26000000-0000-4000-8000-000000000314'),0::bigint,'PENDING no aparece en asistencia');
select lives_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000314')$$,'aprueba menor con requisitos vigentes');
select is((select count(*) from public.v_attendance_roster where membership_id='26000000-0000-4000-8000-000000000314'),1::bigint,'ACTIVE aparece en asistencia con mismo ID');
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000314')$$,'PT409','membership_not_pending','no repite aprobación');
select throws_ok($$select public.reject_pending_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000314')$$,'PT409','membership_not_pending','decisión atrasada no desactiva un aprobado');
select lives_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000316')$$,'adulto desde hoy no exige apoderado');
select lives_ok($$select public.reject_pending_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000312')$$,'rechaza menor sin consentimiento');
select lives_ok($$select public.reject_pending_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000315')$$,'rechaza adulto pendiente');
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000312')$$,'PT409','membership_not_pending','rechazado no se reactiva por esta RPC');
select is((select count(*) from public.list_pending_memberships('26000000-0000-4000-8000-000000000201')),6::bigint,'resueltos salen de pendientes');
reset role;
select ok((select status='ACTIVE' and joined_at=now() and created_at=now()-interval '10 days' from public.memberships where id='26000000-0000-4000-8000-000000000314'),'ingreso al aprobar; conserva creación original');
select ok((select status='INACTIVE' and joined_at is null and updated_at=now() from public.memberships where id='26000000-0000-4000-8000-000000000312'),'rechazo conserva fila y fecha original; actualiza transición');
select is((select count(*) from public.guardianships where id='26000000-0000-4000-8000-000000000512'),1::bigint,'rechazo conserva vínculo');
select is((select status from public.memberships where id='26000000-0000-4000-8000-000000000399'),'PENDING','rechazo no cambia otro grupo del mismo usuario');
select is((select count(*) from public.memberships where user_id='26000000-0000-4000-8000-000000000106' and group_id='26000000-0000-4000-8000-000000000201' and role='GUARDIAN' and status='ACTIVE'),1::bigint,'CB-02 crea exactamente un GUARDIAN');
select is((select status from public.memberships where user_id='26000000-0000-4000-8000-000000000106' and group_id='26000000-0000-4000-8000-000000000202' and role='GUARDIAN'),'INACTIVE','aprobar en un grupo no reactiva apoderados en otro');
select is((select count(*) from public.attendance_records where membership_id='26000000-0000-4000-8000-000000000314'),0::bigint,'aprobación no fabrica convocatorias retroactivas');
select throws_ok($$update public.consents set revoked_at=now() where guardianship_id='26000000-0000-4000-8000-000000000514'$$,'23514','minor_requires_guardian_consent','R1 sigue protegiendo consentimiento tras aprobar');

-- Evidencia futura no vigente y un consentimiento de otro tipo no bastan.
insert into public.consents(guardianship_id,consent_type,terms_version,granted_at) values
('26000000-0000-4000-8000-000000000513','DATA_PROCESSING_MINOR','future',now()+interval '1 day'),
('26000000-0000-4000-8000-000000000513','ACCOUNT_ACTIVATION_MINOR','test',now());
set local role authenticated;
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000313')$$,'PT422','minor_requires_guardian_consent','consentimiento futuro o de otro tipo no habilita');
reset role;

-- Un apoderado que ya está en 30 grupos no puede recibir uno nuevo al aprobar.
insert into public.groups(id,name,invite_code,created_by)
select ('26000000-0000-4000-8001-'||lpad(n::text,12,'0'))::uuid,'Grupo sintético '||n,'R26G'||lpad(n::text,4,'0'),'26000000-0000-4000-8000-000000000104'
from generate_series(1,29) n;
insert into public.memberships(user_id,group_id,role,status)
select '26000000-0000-4000-8000-000000000104',id,'ADMIN','ACTIVE' from public.groups where invite_code like 'R26G%';
set local role authenticated;
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000320')$$,'PT422','guardian_group_limit','límite de 30 grupos incluye GUARDIAN automático');
reset role;
select is((select status from public.memberships where id='26000000-0000-4000-8000-000000000320'),'PENDING','fallo del apoderado no activa parcialmente al pupilo');

-- Caben 499 activos, pero el menor necesita dos cupos (ATHLETE + GUARDIAN).
with profiles as (
  insert into public.users(full_name,birthdate,account_status)
  select 'Capacidad revisión','1990-01-01','MANAGED' from generate_series(1,499-(select count(*)::int from public.memberships where group_id='26000000-0000-4000-8000-000000000201' and status='ACTIVE')) returning id
) insert into public.memberships(user_id,group_id,role,status)
select id,'26000000-0000-4000-8000-000000000201','ATHLETE','ACTIVE' from profiles;
set local role authenticated;
select throws_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000319')$$,'PT422','group_member_limit','cuenta al apoderado dentro del límite de 500');
reset role;
select is((select status from public.memberships where id='26000000-0000-4000-8000-000000000319'),'PENDING','capacidad revierte aprobación');
update public.memberships set status='INACTIVE' where id=(select m.id from public.memberships m join public.users u on u.id=m.user_id where u.full_name='Capacidad revisión' limit 1);
set local role authenticated;
select lives_ok($$select public.approve_membership('26000000-0000-4000-8000-000000000201','26000000-0000-4000-8000-000000000319')$$,'dos cupos disponibles permiten incorporación atómica');
reset role;
select is((select count(*) from public.memberships where group_id='26000000-0000-4000-8000-000000000201' and status='ACTIVE'),500::bigint,'queda exactamente en el límite');

-- Paginación: más de 100 pendientes siguen accesibles.
with profiles as (
  insert into public.users(full_name,birthdate,account_status)
  select 'Página '||n,'1990-01-01','MANAGED' from generate_series(1,101) n returning id
) insert into public.memberships(user_id,group_id,role,status)
select id,'26000000-0000-4000-8000-000000000201','ATHLETE','PENDING' from profiles;
set local role authenticated;
select is((select count(*) from public.list_pending_memberships('26000000-0000-4000-8000-000000000201')),50::bigint,'primera página de 50');
select is((select count(*) from public.list_pending_memberships('26000000-0000-4000-8000-000000000201',50)),50::bigint,'segunda página de 50');
select is((select count(*) from public.list_pending_memberships('26000000-0000-4000-8000-000000000201',100)),6::bigint,'tercera página conserva los restantes');
select is((select total_count from public.list_pending_memberships('26000000-0000-4000-8000-000000000201') limit 1),106::bigint,'conteo total consistente');
select * from finish();
rollback;
