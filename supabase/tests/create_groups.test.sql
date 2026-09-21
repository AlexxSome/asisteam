begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id, email, raw_user_meta_data)
select ('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'create-groups-' || n || '@example.test',
       jsonb_build_object('full_name', 'Persona ' || n, 'birthdate',
         case when n = 3 then null when n = 4 then (app_private.chile_today() - interval '15 years')::date::text else '1990-01-01' end)
from generate_series(1,7) n;
update public.users set id = ('20000000-0000-4000-8000-' || lpad((right(auth_user_id::text,12)::int + 100)::text,12,'0'))::uuid
where email like 'create-groups-%@example.test';
update public.users set account_status = 'INVITED' where id = '20000000-0000-4000-8000-000000000102';

select ok((select relrowsecurity from pg_class where oid = 'public.groups'::regclass), 'groups conserva RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.memberships'::regclass), 'memberships conserva RLS');
select ok(not has_function_privilege('anon', 'public.create_group(text,text,text,text)', 'EXECUTE'), 'anon no puede crear grupos');
select ok(not has_function_privilege('anon', 'public.join_group_as_athlete(uuid)', 'EXECUTE'), 'anon no puede agregarse como deportista');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select public.create_group('Club', 'Fútbol')$$, 'PT401', 'authentication_required', 'RPC comprueba identidad aunque tenga EXECUTE');
select throws_ok($$select public.join_group_as_athlete(gen_random_uuid())$$, 'PT401', 'authentication_required', 'auto-incorporación comprueba identidad');
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.create_group('Club', 'Fútbol')$$, 'PT403', 'active_account_required', 'INVITED no crea grupos');
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.create_group(null, 'Fútbol')$$, 'PT400', 'invalid_group', 'nombre requerido');
select throws_ok($$select public.create_group(' ab ', 'Fútbol')$$, 'PT400', 'invalid_group', 'nombre mínimo se evalúa sin espacios');
select throws_ok($$select public.create_group(repeat('a',81), 'Fútbol')$$, 'PT400', 'invalid_group', 'nombre máximo');
select throws_ok($$select public.create_group('Club', null)$$, 'PT400', 'invalid_group', 'deporte requerido');
select throws_ok($$select public.create_group('Club', 'x')$$, 'PT400', 'invalid_group', 'deporte mínimo');
select throws_ok($$select public.create_group('Club', repeat('a',51))$$, 'PT400', 'invalid_group', 'deporte máximo');
select throws_ok($$select public.create_group('Club', 'Fútbol', null, 'javascript:alert(1)')$$, 'PT400', 'invalid_group', 'logo restringido a HTTP/HTTPS');
select is((select count(*) from public.v_my_groups), 0::bigint, 'validación no deja grupos parciales');

select set_config('test.created_group', public.create_group('  Club Ñuñoa  ', ' Fútbol ', ' Equipo adulto ', 'https://example.test/logo.png')::text, true);
select is((select name from public.v_group_detail), 'Club Ñuñoa', 'nombre normalizado');
select is((select sport from public.v_group_detail), 'Fútbol', 'deporte normalizado');
select is((select description from public.v_group_detail), 'Equipo adulto', 'descripción guardada');
select is((select logo_url from public.v_group_detail), 'https://example.test/logo.png', 'logo guardado');
select is((select settings from public.v_group_detail), '{"athletes_can_view_group_stats":false,"guardians_can_view_group_stats":false}'::jsonb, 'ambos toggles nacen false');
select matches((select invite_code from public.v_group_detail), '^[A-Za-z0-9]{8}$', 'código automático de ocho caracteres alfanuméricos');
select is((select roles from public.v_my_groups), array['ADMIN'], 'creador queda ADMIN');
select is((select status from public.memberships), 'ACTIVE', 'ADMIN queda ACTIVE');
select ok((select joined_at is not null from public.memberships), 'se registra incorporación');
select throws_ok($$insert into public.groups(name) values('Ataque')$$, '42501', null, 'cliente no crea grupos por tabla base');
select throws_ok($$insert into public.memberships(role) values('ADMIN')$$, '42501', null, 'cliente no escribe membresías directas');
select lives_ok($$select public.join_group_as_athlete(current_setting('test.created_group')::uuid)$$, 'ADMIN agrega su rol ATHLETE');
select is((select roles from public.v_my_groups), array['ADMIN','ATHLETE'], 'ADMIN se conserva junto a ATHLETE');
select is((select count(distinct id) from public.memberships), 2::bigint, 'roles tienen IDs de membresía diferentes');
select lives_ok($$select public.join_group_as_athlete(current_setting('test.created_group')::uuid)$$, 'reintentar auto-incorporación es idempotente');
select is((select count(*) from public.memberships), 2::bigint, 'reintento no duplica membresía');

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select count(*) from public.v_group_detail), 0::bigint, 'V6: otro usuario no ve el grupo nuevo');
select throws_ok($$select public.join_group_as_athlete(current_setting('test.created_group')::uuid)$$, 'PT404', 'group_not_found', 'grupo ajeno no permite auto-incorporación');
select throws_ok($$select public.join_group_as_athlete('20000000-0000-4000-8000-000000009999')$$, 'PT404', 'group_not_found', 'ID inexistente tiene el mismo error');
reset role;
select is((select created_by from public.groups where id = current_setting('test.created_group')::uuid), '20000000-0000-4000-8000-000000000101'::uuid, 'created_by usa perfil desacoplado de auth.uid');
insert into public.memberships(user_id, group_id, role, status)
values('20000000-0000-4000-8000-000000000105', current_setting('test.created_group')::uuid, 'ATHLETE', 'ACTIVE');
set local role authenticated;
select throws_ok($$select public.join_group_as_athlete(current_setting('test.created_group')::uuid)$$, 'PT403', 'admin_required', 'ser ATHLETE no habilita la acción de ADMIN');
select is((select invite_code from public.v_group_detail), null::text, 'V5: deportista no ve código generado');
select is((select count(*) from public.users), 1::bigint, 'crear grupo no abre perfiles de terceros');

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select set_config('test.no_birthdate_group', public.create_group('Club sin fecha', 'Tenis', ' ', ' ')::text, true);
select is((select description from public.v_group_detail), null::text, 'descripción vacía se guarda null');
select is((select logo_url from public.v_group_detail), null::text, 'logo vacío se guarda null');
select throws_ok($$select public.join_group_as_athlete(current_setting('test.no_birthdate_group')::uuid)$$, 'PT422', 'athlete_birthdate_required', 'segundo rol exige fecha de nacimiento');
select is((select roles from public.v_my_groups), array['ADMIN'], 'fallo conserva ADMIN y no crea ATHLETE');

select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select set_config('test.minor_group', public.create_group('Club menor', 'Tenis')::text, true);
select throws_ok($$select public.join_group_as_athlete(current_setting('test.minor_group')::uuid)$$, 'PT422', 'minor_requires_guardian_consent', 'R1: menor sin apoderado/consentimiento no se activa');
reset role;
insert into public.guardianships(id, guardian_user_id, athlete_user_id, relationship)
values('20000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000105', '20000000-0000-4000-8000-000000000104', 'Madre');
set local role authenticated;
select throws_ok($$select public.join_group_as_athlete(current_setting('test.minor_group')::uuid)$$, 'PT422', 'minor_requires_guardian_consent', 'R1: vínculo sin consentimiento no basta');
reset role;
insert into public.consents(guardianship_id, consent_type, terms_version, revoked_at)
values('20000000-0000-4000-8000-000000000401', 'DATA_PROCESSING_MINOR', 'v1', now());
set local role authenticated;
select throws_ok($$select public.join_group_as_athlete(current_setting('test.minor_group')::uuid)$$, 'PT422', 'minor_requires_guardian_consent', 'R1: consentimiento revocado no basta');
reset role;
insert into public.consents(guardianship_id, consent_type, terms_version)
values('20000000-0000-4000-8000-000000000401', 'DATA_PROCESSING_MINOR', 'v2');

-- El apoderado ya participa en el primer grupo y otros 29.
insert into public.groups(id, name, invite_code, created_by)
select ('20000000-0000-4000-8000-' || lpad((n+800)::text,12,'0'))::uuid,
       'Equipo apoderado ' || n, 'GUARD' || lpad(n::text,3,'0'), '20000000-0000-4000-8000-000000000105'
from generate_series(1,29) n;
insert into public.memberships(user_id, group_id, role, status)
select '20000000-0000-4000-8000-000000000105', id, 'ADMIN', 'ACTIVE' from public.groups where name like 'Equipo apoderado %';
set local role authenticated;
select throws_ok($$select public.join_group_as_athlete(current_setting('test.minor_group')::uuid)$$, 'PT422', 'guardian_group_limit', 'no incorpora automáticamente al apoderado en su grupo 31');
select is((select roles from public.v_my_groups), array['ADMIN'], 'fallo del apoderado no deja ATHLETE parcial');
reset role;
update public.memberships set status = 'INACTIVE' where user_id = '20000000-0000-4000-8000-000000000105'
  and group_id in (select id from public.groups where name like 'Equipo apoderado %');

-- Capacidad: el trigger incorpora también al GUARDIAN, no solo al ATHLETE.
insert into public.users(id, full_name, birthdate, account_status)
select ('20000000-0000-4000-9000-' || lpad(n::text,12,'0'))::uuid, 'Deportista sintético ' || n, '1990-01-01', 'MANAGED'
from generate_series(1,498) n;
insert into public.memberships(user_id, group_id, role, status)
select id, current_setting('test.minor_group')::uuid, 'ATHLETE', 'ACTIVE' from public.users where id::text like '20000000-0000-4000-9000-%';
set local role authenticated;
select throws_ok($$select public.join_group_as_athlete(current_setting('test.minor_group')::uuid)$$, 'PT422', 'group_member_limit', 'límite incluye GUARDIAN automático');
reset role;
update public.memberships set status = 'INACTIVE' where user_id = '20000000-0000-4000-9000-000000000001';
set local role authenticated;
select lives_ok($$select public.join_group_as_athlete(current_setting('test.minor_group')::uuid)$$, 'menor con consentimiento y capacidad obtiene segundo rol');
reset role;
select is((select count(*) from public.memberships where group_id = current_setting('test.minor_group')::uuid and status = 'ACTIVE'), 500::bigint, 'se alcanza 500 sin superarlo');
select is((select status from public.memberships where group_id = current_setting('test.minor_group')::uuid and user_id = '20000000-0000-4000-8000-000000000105' and role = 'GUARDIAN'), 'ACTIVE', 'CB-02: apoderado obtiene membresía automática');

-- 29 grupos, dos roles en cada uno: el límite se cuenta por grupo, no rol.
insert into public.groups(id, name, invite_code, created_by)
select ('20000000-0000-4000-8000-' || lpad((n+700)::text,12,'0'))::uuid,
       'Equipo límite ' || n, 'LIMIT' || lpad(n::text,3,'0'), '20000000-0000-4000-8000-000000000106'
from generate_series(1,29) n;
insert into public.memberships(user_id, group_id, role, status)
select '20000000-0000-4000-8000-000000000106', id, role, 'ACTIVE'
from public.groups cross join (values('ADMIN'),('ATHLETE')) roles(role) where name like 'Equipo límite %';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select lives_ok($$select public.create_group('Grupo treinta', 'Tenis')$$, 'multi-rol no reduce el límite de 30 grupos');
select throws_ok($$select public.create_group('Grupo treinta y uno', 'Tenis')$$, 'PT422', 'user_group_limit', 'no se supera el límite 30');
select is((select count(*) from public.v_my_groups), 30::bigint, 'fallo no deja grupo extra');

-- Atomicidad real: un fallo al insertar ADMIN revierte también groups.
reset role;
create function pg_temp.reject_new_admin() returns trigger language plpgsql as $$
begin raise sqlstate 'PT422' using message = 'test_admin_failure'; end $$;
create trigger test_reject_admin before insert on public.memberships for each row when (new.role = 'ADMIN') execute function pg_temp.reject_new_admin();
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select throws_ok($$select public.create_group('Grupo debe revertirse', 'Tenis')$$, 'PT422', 'test_admin_failure', 'fallo al crear ADMIN aborta creación');
reset role;
select is((select count(*) from public.groups where name = 'Grupo debe revertirse'), 0::bigint, 'no quedan grupos huérfanos');
drop trigger test_reject_admin on public.memberships;
select is((select count(*) from public.groups), (select count(distinct invite_code) from public.groups), 'todos los códigos son únicos');
select * from finish();
rollback;
