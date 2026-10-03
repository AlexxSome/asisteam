begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.uid(n integer) returns uuid language sql as $$
  select ('46000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid
$$;
-- Reloj de dominio dentro de la transacción: la edad cambia sin editar birthdate.
create or replace function app_private.chile_today() returns date language sql stable
set search_path = '' as $$ select date '2026-04-04' $$;
insert into auth.users(id,email,raw_user_meta_data)
select pg_temp.uid(n), 'wards46-' || n || '@example.test',
  jsonb_build_object('full_name','Persona ' || n,'birthdate','1990-01-01') from generate_series(1,3) n;
update public.users set id = pg_temp.uid(right(auth_user_id::text,12)::integer + 100)
where email like 'wards46-%@example.test';
insert into public.users(id,full_name,birthdate,account_status,email,phone) values
(pg_temp.uid(111),'Pupilo menor','2011-01-01','MANAGED',null,'+56911111111'),
(pg_temp.uid(112),'Pupilo cumpleaños','2008-04-05','MANAGED','ward46@example.test','+56922222222'),
(pg_temp.uid(113),'Deportista ajeno','2012-01-01','MANAGED',null,null);
insert into public.groups(id,name,sport,invite_code,created_by) values
(pg_temp.uid(201),'Club principal','Tenis','WRD46001',pg_temp.uid(103)),
(pg_temp.uid(202),'Segundo club','Fútbol','WRD46002',pg_temp.uid(103)),
(pg_temp.uid(203),'Grupo no compartido','Tenis','WRD46003',pg_temp.uid(103));
-- Fixture previo a suscripciones: conserva la capacidad histórica (sin alterar guards).
insert into app_private.billing_legacy_groups(group_id) select id from public.groups on conflict do nothing;
insert into public.memberships(user_id,group_id,role,status) values
(pg_temp.uid(103),pg_temp.uid(201),'ADMIN','ACTIVE'),
(pg_temp.uid(103),pg_temp.uid(202),'ADMIN','ACTIVE'),
(pg_temp.uid(103),pg_temp.uid(203),'ADMIN','ACTIVE'),
(pg_temp.uid(101),pg_temp.uid(201),'ATHLETE','ACTIVE'),
(pg_temp.uid(111),pg_temp.uid(201),'ATHLETE','PENDING'),
(pg_temp.uid(111),pg_temp.uid(203),'ATHLETE','PENDING'),
(pg_temp.uid(112),pg_temp.uid(201),'ATHLETE','PENDING'),
(pg_temp.uid(112),pg_temp.uid(202),'ATHLETE','PENDING'),
(pg_temp.uid(113),pg_temp.uid(201),'ATHLETE','PENDING');
insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship) values
(pg_temp.uid(301),pg_temp.uid(101),pg_temp.uid(111),'Madre'),
(pg_temp.uid(302),pg_temp.uid(101),pg_temp.uid(112),'Madre'),
(pg_temp.uid(303),pg_temp.uid(102),pg_temp.uid(112),'Padre'),
(pg_temp.uid(304),pg_temp.uid(103),pg_temp.uid(113),'Tutor');
insert into public.consents(guardianship_id,consent_type,terms_version)
select pg_temp.uid(n),'DATA_PROCESSING_MINOR','test' from generate_series(301,304) n;
update public.memberships set status='ACTIVE',joined_at=now()
where user_id in (pg_temp.uid(111),pg_temp.uid(112)) and group_id <> pg_temp.uid(203);

select ok(not has_table_privilege('anon','public.v_my_wards','SELECT'),'anon no lista pupilos');
select ok(not has_table_privilege('anon','public.v_my_ward_groups','SELECT'),'anon no lista grupos de pupilos');
select ok(not has_table_privilege('authenticated','public.job_runs','SELECT'),'no expone job_runs');
select ok(not has_table_privilege('authenticated','app_private.guardianship_majority_deliveries','SELECT'),'recibos privados');
select ok((select relrowsecurity from pg_class where oid='public.job_runs'::regclass),'job_runs con RLS');
select ok((select relrowsecurity from pg_class where oid='app_private.guardianship_majority_deliveries'::regclass),'recibos con RLS');
select ok(not has_function_privilege('authenticated','public.run_guardianship_majority()','EXECUTE'),'cliente no ejecuta job');
select ok(not has_function_privilege('anon','public.claim_guardianship_majority_emails()','EXECUTE'),'anon no obtiene destinatarios');
select ok(not has_function_privilege('authenticated','public.claim_guardianship_majority_emails()','EXECUTE'),'cliente no obtiene destinatarios');
select ok(not has_function_privilege('authenticated','public.complete_guardianship_majority_email(uuid,uuid)','EXECUTE'),'cliente no marca entregas');
select ok(not has_function_privilege('authenticated','app_private.dispatch_guardianship_majority()','EXECUTE'),'cliente no despacha job');
select ok((select proconfig @> array['search_path=""'] from pg_proc where oid='public.run_guardianship_majority()'::regprocedure),'job fija search_path');
select is((select schedule from cron.job where jobname='guardianship-majority'),'*/10 * * * *','cron permite reintentos y horario Chile desde SQL');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.uid(1),'role','authenticated')::text,true);
select is((select count(*) from public.v_my_wards),2::bigint,'lista cada pupilo una sola vez aunque tenga varios grupos');
select is((select count(*) from public.v_my_ward_groups),3::bigint,'solo grupos compartidos donde ATHLETE vigente');
select is((select count(*) from public.v_my_ward_groups where group_id=pg_temp.uid(203)),0::bigint,'V6 excluye grupo sin membership GUARDIAN');
select is((select count(*) from public.v_my_wards where athlete_user_id=pg_temp.uid(113)),0::bigint,'otro atleta del mismo grupo no es visible');
select is((select count(*) from public.v_my_wards where athlete_user_id=pg_temp.uid(999)),0::bigint,'inexistente y no vinculado producen la misma ausencia');
select is((select age from public.v_my_wards where athlete_user_id=pg_temp.uid(112)),17,'edad calculada en Chile');
select is((select days_until_majority from public.v_my_wards where athlete_user_id=pg_temp.uid(112)),1,'puede avisar antes de mayoría de edad');
select ok((select bool_and(to_jsonb(w)-array['athlete_user_id','full_name','avatar_url','age','days_until_majority']='{}'::jsonb) from public.v_my_wards w),'V5 no proyecta contacto, birthdate ni otros apoderados');
select ok((select bool_and(to_jsonb(g)-array['athlete_user_id','group_id','name','sport','membership_status']='{}'::jsonb) from public.v_my_ward_groups g),'grupos no filtran código ni settings');
select ok((select bool_and(avatar_url is null) from public.v_my_wards),'sin consentimiento de imagen no muestra foto');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.uid(3),'role','authenticated')::text,true);
select is((select count(*) from public.v_my_wards where athlete_user_id in (pg_temp.uid(111),pg_temp.uid(112))),0::bigint,'ser ADMIN no permite el contexto privado de otro apoderado');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select is((select count(*) from public.v_my_wards),0::bigint,'sin identidad no devuelve pupilos');
reset role;

-- Cumpleaños real: no actualizamos usuarios, así el trigger antiguo no ayuda.
create or replace function app_private.chile_today() returns date language sql stable
set search_path = '' as $$ select date '2026-04-05' $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.uid(1),'role','authenticated')::text,true);
select is((select count(*) from public.v_my_wards),1::bigint,'V3 desaparece desde cumpleaños aun antes del job');
select is((select count(*) from public.v_my_wards where athlete_user_id=pg_temp.uid(112)),0::bigint,'URL antigua no obtiene perfil adulto');
select is((select count(*) from public.v_my_ward_groups where athlete_user_id=pg_temp.uid(112)),0::bigint,'tampoco obtiene grupos del ex-pupilo');
reset role;
select is((select status from public.guardianships where id=pg_temp.uid(302)),'ACTIVE','fixture reproduce transición pendiente del job');
set local role service_role;
select is(public.run_guardianship_majority(),1,'job procesa una persona con dos apoderados');
select is(public.run_guardianship_majority(),0,'reintento de la fecha es idempotente');
reset role;
select is((select count(*) from public.guardianships where athlete_user_id=pg_temp.uid(112) and status='INACTIVE' and deactivated_at is not null),2::bigint,'persiste baja de ambos vínculos conservando filas');
select is((select count(*) from public.consents where guardianship_id in (pg_temp.uid(302),pg_temp.uid(303))),2::bigint,'conserva evidencia legal');
select is((select status from public.memberships where user_id=pg_temp.uid(101) and group_id=pg_temp.uid(201) and role='GUARDIAN'),'ACTIVE','conserva acceso al otro menor');
select is((select status from public.memberships where user_id=pg_temp.uid(101) and group_id=pg_temp.uid(202) and role='GUARDIAN'),'INACTIVE','inactiva grupo sin otros pupilos');
select is((select count(*) from public.memberships where user_id=pg_temp.uid(102) and role='GUARDIAN' and status='ACTIVE'),0::bigint,'apoderado sin otros pupilos queda inactivo');
select is((select status from public.memberships where user_id=pg_temp.uid(101) and role='ATHLETE'),'ACTIVE','preserva otros roles del apoderado');
select is((select count(*) from public.memberships where user_id=pg_temp.uid(112) and role='ATHLETE' and status='ACTIVE'),2::bigint,'no altera membresías del deportista adulto');
select is((select count(*) from public.job_runs where run_date='2026-04-05'),1::bigint,'una evidencia por día');
select is((select count(*) from app_private.guardianship_majority_deliveries where athlete_user_id=pg_temp.uid(112)),4::bigint,'correo para deportista, dos apoderados y ADMIN de MANAGED, sin duplicar ADMIN multi-grupo');
set local role service_role;
create temp table deliveries as select * from public.claim_guardianship_majority_emails();
select is((select count(*) from deliveries),4::bigint,'solo Edge obtiene lote de destinatarios');
select is((select count(*) from public.claim_guardianship_majority_emails()),0::bigint,'no reclama en paralelo entregas con lease');
select public.complete_guardianship_majority_email(delivery_id,gen_random_uuid()) from deliveries;
reset role;
select is((select count(*) from app_private.guardianship_majority_deliveries where sent_at is not null),0::bigint,'token equivocado no confirma entrega');
set local role service_role;
select public.complete_guardianship_majority_email(delivery_id,claim_token) from deliveries;
reset role;
select is((select count(*) from app_private.guardianship_majority_deliveries where athlete_user_id=pg_temp.uid(112) and sent_at is not null),4::bigint,'registra entrega confirmada');
set local role service_role;
select is((select count(*) from public.claim_guardianship_majority_emails()),0::bigint,'entregas confirmadas no se reenvían');
reset role;
select * from finish();
rollback;
