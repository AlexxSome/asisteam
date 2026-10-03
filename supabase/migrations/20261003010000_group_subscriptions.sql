-- #56: el club paga a Asisteam. Catálogo y límites del servidor; nunca cuotas de deportistas.
create table public.billing_plans (
  code text primary key check (code in ('TEAM','CLUB','ACADEMY')),
  name text not null, amount_clp integer not null check (amount_clp > 0),
  athlete_limit integer not null check (athlete_limit > 0), currency text not null default 'CLP' check (currency = 'CLP')
);
insert into public.billing_plans(code,name,amount_clp,athlete_limit) values
  ('TEAM','Equipo',4990,50), ('CLUB','Club',9990,200), ('ACADEMY','Academia',15990,1000);

create table public.group_subscriptions (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete restrict,
  plan_code text not null references public.billing_plans(code),
  amount_clp integer not null check(amount_clp > 0), athlete_limit integer not null check(athlete_limit > 0),
  requested_by uuid not null references public.users(id),
  status text not null default 'CREATING' check(status in ('CREATING','PENDING','AUTHORIZED','PAUSED','CANCELLED','FAILED')),
  provider_subscription_id text unique, checkout_url text, creation_attempted_at timestamptz,
  provider_updated_at timestamptz, next_payment_at timestamptz, activated_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index uq_group_open_subscription on public.group_subscriptions(group_id)
  where status not in ('CANCELLED','FAILED');
create index idx_group_subscription_history on public.group_subscriptions(group_id,created_at desc);
create trigger trg_group_subscription_updated_at before update on public.group_subscriptions
  for each row execute function public.set_updated_at();

-- Una fila por factura remota. Reintentos/notificaciones no crean deuda nueva.
create table public.subscription_invoices (
  provider_invoice_id text primary key,
  subscription_id uuid not null references public.group_subscriptions(id) on delete restrict,
  due_at timestamptz not null, amount_clp integer not null check(amount_clp > 0),
  status text not null check(status in ('PENDING','PAID','CANCELLED','REFUNDED')),
  provider_payment_id text, paid_at timestamptz, provider_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((status = 'PAID') = (paid_at is not null))
);
create index idx_subscription_invoices_history on public.subscription_invoices(subscription_id,due_at desc);
create unique index uq_subscription_payment on public.subscription_invoices(provider_payment_id)
  where provider_payment_id is not null;

alter table public.billing_plans enable row level security;
alter table public.group_subscriptions enable row level security;
alter table public.subscription_invoices enable row level security;
revoke all on public.billing_plans, public.group_subscriptions, public.subscription_invoices from public, anon, authenticated;
grant select on public.billing_plans to authenticated;
create policy billing_plans_read on public.billing_plans for select to authenticated using(true);
grant select,insert,update on public.billing_plans, public.group_subscriptions, public.subscription_invoices to service_role;

create function app_private.billing_actor(p_group_id uuid,p_auth_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  select id into v_user from public.users where auth_user_id = p_auth_id and account_status = 'ACTIVE';
  if v_user is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  perform 1 from public.memberships where group_id = p_group_id and user_id = v_user and status = 'ACTIVE';
  if not found then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
  if not exists(select 1 from public.memberships where group_id = p_group_id and user_id = v_user and status = 'ACTIVE' and role = 'ADMIN') then
    raise sqlstate 'PT403' using message = 'admin_required';
  end if;
  return v_user;
end $$;
revoke all on function app_private.billing_actor(uuid,uuid) from public,anon,authenticated;

create function public.begin_subscription_checkout(p_group_id uuid,p_actor_auth_id uuid,p_plan_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_actor uuid; v_plan public.billing_plans%rowtype; v_subscription public.group_subscriptions%rowtype;
begin
  perform 1 from public.groups where id = p_group_id for update;
  v_actor := app_private.billing_actor(p_group_id,p_actor_auth_id);
  select * into v_plan from public.billing_plans where code = p_plan_code;
  if not found then raise sqlstate 'PT400' using message = 'invalid_billing_request'; end if;
  select * into v_subscription from public.group_subscriptions where group_id = p_group_id and status not in ('CANCELLED','FAILED');
  if found then
    if v_subscription.plan_code <> p_plan_code then
      raise sqlstate 'PT409' using message = 'subscription_exists';
    end if;
  else
    insert into public.group_subscriptions(group_id,plan_code,amount_clp,athlete_limit,requested_by)
    values(p_group_id,v_plan.code,v_plan.amount_clp,v_plan.athlete_limit,v_actor)
    returning * into v_subscription;
  end if;
  return to_jsonb(v_subscription);
end $$;

create function public.get_subscription_context(p_group_id uuid,p_actor_auth_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform app_private.billing_actor(p_group_id,p_actor_auth_id);
  select to_jsonb(s) into v_result from public.group_subscriptions s where s.group_id = p_group_id
    order by (s.status not in ('CANCELLED','FAILED')) desc,s.created_at desc limit 1;
  if v_result is null then raise sqlstate 'PT404' using message = 'subscription_not_found'; end if;
  return v_result;
end $$;

-- Una creación remota por reserva. Si el resultado HTTP es incierto, se recupera
-- por external_reference; nunca se repite a ciegas POST /preapproval.
create function public.claim_subscription_creation(p_subscription_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.group_subscriptions set creation_attempted_at = now()
    where id = p_subscription_id and status = 'CREATING' and creation_attempted_at is null;
  return found;
end $$;
create function public.reject_subscription_creation(p_subscription_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.group_subscriptions set status = 'FAILED'
    where id = p_subscription_id and status = 'CREATING' and provider_subscription_id is null;
$$;

create function public.sync_group_subscription(p_subscription_id uuid,p_provider_id text,p_status text,
  p_provider_updated_at timestamptz,p_next_payment_at timestamptz,p_checkout_url text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_sub public.group_subscriptions%rowtype;
begin
  if p_provider_id is null or p_provider_id !~ '^[A-Za-z0-9_-]{1,128}$' or p_provider_updated_at is null
    or p_status is null or p_status not in ('PENDING','AUTHORIZED','PAUSED','CANCELLED') then
    raise sqlstate 'PT400' using message = 'invalid_billing_request';
  end if;
  select * into v_sub from public.group_subscriptions where id = p_subscription_id for update;
  if not found then raise sqlstate 'PT404' using message = 'subscription_not_found'; end if;
  if v_sub.provider_subscription_id is not null and v_sub.provider_subscription_id <> p_provider_id then
    raise sqlstate 'PT409' using message = 'subscription_provider_mismatch';
  end if;
  if v_sub.provider_updated_at is not null and v_sub.provider_updated_at >= p_provider_updated_at then return; end if;
  -- Una cancelación es terminal: un evento anterior no reabre una suscripción.
  if v_sub.status = 'CANCELLED' and p_status <> 'CANCELLED' then return; end if;
  update public.group_subscriptions set provider_subscription_id = p_provider_id,status = p_status,
    provider_updated_at = p_provider_updated_at,next_payment_at = p_next_payment_at,
    checkout_url = coalesce(p_checkout_url,checkout_url) where id = p_subscription_id;
end $$;

create function public.sync_subscription_invoice(p_provider_subscription_id text,p_invoice_id text,p_due_at timestamptz,
  p_amount_clp integer,p_currency text,p_status text,p_payment_id text,p_paid_at timestamptz,p_provider_updated_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare v_sub public.group_subscriptions%rowtype; v_existing public.subscription_invoices%rowtype;
begin
  select * into v_sub from public.group_subscriptions where provider_subscription_id = p_provider_subscription_id;
  if not found then raise sqlstate 'PT404' using message = 'subscription_not_found'; end if;
  -- Orden de bloqueo compartido con altas de miembros y checkout.
  perform 1 from public.groups where id = v_sub.group_id for update;
  if p_invoice_id is null or p_invoice_id !~ '^[0-9]{1,32}$' or p_due_at is null or p_provider_updated_at is null
    or p_amount_clp is distinct from v_sub.amount_clp or p_currency is distinct from 'CLP'
    or p_status is null or p_status not in ('PENDING','PAID','CANCELLED','REFUNDED')
    or ((p_status = 'PAID') is distinct from (p_paid_at is not null))
    or (p_status = 'PAID' and p_payment_id is null) then
    raise sqlstate 'PT400' using message = 'invalid_billing_request';
  end if;
  select * into v_existing from public.subscription_invoices where provider_invoice_id = p_invoice_id for update;
  if found then
    if v_existing.subscription_id <> v_sub.id then raise sqlstate 'PT409' using message = 'invoice_subscription_mismatch'; end if;
    if v_existing.provider_updated_at >= p_provider_updated_at then return; end if;
  end if;
  insert into public.subscription_invoices(provider_invoice_id,subscription_id,due_at,amount_clp,status,provider_payment_id,paid_at,provider_updated_at)
  values(p_invoice_id,v_sub.id,p_due_at,p_amount_clp,p_status,p_payment_id,p_paid_at,p_provider_updated_at)
  on conflict(provider_invoice_id) do update set due_at = excluded.due_at,status = excluded.status,
    provider_payment_id = excluded.provider_payment_id,paid_at = excluded.paid_at,provider_updated_at = excluded.provider_updated_at;
  -- AUTHORIZED no acredita pago. La capacidad contratada comienza con un pago aprobado.
  if p_status = 'PAID' then
    update public.group_subscriptions set activated_at = coalesce(activated_at,now()) where id = v_sub.id;
  end if;
end $$;

-- Fotografía de grupos previos: no se crean nuevas excepciones legacy desde clientes.
create table app_private.billing_legacy_groups (group_id uuid primary key references public.groups(id) on delete restrict);
alter table app_private.billing_legacy_groups enable row level security;
insert into app_private.billing_legacy_groups(group_id) select id from public.groups;
revoke all on app_private.billing_legacy_groups from public,anon,authenticated;

create function app_private.group_athlete_limit(p_group_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select athlete_limit from public.group_subscriptions where group_id = p_group_id and activated_at is not null
    order by created_at desc,id desc limit 1),
    case when exists(select 1 from app_private.billing_legacy_groups where group_id = p_group_id) then null else 0 end);
$$;
-- Capacidad operativa para deportistas + apoderados + staff. No es una unidad de cobro.
create function app_private.group_membership_limit(p_group_id uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case when app_private.group_athlete_limit(p_group_id) is null then 500 else 5000 end;
$$;
revoke all on function app_private.group_athlete_limit(uuid),app_private.group_membership_limit(uuid) from public,anon,authenticated;

create function app_private.enforce_subscription_capacity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_limit integer;
begin
  if new.status <> 'ACTIVE' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'ACTIVE' and old.group_id = new.group_id and old.role = new.role then return new; end if;
  perform 1 from public.groups where id = new.group_id for update;
  v_limit := app_private.group_athlete_limit(new.group_id);
  if v_limit is null then return new; end if;
  if new.role = 'ATHLETE' and (select count(*) from public.memberships
    where group_id = new.group_id and role = 'ATHLETE' and status = 'ACTIVE' and id <> new.id) >= v_limit then
    raise sqlstate 'PT422' using message = 'subscription_athlete_limit';
  end if;
  if (select count(*) from public.memberships where group_id = new.group_id and status = 'ACTIVE' and id <> new.id) >= 5000 then
    raise sqlstate 'PT422' using message = 'group_member_limit';
  end if;
  return new;
end $$;
revoke all on function app_private.enforce_subscription_capacity() from public,anon,authenticated;
create trigger trg_subscription_capacity before insert or update on public.memberships
  for each row execute function app_private.enforce_subscription_capacity();

create function public.get_group_billing(p_group_id uuid,p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
  if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
  if p_page is null or p_page not between 1 and 1000000 then raise sqlstate 'PT400' using message = 'invalid_billing_request'; end if;
  with ledger as materialized (
    select i.provider_invoice_id as id,p.name as plan_name,i.due_at,i.amount_clp,i.paid_at,
      case when i.status = 'PENDING' and (i.due_at at time zone 'America/Santiago')::date < app_private.chile_today()
        then 'OVERDUE' else i.status end as status
    from public.subscription_invoices i join public.group_subscriptions s on s.id = i.subscription_id
    join public.billing_plans p on p.code = s.plan_code where s.group_id = p_group_id
  ), paged as (select * from ledger order by due_at desc,id desc limit 50 offset (p_page-1)*50)
  select jsonb_build_object(
    'plans',(select jsonb_agg(to_jsonb(p) order by athlete_limit) from public.billing_plans p),
    'active_athletes',(select count(*) from public.memberships where group_id = p_group_id and role = 'ATHLETE' and status = 'ACTIVE'),
    'athlete_limit',app_private.group_athlete_limit(p_group_id),
    'subscription',(select jsonb_build_object('id',s.id,'plan_code',s.plan_code,'amount_clp',s.amount_clp,'status',s.status,
      'next_payment_at',s.next_payment_at,'activated_at',s.activated_at) from public.group_subscriptions s where s.group_id = p_group_id
      order by (s.status not in ('CANCELLED','FAILED')) desc,s.created_at desc limit 1),
    'invoices',coalesce((select jsonb_agg(to_jsonb(paged) order by due_at desc,id desc) from paged),'[]'::jsonb),
    'overdue_amount_clp',coalesce((select sum(amount_clp) from ledger where status = 'OVERDUE'),0),
    'total_invoices',(select count(*) from ledger),'page',p_page) into v_result;
  return v_result;
end $$;
revoke all on function public.get_group_billing(uuid,integer) from public,anon;
grant execute on function public.get_group_billing(uuid,integer) to authenticated;

revoke all on function public.begin_subscription_checkout(uuid,uuid,text),public.get_subscription_context(uuid,uuid),
 public.claim_subscription_creation(uuid),public.reject_subscription_creation(uuid),
 public.sync_group_subscription(uuid,text,text,timestamptz,timestamptz,text),
 public.sync_subscription_invoice(text,text,timestamptz,integer,text,text,text,timestamptz,timestamptz)
 from public,anon,authenticated;
grant execute on function public.begin_subscription_checkout(uuid,uuid,text),public.get_subscription_context(uuid,uuid),
 public.claim_subscription_creation(uuid),public.reject_subscription_creation(uuid),
 public.sync_group_subscription(uuid,text,text,timestamptz,timestamptz,text),
 public.sync_subscription_invoice(text,text,timestamptz,integer,text,text,text,timestamptz,timestamptz)
 to service_role;

create function public.lookup_billing_subscription(p_subscription_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(s) from public.group_subscriptions s where id = p_subscription_id;
$$;
revoke all on function public.lookup_billing_subscription(uuid) from public,anon,authenticated;
grant execute on function public.lookup_billing_subscription(uuid) to service_role;
