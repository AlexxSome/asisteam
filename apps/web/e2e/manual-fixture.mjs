import { email, id } from './data.mjs';
import { sql, quote, activityType } from './local-fixtures.mjs';

// Run after server.mjs. Dedicated 20-person roster, never used by automated tests.
const group = id(6000);
const owner = sql(`select id from public.users where email=${quote(email('admin'))}`);
if (!owner || sql(`select count(*) from public.groups where id='${group}' and created_by<>'${owner}'`) !== '0') throw new Error('Namespace manual QA no disponible');
sql(`insert into public.groups(id,name,sport,invite_code,created_by)
  values('${group}','Club QA prueba humana','Tenis','QA100MAN','${owner}') on conflict(id) do nothing;
  insert into public.group_subscriptions(id,group_id,plan_code,amount_clp,athlete_limit,requested_by,status,activated_at)
  values('${id(6001)}','${group}','ACADEMY',15990,1000,'${owner}','AUTHORIZED',now()) on conflict(id) do nothing;
  insert into public.memberships(user_id,group_id,role,status,joined_at)
  values('${owner}','${group}','ADMIN','ACTIVE',now()-interval '90 days') on conflict(user_id,group_id,role) do nothing;
  insert into public.memberships(user_id,group_id,role,status,joined_at)
  select id,'${group}','ATHLETE','ACTIVE',now()-interval '90 days' from public.users
  where id between '${id(1001)}' and '${id(1020)}' on conflict(user_id,group_id,role) do nothing;
  insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by)
  values('${id(6002)}','${group}','${activityType}','Prueba humana de 20 deportistas',now()-interval '1 hour',now(),'${owner}') on conflict(id) do nothing;`);
console.log('Fixture manual listo: grupo y 20 deportistas sintéticos; sin borrar registros existentes.');
