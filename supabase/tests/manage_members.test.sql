begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.id(n int) returns uuid language sql immutable as $$
  select ('34000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;
create function pg_temp.login(n int) returns text language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',pg_temp.id(n))::text,true)
$$;
insert into auth.users(id,email,raw_user_meta_data)
select pg_temp.id(n),'manage34-'||n||'@example.test',jsonb_build_object('full_name','Persona '||n,'birthdate','1990-01-01') from generate_series(1,5) n;
update public.users set id=pg_temp.id(right(auth_user_id::text,12)::int+100) where email like 'manage34-%@example.test';
insert into public.users(id,full_name,birthdate,account_status) values
(pg_temp.id(111),'Adulto gestionado','1990-01-01','MANAGED'),
(pg_temp.id(112),'Menor gestionado',(app_private.chile_today()-interval '15 years')::date,'MANAGED'),
(pg_temp.id(113),'Menor sin permiso',(app_private.chile_today()-interval '15 years')::date,'MANAGED'),
(pg_temp.id(114),'Pendiente gestionado',(app_private.chile_today()-interval '15 years')::date,'MANAGED');
insert into public.groups(id,name,invite_code,created_by,created_at) values
(pg_temp.id(201),'Club gestión','M3400001',pg_temp.id(101),now()-interval '1 year'),
(pg_temp.id(202),'Club ajeno','M3400002',pg_temp.id(104),now()-interval '1 year');
insert into public.memberships(id,user_id,group_id,role,status,joined_at) values
(pg_temp.id(301),pg_temp.id(101),pg_temp.id(201),'ADMIN','ACTIVE',now()-interval '1 year'),
(pg_temp.id(302),pg_temp.id(102),pg_temp.id(201),'ATHLETE','ACTIVE',now()-interval '1 year'),
(pg_temp.id(303),pg_temp.id(103),pg_temp.id(201),'GUARDIAN','ACTIVE',now()-interval '1 year'),
(pg_temp.id(304),pg_temp.id(104),pg_temp.id(202),'ADMIN','ACTIVE',now()-interval '1 year'),
(pg_temp.id(305),pg_temp.id(105),pg_temp.id(201),'ADMIN','INACTIVE',now()-interval '1 year'),
(pg_temp.id(311),pg_temp.id(111),pg_temp.id(201),'ATHLETE','ACTIVE',now()-interval '1 year'),
(pg_temp.id(312),pg_temp.id(112),pg_temp.id(201),'ATHLETE','INACTIVE',now()-interval '1 year'),
(pg_temp.id(313),pg_temp.id(113),pg_temp.id(201),'ATHLETE','INACTIVE',null),
(pg_temp.id(314),pg_temp.id(114),pg_temp.id(201),'ATHLETE','INACTIVE',null),
(pg_temp.id(399),pg_temp.id(111),pg_temp.id(202),'ATHLETE','ACTIVE',now()-interval '1 year');
insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship) values
(pg_temp.id(412),pg_temp.id(103),pg_temp.id(112),'Tutor'),
(pg_temp.id(414),pg_temp.id(103),pg_temp.id(114),'Tutor');
insert into public.consents(guardianship_id,consent_type,terms_version) values
(pg_temp.id(412),'DATA_PROCESSING_MINOR','test'),(pg_temp.id(414),'DATA_PROCESSING_MINOR','test');
insert into app_private.managed_member_enrollments(membership_id,guardianship_id,declared_by)
values(pg_temp.id(314),pg_temp.id(414),pg_temp.id(101));
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by)
select pg_temp.id(501),pg_temp.id(201),id,'Actividad histórica',now()-interval '2 days',now()-interval '2 days'+interval '1 hour',pg_temp.id(101)
from public.activity_types where group_id is null limit 1;
insert into public.attendance_records(id,activity_id,membership_id,status,note,recorded_by)
values(pg_temp.id(601),pg_temp.id(501),pg_temp.id(311),'PRESENT','Nota histórica',pg_temp.id(101));

select ok(not has_function_privilege('anon','public.list_group_members(uuid,text,text,integer)','EXECUTE'),'anon no ve datos privados');
select ok(not has_function_privilege('anon','public.update_managed_member(uuid,uuid,text,date,text,text)','EXECUTE'),'anon no edita');
select ok(not has_function_privilege('anon','public.deactivate_membership(uuid,uuid)','EXECUTE'),'anon no desactiva');
select ok(not has_function_privilege('anon','public.reactivate_membership(uuid,uuid)','EXECUTE'),'anon no reactiva');
select ok(not has_function_privilege('authenticated','app_private.change_membership_status(uuid,uuid,boolean)','EXECUTE'),'helper privado cerrado');
select ok(not has_table_privilege('authenticated','public.memberships','UPDATE'),'status no admite writes directos');
select ok((select bool_and(proconfig @> array['search_path=""']) from pg_proc where oid in
  ('public.list_group_members(uuid,text,text,integer)'::regprocedure,'public.update_managed_member(uuid,uuid,text,date,text,text)'::regprocedure,
   'public.deactivate_membership(uuid,uuid)'::regprocedure,'public.reactivate_membership(uuid,uuid)'::regprocedure,
   'app_private.change_membership_status(uuid,uuid,boolean)'::regprocedure)),'search_path fijo');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.deactivate_membership(pg_temp.id(201),pg_temp.id(311))$$,'PT401','authentication_required','sin sesión no desactiva');
select pg_temp.login(4);
select throws_ok($$select * from public.list_group_members(pg_temp.id(201))$$,'PT404','group_not_found','V6 no expone nómina ajena');
select throws_ok($$select public.deactivate_membership(pg_temp.id(201),pg_temp.id(311))$$,'PT404','group_not_found','ADMIN ajeno no desactiva');
select throws_ok($$select public.reactivate_membership(pg_temp.id(201),pg_temp.id(312))$$,'PT404','group_not_found','ADMIN ajeno no reactiva');
select throws_ok($$select public.update_managed_member(pg_temp.id(201),pg_temp.id(311),'Nombre ajeno','1990-01-01')$$,'PT404','group_not_found','ADMIN ajeno no edita');
select pg_temp.login(2);
select throws_ok($$select * from public.list_group_members(pg_temp.id(201))$$,'PT403','admin_required','V5 ATHLETE no ve PII');
select throws_ok($$select public.deactivate_membership(pg_temp.id(201),pg_temp.id(311))$$,'PT403','admin_required','ATHLETE no desactiva');
select throws_ok($$select public.update_managed_member(pg_temp.id(201),pg_temp.id(311),'Nombre ajeno','1990-01-01')$$,'PT403','admin_required','ATHLETE no edita');
select pg_temp.login(3);
select throws_ok($$select * from public.list_group_members(pg_temp.id(201))$$,'PT403','admin_required','V5 GUARDIAN no ve PII de nómina');
select throws_ok($$select public.update_managed_member(pg_temp.id(201),pg_temp.id(312),'Pupilo editado','2011-01-01')$$,'PT403','admin_required','apoderado no edita pupilo');
select pg_temp.login(5);
select throws_ok($$select * from public.list_group_members(pg_temp.id(201))$$,'PT404','group_not_found','ADMIN inactivo no accede');
select pg_temp.login(1);
select is((select count(*) from public.list_group_members(pg_temp.id(201))),8::bigint,'lista solo grupo solicitado');
select is((select count(*) from public.list_group_members(pg_temp.id(201),'ATHLETE','INACTIVE')),3::bigint,'filtra rol y estado');
select throws_ok($$select * from public.list_group_members(pg_temp.id(201),'COACH')$$,'PT400','invalid_member_filters','no admite rol P2');
select throws_ok($$select * from public.list_group_members(pg_temp.id(201),null,null,-1)$$,'PT400','invalid_member_filters','offset inválido');
select throws_ok($$select public.deactivate_membership(pg_temp.id(201),pg_temp.id(399))$$,'PT404','membership_not_found','membership de otro grupo responde 404');
select throws_ok($$select public.deactivate_membership(pg_temp.id(201),pg_temp.id(999))$$,'PT404','membership_not_found','membership inexistente responde igual');
select throws_ok($$select public.deactivate_membership(pg_temp.id(201),pg_temp.id(301))$$,'PT409','LAST_ADMIN','protege último ADMIN');
select throws_ok($$select public.update_managed_member(pg_temp.id(201),pg_temp.id(302),'Nombre cambiado','1990-01-01')$$,'PT403','managed_profile_required','ADMIN no edita cuenta ACTIVE');
select throws_ok($$select public.update_managed_member(pg_temp.id(201),pg_temp.id(311),'Nombre cambiado','1990-01-01','manage34-2@example.test')$$,'PT409','managed_email_unavailable','email duplicado no filtra identidad');
select throws_ok($$select public.update_managed_member(pg_temp.id(201),pg_temp.id(311),'Nombre cambiado','1990-01-01',null,'123')$$,'PT400','invalid_managed_member','servidor valida teléfono');
select throws_ok($$select public.update_managed_member(pg_temp.id(201),pg_temp.id(311),'Nombre cambiado','2020-01-01')$$,'PT422','minor_requires_guardian_consent','editar fecha no evade R1');
select is(public.update_managed_member(pg_temp.id(201),pg_temp.id(311),'  Nombre actualizado  ','1991-01-01',' NEW34@EXAMPLE.TEST ','+56912345678'),'UPDATED','edita datos básicos MANAGED');
select ok((select full_name='Nombre actualizado' and email='new34@example.test' and phone='+56912345678' and birthdate='1991-01-01' from public.list_group_members(pg_temp.id(201)) where membership_id=pg_temp.id(311)),'datos persisten normalizados');
select lives_ok($$select public.deactivate_membership(pg_temp.id(201),pg_temp.id(311))$$,'desactiva integrante');
select is((select count(*) from public.v_attendance_roster where membership_id=pg_temp.id(311)),0::bigint,'inactivo sale de listas de asistencia');
select is((select count(*) from public.v_attendance_admin where membership_id=pg_temp.id(311)),1::bigint,'conserva registro y nota');
select is((select sum(present) from public.v_group_attendance_report where membership_id=pg_temp.id(311)),1::numeric,'histórico incluye inactivo');
select is(public.get_group_attendance_report(pg_temp.id(201),p_period=>'season',p_include_inactive=>true)->'totals'->>'present','1','RPC de reportes preserva histórico');
select throws_ok($$select public.deactivate_membership(pg_temp.id(201),pg_temp.id(311))$$,'PT409','membership_status_changed','decisión atrasada no tiene falso éxito');
select lives_ok($$select public.reactivate_membership(pg_temp.id(201),pg_temp.id(311))$$,'reactiva mismo integrante');
select is((select count(*) from public.v_attendance_roster where membership_id=pg_temp.id(311)),1::bigint,'reactivado vuelve con mismo ID');
select is((select sum(present) from public.v_group_attendance_report where membership_id=pg_temp.id(311)),1::numeric,'reactivación no reinicia ventana histórica');
select throws_ok($$select public.reactivate_membership(pg_temp.id(201),pg_temp.id(313))$$,'PT422','minor_requires_guardian_consent','menor sin consentimiento no se activa');
select throws_ok($$select public.reactivate_membership(pg_temp.id(201),pg_temp.id(314))$$,'PT422','managed_consent_required','rechazo no permite eludir ratificación MANAGED');
select lives_ok($$select public.reactivate_membership(pg_temp.id(201),pg_temp.id(312))$$,'reactiva menor con requisitos');
select throws_ok($$select public.deactivate_membership(pg_temp.id(201),pg_temp.id(303))$$,'PT422','guardian_has_active_wards','V2 conserva acceso del apoderado');
select lives_ok($$select public.deactivate_membership(pg_temp.id(201),pg_temp.id(312))$$,'ADMIN puede dar baja a menor');
select lives_ok($$select public.deactivate_membership(pg_temp.id(201),pg_temp.id(303))$$,'apoderado sin pupilos activos puede desactivarse');
select throws_ok($$select public.reactivate_membership(pg_temp.id(201),pg_temp.id(303))$$,'PT422','guardian_requires_active_ward','V3 no recupera acceso sin pupilos vigentes');
reset role;
select is((select joined_at from public.memberships where id=pg_temp.id(311)),now()-interval '1 year','joined_at original conservado');
select is((select status from public.memberships where id=pg_temp.id(399)),'ACTIVE','otro grupo no cambia');
select is((select note from public.attendance_records where id=pg_temp.id(601)),'Nota histórica','nota permanece intacta');
update public.consents set revoked_at=now() where guardianship_id=pg_temp.id(412);
set local role authenticated;
select throws_ok($$select public.reactivate_membership(pg_temp.id(201),pg_temp.id(312))$$,'PT422','minor_requires_guardian_consent','consentimiento revocado bloquea reactivación');
reset role;
-- Cambiar menor→adulto exige aprobación existente de cada grupo.
insert into public.memberships(user_id,group_id,role,status) values(pg_temp.id(112),pg_temp.id(201),'ATHLETE','PENDING')
on conflict(user_id,group_id,role) do update set status='PENDING';
set local role authenticated;
select is(public.update_managed_member(pg_temp.id(201),pg_temp.id(312),'Menor con solicitud','1990-01-01'),'BIRTHDATE_PENDING','crea corrección protegida');
select ok((select birthdate>'2010-01-01' from public.list_group_members(pg_temp.id(201)) where membership_id=pg_temp.id(312)),'conserva fecha hasta aprobación');
select is(public.review_birthdate_change((select request_id from public.list_birthdate_reviews() where full_name='Menor con solicitud'),pg_temp.id(201),true),'APPLIED','reutiliza aprobación existente para MANAGED');
select ok((select birthdate='1990-01-01' from public.list_group_members(pg_temp.id(201)) where membership_id=pg_temp.id(312)),'aprobación aplica fecha');
reset role;
-- Límite de grupos revalidado al reactivar.
insert into public.groups(id,name,invite_code,created_by)
select ('34000000-0000-4000-8001-'||lpad(n::text,12,'0'))::uuid,'Grupo sintético','M34G'||lpad(n::text,4,'0'),pg_temp.id(101) from generate_series(1,30) n;
insert into public.memberships(user_id,group_id,role,status)
select pg_temp.id(113),id,'GUARDIAN','ACTIVE' from public.groups where invite_code like 'M34G%';
set local role authenticated;
select throws_ok($$select public.reactivate_membership(pg_temp.id(201),pg_temp.id(313))$$,'PT422','user_group_limit','no incorpora grupo 31');
reset role;
-- Capacidad y paginación con más de 100 registros, sin modificar historial.
with profiles as (
  insert into public.users(full_name,birthdate,account_status)
  select 'Capacidad gestión '||n,'1990-01-01','MANAGED' from generate_series(1,500-(select count(*)::int from public.memberships where group_id=pg_temp.id(201) and status='ACTIVE')) n returning id
) insert into public.memberships(user_id,group_id,role,status) select id,pg_temp.id(201),'ATHLETE','ACTIVE' from profiles;
set local role authenticated;
select throws_ok($$select public.reactivate_membership(pg_temp.id(201),pg_temp.id(305))$$,'PT422','group_member_limit','límite 500 al reactivar');
select is((select count(*) from public.list_group_members(pg_temp.id(201))),50::bigint,'página máxima 50');
select is((select count(*) from public.list_group_members(pg_temp.id(201),null,null,100)),50::bigint,'accesibles más de 100');
select * from finish();
rollback;
