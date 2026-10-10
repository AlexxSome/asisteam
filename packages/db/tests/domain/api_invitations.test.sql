begin;
\i packages/db/fixtures/domain.sql

select no_plan();
select ok(not rolsuper and not rolbypassrls and not rolinherit and  not rolcreaterole and not rolcreatedb,'registro NOLOGIN sin privilegios') from pg_roles where rolname='asisteam_invitation';
select ok(not exists(select 1 from pg_auth_members where member=(select oid from pg_roles where rolname='asisteam_invitation')),'registro sin roles heredados');
select ok(not exists(select 1 from pg_class c where c.relnamespace in ('public'::regnamespace,'app_private'::regnamespace,'public'::regnamespace) and (c.relowner=(select oid from pg_roles where rolname='asisteam_invitation') or has_table_privilege('asisteam_invitation',c.oid,'SELECT,INSERT,UPDATE,DELETE'))),'registro sin ownership ni tablas');
select ok(not has_schema_privilege('asisteam_invitation','public','CREATE') and not has_schema_privilege('asisteam_invitation','app_private','CREATE'),'registro sin CREATE');
select ok(pg_temp.can_execute('asisteam_invitation','public.invitation_context(text)','EXECUTE') and pg_temp.can_execute('asisteam_invitation','public.prepare_invitation_registration(text,text,text,jsonb)','EXECUTE') and pg_temp.can_execute('asisteam_invitation','public.cancel_invitation_registration(text)','EXECUTE') and pg_temp.can_execute('asisteam_invitation','public.consume_invitation_attempt(text)','EXECUTE') and pg_temp.can_execute('asisteam_invitation','public.invitation_registration_result(text,uuid)','EXECUTE'),'cinco capacidades de registro');
select ok(not pg_temp.can_execute('asisteam_invitation','public.issue_invitation(uuid,uuid,text,text,text,uuid)','EXECUTE') and not pg_temp.can_execute('asisteam_invitation','public.accept_invitation(text,uuid)','EXECUTE'),'registro no suplanta actor de emisión/aceptación');
select ok(not pg_temp.can_execute('asisteam_api','public.prepare_invitation_registration(text,text,text,jsonb)','EXECUTE'),'API RLS no prepara credenciales');
select ok(not pg_temp.can_execute('asisteam_member','app_private.api_issue_invitation(uuid,text,text,text,uuid,uuid)','EXECUTE') and not pg_temp.can_execute('asisteam_test_anonymous','app_private.api_accept_invitation(text)','EXECUTE') and not pg_temp.can_execute('asisteam_test_operator','app_private.api_accept_invitation(text)','EXECUTE'),'adaptadores exclusivos API');
select ok(not exists(select 1 from pg_proc where proname in ('api_issue_invitation','api_accept_invitation') and not ('search_path=""'=any(proconfig))),'adaptadores search_path vacío');
set local role asisteam_api;
select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims',(('{}')::jsonb||'{"auth_provider":"nest"}'::jsonb)::text,true);
select throws_ok($$select app_private.api_accept_invitation(repeat('a',64))$$,'PT401','authentication_required','aceptación sin contexto falla');
select throws_ok($$select app_private.api_issue_invitation(gen_random_uuid(),repeat('a',64))$$,'PT401','authentication_required','emisión sin contexto falla');
reset role;
select * from finish();rollback;
