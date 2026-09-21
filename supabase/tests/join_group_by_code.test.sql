begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, email, raw_user_meta_data)
select ('22000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'join-code-' || n || '@example.test',
       jsonb_build_object('full_name', 'Persona ' || n, 'birthdate',
         case when n = 3 then (app_private.chile_today() - interval '15 years')::date::text
              else '1990-01-01' end)
from generate_series(1,5) n;
update public.users set id = ('22000000-0000-4000-8000-' || lpad((right(auth_user_id::text,12)::int + 100)::text,12,'0'))::uuid
where email like 'join-code-%@example.test';
insert into public.groups(id, name, sport, invite_code, created_by)
values('22000000-0000-4000-8000-000000000201', 'Club invitador', 'Fútbol', 'CODE0001', '22000000-0000-4000-8000-000000000101');
insert into public.memberships(user_id, group_id, role, status, joined_at)
values('22000000-0000-4000-8000-000000000101', '22000000-0000-4000-8000-000000000201', 'ADMIN', 'ACTIVE', now());

select ok(not has_function_privilege('anon', 'public.join_group_by_code(text)', 'EXECUTE'), 'anon no usa el código');
select ok(not has_function_privilege('anon', 'public.list_pending_athletes(uuid)', 'EXECUTE'), 'anon no lee pendientes');
select ok(not has_table_privilege('authenticated', 'app_private.join_code_attempts', 'SELECT'), 'contador privado');
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select public.join_group_by_code('CODE0001')$$, 'PT401', 'authentication_required', 'RPC exige identidad');
select throws_ok($$select * from public.list_pending_athletes('22000000-0000-4000-8000-000000000201')$$,
  'PT401', 'authentication_required', 'lista exige identidad');

-- Adulto: código inválido y rotado comparten respuesta; alta solo ATHLETE.
select set_config('request.jwt.claims', '{"sub":"22000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.join_group_by_code('INVALID!')->'error'->>'code', 'invalid_invite_code', 'formato inválido no enumera grupos');
select is(public.join_group_by_code('CODE9999')->'error'->>'code', 'invalid_invite_code', 'código inexistente da el mismo error');
select is(public.join_group_by_code('CODE0001')->'membership'->>'status', 'ACTIVE', 'adulto ingresa ACTIVE');
select is((select role from public.memberships where user_id='22000000-0000-4000-8000-000000000102'), 'ATHLETE', 'código solo incorpora ATHLETE');
select ok((select joined_at is not null from public.memberships where user_id='22000000-0000-4000-8000-000000000102'), 'adulto recibe joined_at');
select is((select roles from public.v_my_groups), array['ATHLETE'], 'adulto ve grupo inmediatamente');
select is(public.join_group_by_code('CODE0001')->'error'->>'code', 'membership_already_exists', 'repetición no duplica membership');
select is((select count(*) from public.memberships where user_id='22000000-0000-4000-8000-000000000102'), 1::bigint, 'repetición conserva una fila');
select throws_ok($$select * from public.list_pending_athletes('22000000-0000-4000-8000-000000000201')$$,
  'PT403', 'admin_required', 'ATHLETE no accede a pendientes');

-- Menor: PENDING sin apoderado; el trigger conserva R1 al intentar activarlo.
select set_config('request.jwt.claims', '{"sub":"22000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(public.join_group_by_code('CODE0001')->'membership'->>'status', 'PENDING', 'menor ingresa PENDING');
select is((select joined_at from public.memberships where user_id='22000000-0000-4000-8000-000000000103'), null::timestamptz, 'PENDING no anticipa joined_at');
select is((select count(*) from public.v_my_groups), 0::bigint, 'PENDING no obtiene acceso al grupo');
reset role;
select throws_ok($$update public.memberships set status='ACTIVE' where user_id='22000000-0000-4000-8000-000000000103'$$,
  '23514', 'minor_requires_guardian_consent', 'R1 impide activar menor sin consentimiento');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select full_name from public.list_pending_athletes('22000000-0000-4000-8000-000000000201')),
  'Persona 3', 'ADMIN ve al menor en aprobaciones');
select is((select guardian_ready from public.list_pending_athletes('22000000-0000-4000-8000-000000000201')),
  false, 'lista informa falta de consentimiento');
select is((select is_minor from public.list_pending_athletes('22000000-0000-4000-8000-000000000201')),
  true, 'edad se evalúa en America/Santiago');
select throws_ok($$select * from public.list_pending_athletes('22000000-0000-4000-8000-000000000299')$$,
  'PT404', 'group_not_found', 'grupo ajeno e inexistente no enumeran pendientes');
reset role;
insert into public.guardianships(id, guardian_user_id, athlete_user_id, relationship)
values('22000000-0000-4000-8000-000000000401', '22000000-0000-4000-8000-000000000101',
       '22000000-0000-4000-8000-000000000103', 'Madre');
insert into public.consents(guardianship_id, consent_type, terms_version)
values('22000000-0000-4000-8000-000000000401', 'DATA_PROCESSING_MINOR', 'v1');
set local role authenticated;
select is((select guardian_ready from public.list_pending_athletes('22000000-0000-4000-8000-000000000201')),
  true, 'ADMIN ve consentimiento vigente sin activar al menor');
reset role;
select is((select status from public.memberships where user_id='22000000-0000-4000-8000-000000000103'),
  'PENDING', 'consentimiento no omite aprobación ADMIN');
set local role authenticated;

select set_config('test.rotated_code', public.rotate_invite_code('22000000-0000-4000-8000-000000000201'), true);
select set_config('request.jwt.claims', '{"sub":"22000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is(public.join_group_by_code('CODE0001')->'error'->>'code', 'invalid_invite_code', 'código rotado deja de funcionar');
select is(public.join_group_by_code(current_setting('test.rotated_code'))->'membership'->>'status', 'ACTIVE', 'código nuevo funciona');

-- El contador persiste los fallos y corta el intento 11 dentro de 15 minutos.
select set_config('request.jwt.claims', '{"sub":"22000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
do $$begin for attempt in 1..10 loop perform public.join_group_by_code('CODE9999'); end loop; end$$;
select throws_ok($$select public.join_group_by_code('CODE0001')$$, 'PT429', 'join_rate_limited', 'límite de diez intentos');
reset role;
select is((select cardinality(attempts) from app_private.join_code_attempts where user_id='22000000-0000-4000-8000-000000000105'),
  10, 'fallos se registran pese a respuesta inválida');

select * from finish();
rollback;
