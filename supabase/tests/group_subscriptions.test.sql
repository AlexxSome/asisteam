begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.id(n integer) returns uuid language sql immutable as $$ select ('56000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
insert into auth.users(id,email,raw_user_meta_data) select pg_temp.id(n),'billing-'||n||'@example.test',jsonb_build_object('full_name','Persona '||n,'birthdate','1990-01-01') from generate_series(1,4) n;
update public.users set id=pg_temp.id(right(auth_user_id::text,12)::int+100) where email like 'billing-%@example.test';
insert into public.groups(id,name,invite_code,created_by) values
(pg_temp.id(201),'Equipo pagador','BILL0001',pg_temp.id(101)),(pg_temp.id(202),'Club ajeno','BILL0002',pg_temp.id(103)),
(pg_temp.id(203),'Academia','BILL0003',pg_temp.id(101)),(pg_temp.id(204),'Club histórico','BILL0004',pg_temp.id(101));
-- La temporada debe preceder al ingreso (-1 día) y a la actividad (-1 hora),
-- incluso cuando la corrida cruza la medianoche en America/Santiago.
update public.groups set created_at=now()-interval '2 days' where id=pg_temp.id(203);
-- Solo este grupo representa el snapshot anterior al despliegue.
insert into app_private.billing_legacy_groups values(pg_temp.id(204));
insert into public.memberships(id,user_id,group_id,role,status) values
(pg_temp.id(301),pg_temp.id(101),pg_temp.id(201),'ADMIN','ACTIVE'),(pg_temp.id(302),pg_temp.id(102),pg_temp.id(201),'GUARDIAN','ACTIVE'),
(pg_temp.id(303),pg_temp.id(103),pg_temp.id(202),'ADMIN','ACTIVE'),(pg_temp.id(304),pg_temp.id(101),pg_temp.id(203),'ADMIN','ACTIVE'),
(pg_temp.id(305),pg_temp.id(101),pg_temp.id(204),'ADMIN','ACTIVE'),(pg_temp.id(306),pg_temp.id(104),pg_temp.id(201),'COACH','ACTIVE');
select is((select jsonb_agg(jsonb_build_array(amount_clp,athlete_limit) order by athlete_limit) from public.billing_plans),'[[4990,50],[9990,200],[15990,1000]]'::jsonb,'catálogo aprobado mensual CLP');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.billing_plans'::regclass,'public.group_subscriptions'::regclass,'public.subscription_invoices'::regclass)),'RLS activa en las tres tablas');
select ok(not has_table_privilege('authenticated','public.group_subscriptions','SELECT,INSERT,UPDATE,DELETE'),'ni ADMIN lee/escribe suscripciones base');
select ok(not has_table_privilege('authenticated','public.subscription_invoices','SELECT,INSERT,UPDATE,DELETE'),'cliente no escribe ni lee ledger base');
select ok(not has_table_privilege('authenticated','app_private.billing_legacy_groups','SELECT,INSERT,UPDATE,DELETE'),'cliente no puede agregar exención legacy');
select ok(not has_table_privilege('anon','app_private.billing_legacy_groups','SELECT,INSERT,UPDATE,DELETE'),'anon no puede agregar exención legacy');
select ok(not has_function_privilege('authenticated','public.sync_subscription_invoice(text,text,timestamptz,integer,text,text,text,timestamptz,timestamptz)','EXECUTE'),'cliente no puede confirmar pago');
select ok(not has_function_privilege('authenticated','public.begin_subscription_checkout(uuid,uuid,text)','EXECUTE'),'cliente no puede suplantar actor Edge');
select ok(not has_function_privilege('anon','public.get_group_billing(uuid,integer)','EXECUTE'),'anon no lee facturación');
select is(app_private.group_athlete_limit(pg_temp.id(201)),0,'grupo nuevo no tiene cupos gratuitos');
select is(app_private.group_athlete_limit(pg_temp.id(204)),null::integer,'histórico conserva capacidad');
select is(app_private.group_membership_limit(pg_temp.id(204)),500,'histórico conserva total operativo 500');
select throws_ok($$insert into public.memberships(user_id,group_id,role,status) values(pg_temp.id(102),pg_temp.id(201),'ATHLETE','ACTIVE')$$,'PT422','subscription_athlete_limit','trigger impide alta sin pago incluso en escritura privilegiada');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(1),'role','authenticated')::text,true);
select is((public.get_group_billing(pg_temp.id(201))->>'athlete_limit')::int,0,'ADMIN ve onboarding sin pago');
select throws_ok($$select public.get_group_billing(pg_temp.id(202))$$,'PT404','group_not_found','ADMIN ajeno no ve facturación');
select throws_ok($$select public.get_group_billing(pg_temp.id(999))$$,'PT404','group_not_found','inexistente responde igual que ajeno');
select throws_ok($$select public.get_group_billing(pg_temp.id(201),0)$$,'PT400','invalid_billing_request','paginación válida');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(2),'role','authenticated')::text,true);
select throws_ok($$select public.get_group_billing(pg_temp.id(201))$$,'PT403','admin_required','GUARDIAN no ve deuda ni planes contratados');
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(4),'role','authenticated')::text,true);
select throws_ok($$select public.get_group_billing(pg_temp.id(201))$$,'PT403','admin_required','COACH no gestiona facturación');
reset role;
select throws_ok($$select public.begin_subscription_checkout(pg_temp.id(201),pg_temp.id(2),'TEAM')$$,'PT403','admin_required','Edge también valida rol de actor');
select throws_ok($$select public.begin_subscription_checkout(pg_temp.id(202),pg_temp.id(1),'TEAM')$$,'PT404','group_not_found','Edge valida pertenencia');
select set_config('test.team',(public.begin_subscription_checkout(pg_temp.id(201),pg_temp.id(1),'TEAM')->>'id'),true);
select is(public.begin_subscription_checkout(pg_temp.id(201),pg_temp.id(1),'TEAM')->>'id',current_setting('test.team'),'reserva idempotente por grupo');
select throws_ok($$select public.begin_subscription_checkout(pg_temp.id(201),pg_temp.id(1),'ACADEMY')$$,'PT409','subscription_exists','no crea dos renovaciones abiertas');
select ok(public.claim_subscription_creation(current_setting('test.team')::uuid),'primer ejecutor reclama creación');
select ok(not public.claim_subscription_creation(current_setting('test.team')::uuid),'segundo ejecutor no repite POST remoto');
select public.sync_group_subscription(current_setting('test.team')::uuid,'mp-team','AUTHORIZED',now(),now()+interval '1 month',null);
select is(app_private.group_athlete_limit(pg_temp.id(201)),0,'AUTHORIZED no activa cupos ni acredita pago');
select throws_ok($$select public.sync_subscription_invoice('mp-team','1',now(),1,'CLP','PAID','11',now(),now())$$,'PT400','invalid_billing_request','rechaza monto ajeno al catálogo');
select throws_ok($$select public.sync_subscription_invoice('mp-team','1',now(),4990,'USD','PAID','11',now(),now())$$,'PT400','invalid_billing_request','rechaza otra moneda');
select public.sync_subscription_invoice('mp-team','1',now(),4990,'CLP','PAID','11',now(),now());
select public.sync_subscription_invoice('mp-team','1',now(),4990,'CLP','PAID','11',now(),now());
select is((select count(*) from public.subscription_invoices),1::bigint,'webhook duplicado no duplica factura');
select public.sync_subscription_invoice('mp-team','1',now(),4990,'CLP','PENDING','11',null,now()-interval '1 hour');
select is((select status from public.subscription_invoices where provider_invoice_id='1'),'PAID','evento antiguo no deshace pago');
select is(app_private.group_athlete_limit(pg_temp.id(201)),50,'primer pago verificado habilita Equipo');
select is(app_private.group_membership_limit(pg_temp.id(201)),5000,'capacidad operativa separada del precio');
insert into public.users(id,full_name,birthdate,account_status) select pg_temp.id(10000+n),'Deportista '||n,'1990-01-01','MANAGED' from generate_series(1,1001)n;
insert into public.memberships(user_id,group_id,role,status) select pg_temp.id(10000+n),pg_temp.id(201),'ATHLETE','ACTIVE' from generate_series(1,50)n;
select throws_ok($$insert into public.memberships(user_id,group_id,role,status) values(pg_temp.id(10051),pg_temp.id(201),'ATHLETE','ACTIVE')$$,'PT422','subscription_athlete_limit','Equipo no admite deportista 51');
select public.sync_group_subscription(current_setting('test.team')::uuid,'mp-team','CANCELLED',now()+interval '1 minute',null,null);
select public.sync_group_subscription(current_setting('test.team')::uuid,'mp-team','AUTHORIZED',now()+interval '2 minutes',null,null);
select is((select status from public.group_subscriptions where id=current_setting('test.team')::uuid),'CANCELLED','cancelación terminal no se reabre');
select is(app_private.group_athlete_limit(pg_temp.id(201)),50,'cancelar nunca restablece legacy 500');
select set_config('test.club',public.begin_subscription_checkout(pg_temp.id(202),pg_temp.id(3),'CLUB')->>'id',true);
select public.sync_group_subscription(current_setting('test.club')::uuid,'mp-club','AUTHORIZED',now(),null,null);
select public.sync_subscription_invoice('mp-club','2',now(),9990,'CLP','PAID','22',now(),now());
insert into public.memberships(user_id,group_id,role,status) select pg_temp.id(10000+n),pg_temp.id(202),'ATHLETE','ACTIVE' from generate_series(1,200)n;
select throws_ok($$insert into public.memberships(user_id,group_id,role,status) values(pg_temp.id(10201),pg_temp.id(202),'ATHLETE','ACTIVE')$$,'PT422','subscription_athlete_limit','Club no admite deportista 201');
select set_config('test.academy',public.begin_subscription_checkout(pg_temp.id(203),pg_temp.id(1),'ACADEMY')->>'id',true);
select public.sync_group_subscription(current_setting('test.academy')::uuid,'mp-academy','AUTHORIZED',now(),null,null);
select public.sync_subscription_invoice('mp-academy','3',now(),15990,'CLP','PAID','33',now(),now());
insert into public.memberships(id,user_id,group_id,role,status,joined_at) select pg_temp.id(20000+n),pg_temp.id(10000+n),pg_temp.id(203),'ATHLETE','ACTIVE',now()-interval '1 day' from generate_series(1,1000)n;
select is((select count(*) from public.memberships where group_id=pg_temp.id(203) and role='ATHLETE' and status='ACTIVE'),1000::bigint,'Academia admite 1000 ATHLETE MANAGED activos');
select throws_ok($$insert into public.memberships(user_id,group_id,role,status) values(pg_temp.id(11001),pg_temp.id(203),'ATHLETE','ACTIVE')$$,'PT422','subscription_athlete_limit','Academia no admite 1001');
insert into public.memberships(user_id,group_id,role,status) select pg_temp.id(10000+n),pg_temp.id(203),'GUARDIAN','ACTIVE' from generate_series(1,1000)n;
select is((select count(*) from public.memberships where group_id=pg_temp.id(203) and status='ACTIVE'),2001::bigint,'1000 acompañantes coexisten sin consumir cupos ATHLETE');
-- El camino RPC antes limitado a 500 también admite staff sobre los 2000 integrantes.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.id(1),'role','authenticated')::text,true);
select lives_ok($$select public.assign_member_coach(pg_temp.id(203),pg_temp.id(20001))$$,'asignar COACH funciona por encima del antiguo total 500');
select is((select count(*) from public.v_attendance_roster where group_id=pg_temp.id(203)),1000::bigint,'nómina SQL completa sin truncar Academia');
reset role;
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values
(pg_temp.id(501),pg_temp.id(203),'b2c3d4e5-0001-4b3c-8d4e-111111111111','Academia 1000',now()-interval '1 hour',now(),pg_temp.id(101));
set local role authenticated;
select lives_ok($$select public.record_attendance_bulk(pg_temp.id(501),(select jsonb_agg(jsonb_build_object('membership_id',pg_temp.id(20000+n),'status','PRESENT')) from generate_series(1,500)n))$$,'primer lote 500 válido');
select lives_ok($$select public.record_attendance_bulk(pg_temp.id(501),(select jsonb_agg(jsonb_build_object('membership_id',pg_temp.id(20000+n),'status','PRESENT')) from generate_series(501,1000)n))$$,'segundo lote 500 válido');
select is((public.get_group_attendance_report(pg_temp.id(203),'season')#>>'{totals,convened}')::int,1000,'reporte totaliza ambos lotes de Academia');
select is((public.get_group_attendance_report(pg_temp.id(203),'season')#>>'{totals,attendance_pct}')::numeric,100.0,'métrica canónica se conserva para 1000 integrantes');
create temporary table report_timings(milliseconds numeric);
do $bench$ declare started timestamptz; begin
  for i in 1..20 loop
    started := clock_timestamp();
    perform public.get_group_attendance_report(pg_temp.id(203),'season');
    insert into report_timings values(extract(epoch from clock_timestamp()-started)*1000);
  end loop;
end $bench$;
select diag('Academia: p95 de 20 reportes locales (1000 atletas/1000 registros) = '||(select percentile_disc(0.95) within group(order by milliseconds) from report_timings)||' ms');
reset role;
-- Vencimiento por fecha Chile; la factura del día sigue pendiente.
select public.sync_subscription_invoice('mp-team','4',(app_private.chile_today()-1)::timestamp at time zone 'America/Santiago',4990,'CLP','PENDING',null,null,now());
select public.sync_subscription_invoice('mp-team','5',app_private.chile_today()::timestamp at time zone 'America/Santiago',4990,'CLP','PENDING',null,null,now());
set local role authenticated;
select is((public.get_group_billing(pg_temp.id(201))->>'overdue_amount_clp')::int,4990,'solo factura anterior a hoy está vencida');
select is((public.get_group_billing(pg_temp.id(201))->>'active_athletes')::int,50,'mora no desactiva deportistas');
select ok(not(public.get_group_billing(pg_temp.id(201))::text ~ 'payer|email|collector|checkout_url|provider_subscription_id|requested_by'),'DTO no expone datos privados del proveedor');
reset role;
-- Downgrade conserva los 1000 existentes y bloquea solo nuevas altas/reactivaciones.
select public.sync_group_subscription(current_setting('test.academy')::uuid,'mp-academy','CANCELLED',now()+interval '1 minute',null,null);
select set_config('test.downgrade',public.begin_subscription_checkout(pg_temp.id(203),pg_temp.id(1),'TEAM')->>'id',true);
-- now() es el mismo durante el test: ordenar explícitamente el contrato posterior.
update public.group_subscriptions set created_at=now()+interval '1 second' where id=current_setting('test.downgrade')::uuid;
select public.sync_group_subscription(current_setting('test.downgrade')::uuid,'mp-downgrade','AUTHORIZED',now(),null,null);
select public.sync_subscription_invoice('mp-downgrade','6',now(),4990,'CLP','PAID','66',now(),now());
select is(app_private.group_athlete_limit(pg_temp.id(203)),50,'nuevo pago cambia capacidad a Equipo');
select is((select count(*) from public.memberships where group_id=pg_temp.id(203) and role='ATHLETE' and status='ACTIVE'),1000::bigint,'downgrade conserva integrantes existentes');
update public.memberships set status='INACTIVE' where id=pg_temp.id(20001);
select throws_ok($$update public.memberships set status='ACTIVE' where id=pg_temp.id(20001)$$,'PT422','subscription_athlete_limit','reactivación tampoco evade límite');
select lives_ok($$update public.memberships set joined_at=joined_at where id=pg_temp.id(20002)$$,'editar miembro existente no bloquea acceso por mora/cupo');
select public.sync_group_subscription(current_setting('test.downgrade')::uuid,'mp-downgrade','CANCELLED',now()+interval '1 minute',null,null);
select is(app_private.group_athlete_limit(pg_temp.id(203)),50,'cancelar downgrade no recupera 1000');
select * from finish();
rollback;
