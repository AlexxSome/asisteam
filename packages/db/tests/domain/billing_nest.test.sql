begin;
\i packages/db/fixtures/domain.sql

select no_plan();
-- PostgreSQL17 creator membership has ADMIN but SET false. Test-only SET, rolled back below.
do $$ begin execute format('grant asisteam_billing to %I with inherit false, set true',current_user); end $$;
grant usage on schema extensions to asisteam_billing;
select ok(not (select rolsuper or rolbypassrls or rolcreaterole or rolcreatedb from pg_roles where rolname='asisteam_billing'),'billing provisioned NOLOGIN with minimum capabilities');
select ok(not has_table_privilege('asisteam_billing','public.group_subscriptions','SELECT,INSERT,UPDATE,DELETE'),'runtime cannot read/write subscription table');
select ok(not has_table_privilege('asisteam_billing','public.subscription_invoices','SELECT,INSERT,UPDATE,DELETE'),'runtime cannot read/write ledger table');
select ok(not has_table_privilege('asisteam_billing','app_private.billing_transport','SELECT,INSERT,UPDATE,DELETE'),'runtime cannot choose executor');
select ok(not has_table_privilege('asisteam_billing','app_private.billing_transport','UPDATE'),'runtime cannot handoff itself');
select ok(not pg_temp.can_execute('asisteam_api','app_private.claim_subscription_creation(uuid)','EXECUTE'),'API role cannot claim remote creation');
select ok(not pg_temp.can_execute('asisteam_invitation','app_private.sync_subscription_invoice(text,text,timestamptz,integer,text,text,text,timestamptz,timestamptz)','EXECUTE'),'other integration role cannot confirm payments');
select ok(pg_temp.can_execute('asisteam_api','public.get_group_billing(uuid,integer)','EXECUTE'),'API reads authorized DTO');
select ok(not pg_temp.can_execute('asisteam_member','app_private.begin_subscription_checkout(uuid,uuid,text)','EXECUTE'),'client cannot impersonate actor');
select ok(not pg_temp.can_execute('asisteam_billing','app_private.billing_canonical_claim_subscription_creation(uuid)','EXECUTE'),'runtime cannot bypass handoff gate');
-- A missing native admission row fences all writes.
delete from app_private.billing_transport;
set local role asisteam_billing;
select throws_ok($$select app_private.claim_subscription_creation('15800000-0000-4000-8000-000000000001')$$,'PT503','billing_unavailable','Nest fails closed before handoff');
reset role;
select ok(not has_table_privilege('asisteam_billing','app_private.billing_transport','INSERT'),'runtime no puede autoactivar admisión');
select lives_ok($$insert into app_private.billing_transport(singleton,mode) values(true,'NEST')$$,'operador admite único ejecutor nativo');
set local role asisteam_test_operator;
select throws_ok($$select app_private.claim_subscription_creation('15800000-0000-4000-8000-000000000001')$$,'42501',null,'credencial ajena no ejecuta checkout');
reset role;
set local role asisteam_billing;
select is(app_private.claim_subscription_creation('15800000-0000-4000-8000-000000000001'),false,'Nest may execute after handoff');
select throws_ok($$select app_private.billing_canonical_claim_subscription_creation('15800000-0000-4000-8000-000000000001')$$,'42501',null,'Nest cannot bypass gate');
reset role;
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where pronamespace='app_private'::regnamespace and proname in ('begin_subscription_checkout','get_subscription_context','lookup_billing_subscription','claim_subscription_creation','reject_subscription_creation','sync_group_subscription','sync_subscription_invoice')),'all adapters use SECURITY DEFINER with fixed path');
select * from finish();
rollback;
