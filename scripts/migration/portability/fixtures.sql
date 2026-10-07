-- Only the newly created, empty rehearsal database receives these fixtures.
-- UUIDs are fixture constants within that DB; :admin/:athlete/:guardian are
-- the exported profile UUIDs, :*_auth are their GoTrue identity UUIDs.
begin;
insert into public.users(id,full_name,email,birthdate,account_status) values
('15000000-0000-4000-8000-000000000001','Fixture menor',null,(app_private.chile_today()-interval '12 years')::date,'MANAGED'),
('15000000-0000-4000-8000-000000000002','Fixture invitado','invited150@example.invalid',date '2000-01-01','INVITED');
insert into public.groups(id,name,invite_code,created_by) values
('15000000-0000-4000-8000-000000000010','Fixture grupo uno','MIG150A1',:'admin'),
('15000000-0000-4000-8000-000000000011','Fixture grupo dos','MIG150B2',:'athlete');
-- Synthetic subscription/ledger preserves the existing capacity invariant.
insert into public.billing_plans(code,name,amount_clp,athlete_limit) values
('TEAM','Equipo',4990,50),('CLUB','Club',9990,200),('ACADEMY','Academia',15990,1000);
insert into public.group_subscriptions(id,group_id,plan_code,amount_clp,athlete_limit,requested_by,status,activated_at) values
('15000000-0000-4000-8000-000000000040','15000000-0000-4000-8000-000000000010','TEAM',4990,50,:'admin','AUTHORIZED',now());
insert into public.subscription_invoices(provider_invoice_id,subscription_id,due_at,amount_clp,status,provider_payment_id,paid_at,provider_updated_at)
values('synthetic-invoice-150','15000000-0000-4000-8000-000000000040',now(),4990,'PAID','synthetic-payment-150',now(),now());
insert into public.memberships(id,user_id,group_id,role,status,joined_at) values
('15000000-0000-4000-8000-000000000020',:'admin','15000000-0000-4000-8000-000000000010','ADMIN','ACTIVE',now()-interval '60 days'),
('15000000-0000-4000-8000-000000000021',:'athlete','15000000-0000-4000-8000-000000000010','ATHLETE','ACTIVE',now()-interval '60 days'),
('15000000-0000-4000-8000-000000000022',:'athlete','15000000-0000-4000-8000-000000000011','ADMIN','ACTIVE',now()-interval '60 days');
insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship) values
('15000000-0000-4000-8000-000000000030',:'guardian','15000000-0000-4000-8000-000000000001','Apoderado');
insert into public.consents(guardianship_id,consent_type,terms_version,channel,allows_avatar) values
('15000000-0000-4000-8000-000000000030','DATA_PROCESSING_MINOR','rehearsal150','IN_APP',true);
insert into public.memberships(id,user_id,group_id,role,status,joined_at) values
('15000000-0000-4000-8000-000000000023','15000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000010','ATHLETE','ACTIVE',now()-interval '60 days');
-- System types are normally migration data, absent in a schema-only snapshot.
-- In this owned fixture DB only, seed before reinstating their immutability.
alter table public.activity_types disable trigger trg_system_activity_type;
insert into public.activity_types(id,name) values
('b2c3d4e5-0001-4b3c-8d4e-111111111111','TRAINING'),
('b2c3d4e5-0002-4b3c-8d4e-222222222222','PHYSICAL_PREP'),
('b2c3d4e5-0003-4b3c-8d4e-333333333333','COMPETITION'),
('b2c3d4e5-0004-4b3c-8d4e-444444444444','MEETING');
alter table public.activity_types enable trigger trg_system_activity_type;
insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by)
select ('15000000-0000-4000-8000-'||lpad((100+n)::text,12,'0'))::uuid,
'15000000-0000-4000-8000-000000000010','b2c3d4e5-0001-4b3c-8d4e-111111111111',
'Fixture entrenamiento',now()-interval '1 day',now()-interval '23 hours',:'admin'
from generate_series(1,10) n;
insert into public.attendance_records(activity_id,membership_id,status,recorded_by)
select id,'15000000-0000-4000-8000-000000000021',
case when row_number() over(order by id)<=6 then 'PRESENT'
when row_number() over(order by id)=7 then 'LATE'
when row_number() over(order by id)<=9 then 'ABSENT' else 'EXCUSED' end,:'admin'
from public.activities;
-- Provider identity records are synthetic transport fixtures, not OAuth login.
insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at) values
(gen_random_uuid(),:'athlete_auth','synthetic-subject-150','google',jsonb_build_object('sub','synthetic-subject-150'),now(),now()),
(gen_random_uuid(),:'guardian_auth','synthetic-subject-150','apple',jsonb_build_object('sub','synthetic-subject-150'),now(),now());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('avatars','avatars',false,2097152,array['image/jpeg','image/png','image/webp']);
commit;
