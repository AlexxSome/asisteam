BEGIN;
\i packages/db/fixtures/domain.sql
SELECT no_plan();
CREATE FUNCTION pg_temp.uid(n int) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT ('17300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
CREATE FUNCTION pg_temp.actor(n int) RETURNS text LANGUAGE sql AS $$ SELECT set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.uid(n),'role','authenticated','auth_provider','nest')::text,true) $$;
INSERT INTO pg_temp.fixture_accounts(id,email,profile_data) SELECT pg_temp.uid(n),'dashboard-'||n||'@example.test',jsonb_build_object('full_name','Persona '||n,'birthdate','1990-01-01') FROM generate_series(1,6) n;
UPDATE public.users SET id=pg_temp.uid(right(auth_user_id::text,12)::int+100) WHERE email LIKE 'dashboard-%';
INSERT INTO public.account_consents(user_id,terms_version,channel) SELECT pg_temp.uid(100+n),'2026-09-21','IN_APP' FROM generate_series(1,6) n;
INSERT INTO public.groups(id,name,invite_code,created_by) VALUES(pg_temp.uid(201),'Panel sintético','DASH0173',pg_temp.uid(101)),(pg_temp.uid(202),'Grupo ajeno','DASH0174',pg_temp.uid(105));
INSERT INTO app_private.billing_legacy_groups(group_id) VALUES(pg_temp.uid(201)),(pg_temp.uid(202));
INSERT INTO public.memberships(id,user_id,group_id,role,status,joined_at) VALUES
(pg_temp.uid(301),pg_temp.uid(101),pg_temp.uid(201),'ADMIN','ACTIVE',now()-interval '100 days'),
(pg_temp.uid(302),pg_temp.uid(102),pg_temp.uid(201),'ATHLETE','ACTIVE',now()-interval '100 days'),
(pg_temp.uid(303),pg_temp.uid(103),pg_temp.uid(201),'COACH','ACTIVE',now()-interval '100 days'),
(pg_temp.uid(305),pg_temp.uid(105),pg_temp.uid(202),'ADMIN','ACTIVE',now()-interval '100 days'),
(pg_temp.uid(306),pg_temp.uid(106),pg_temp.uid(201),'ATHLETE','PENDING',now()-interval '100 days');
INSERT INTO public.users(id,full_name,birthdate,account_status) SELECT pg_temp.uid(110+n),'Nombre repetido','1990-01-01','MANAGED' FROM generate_series(1,5) n;
INSERT INTO public.memberships(id,user_id,group_id,role,status,joined_at) SELECT pg_temp.uid(310+n),pg_temp.uid(110+n),pg_temp.uid(201),'ATHLETE','ACTIVE',now()-interval '100 days' FROM generate_series(1,5) n;
INSERT INTO public.users(id,full_name,birthdate,account_status) VALUES(pg_temp.uid(120),'Pupilo sintético',(app_private.chile_today()-interval '12 years')::date,'MANAGED');
INSERT INTO public.guardianships(id,guardian_user_id,athlete_user_id,relationship) VALUES(pg_temp.uid(401),pg_temp.uid(104),pg_temp.uid(120),'PARENT');
INSERT INTO public.consents(guardianship_id,consent_type,terms_version) VALUES(pg_temp.uid(401),'DATA_PROCESSING_MINOR','1.0');
INSERT INTO public.memberships(id,user_id,group_id,role,status,joined_at) VALUES(pg_temp.uid(320),pg_temp.uid(120),pg_temp.uid(201),'ATHLETE','ACTIVE',now()-interval '100 days');
INSERT INTO public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by)
SELECT pg_temp.uid(500+n),pg_temp.uid(201),'b2c3d4e5-0001-4b3c-8d4e-111111111111','Canónica '||n,
 (date_trunc('month',now() at time zone 'America/Santiago') at time zone 'America/Santiago')+n*interval '1 second',
 (date_trunc('month',now() at time zone 'America/Santiago') at time zone 'America/Santiago')+n*interval '1 second'+interval '1 hour',pg_temp.uid(101) FROM generate_series(1,10) n;
INSERT INTO public.attendance_records(activity_id,membership_id,status,note,recorded_by)
SELECT pg_temp.uid(500+n),pg_temp.uid(302),CASE WHEN n<=6 THEN 'PRESENT' WHEN n=7 THEN 'LATE' WHEN n<=9 THEN 'ABSENT' ELSE 'EXCUSED' END,'Nota propia',pg_temp.uid(101) FROM generate_series(1,10) n;
INSERT INTO public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) VALUES
(pg_temp.uid(601),pg_temp.uid(201),'b2c3d4e5-0001-4b3c-8d4e-111111111111','En curso primera',now()-interval '1 hour',now()+interval '1 hour',pg_temp.uid(101)),
(pg_temp.uid(602),pg_temp.uid(201),'b2c3d4e5-0001-4b3c-8d4e-111111111111','En curso segunda',now()-interval '30 minutes',now()+interval '1 hour',pg_temp.uid(101)),
(pg_temp.uid(603),pg_temp.uid(201),'b2c3d4e5-0001-4b3c-8d4e-111111111111','Próxima',now()+interval '10 minutes',now()+interval '1 hour',pg_temp.uid(101)),
(pg_temp.uid(604),pg_temp.uid(201),'b2c3d4e5-0001-4b3c-8d4e-111111111111','Última finalizada',now()-interval '2 hours',now()-interval '1 minute',pg_temp.uid(101)),
(pg_temp.uid(605),pg_temp.uid(202),'b2c3d4e5-0001-4b3c-8d4e-111111111111','Ajena',now(),now()+interval '1 hour',pg_temp.uid(105));
CREATE FUNCTION pg_temp.home(activity uuid DEFAULT NULL, page int DEFAULT 1) RETURNS jsonb LANGUAGE sql AS $$ SELECT public.get_group_dashboard(pg_temp.uid(201),activity,page) $$;
SELECT ok((SELECT prosecdef AND proconfig=array['search_path=""'] FROM pg_proc WHERE oid='public.get_group_dashboard(uuid,uuid,integer,integer,integer)'::regprocedure),'RPC definer search_path fijo');
SELECT ok(NOT pg_temp.can_execute('asisteam_api','app_private.membership_onboarding_rows(uuid,uuid,uuid,boolean)','EXECUTE'),'helper sin grant directo runtime');
SELECT ok(NOT pg_temp.can_execute('asisteam_test_anonymous','public.get_group_dashboard(uuid,uuid,integer,integer,integer)','EXECUTE'),'sin grant anónimo');
SELECT is((SELECT from_utc::text FROM app_private.attendance_period_bounds('month','2026-04-01',NULL,now())),'2026-04-01 03:00:00+00','mes Chile antes de cambio estacional');
SELECT is((SELECT until_utc::text FROM app_private.attendance_period_bounds('month','2026-04-01',NULL,now())),'2026-05-01 04:00:00+00','mes Chile después de cambio estacional');
SELECT is((SELECT until_utc-from_utc FROM app_private.attendance_period_bounds('week','2026-09-06',NULL,now())),interval '167 hours','semana DST de 167 horas');
SELECT is((SELECT from_date::text FROM app_private.attendance_period_bounds('week','2027-01-01',NULL,now())),'2026-12-28','semana cruza año, lunes a domingo');
SET LOCAL ROLE asisteam_api;
SELECT set_config('request.jwt.claims','{}',true);
SELECT throws_ok($$SELECT pg_temp.home()$$,'PT401','authentication_required','identidad requerida');
SELECT pg_temp.actor(1);
SELECT is(pg_temp.home()#>>'{indicators,active_athletes}','7','ATHLETE ACTIVE completos, excluye ADMIN/COACH/PENDING');
SELECT is(pg_temp.home()#>>'{indicators,monthly,attendance_pct}','77.8','total mensual ponderado canónico');
SELECT is(pg_temp.home()->'personal','null'::jsonb,'ADMIN sin ATHLETE no tiene asistencia propia');
SELECT is(pg_temp.home()->>'pending','1','pending total real');
SELECT is(jsonb_array_length(pg_temp.home()->'upcoming'),3,'próximas tres incluyendo en curso');
SELECT is(pg_temp.home()->>'selected_activity_id',pg_temp.uid(601)::text,'primera en curso estable');
SELECT is(pg_temp.home()#>>'{previous,id}',pg_temp.uid(604)::text,'última finalizada respaldo');
SELECT is(pg_temp.home()#>>'{context,unmarked}','7','sin marcar no se convierte en ausencia');
SELECT is(pg_temp.home()#>'{context,counts,attendance_pct}','null'::jsonb,'sin convocatorias es null');
SELECT is(pg_temp.home(pg_temp.uid(603))#>>'{context,phase}','preparation','futura solo preparación');
SELECT is(pg_temp.home(pg_temp.uid(603))#>'{context,counts,attendance_pct}','null'::jsonb,'futura sin porcentaje realizado');
SELECT throws_ok($$SELECT pg_temp.home(pg_temp.uid(605))$$,'PT404','activity_not_found','selector no enumera otro grupo');
SELECT throws_ok($$SELECT pg_temp.home(NULL,0)$$,'PT400','invalid_report_filters','página inválida');
SELECT is(pg_temp.home(NULL,999999)#>>'{context,records,total}','0','página vacía conserva total');
SELECT pg_temp.actor(2);
SELECT is(pg_temp.home()->'indicators','null'::jsonb,'ATHLETE toggle off ausencia de permiso distinta de cero');
SELECT is(pg_temp.home()->'pending','null'::jsonb,'pending solo ADMIN');
SELECT is(pg_temp.home()->'context','null'::jsonb,'sin resumen operativo para ATHLETE');
SELECT is(pg_temp.home()#>>'{personal,monthly,attendance_pct}','77.8','V1 siempre propio');
SELECT pg_temp.actor(3);
SELECT is(pg_temp.home()->>'access','coach','COACH autorizado');
SELECT is(pg_temp.home()#>'{context,records}','null'::jsonb,'COACH sin preview individual');
SELECT ok(NOT (pg_temp.home()::text ~ 'Nota propia|"note"|"email"|"phone"|"birthdate"'),'COACH no tiene PII/notas/records ajenos');
SELECT pg_temp.actor(4);
SELECT is(pg_temp.home()->'indicators','null'::jsonb,'GUARDIAN toggle off');
SELECT is(pg_temp.home()#>>'{wards,total}','1','V2 pupilos vigentes sin toggle');
SELECT is(pg_temp.home()#>'{wards,data,0,monthly,attendance_pct}','null'::jsonb,'pupilo sin datos no muestra cien o cero');
SELECT pg_temp.actor(5);
SELECT throws_ok($$SELECT pg_temp.home()$$,'PT404','group_not_found','ADMIN ajeno no lee grupo');
SELECT pg_temp.actor(6);
SELECT throws_ok($$SELECT pg_temp.home()$$,'PT404','group_not_found','PENDING no lee grupo');
RESET ROLE;
-- More than one preview page; canonical report excludes the future record.
INSERT INTO public.attendance_records(activity_id,membership_id,status,note,recorded_by)
SELECT pg_temp.uid(601),pg_temp.uid(310+n),'PRESENT','Nota ADMIN',pg_temp.uid(101) FROM generate_series(1,5) n;
INSERT INTO public.attendance_records(activity_id,membership_id,status,note,recorded_by) VALUES(pg_temp.uid(603),pg_temp.uid(302),'ABSENT','Futura real',pg_temp.uid(101));
UPDATE public.groups SET settings='{"athletes_can_view_group_stats":true,"guardians_can_view_group_stats":false}' WHERE id=pg_temp.uid(201);
SET LOCAL ROLE asisteam_api;
SELECT pg_temp.actor(1);
SELECT is(jsonb_array_length(pg_temp.home()#>'{context,records,data}'),4,'preview solo cuatro registros');
SELECT is(jsonb_array_length(pg_temp.home(NULL,2)#>'{context,records,data}'),1,'segunda página registro restante');
SELECT is(pg_temp.home(NULL,999999)#>>'{context,records,total}','5','totales completos incluso página vacía');
SELECT is(pg_temp.home()#>>'{context,recorded}','5','resumen una actividad');
SELECT is(pg_temp.home()#>>'{context,unmarked}','2','sin marcar separado');
SELECT is(pg_temp.home()#>>'{indicators,monthly,attendance_pct}','85.7','ponderado 12/14, no promedio individual');
SELECT is(pg_temp.home(pg_temp.uid(603))#>'{context,counts,attendance_pct}','null'::jsonb,'registros futuros reales no generan porcentaje');
SELECT pg_temp.actor(2);
SELECT is(pg_temp.home()#>>'{indicators,active_athletes}','7','toggle ATHLETE permite totales');
SELECT ok(NOT pg_temp.home()::text ~ 'Nota ADMIN','ATHLETE no recibe notas de terceros con toggle');
SELECT pg_temp.actor(4);
SELECT is(pg_temp.home()->'indicators','null'::jsonb,'toggle ATHLETE no autoriza GUARDIAN');
RESET ROLE;
UPDATE public.groups SET settings='{"athletes_can_view_group_stats":false,"guardians_can_view_group_stats":true}' WHERE id=pg_temp.uid(201);
SET LOCAL ROLE asisteam_api;
SELECT pg_temp.actor(2);
SELECT is(pg_temp.home()->'indicators','null'::jsonb,'revocación inmediata ATHLETE');
SELECT pg_temp.actor(4);
SELECT is(pg_temp.home()#>>'{indicators,active_athletes}','7','toggle GUARDIAN permite totales');
RESET ROLE;
INSERT INTO public.users(id,full_name,birthdate,account_status) SELECT pg_temp.uid(9000+n),'Menor pendiente',(app_private.chile_today()-interval '12 years')::date,'MANAGED' FROM generate_series(1,51) n;
INSERT INTO public.guardianships(guardian_user_id,athlete_user_id,relationship) SELECT pg_temp.uid(104),pg_temp.uid(9000+n),'PARENT' FROM generate_series(1,51) n;
INSERT INTO public.memberships(user_id,group_id,role,status) SELECT pg_temp.uid(9000+n),pg_temp.uid(201),'ATHLETE','PENDING' FROM generate_series(1,51) n;
SET LOCAL ROLE asisteam_api;
SELECT pg_temp.actor(4);
SELECT is(pg_temp.home()#>>'{guardian_tasks,consents}','51','tareas completas más allá de página50 sin nómina en cliente');
SELECT is(pg_temp.home()#>>'{wards,total}','1','pendientes no forman parte de panel de asistencia pupilos');
RESET ROLE;
INSERT INTO public.guardianships(id,guardian_user_id,athlete_user_id,relationship) VALUES(pg_temp.uid(402),pg_temp.uid(101),pg_temp.uid(120),'PARENT');
INSERT INTO public.consents(guardianship_id,consent_type,terms_version) VALUES(pg_temp.uid(402),'DATA_PROCESSING_MINOR','1.0');
UPDATE public.guardianships SET status='INACTIVE',deactivated_at=now() WHERE id=pg_temp.uid(401);
SET LOCAL ROLE asisteam_api;
SELECT pg_temp.actor(4);
SELECT is(pg_temp.home()#>>'{wards,total}','0','vínculo revocado retira pupilo');
SELECT is(pg_temp.home()->'indicators','null'::jsonb,'sin pupilo vigente no hay agregado');
RESET ROLE;
INSERT INTO public.consents(guardianship_id,consent_type,terms_version) SELECT id,'DATA_PROCESSING_MINOR','1.0' FROM public.guardianships WHERE athlete_user_id IN(SELECT pg_temp.uid(9000+n) FROM generate_series(1,5)n);
UPDATE public.memberships SET status='ACTIVE',joined_at=now()-interval '1 day' WHERE user_id IN(SELECT pg_temp.uid(9000+n) FROM generate_series(1,5)n) AND role='ATHLETE';
INSERT INTO public.activities(group_id,activity_type_id,title,starts_at,ends_at,created_by) SELECT pg_temp.uid(201),'b2c3d4e5-0001-4b3c-8d4e-111111111111','Agenda extensa',app_private.chile_today()::timestamp AT TIME ZONE 'America/Santiago', (app_private.chile_today()::timestamp AT TIME ZONE 'America/Santiago')+interval '1 hour',pg_temp.uid(101) FROM generate_series(1,60)n;
SET LOCAL ROLE asisteam_api;
SELECT pg_temp.actor(4);
SELECT is(pg_temp.home()#>>'{wards,total}','5','total pupilos completo mayor que página4');
SELECT is(jsonb_array_length(pg_temp.home()#>'{wards,data}'),4,'pupilos acotados a cuatro');
SELECT is(jsonb_array_length(public.get_group_dashboard(pg_temp.uid(201),NULL,1,1,2)#>'{wards,data}'),1,'segunda página pupilos');
SELECT is(jsonb_array_length(pg_temp.home()#>'{today,data}'),50,'selector día acotado a50');
SELECT is(public.get_group_dashboard(pg_temp.uid(201),NULL,1,999999,1)#>'{today,total}',pg_temp.home()#>'{today,total}','total del día independiente de página vacía');
RESET ROLE;
-- UI-05 composes active roles and withdraws ward data at authorization time.
INSERT INTO public.memberships(user_id,group_id,role,status,joined_at) VALUES(pg_temp.uid(101),pg_temp.uid(201),'ATHLETE','ACTIVE',now()-interval '100 days');
SET LOCAL ROLE asisteam_api;
SELECT pg_temp.actor(1);
SELECT is(pg_temp.home()->>'access','admin','ADMIN+ATHLETE keeps most permissive view');
SELECT ok(pg_temp.home()->'personal'<>'null'::jsonb,'ADMIN+ATHLETE preserves own attendance');
SELECT ok(pg_temp.home()->'pending'<>'null'::jsonb,'ADMIN multi-role keeps administrative totals');
RESET ROLE;
INSERT INTO public.guardianships(id,guardian_user_id,athlete_user_id,relationship) VALUES(pg_temp.uid(403),pg_temp.uid(102),pg_temp.uid(120),'PARENT');
INSERT INTO public.consents(guardianship_id,consent_type,terms_version) VALUES(pg_temp.uid(403),'DATA_PROCESSING_MINOR','1.0');
INSERT INTO public.memberships(user_id,group_id,role,status) VALUES(pg_temp.uid(102),pg_temp.uid(201),'GUARDIAN','ACTIVE') ON CONFLICT(user_id,group_id,role) DO UPDATE SET status='ACTIVE';
UPDATE public.groups SET settings='{"athletes_can_view_group_stats":false,"guardians_can_view_group_stats":false}' WHERE id=pg_temp.uid(201);
SET LOCAL ROLE asisteam_api;
SELECT pg_temp.actor(2);
SELECT is(pg_temp.home()->'indicators','null'::jsonb,'ATHLETE+GUARDIAN off toggles no aggregate');
SELECT is(pg_temp.home()#>>'{personal,monthly,attendance_pct}','77.8','ATHLETE+GUARDIAN V1 own attendance');
SELECT is(pg_temp.home()#>>'{wards,total}','1','ATHLETE+GUARDIAN V2 ward independent of toggles');
SELECT is(pg_temp.home()->'pending','null'::jsonb,'ATHLETE+GUARDIAN never receives approvals');
SELECT is(pg_temp.home()->'context','null'::jsonb,'ATHLETE+GUARDIAN never receives administrative records');
RESET ROLE;
UPDATE public.memberships SET status='INACTIVE' WHERE user_id=pg_temp.uid(101) AND group_id=pg_temp.uid(201) AND role='ATHLETE';
SET LOCAL ROLE asisteam_api;
SELECT pg_temp.actor(1);
SELECT is(pg_temp.home()->'personal','null'::jsonb,'revoked ATHLETE removes personal section despite ADMIN role');
RESET ROLE;
-- Advance only the fixture date; transaction rollback restores the canonical clock.
CREATE OR REPLACE FUNCTION app_private.chile_today() RETURNS date LANGUAGE sql STABLE SET search_path='' AS $$ SELECT ((now() AT TIME ZONE 'America/Santiago')::date+interval '6 years')::date $$;
SET LOCAL ROLE asisteam_api;
SELECT pg_temp.actor(2);
SELECT is(pg_temp.home()#>>'{wards,total}','0','18th birthday withdraws ward without waiting for daily job');
SELECT ok(pg_temp.home()->'personal'<>'null'::jsonb,'birthday preserves own ATHLETE access in the advanced period');
RESET ROLE;
UPDATE public.guardianships SET status='INACTIVE',deactivated_at=now() WHERE id=pg_temp.uid(403);
SET LOCAL ROLE asisteam_api;
SELECT pg_temp.actor(2);
SELECT is(pg_temp.home()#>>'{wards,total}','0','revoked guardianship never returns old selected ward');
RESET ROLE;
-- UI-04 faults are confined to this transaction; no production hook exists.
CREATE TEMP TABLE dashboard_definition AS SELECT pg_get_functiondef('public.get_group_dashboard(uuid,uuid,integer,integer,integer)'::regprocedure) AS definition;
CREATE OR REPLACE FUNCTION public.list_group_announcements(p_group_id uuid,p_page integer DEFAULT 1)
RETURNS TABLE(id uuid,group_id uuid,title text,body text,created_at timestamptz,updated_at timestamptz,total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'synthetic_announcement_failure'; END $$;
SET LOCAL ROLE asisteam_api;
SELECT pg_temp.actor(1);
SELECT is(pg_temp.home()->'secondary_errors','["latest_announcement"]'::jsonb,'announcement failure explicit');
SELECT is(pg_temp.home()->'latest_announcement','null'::jsonb,'failed announcement has no current data');
SELECT is(jsonb_array_length(pg_temp.home()->'upcoming'),3,'announcement failure preserves agenda');
SELECT ok(pg_temp.home()->'indicators'<>'null'::jsonb,'announcement failure preserves indicators');
SELECT is(pg_temp.home()->>'pending','47','announcement failure preserves full pending total');
RESET ROLE;
DO $$ BEGIN EXECUTE replace((SELECT definition FROM dashboard_definition),
 'SELECT count(*) INTO v_pending FROM public.memberships WHERE group_id=p_group_id AND role=''ATHLETE'' AND status=''PENDING'';',
 'SELECT 1/0 INTO v_pending;'); END $$;
SET LOCAL ROLE asisteam_api;
SELECT pg_temp.actor(1);
SELECT ok(pg_temp.home()->'secondary_errors' ? 'pending','pending failure explicit');
SELECT is(pg_temp.home()->'pending','null'::jsonb,'pending failure never becomes zero');
SELECT is(jsonb_array_length(pg_temp.home()->'upcoming'),3,'both secondary failures preserve agenda');
SELECT pg_temp.actor(3);
SELECT ok(NOT (pg_temp.home()->'secondary_errors' ? 'pending'),'COACH never reads pending even with fault');
RESET ROLE;
DO $$ BEGIN EXECUTE (SELECT definition FROM dashboard_definition); END $$;
CREATE OR REPLACE FUNCTION public.list_group_announcements(p_group_id uuid,p_page integer DEFAULT 1)
RETURNS TABLE(id uuid,group_id uuid,title text,body text,created_at timestamptz,updated_at timestamptz,total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ BEGIN RAISE SQLSTATE 'PT404' USING message='group_not_found'; END $$;
SET LOCAL ROLE asisteam_api;
SELECT pg_temp.actor(1);
SELECT throws_ok($$SELECT pg_temp.home()$$,'PT404','group_not_found','secondary authorization failure remains fatal');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
