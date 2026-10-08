-- MIG-14: one effect executor, same canonical ledger/invariants.
create role asisteam_billing nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
grant usage on schema public,app_private to asisteam_billing;
create table app_private.billing_transport (singleton boolean primary key default true check(singleton), mode text not null check(mode in ('LEGACY','NEST')));
insert into app_private.billing_transport values(true,'LEGACY');
alter table app_private.billing_transport enable row level security;
revoke all on app_private.billing_transport from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
create function app_private.billing_gate(p_mode text) returns void language plpgsql security definer set search_path='' as $$
declare v_mode text;
begin
  select mode into v_mode from app_private.billing_transport where singleton for share;
  if v_mode is distinct from p_mode then raise sqlstate 'PT503' using message='billing_unavailable'; end if;
end $$;
revoke all on function app_private.billing_gate(text) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
-- Operator performs this only after old effects have drained; the row lock fences transactions.
create function app_private.billing_handoff(p_quiescent boolean) returns void language plpgsql security definer set search_path='' as $$
begin
  if p_quiescent is distinct from true then raise sqlstate 'PT400' using message='billing_unavailable'; end if;
  update app_private.billing_transport set mode='NEST' where singleton;
end $$;
revoke all on function app_private.billing_handoff(boolean) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;

alter function public.begin_subscription_checkout(uuid,uuid,text) set schema app_private;
alter function app_private.begin_subscription_checkout(uuid,uuid,text) rename to billing_canonical_begin_subscription_checkout;
revoke all on function app_private.billing_canonical_begin_subscription_checkout(uuid,uuid,text) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
create function public.begin_subscription_checkout(p_group_id uuid,p_actor_auth_id uuid,p_plan_code text) returns jsonb language plpgsql security definer set search_path='' as $$ begin if session_user <> 'postgres' or current_setting('role',true) not in ('none','postgres') then perform app_private.billing_gate('LEGACY'); end if; return app_private.billing_canonical_begin_subscription_checkout(p_group_id,p_actor_auth_id,p_plan_code); end $$;
revoke all on function public.begin_subscription_checkout(uuid,uuid,text) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
grant execute on function public.begin_subscription_checkout(uuid,uuid,text) to service_role;
create function app_private.begin_subscription_checkout(p_group_id uuid,p_actor_auth_id uuid,p_plan_code text) returns jsonb language plpgsql security definer set search_path='' as $$ begin perform app_private.billing_gate('NEST'); return app_private.billing_canonical_begin_subscription_checkout(p_group_id,p_actor_auth_id,p_plan_code); end $$;
revoke all on function app_private.begin_subscription_checkout(uuid,uuid,text) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
grant execute on function app_private.begin_subscription_checkout(uuid,uuid,text) to asisteam_billing;

alter function public.get_subscription_context(uuid,uuid) set schema app_private;
alter function app_private.get_subscription_context(uuid,uuid) rename to billing_canonical_get_subscription_context;
revoke all on function app_private.billing_canonical_get_subscription_context(uuid,uuid) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
create function public.get_subscription_context(p_group_id uuid,p_actor_auth_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin if session_user <> 'postgres' or current_setting('role',true) not in ('none','postgres') then perform app_private.billing_gate('LEGACY'); end if; return app_private.billing_canonical_get_subscription_context(p_group_id,p_actor_auth_id); end $$;
revoke all on function public.get_subscription_context(uuid,uuid) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
grant execute on function public.get_subscription_context(uuid,uuid) to service_role;
create function app_private.get_subscription_context(p_group_id uuid,p_actor_auth_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin perform app_private.billing_gate('NEST'); return app_private.billing_canonical_get_subscription_context(p_group_id,p_actor_auth_id); end $$;
revoke all on function app_private.get_subscription_context(uuid,uuid) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
grant execute on function app_private.get_subscription_context(uuid,uuid) to asisteam_billing;

alter function public.claim_subscription_creation(uuid) set schema app_private;
alter function app_private.claim_subscription_creation(uuid) rename to billing_canonical_claim_subscription_creation;
revoke all on function app_private.billing_canonical_claim_subscription_creation(uuid) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
create function public.claim_subscription_creation(p_subscription_id uuid) returns boolean language plpgsql security definer set search_path='' as $$ begin if session_user <> 'postgres' or current_setting('role',true) not in ('none','postgres') then perform app_private.billing_gate('LEGACY'); end if; return app_private.billing_canonical_claim_subscription_creation(p_subscription_id); end $$;
revoke all on function public.claim_subscription_creation(uuid) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
grant execute on function public.claim_subscription_creation(uuid) to service_role;
create function app_private.claim_subscription_creation(p_subscription_id uuid) returns boolean language plpgsql security definer set search_path='' as $$ begin perform app_private.billing_gate('NEST'); return app_private.billing_canonical_claim_subscription_creation(p_subscription_id); end $$;
revoke all on function app_private.claim_subscription_creation(uuid) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
grant execute on function app_private.claim_subscription_creation(uuid) to asisteam_billing;

alter function public.reject_subscription_creation(uuid) set schema app_private;
alter function app_private.reject_subscription_creation(uuid) rename to billing_canonical_reject_subscription_creation;
revoke all on function app_private.billing_canonical_reject_subscription_creation(uuid) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
create function public.reject_subscription_creation(p_subscription_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin if session_user <> 'postgres' or current_setting('role',true) not in ('none','postgres') then perform app_private.billing_gate('LEGACY'); end if; perform app_private.billing_canonical_reject_subscription_creation(p_subscription_id); return; end $$;
revoke all on function public.reject_subscription_creation(uuid) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
grant execute on function public.reject_subscription_creation(uuid) to service_role;
create function app_private.reject_subscription_creation(p_subscription_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin perform app_private.billing_gate('NEST'); perform app_private.billing_canonical_reject_subscription_creation(p_subscription_id); return; end $$;
revoke all on function app_private.reject_subscription_creation(uuid) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
grant execute on function app_private.reject_subscription_creation(uuid) to asisteam_billing;

alter function public.lookup_billing_subscription(uuid) set schema app_private;
alter function app_private.lookup_billing_subscription(uuid) rename to billing_canonical_lookup_billing_subscription;
revoke all on function app_private.billing_canonical_lookup_billing_subscription(uuid) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
create function public.lookup_billing_subscription(p_subscription_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin if session_user <> 'postgres' or current_setting('role',true) not in ('none','postgres') then perform app_private.billing_gate('LEGACY'); end if; return app_private.billing_canonical_lookup_billing_subscription(p_subscription_id); end $$;
revoke all on function public.lookup_billing_subscription(uuid) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
grant execute on function public.lookup_billing_subscription(uuid) to service_role;
create function app_private.lookup_billing_subscription(p_subscription_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ begin perform app_private.billing_gate('NEST'); return app_private.billing_canonical_lookup_billing_subscription(p_subscription_id); end $$;
revoke all on function app_private.lookup_billing_subscription(uuid) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
grant execute on function app_private.lookup_billing_subscription(uuid) to asisteam_billing;

alter function public.sync_group_subscription(uuid,text,text,timestamptz,timestamptz,text) set schema app_private;
alter function app_private.sync_group_subscription(uuid,text,text,timestamptz,timestamptz,text) rename to billing_canonical_sync_group_subscription;
revoke all on function app_private.billing_canonical_sync_group_subscription(uuid,text,text,timestamptz,timestamptz,text) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
create function public.sync_group_subscription(p_subscription_id uuid,p_provider_id text,p_status text,p_provider_updated_at timestamptz,p_next_payment_at timestamptz,p_checkout_url text) returns void language plpgsql security definer set search_path='' as $$ begin if session_user <> 'postgres' or current_setting('role',true) not in ('none','postgres') then perform app_private.billing_gate('LEGACY'); end if; perform app_private.billing_canonical_sync_group_subscription(p_subscription_id,p_provider_id,p_status,p_provider_updated_at,p_next_payment_at,p_checkout_url); return; end $$;
revoke all on function public.sync_group_subscription(uuid,text,text,timestamptz,timestamptz,text) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
grant execute on function public.sync_group_subscription(uuid,text,text,timestamptz,timestamptz,text) to service_role;
create function app_private.sync_group_subscription(p_subscription_id uuid,p_provider_id text,p_status text,p_provider_updated_at timestamptz,p_next_payment_at timestamptz,p_checkout_url text) returns void language plpgsql security definer set search_path='' as $$ begin perform app_private.billing_gate('NEST'); perform app_private.billing_canonical_sync_group_subscription(p_subscription_id,p_provider_id,p_status,p_provider_updated_at,p_next_payment_at,p_checkout_url); return; end $$;
revoke all on function app_private.sync_group_subscription(uuid,text,text,timestamptz,timestamptz,text) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
grant execute on function app_private.sync_group_subscription(uuid,text,text,timestamptz,timestamptz,text) to asisteam_billing;

alter function public.sync_subscription_invoice(text,text,timestamptz,integer,text,text,text,timestamptz,timestamptz) set schema app_private;
alter function app_private.sync_subscription_invoice(text,text,timestamptz,integer,text,text,text,timestamptz,timestamptz) rename to billing_canonical_sync_subscription_invoice;
revoke all on function app_private.billing_canonical_sync_subscription_invoice(text,text,timestamptz,integer,text,text,text,timestamptz,timestamptz) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
create function public.sync_subscription_invoice(p_provider_subscription_id text,p_invoice_id text,p_due_at timestamptz,p_amount_clp integer,p_currency text,p_status text,p_payment_id text,p_paid_at timestamptz,p_provider_updated_at timestamptz) returns void language plpgsql security definer set search_path='' as $$ begin if session_user <> 'postgres' or current_setting('role',true) not in ('none','postgres') then perform app_private.billing_gate('LEGACY'); end if; perform app_private.billing_canonical_sync_subscription_invoice(p_provider_subscription_id,p_invoice_id,p_due_at,p_amount_clp,p_currency,p_status,p_payment_id,p_paid_at,p_provider_updated_at); return; end $$;
revoke all on function public.sync_subscription_invoice(text,text,timestamptz,integer,text,text,text,timestamptz,timestamptz) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
grant execute on function public.sync_subscription_invoice(text,text,timestamptz,integer,text,text,text,timestamptz,timestamptz) to service_role;
create function app_private.sync_subscription_invoice(p_provider_subscription_id text,p_invoice_id text,p_due_at timestamptz,p_amount_clp integer,p_currency text,p_status text,p_payment_id text,p_paid_at timestamptz,p_provider_updated_at timestamptz) returns void language plpgsql security definer set search_path='' as $$ begin perform app_private.billing_gate('NEST'); perform app_private.billing_canonical_sync_subscription_invoice(p_provider_subscription_id,p_invoice_id,p_due_at,p_amount_clp,p_currency,p_status,p_payment_id,p_paid_at,p_provider_updated_at); return; end $$;
revoke all on function app_private.sync_subscription_invoice(text,text,timestamptz,integer,text,text,text,timestamptz,timestamptz) from public,anon,authenticated,service_role,asisteam_api,asisteam_jobs,asisteam_webhook,asisteam_billing;
grant execute on function app_private.sync_subscription_invoice(text,text,timestamptz,integer,text,text,text,timestamptz,timestamptz) to asisteam_billing;

grant execute on function public.get_group_billing(uuid,integer) to asisteam_api;
