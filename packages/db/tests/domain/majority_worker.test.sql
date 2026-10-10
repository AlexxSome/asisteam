begin;
\i packages/db/fixtures/domain.sql

select no_plan();
create or replace function app_private.worker_now() returns timestamptz language sql stable set search_path='' as $$select '2026-04-05 03:29:00+00'::timestamptz$$;
select is((select mode from app_private.majority_executor),'WORKER','instalación usa worker independiente');
update app_private.majority_executor set mode='DRAINING';
select is((select count(*) from app_private.worker_claim_transition()),0::bigint,'worker cannot execute before handoff');
select ok(not pg_temp.can_execute('asisteam_jobs','app_private.majority_handoff(text,boolean)','EXECUTE'),'jobs cannot perform handoff');
select ok(not pg_temp.can_execute('asisteam_jobs','app_private.majority_transition()','EXECUTE'),'jobs cannot bypass lease');
select ok(not pg_temp.can_execute('asisteam_api','app_private.worker_claim_email()','EXECUTE'),'API cannot obtain emails');
select ok(not has_table_privilege('asisteam_jobs','public.users','SELECT'),'jobs has no direct PII access');
select ok(not has_table_privilege('asisteam_jobs','app_private.majority_tasks','UPDATE'),'jobs cannot forge leases');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('app_private.majority_tasks'::regclass,'app_private.majority_executor'::regclass)),'new private tables have RLS');
update app_private.majority_executor set mode='DRAINING',draining_since=app_private.worker_now();
select is((select count(*) from pg_namespace where nspname='cron'),0::bigint,'sin scheduler proveedor');
select ok(to_regprocedure('public.run_guardianship_majority()') is null,'old transition fenced during drain (capacidad retirada)');
select ok(to_regprocedure('public.claim_guardianship_majority_emails()') is null,'old delivery claim fenced during drain (capacidad retirada)');
select ok(not pg_temp.can_execute('asisteam_jobs','app_private.majority_handoff(text,boolean)','EXECUTE'),'worker no decide activación');
update app_private.majority_executor set draining_since=app_private.worker_now()-interval '11 minutes';
select is((select mode from app_private.majority_executor),'DRAINING','tiempo no activa ejecutor');
update app_private.majority_executor set mode='WORKER';
select ok(to_regprocedure('public.run_guardianship_majority()') is null,'old transition fenced after activation (capacidad retirada)');
select ok(to_regprocedure('public.complete_guardianship_majority_email(uuid,uuid)') is null,'old receipt cannot write in worker mode (capacidad retirada)');
-- 2026 fall DST repeats local 23:00; local date avoids two daily tasks.
select is((select count(*) from app_private.worker_claim_transition()),1::bigint,'Chile date gets task after 00:30');
create temporary table lease as select run_date,lease_token from app_private.majority_tasks where completed_at is null;
select is((select count(*) from app_private.worker_claim_transition()),0::bigint,'second replica cannot claim live lease');
select is(app_private.worker_complete_transition((select run_date from lease),gen_random_uuid()),false,'incorrect token cannot complete');
update app_private.majority_tasks set lease_until=app_private.worker_now()-interval '1 second';
create temporary table reclaimed as select * from app_private.worker_claim_transition();
select is((select count(*) from reclaimed),1::bigint,'crash lease recovered');
select ok((select lease_token from lease)<>(select lease_token from reclaimed),'recovery issues new token');
select is(app_private.worker_complete_transition((select run_date from lease),(select lease_token from lease)),false,'stale worker fenced');
-- Do not execute the domain transition against unrelated fixture state here; my_wards covers it.
update app_private.majority_tasks set completed_at=app_private.worker_now(),lease_until=null;
create or replace function app_private.worker_now() returns timestamptz language sql stable set search_path='' as $$select '2026-09-06 03:29:00+00'::timestamptz$$;
select is((select count(*) from app_private.worker_claim_transition()),1::bigint,'late prior Chile day catches up before spring jump');
select is((select run_date::text from app_private.majority_tasks where completed_at is null),'2026-09-05','UTC new day remains previous Chile date');
update app_private.majority_tasks set completed_at=app_private.worker_now(),lease_until=null;
create or replace function app_private.worker_now() returns timestamptz language sql stable set search_path='' as $$select '2026-09-06 04:00:00+00'::timestamptz$$;
select is((select count(*) from app_private.worker_claim_transition()),1::bigint,'missing spring 00:30 catches up at 01:00');
select is((select run_date::text from app_private.majority_tasks where completed_at is null),'2026-09-06','uses Chile date at DST');
select is((select count(*) from app_private.worker_claim_transition()),0::bigint,'restart has no duplicate claim');
create or replace function app_private.worker_now() returns timestamptz language sql stable set search_path='' as $$select '2026-09-07 03:29:00+00'::timestamptz$$;
select is((select count(*) from app_private.worker_claim_transition()),0::bigint,'expired task from yesterday does not run next day before 00:30');
create or replace function app_private.worker_now() returns timestamptz language sql stable set search_path='' as $$select '2026-09-07 03:30:00+00'::timestamptz$$;
-- Restrict delivery fixture to a transactional synthetic outbox.
delete from app_private.guardianship_majority_deliveries;
insert into public.users(id,full_name,email,birthdate,account_status) values
('15700000-0000-4000-8000-000000000001','Adulto sintético','worker157@example.test','1990-01-01','MANAGED');
insert into app_private.guardianship_majority_deliveries(athlete_user_id,recipient_user_id,audience) values
('15700000-0000-4000-8000-000000000001','15700000-0000-4000-8000-000000000001','ATHLETE');
update app_private.guardianship_majority_deliveries set retry_at=app_private.worker_now();
create temporary table delivery as select * from app_private.worker_claim_email();
select is((select count(*) from delivery),1::bigint,'claims synthetic email');
select is((select count(*) from app_private.worker_claim_email()),0::bigint,'two replicas do not claim same email');
select is(app_private.worker_email_payload((select delivery_id from delivery),(select claim_token from delivery),'{"from":"fixture","to":["worker157@example.test"],"subject":"Fixture","text":"Fixture"}'),'{"from":"fixture","to":["worker157@example.test"],"subject":"Fixture","text":"Fixture"}'::jsonb,'payload durably frozen before send');
select is(app_private.worker_finish_email((select delivery_id from delivery),(select claim_token from delivery),false),true,'provider failure schedules independent retry');
select is((select count(*) from app_private.worker_claim_email()),0::bigint,'backoff respected');
update app_private.majority_executor set email_next_at=null;
update app_private.guardianship_majority_deliveries set retry_at=app_private.worker_now()-interval '1 second';
create temporary table retry as select * from app_private.worker_claim_email();
select is((select delivery_id from retry),(select delivery_id from delivery),'retry keeps provider key');
select is(app_private.worker_email_payload((select delivery_id from retry),(select claim_token from retry),'{"text":"modified"}'),(select payload from retry),'retry keeps exact payload');
select is(app_private.worker_finish_email((select delivery_id from delivery),(select claim_token from delivery),true),false,'stale receipt cannot complete');
select is(app_private.worker_finish_email((select delivery_id from retry),(select claim_token from retry),true),true,'current receipt completes');
update app_private.majority_executor set email_next_at=null;
select is((select count(*) from app_private.worker_claim_email()),0::bigint,'completed email is not resent');
update app_private.guardianship_majority_deliveries set sent_at=null,first_attempt_at=app_private.worker_now()-interval '23 hours',retry_at=app_private.worker_now()-interval '1 second';
update app_private.majority_executor set email_next_at=null;
select is((select count(*) from app_private.worker_claim_email()),0::bigint,'uncertain expired provider key never automatically resent');
select is((app_private.worker_metrics()->>'blocked')::integer,1,'blocked pending alert visible without PII');
-- Exercise actual canonical transition via the leased worker entry point.
create or replace function app_private.chile_today() returns date language sql stable set search_path='' as $$select date '2026-04-05'$$;
insert into public.users(id,full_name,email,birthdate,account_status) values
('15700000-0000-4000-8000-000000000002','Tutor sintético','guardian157@example.test','1990-01-01','MANAGED'),
('15700000-0000-4000-8000-000000000003','Pupilo sintético','athlete157@example.test','2008-04-06','MANAGED');
insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship) values
('15700000-0000-4000-8000-000000000004','15700000-0000-4000-8000-000000000002','15700000-0000-4000-8000-000000000003','Tutor');
insert into public.consents(guardianship_id,consent_type,terms_version) values('15700000-0000-4000-8000-000000000004','DATA_PROCESSING_MINOR','synthetic');
create or replace function app_private.chile_today() returns date language sql stable set search_path='' as $$select date '2026-04-06'$$;
create or replace function app_private.worker_now() returns timestamptz language sql stable set search_path='' as $$select '2026-04-06 04:30:00+00'::timestamptz$$;
update app_private.majority_tasks set completed_at=app_private.worker_now(),lease_until=null;
create temporary table birthday as select * from app_private.worker_claim_transition();
select ok(app_private.worker_complete_transition((select run_date from birthday),(select lease_token from birthday)),'worker commits actual birthday transition');
select is((select status from public.guardianships where id='15700000-0000-4000-8000-000000000004'),'INACTIVE','historical link inactive');
select ok((select deactivated_at is not null from public.guardianships where id='15700000-0000-4000-8000-000000000004'),'persisted transition timestamp');
select is((select count(*) from public.consents where guardianship_id='15700000-0000-4000-8000-000000000004'),1::bigint,'legal history retained');
select is((select count(*) from public.job_runs where run_date='2026-04-06'),1::bigint,'daily ledger retained');
select is((select count(*) from app_private.guardianship_majority_deliveries where athlete_user_id='15700000-0000-4000-8000-000000000003'),2::bigint,'athlete and guardian notifications independent of transition');
select is(app_private.worker_complete_transition((select run_date from birthday),(select lease_token from birthday)),false,'second completion cannot repeat transition');
select * from finish();
rollback;
