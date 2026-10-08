-- MIG-21 #165. Derived from versioned Supabase schema; see transformation.json.
--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app_private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA app_private;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: accept_invitation(text, uuid, jsonb); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.accept_invitation(p_token_hash text, p_auth_user_id uuid, p_registration jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
    v_inv public.invitations%rowtype; v_user public.users%rowtype;
    v_auth_email text; v_birthdate date; v_status text; v_membership public.memberships%rowtype;
    v_new_memberships integer;
begin
    perform 1 from public.users where id = (select invited_user_id from public.invitations
      where token = p_token_hash and activation_membership_id is not null) for update;
    select * into v_inv from public.invitations where token = p_token_hash for update;
    if not found then return jsonb_build_object('error', 'invitation_not_available'); end if;
    if v_inv.status = 'PENDING' and v_inv.expires_at <= now() then
        update public.invitations set status = 'EXPIRED' where id = v_inv.id;
        return jsonb_build_object('error', 'invitation_expired');
    end if;
    if v_inv.status = 'EXPIRED' then return jsonb_build_object('error', 'invitation_expired'); end if;
    if v_inv.status <> 'PENDING' then return jsonb_build_object('error', 'invitation_not_available'); end if;
    select email into v_auth_email from app_private.auth_subjects where id = p_auth_user_id;
    select * into v_user from public.users
      where (v_inv.invited_user_id is not null and id = v_inv.invited_user_id)
         or (v_inv.invited_user_id is null and lower(email) = lower(v_inv.email)) for update;
    if v_user.id is null or v_auth_email is null
      or lower(v_auth_email) is distinct from lower(coalesce(v_inv.email, v_user.email))
      or (v_user.email is not null and lower(v_user.email) <> lower(v_auth_email)) then
        return jsonb_build_object('error', 'invitation_not_available');
    end if;

    -- HU-DEP-07: resolver el perfil vigente en la misma transacción de Auth.
    -- El titular únicamente elige sus credenciales y acepta las condiciones.
    if p_registration -> 'managed_claim' = 'true'::jsonb then
        if v_inv.activation_membership_id is null or v_user.account_status <> 'MANAGED' then
            return jsonb_build_object('error', 'invitation_not_available');
        end if;
        p_registration := jsonb_build_object('full_name', v_user.full_name,
          'birthdate', v_user.birthdate, 'phone', v_user.phone,
          'terms_version', p_registration ->> 'terms_version');
    end if;

    if p_registration is null then
        if v_user.auth_user_id is distinct from p_auth_user_id or v_user.account_status <> 'ACTIVE' then
            return jsonb_build_object('error', 'invitation_not_available');
        end if;
        v_birthdate := v_user.birthdate;
    else
        if v_user.auth_user_id is not null or v_user.account_status not in ('INVITED','MANAGED') then
            return jsonb_build_object('error', 'invitation_not_available');
        end if;
        v_birthdate := (p_registration ->> 'birthdate')::date;
        if v_birthdate is null or v_birthdate >= app_private.chile_today()
          or extract(year from age(app_private.chile_today(), v_birthdate)) > 110
          or length(trim(p_registration ->> 'full_name')) not between 2 and 120
          or coalesce(p_registration ->> 'terms_version', '') <> '2026-09-21' then
            return jsonb_build_object('error', 'invalid_registration');
        end if;
        -- Una fecha precargada por ADMIN no se puede cambiar para eludir R1.
        if v_user.birthdate is not null and v_user.birthdate <> v_birthdate then
            return jsonb_build_object('error', 'birthdate_confirmation_required');
        end if;
        if app_private.is_minor(v_birthdate) and (not app_private.has_minor_consent(v_user.id)
          or (v_user.account_status = 'MANAGED' and not exists (
            select 1 from public.guardianships g join public.consents c on c.guardianship_id = g.id
            where g.athlete_user_id = v_user.id and g.status = 'ACTIVE'
              and c.consent_type = 'ACCOUNT_ACTIVATION_MINOR' and c.revoked_at is null and c.granted_at <= now()
          ))) then return jsonb_build_object('error', 'guardian_consent_required'); end if;
    end if;
    if v_inv.role = 'ATHLETE' and v_birthdate is null then
        return jsonb_build_object('error', 'athlete_birthdate_required');
    end if;
    if v_inv.activation_membership_id is not null then
        if p_registration is null or v_user.account_status <> 'MANAGED' then
            return jsonb_build_object('error','invitation_not_available');
        end if;
        if app_private.is_minor(v_birthdate) and not app_private.has_account_activation_consent(v_user.id) then
            return jsonb_build_object('error','guardian_consent_required');
        end if;
        select * into v_membership from public.memberships where id = v_inv.activation_membership_id
          and user_id = v_user.id and group_id = v_inv.group_id and role = 'ATHLETE';
        if not found then return jsonb_build_object('error','invitation_not_available'); end if;
        -- CB-06: actualizar solo la cuenta; ninguna membresía/vínculo/asistencia
        -- se inserta, reactiva ni modifica (incluido joined_at y updated_at).
        update public.users set auth_user_id = p_auth_user_id, account_status = 'ACTIVE', email = v_auth_email,
          full_name = trim(p_registration ->> 'full_name'), phone = nullif(trim(p_registration ->> 'phone'),'')
          where id = v_user.id;
        update public.invitations set status = 'ACCEPTED', accepted_at = now(),
          terms_version = p_registration ->> 'terms_version' where id = v_inv.id;
        return jsonb_build_object('group_id',v_inv.group_id,'membership_status',v_membership.status);
    end if;
    v_status := case when v_inv.role = 'ATHLETE' and app_private.is_minor(v_birthdate)
      and not app_private.has_minor_consent(v_user.id) then 'PENDING' else 'ACTIVE' end;
    perform 1 from public.groups where id = v_inv.group_id for update;
    select * into v_membership from public.memberships
      where user_id = v_user.id and group_id = v_inv.group_id and role = v_inv.role;
    v_new_memberships := case when coalesce(v_membership.status, '') <> 'ACTIVE' and v_status = 'ACTIVE' then 1 else 0 end;
    if v_inv.role = 'ATHLETE' and v_status = 'ACTIVE' and app_private.is_minor(v_birthdate) then
        -- El trigger canónico incorpora también a los apoderados del menor.
        v_new_memberships := v_new_memberships + (select count(*) from public.guardianships g
          where g.athlete_user_id = v_user.id and g.status = 'ACTIVE'
            and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
              and m.group_id = v_inv.group_id and m.role = 'GUARDIAN' and m.status = 'ACTIVE'));
    end if;
    if (select count(*) from public.memberships where group_id = v_inv.group_id and status = 'ACTIVE') + v_new_memberships > app_private.group_membership_limit(v_inv.group_id) then
        return jsonb_build_object('error', 'group_member_limit');
    end if;
    if not exists(select 1 from public.memberships where user_id = v_user.id and group_id = v_inv.group_id and status in ('ACTIVE','PENDING'))
      and (select count(distinct group_id) from public.memberships where user_id = v_user.id and status in ('ACTIVE','PENDING')) >= 30 then
        return jsonb_build_object('error', 'user_group_limit');
    end if;
    if p_registration is not null then
        update public.users set auth_user_id = p_auth_user_id, account_status = 'ACTIVE', email = v_auth_email,
          full_name = trim(p_registration ->> 'full_name'), birthdate = v_birthdate,
          phone = nullif(trim(p_registration ->> 'phone'), '') where id = v_user.id;
    end if;
    insert into public.memberships(user_id, group_id, role, status, joined_at)
      values(v_user.id, v_inv.group_id, v_inv.role, v_status, case when v_status = 'ACTIVE' then now() end)
    on conflict(user_id, group_id, role) do update set status = excluded.status,
      joined_at = coalesce(public.memberships.joined_at, excluded.joined_at);
    update public.invitations set status = 'ACCEPTED', accepted_at = now(), invited_user_id = v_user.id,
      terms_version = p_registration ->> 'terms_version' where id = v_inv.id;
    return jsonb_build_object('group_id', v_inv.group_id, 'membership_status', v_status);
end $$;


--
-- Name: account_terms_version(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.account_terms_version() RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$ select '2026-09-21'::text $$;


--
-- Name: activity_local_to_utc(timestamp without time zone); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.activity_local_to_utc(p_local timestamp without time zone) RETURNS timestamp with time zone
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare v_utc timestamptz := p_local at time zone 'America/Santiago';
begin
  if not isfinite(p_local) or v_utc at time zone 'America/Santiago' <> p_local
    or (v_utc - interval '1 hour') at time zone 'America/Santiago' = p_local
    or (v_utc + interval '1 hour') at time zone 'America/Santiago' = p_local then
    raise sqlstate 'PT422' using message = 'invalid_local_datetime';
  end if;
  return v_utc;
end $$;


--
-- Name: actor_claims(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.actor_claims() RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
 select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
$$;


--
-- Name: actor_role(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.actor_role() RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$
 select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),app_private.actor_claims()->>'role')
$$;


--
-- Name: actor_subject_id(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.actor_subject_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select case when a.mode='FROZEN' or (a.mode='NATIVE' and
  (coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'auth_provider','')<>'nest'
   or (session_user<>'asisteam_api' and current_setting('role',true)<>'asisteam_api'))) then null
 else coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
 nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid end
 from app_private.auth_authority a where singleton
$$;


--
-- Name: announcement_worker_metrics(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.announcement_worker_metrics() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
select jsonb_build_object('pending',count(*) filter(where status in ('PENDING','AWAITING_RECEIPT')),
  'failed',count(*) filter(where status='FAILED'),
  'oldest_seconds',coalesce(extract(epoch from now()-min(created_at) filter(where status in ('PENDING','AWAITING_RECEIPT')))::integer,0))
from app_private.announcement_push_deliveries;
$$;


--
-- Name: api_accept_invitation(text); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.api_accept_invitation(p_token_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if app_private.actor_subject_id() is null or public.auth_user_id() is null then raise sqlstate 'PT401' using message='authentication_required'; end if;
  if not public.has_account_consent() then raise sqlstate 'PT422' using message='account_terms_required'; end if;
  return public.accept_invitation(p_token_hash,app_private.actor_subject_id());
end $$;


--
-- Name: api_issue_invitation(uuid, text, text, text, uuid, uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.api_issue_invitation(p_group_id uuid, p_token_hash text, p_email text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_invitation_id uuid DEFAULT NULL::uuid, p_membership_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if app_private.actor_subject_id() is null or public.auth_user_id() is null then raise sqlstate 'PT401' using message='authentication_required'; end if;
  if not public.has_account_consent() then raise sqlstate 'PT403' using message='account_terms_required'; end if;
  if p_membership_id is not null then
    return public.issue_managed_activation(app_private.actor_subject_id(),p_group_id,p_membership_id,p_token_hash);
  end if;
  return public.issue_invitation(app_private.actor_subject_id(),p_group_id,p_token_hash,p_email,p_role,p_invitation_id);
end $$;


--
-- Name: api_session_user_id(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.api_session_user_id(p_session_id uuid) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$select null::uuid$$;


--
-- Name: attendance_metrics(bigint, bigint, bigint, bigint); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.attendance_metrics(p_present bigint, p_late bigint, p_absent bigint, p_excused bigint) RETURNS TABLE(convened bigint, present bigint, late bigint, absent bigint, excused bigint, attendance_pct numeric, late_rate numeric)
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
    select p_present + p_late + p_absent + p_excused, p_present, p_late, p_absent, p_excused,
      round(100.0 * (p_present + p_late) / nullif(p_present + p_late + p_absent, 0), 1),
      round(100.0 * p_late / nullif(p_present + p_late, 0), 1)
$$;


--
-- Name: attendance_period_bounds(text, date, date, timestamp with time zone); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.attendance_period_bounds(p_period text, p_from date, p_to date, p_created_at timestamp with time zone) RETURNS TABLE(from_date date, until_date date, from_utc timestamp with time zone, until_utc timestamp with time zone)
    LANGUAGE plpgsql STABLE
    SET search_path TO ''
    AS $$
declare v_anchor date := coalesce(p_from, app_private.chile_today());
begin
  if p_period is null or p_period not in ('week', 'month', 'custom', 'season')
    or (p_from is not null and (not isfinite(p_from) or p_from not between date '0001-01-01' and date '9999-12-31'))
    or (p_to is not null and (not isfinite(p_to) or p_to not between date '0001-01-01' and date '9999-12-31')) then
    raise sqlstate 'PT400' using message = 'invalid_report_filters';
  end if;
  case p_period
    when 'week' then from_date := date_trunc('week', v_anchor::timestamp)::date; until_date := from_date + 7;
    when 'month' then from_date := date_trunc('month', v_anchor::timestamp)::date; until_date := (from_date + interval '1 month')::date;
    when 'custom' then
      if p_from is null or p_to is null or p_to < p_from then
        raise sqlstate 'PT400' using message = 'invalid_report_filters';
      end if;
      from_date := p_from; until_date := p_to + 1;
    when 'season' then from_date := (p_created_at at time zone 'America/Santiago')::date; until_date := app_private.chile_today() + 1;
  end case;
  from_utc := from_date::timestamp at time zone 'America/Santiago';
  until_utc := until_date::timestamp at time zone 'America/Santiago';
  return next;
end $$;


--
-- Name: auth_cutover(text); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.auth_cutover(p_action text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$begin
 if p_action<>'RECOVER_FORWARD' or not app_private.auth_is_native() then raise exception 'Native authority required';end if;
 update app_private.auth_authority set recovery_started_at=now() where singleton;
 return jsonb_build_object('mode','NATIVE');
end$$;


--
-- Name: auth_is_native(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.auth_is_native() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
 select mode='NATIVE' from app_private.auth_authority where singleton
$$;


--
-- Name: auth_operation(text, jsonb); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.auth_operation(p_operation text, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_mode text; v_subject uuid; v_result jsonb; begin
 select mode into v_mode from app_private.auth_authority where singleton for share;
 if v_mode='FROZEN' then raise sqlstate 'PT503' using message='identity_authority_frozen'; end if;
 if p_operation in ('lookup','recovery') then
  select auth_user_id into v_subject from public.users where lower(email)=lower(p_data->>'email');
 elsif p_data->>'subject_id' is not null then v_subject:=(p_data->>'subject_id')::uuid;
 end if;
 if exists(select 1 from app_private.auth_subjects where id=v_subject and disabled_until>statement_timestamp()) then
  if p_operation='recovery' then return '{}'::jsonb; end if;
  return jsonb_build_object('error','authentication_required');
 end if;
 v_result:=app_private.identity_auth_operation(p_operation,p_data);
 if v_result->>'subject_id' is not null and exists(select 1 from app_private.auth_subjects
   where id=(v_result->>'subject_id')::uuid and disabled_until>statement_timestamp()) then
  update app_private.auth_families set revoked_at=now() where id=(v_result->>'session_id')::uuid;
  return jsonb_build_object('error','authentication_required');
 end if;
 if not (v_result ? 'error') and p_operation in ('register','login','password','reset','oauth_complete') then
  v_subject:=coalesce((v_result->>'subject_id')::uuid,v_subject);
  if p_operation='reset' then select subject_id into v_subject from app_private.auth_recovery where token_hash=p_data->>'token_hash'; end if;
  update app_private.auth_subjects set native_owned=true where id=v_subject;
  if v_mode='LEGACY' then perform app_private.invalidate_legacy_subject(v_subject); end if;
 end if;
 return v_result;
end $$;


--
-- Name: begin_subscription_checkout(uuid, uuid, text); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.begin_subscription_checkout(p_group_id uuid, p_actor_auth_id uuid, p_plan_code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ begin perform app_private.billing_gate('NEST'); return app_private.billing_canonical_begin_subscription_checkout(p_group_id,p_actor_auth_id,p_plan_code); end $$;


--
-- Name: billing_actor(uuid, uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.billing_actor(p_group_id uuid, p_auth_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: billing_canonical_begin_subscription_checkout(uuid, uuid, text); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.billing_canonical_begin_subscription_checkout(p_group_id uuid, p_actor_auth_id uuid, p_plan_code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: billing_canonical_claim_subscription_creation(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.billing_canonical_claim_subscription_creation(p_subscription_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update public.group_subscriptions set creation_attempted_at = now()
    where id = p_subscription_id and status = 'CREATING' and creation_attempted_at is null;
  return found;
end $$;


--
-- Name: billing_canonical_get_subscription_context(uuid, uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.billing_canonical_get_subscription_context(p_group_id uuid, p_actor_auth_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_result jsonb;
begin
  perform app_private.billing_actor(p_group_id,p_actor_auth_id);
  select to_jsonb(s) into v_result from public.group_subscriptions s where s.group_id = p_group_id
    order by (s.status not in ('CANCELLED','FAILED')) desc,s.created_at desc limit 1;
  if v_result is null then raise sqlstate 'PT404' using message = 'subscription_not_found'; end if;
  return v_result;
end $$;


--
-- Name: billing_canonical_lookup_billing_subscription(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.billing_canonical_lookup_billing_subscription(p_subscription_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select to_jsonb(s) from public.group_subscriptions s where id = p_subscription_id;
$$;


--
-- Name: billing_canonical_reject_subscription_creation(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.billing_canonical_reject_subscription_creation(p_subscription_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update public.group_subscriptions set status = 'FAILED'
    where id = p_subscription_id and status = 'CREATING' and provider_subscription_id is null;
$$;


--
-- Name: billing_canonical_sync_group_subscription(uuid, text, text, timestamp with time zone, timestamp with time zone, text); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.billing_canonical_sync_group_subscription(p_subscription_id uuid, p_provider_id text, p_status text, p_provider_updated_at timestamp with time zone, p_next_payment_at timestamp with time zone, p_checkout_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
end $_$;


--
-- Name: billing_canonical_sync_subscription_invoice(text, text, timestamp with time zone, integer, text, text, text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.billing_canonical_sync_subscription_invoice(p_provider_subscription_id text, p_invoice_id text, p_due_at timestamp with time zone, p_amount_clp integer, p_currency text, p_status text, p_payment_id text, p_paid_at timestamp with time zone, p_provider_updated_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
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
end $_$;


--
-- Name: billing_gate(text); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.billing_gate(p_mode text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_mode text;
begin
  select mode into v_mode from app_private.billing_transport where singleton for share;
  if v_mode is distinct from p_mode then raise sqlstate 'PT503' using message='billing_unavailable'; end if;
end $$;


--
-- Name: billing_handoff(boolean); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.billing_handoff(p_quiescent boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_quiescent is distinct from true then raise sqlstate 'PT400' using message='billing_unavailable'; end if;
  update app_private.billing_transport set mode='NEST' where singleton;
end $$;


--
-- Name: can_manage_attendance(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.can_manage_attendance(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists(select 1 from public.memberships where group_id = p_group_id
    and user_id = public.auth_user_id() and status = 'ACTIVE' and role in ('ADMIN','COACH'))
$$;


--
-- Name: can_read_group_activities(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.can_read_group_activities(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select exists (
        select 1 from public.memberships m
        where m.group_id = p_group_id and m.user_id = public.auth_user_id() and m.status = 'ACTIVE'
          and (m.role in ('ADMIN', 'ATHLETE', 'COACH') or (m.role = 'GUARDIAN' and exists (
              select 1 from public.memberships ward
              where ward.group_id = p_group_id and ward.role = 'ATHLETE' and ward.status = 'ACTIVE'
                and public.is_guardian_of(ward.user_id)
          )))
    )
$$;


--
-- Name: can_view_group_stats(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.can_view_group_stats(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select exists (
    select 1 from public.groups g join public.memberships m on m.group_id = g.id
    where g.id = p_group_id and m.user_id = public.auth_user_id() and m.status = 'ACTIVE'
      and (m.role in ('ADMIN','COACH')
        or m.role = 'ATHLETE' and (g.settings ->> 'athletes_can_view_group_stats')::boolean
        or m.role = 'GUARDIAN' and (g.settings ->> 'guardians_can_view_group_stats')::boolean
          and exists(select 1 from public.memberships ward where ward.group_id = g.id
            and ward.role = 'ATHLETE' and ward.status = 'ACTIVE' and public.is_guardian_of(ward.user_id)))
  )
$$;


--
-- Name: canonical_claim_announcement_push(boolean); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.canonical_claim_announcement_push(p_receipts boolean DEFAULT false) RETURNS TABLE(delivery_id uuid, claim_token uuid, token text, announcement_id uuid, group_id uuid, ticket_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update app_private.announcement_push_deliveries d set status='CANCELLED',completed_at=now(),claim_token=null
    where d.status='PENDING' and not exists(
      select 1 from public.group_announcements a join public.push_tokens t on t.id=d.push_token_id and t.user_id=d.user_id and t.is_active
      join public.announcement_push_preferences pref on pref.user_id=d.user_id and pref.enabled
      join public.users u on u.id=d.user_id and u.account_status='ACTIVE'
      where a.id=d.announcement_id and a.deleted_at is null and exists(
        select 1 from public.memberships m where m.group_id=a.group_id and m.user_id=d.user_id and m.status='ACTIVE'));
  update app_private.announcement_push_deliveries d set status='FAILED',failure_code='attempts_exhausted',completed_at=now(),claim_token=null
    where d.status='PENDING' and d.attempts>=6 and (d.claimed_until is null or d.claimed_until<now());
  update app_private.announcement_push_deliveries d set status='FAILED',failure_code='receipt_timeout',completed_at=now(),claim_token=null
    where d.status='AWAITING_RECEIPT' and d.accepted_at<now()-interval '23 hours';
  return query with pending as (
    select d.id from app_private.announcement_push_deliveries d
    where d.status=case when p_receipts then 'AWAITING_RECEIPT' else 'PENDING' end
      and d.next_attempt_at<=now() and (d.claimed_until is null or d.claimed_until<now())
    order by d.next_attempt_at,d.id limit 10 for update skip locked
  ), claimed as (
    update app_private.announcement_push_deliveries d set claimed_until=now()+interval '2 minutes',claim_token=gen_random_uuid(),
      attempts=d.attempts+case when p_receipts then 0 else 1 end
    from pending p where d.id=p.id returning d.*
  ) select c.id,c.claim_token,case when p_receipts then null else t.token end,c.announcement_id,a.group_id,c.ticket_id
    from claimed c join public.push_tokens t on t.id=c.push_token_id join public.group_announcements a on a.id=c.announcement_id;
end $$;


--
-- Name: canonical_complete_announcement_push(uuid, uuid, text, text); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.canonical_complete_announcement_push(p_delivery_id uuid, p_claim_token uuid, p_outcome text, p_ticket_id text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_delivery app_private.announcement_push_deliveries;
begin
  if p_outcome is null or p_outcome not in ('accepted','delivered','retry','unregistered','failed','receipt_pending') then
    raise sqlstate 'PT400' using message='invalid_push_outcome';
  end if;
  select * into v_delivery from app_private.announcement_push_deliveries where id=p_delivery_id and claim_token=p_claim_token for update;
  if not found then return; end if;
  if p_outcome='accepted' then
    if v_delivery.status<>'PENDING' or p_ticket_id is null or length(p_ticket_id) not between 1 and 200 then
      raise sqlstate 'PT400' using message='invalid_push_outcome'; end if;
    update app_private.announcement_push_deliveries set status='AWAITING_RECEIPT',ticket_id=p_ticket_id,accepted_at=now(),
      next_attempt_at=now()+interval '15 minutes',claim_token=null,claimed_until=null where id=p_delivery_id;
  elsif p_outcome='receipt_pending' then
    update app_private.announcement_push_deliveries set next_attempt_at=now()+interval '15 minutes',claim_token=null,claimed_until=null where id=p_delivery_id;
  elsif p_outcome='retry' then
    update app_private.announcement_push_deliveries set status=case when attempts>=6 then 'FAILED' else 'PENDING' end,
      failure_code='temporary_error',ticket_id=null,accepted_at=null,next_attempt_at=now()+make_interval(secs=>60*(2^attempts)::integer),claim_token=null,claimed_until=null where id=p_delivery_id;
  else
    update app_private.announcement_push_deliveries set status=case when p_outcome='delivered' then 'DELIVERED' else 'FAILED' end,
      failure_code=case when p_outcome='delivered' then null else p_outcome end,completed_at=now(),claim_token=null,claimed_until=null where id=p_delivery_id;
    if p_outcome='unregistered' then
      update public.push_tokens set is_active=false where id=v_delivery.push_token_id and user_id=v_delivery.user_id;
    end if;
  end if;
end $$;


--
-- Name: canonical_record_announcement_push_run(integer); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.canonical_record_announcement_push_run(p_processed integer) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  insert into public.job_runs(job_name,run_date,affected_count) values('send-announcement-push',app_private.chile_today(),p_processed)
  on conflict(job_name,run_date) do update set affected_count=public.job_runs.affected_count+excluded.affected_count,completed_at=now();
$$;


--
-- Name: change_membership_status(uuid, uuid, boolean); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.change_membership_status(p_group_id uuid, p_membership_id uuid, p_active boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
    v_actor uuid := public.auth_user_id(); v_user uuid; v_member public.memberships%rowtype;
    v_birthdate date; v_new_memberships integer := 1;
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    select user_id into v_user from public.memberships where id = p_membership_id and group_id = p_group_id;
    if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;
    -- Personas antes de grupo, como altas y aprobaciones: serializa límites,
    -- consentimiento y sincronización GUARDIAN durante la reactivación.
    perform 1 from public.users u where u.id = v_user or exists(
      select 1 from public.guardianships g where g.status = 'ACTIVE'
        and ((g.athlete_user_id = v_user and g.guardian_user_id = u.id)
          or (g.guardian_user_id = v_user and g.athlete_user_id = u.id))) order by u.id for update;
    select birthdate into v_birthdate from public.users where id = v_user;
    if p_active and app_private.is_minor(v_birthdate) then
        perform 1 from public.users u where exists(select 1 from public.guardianships g
          where g.athlete_user_id = v_user and g.guardian_user_id = u.id and g.status = 'ACTIVE')
          order by u.id for update;
    end if;
    perform 1 from public.groups where id = p_group_id for update;
    perform 1 from public.memberships where user_id = v_actor and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    select * into v_member from public.memberships where id = p_membership_id and group_id = p_group_id for update;
    if v_member.status <> (case when p_active then 'INACTIVE' else 'ACTIVE' end) then
        raise sqlstate 'PT409' using message = 'membership_status_changed';
    end if;
    if not p_active then
        if v_member.role = 'ADMIN' and (select count(*) from public.memberships
          where group_id = p_group_id and role = 'ADMIN' and status = 'ACTIVE') <= 1 then
            raise sqlstate 'PT409' using message = 'LAST_ADMIN';
        end if;
        -- V2: no se corta el acceso a pupilos vigentes. La baja del pupilo
        -- conserva sus vínculos y libera después la baja del apoderado.
        if v_member.role = 'GUARDIAN' and exists(select 1 from public.guardianships g
          join public.users u on u.id = g.athlete_user_id join public.memberships m on m.user_id = u.id
          where g.guardian_user_id = v_user and g.status = 'ACTIVE' and app_private.is_minor(u.birthdate)
            and m.group_id = p_group_id and m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')) then
            raise sqlstate 'PT422' using message = 'guardian_has_active_wards';
        end if;
        update public.memberships set status = 'INACTIVE' where id = p_membership_id;
        return;
    end if;
    if not exists(select 1 from public.memberships where user_id = v_user and group_id = p_group_id and status in ('ACTIVE','PENDING'))
      and (select count(distinct group_id) from public.memberships where user_id = v_user and status in ('ACTIVE','PENDING')) >= 30 then
        raise sqlstate 'PT422' using message = 'user_group_limit';
    end if;
    if v_member.role = 'GUARDIAN' and not exists(select 1 from public.guardianships g
      join public.users u on u.id = g.athlete_user_id join public.memberships m on m.user_id = u.id
      where g.guardian_user_id = v_user and g.status = 'ACTIVE' and app_private.is_minor(u.birthdate)
        and m.group_id = p_group_id and m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')) then
        raise sqlstate 'PT422' using message = 'guardian_requires_active_ward';
    end if;
    if v_member.role = 'ATHLETE' then
        if v_birthdate is null then raise sqlstate 'PT422' using message = 'athlete_birthdate_required'; end if;
        if app_private.is_minor(v_birthdate) then
            if not app_private.has_minor_consent(v_user) then
                raise sqlstate 'PT422' using message = 'minor_requires_guardian_consent';
            end if;
            if exists(select 1 from app_private.managed_member_enrollments
              where membership_id = p_membership_id and activated_at is null) then
                raise sqlstate 'PT422' using message = 'managed_consent_required';
            end if;
            if exists(select 1 from public.guardianships g where g.athlete_user_id = v_user and g.status = 'ACTIVE'
              and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
                and m.group_id = p_group_id and m.status in ('ACTIVE','PENDING'))
              and (select count(distinct m.group_id) from public.memberships m where m.user_id = g.guardian_user_id
                and m.status in ('ACTIVE','PENDING')) >= 30) then
                raise sqlstate 'PT422' using message = 'guardian_group_limit';
            end if;
            v_new_memberships := v_new_memberships + (select count(*) from public.guardianships g
              where g.athlete_user_id = v_user and g.status = 'ACTIVE'
                and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
                  and m.group_id = p_group_id and m.role = 'GUARDIAN' and m.status = 'ACTIVE'));
        end if;
    end if;
    if (select count(*) from public.memberships where group_id = p_group_id and status = 'ACTIVE') + v_new_memberships > app_private.group_membership_limit(p_group_id) then
        raise sqlstate 'PT422' using message = 'group_member_limit';
    end if;
    -- Conserva la fecha original para que los reportes sigan incluyendo todo
    -- su historial. Una incorporación nunca activada inicia su fecha hoy.
    update public.memberships set status = 'ACTIVE', joined_at = coalesce(joined_at, now()) where id = p_membership_id;
end $$;


--
-- Name: chile_today(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.chile_today() RETURNS date
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$ select (now() at time zone 'America/Santiago')::date $$;


--
-- Name: claim_subscription_creation(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.claim_subscription_creation(p_subscription_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ begin perform app_private.billing_gate('NEST'); return app_private.billing_canonical_claim_subscription_creation(p_subscription_id); end $$;


--
-- Name: create_single_activity(uuid, uuid, text, timestamp with time zone, timestamp with time zone, text, text); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.create_single_activity(p_group_id uuid, p_activity_type_id uuid, p_title text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_description text DEFAULT NULL::text, p_location text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_id uuid; v_user_id uuid := public.auth_user_id();
begin
    if v_user_id is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not app_private.can_read_group_activities(p_group_id) then
        raise sqlstate 'PT404' using message = 'group_not_found';
    end if;
    -- El lock conserva el permiso ADMIN hasta finalizar la escritura.
    perform 1 from public.memberships where group_id = p_group_id and user_id = v_user_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_title is null or length(trim(p_title)) not between 3 and 120
       or length(p_description) > 2000 or length(p_location) > 200 then
        raise sqlstate 'PT400' using message = 'invalid_activity';
    end if;
    if p_starts_at is null or p_ends_at is null or not isfinite(p_starts_at)
       or not isfinite(p_ends_at) or p_ends_at <= p_starts_at or p_ends_at - p_starts_at > interval '24 hours' then
        raise sqlstate 'PT422' using message = 'invalid_date_range';
    end if;
    perform 1 from public.activity_types where id = p_activity_type_id and is_active
      and (group_id is null or group_id = p_group_id) for share;
    if not found then raise sqlstate 'PT422' using message = 'invalid_activity_type'; end if;
    insert into public.activities(group_id, activity_type_id, title, description, location, starts_at, ends_at, created_by)
    values(p_group_id, p_activity_type_id, trim(p_title), nullif(trim(p_description), ''),
           nullif(trim(p_location), ''), p_starts_at, p_ends_at, v_user_id)
    returning id into v_id;
    return v_id;
end $$;


--
-- Name: deactivate_adult_guardianships(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.deactivate_adult_guardianships() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
    if new.birthdate is distinct from old.birthdate and new.birthdate is not null and not app_private.is_minor(new.birthdate) then
        update public.guardianships set status = 'INACTIVE', deactivated_at = now() where athlete_user_id = new.id and status = 'ACTIVE';
        update public.memberships gm set status = 'INACTIVE'
        where gm.role = 'GUARDIAN' and gm.status = 'ACTIVE'
          and exists(select 1 from public.guardianships g where g.athlete_user_id = new.id and g.guardian_user_id = gm.user_id)
          and not exists(select 1 from public.guardianships g join public.users u on u.id = g.athlete_user_id
            join public.memberships m on m.user_id = u.id and m.group_id = gm.group_id and m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')
            where g.guardian_user_id = gm.user_id and g.status = 'ACTIVE' and app_private.is_minor(u.birthdate));
    end if;
    return new;
end $$;


--
-- Name: enforce_subscription_capacity(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.enforce_subscription_capacity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: get_subscription_context(uuid, uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.get_subscription_context(p_group_id uuid, p_actor_auth_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ begin perform app_private.billing_gate('NEST'); return app_private.billing_canonical_get_subscription_context(p_group_id,p_actor_auth_id); end $$;


--
-- Name: group_athlete_limit(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.group_athlete_limit(p_group_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$ SELECT coalesce((SELECT athlete_limit FROM public.group_subscriptions WHERE group_id=p_group_id AND activated_at IS NOT NULL ORDER BY created_at DESC,id DESC LIMIT 1), CASE WHEN EXISTS(SELECT 1 FROM app_private.billing_legacy_groups WHERE group_id=p_group_id) THEN NULL ELSE 0 END); $$;


--
-- Name: group_membership_limit(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.group_membership_limit(p_group_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select case when app_private.group_athlete_limit(p_group_id) is null then 500 else 5000 end;
$$;


--
-- Name: has_account_activation_consent(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.has_account_activation_consent(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select exists(select 1 from public.guardianships g join public.consents c on c.guardianship_id = g.id
      where g.athlete_user_id = p_user_id and g.status = 'ACTIVE'
        and c.consent_type = 'ACCOUNT_ACTIVATION_MINOR' and c.terms_version = '2026-09-21'
        and c.revoked_at is null and c.granted_at <= now())
$$;


--
-- Name: has_minor_consent(uuid, boolean); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.has_minor_consent(p_user_id uuid, p_avatar boolean DEFAULT false) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select exists (
        select 1 from public.guardianships g join public.consents c on c.guardianship_id = g.id
        where g.athlete_user_id = p_user_id and g.status = 'ACTIVE'
          and c.consent_type = 'DATA_PROCESSING_MINOR' and c.revoked_at is null
          and c.granted_at <= now() and (not p_avatar or c.allows_avatar)
    )
$$;


--
-- Name: identity_auth_operation(text, jsonb); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.identity_auth_operation(p_operation text, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
 v_id uuid; v_subject uuid; v_existing uuid; v_session uuid; v_user uuid;
 v_transaction app_private.auth_oauth_transactions%rowtype;
 v_provider text; v_provider_subject text; v_email text; v_name text;
begin
 if p_operation not in ('oauth_begin','oauth_check','oauth_complete') then
  return app_private.password_auth_operation(p_operation,p_data);
 end if;
 v_id:=(p_data->>'transaction_id')::uuid;
 if p_operation='oauth_begin' then
  v_subject:=(p_data#>>'{link,subject_id}')::uuid;
  v_session:=(p_data#>>'{link,session_id}')::uuid;
  if (v_subject is null)<>(v_session is null) then return jsonb_build_object('error','authentication_required'); end if;
  if v_subject is not null then
   perform 1 from app_private.auth_families f join public.users u on u.auth_user_id=f.subject_id
    where f.id=v_session and f.subject_id=v_subject and f.revoked_at is null and f.expires_at>statement_timestamp() and u.account_status='ACTIVE' for share of f;
   if not found then return jsonb_build_object('error','authentication_required'); end if;
  end if;
  delete from app_private.auth_oauth_transactions where expires_at<now()-interval '1 day';
  insert into app_private.auth_oauth_transactions(id,link_subject_id,link_session_id) values(v_id,v_subject,v_session);
  return '{}'::jsonb;
 end if;
 select * into v_transaction from app_private.auth_oauth_transactions where id=v_id for update;
 if not found or v_transaction.consumed_at is not null or v_transaction.expires_at<=statement_timestamp()
   or v_transaction.link_subject_id is distinct from (p_data#>>'{link,subject_id}')::uuid
   or v_transaction.link_session_id is distinct from (p_data#>>'{link,session_id}')::uuid then
  return jsonb_build_object('error','authentication_required');
 end if;
 if p_operation='oauth_check' and v_transaction.link_subject_id is not null then
  perform 1 from app_private.auth_families f join public.users u on u.auth_user_id=f.subject_id
   where f.id=v_transaction.link_session_id and f.subject_id=v_transaction.link_subject_id
    and f.revoked_at is null and f.expires_at>statement_timestamp() and u.account_status='ACTIVE' for share of f;
  if not found then return jsonb_build_object('error','authentication_required'); end if;
 end if;
 if p_operation='oauth_check' then return '{}'::jsonb; end if;
 v_provider:=p_data->>'provider'; v_provider_subject:=p_data->>'provider_subject';
 v_email:=lower(p_data->>'email');
 if v_provider not in ('google','apple') or v_provider is null or v_provider_subject is null
   or length(v_provider_subject) not between 1 and 255 or v_email is null or length(v_email) not between 3 and 254
   or p_data->>'refresh_hash' is null or p_data->>'refresh_hash' !~ '^[0-9a-f]{64}$' then
  raise sqlstate 'PT400' using message='invalid_request';
 end if;
 -- Serialize the provider pair across login/link and concurrent first callbacks.
 perform pg_advisory_xact_lock(hashtextextended(v_provider||':'||v_provider_subject,163));
 select subject_id into v_existing from app_private.auth_social_identities
  where provider=v_provider and provider_subject=v_provider_subject;
 update app_private.auth_oauth_transactions set consumed_at=now() where id=v_id;
 if v_transaction.link_subject_id is not null then
  v_subject:=v_transaction.link_subject_id;
  if v_existing is not null and v_existing<>v_subject then return jsonb_build_object('error','authentication_required'); end if;
 elsif v_existing is not null then v_subject:=v_existing;
 else
  -- Email collision, including MANAGED/INVITED, requires the canonical access or
  -- invitation flow plus explicit authenticated linking. Never upsert a profile.
  if exists(select 1 from public.users where lower(email)=v_email) then return jsonb_build_object('error','authentication_required'); end if;
  v_subject:=(p_data->>'subject_id')::uuid;
 end if;
 -- Match password login/reset lock order: credential before family. Existing
 -- password subjects cannot gain an OAuth family outside reset's revocation.
 -- Pair serialization precedes this lock for every completion to avoid a cycle
 -- between a concurrent login and explicit linking of that same pair.
 perform 1 from app_private.auth_credentials where subject_id=v_subject for update;
 if v_transaction.link_subject_id is not null then
  perform 1 from app_private.auth_families f join public.users u on u.auth_user_id=f.subject_id
   where f.id=v_transaction.link_session_id and f.subject_id=v_subject
    and f.revoked_at is null and f.expires_at>statement_timestamp() and u.account_status='ACTIVE' for share of f;
  if not found then return jsonb_build_object('error','authentication_required'); end if;
 end if;
 begin
  if v_existing is null and v_transaction.link_subject_id is null then
   insert into app_private.auth_subjects(id,email) values(v_subject,v_email);
   v_name:=left(coalesce(nullif(btrim(p_data->>'name'),''),'Usuario de Asisteam'),120);
   insert into public.users(auth_user_id,email,full_name,account_status)
    values(v_subject,v_email,v_name,'ACTIVE') returning id into v_user;
   -- No inferred birthdate, consent or memberships; onboarding uses canonical RPC.
  else
   select id into v_user from public.users where auth_user_id=v_subject and account_status='ACTIVE';
   if v_user is null then return jsonb_build_object('error','authentication_required'); end if;
  end if;
  if v_existing is null then
   insert into app_private.auth_social_identities(provider,provider_subject,subject_id) values(v_provider,v_provider_subject,v_subject);
  end if;
  insert into app_private.auth_families(subject_id) values(v_subject) returning id into v_session;
  insert into app_private.auth_refresh(token_hash,family_id) values(p_data->>'refresh_hash',v_session);
 exception when unique_violation then
  -- A simultaneous password/OAuth signup may win the email uniqueness check;
  -- roll back all creation effects, but persist consumption of this transaction.
  return jsonb_build_object('error','authentication_required');
 end;
 return jsonb_build_object('subject_id',v_subject,'session_id',v_session);
end $_$;


--
-- Name: invalidate_legacy_subject(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.invalidate_legacy_subject(p_subject uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$begin
 if not app_private.auth_is_native() then raise exception 'Native authority required';end if;
end$$;


--
-- Name: is_minor(date); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.is_minor(p_birthdate date) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$ select p_birthdate is not null and p_birthdate > (app_private.chile_today() - interval '18 years')::date $$;


--
-- Name: legacy_majority_claim(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.legacy_majority_claim() RETURNS TABLE(delivery_id uuid, claim_token uuid, email text, full_name text, audience text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  return query with pending as (
    select d.id from app_private.guardianship_majority_deliveries d
    join public.users recipient on recipient.id = d.recipient_user_id
    where d.sent_at is null and (d.claimed_at is null or d.claimed_at < now() - interval '10 minutes')
      and recipient.email is not null
    order by d.created_at, d.id limit 5 for update of d skip locked
  ), claimed as (
    update app_private.guardianship_majority_deliveries d set claimed_at = now(), claim_token = gen_random_uuid()
    from pending p where d.id = p.id returning d.id, d.claim_token, d.recipient_user_id, d.athlete_user_id, d.audience
  ) select c.id, c.claim_token, recipient.email, athlete.full_name, c.audience
    from claimed c join public.users recipient on recipient.id = c.recipient_user_id
      join public.users athlete on athlete.id = c.athlete_user_id;
end $$;


--
-- Name: legacy_majority_complete(uuid, uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.legacy_majority_complete(p_delivery_id uuid, p_claim_token uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
  update app_private.guardianship_majority_deliveries set sent_at = coalesce(sent_at, now())
  where id = p_delivery_id and claim_token = p_claim_token;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    activity_type_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    location text,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    recurrence_rule jsonb,
    recurrence_source_id uuid,
    CONSTRAINT activities_description_check CHECK ((length(description) <= 2000)),
    CONSTRAINT activities_ends_at_check CHECK (isfinite(ends_at)),
    CONSTRAINT activities_location_check CHECK ((length(location) <= 200)),
    CONSTRAINT activities_starts_at_check CHECK (isfinite(starts_at)),
    CONSTRAINT activities_title_check CHECK (((length(TRIM(BOTH FROM title)) >= 3) AND (length(TRIM(BOTH FROM title)) <= 120))),
    CONSTRAINT chk_activity_range CHECK (((ends_at > starts_at) AND ((ends_at - starts_at) <= '24:00:00'::interval))),
    CONSTRAINT chk_activity_recurrence CHECK ((((recurrence_rule IS NULL) AND (recurrence_source_id IS NULL)) OR (((recurrence_rule IS NOT NULL) AND (jsonb_typeof(recurrence_rule) = 'object'::text) AND ((recurrence_rule ->> 'freq'::text) = 'WEEKLY'::text)) IS TRUE)))
);


--
-- Name: lock_activity_series(uuid, uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.lock_activity_series(p_group_id uuid, p_activity_id uuid) RETURNS public.activities
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_activity public.activities; v_user_id uuid := public.auth_user_id(); v_root uuid;
begin
  if v_user_id is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if not app_private.can_read_group_activities(p_group_id) then
    raise sqlstate 'PT404' using message = 'activity_not_found';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('activity-series:' || p_group_id::text, 0));
  select a.* into v_activity from public.activities a where a.id = p_activity_id and a.group_id = p_group_id;
  if not found then raise sqlstate 'PT404' using message = 'activity_not_found'; end if;
  v_root := coalesce(v_activity.recurrence_source_id, v_activity.id);
  perform 1 from public.activities where group_id = p_group_id and (id = v_root or recurrence_source_id = v_root)
    order by id for update;
  -- Usa la versión más reciente tras esperar una escritura de asistencia.
  select a.* into v_activity from public.activities a where a.id = p_activity_id and a.group_id = p_group_id;
  if not found then raise sqlstate 'PT404' using message = 'activity_not_found'; end if;
  perform 1 from public.memberships where group_id = p_group_id and user_id = v_user_id
    and role = 'ADMIN' and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
  return v_activity;
end $$;


--
-- Name: lock_attendance_activity(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.lock_attendance_activity(p_activity_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_group_id uuid; v_user_id uuid := public.auth_user_id();
begin
    if v_user_id is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    select group_id into v_group_id from public.activities
    where id = p_activity_id and public.is_member(group_id) for update;
    if not found then raise sqlstate 'PT404' using message = 'activity_not_found'; end if;
    perform 1 from public.memberships where group_id = v_group_id and user_id = v_user_id
      and role in ('ADMIN','COACH') and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    return v_group_id;
end $$;


--
-- Name: lookup_billing_subscription(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.lookup_billing_subscription(p_subscription_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ begin perform app_private.billing_gate('NEST'); return app_private.billing_canonical_lookup_billing_subscription(p_subscription_id); end $$;


--
-- Name: majority_transition(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.majority_transition() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_count integer := 0; v_athlete uuid; v_today date := app_private.chile_today();
begin
  -- Serializa ejecuciones y reintentos; la fecha se resuelve en la base, nunca desde HTTP.
  perform pg_advisory_xact_lock(hashtextextended('guardianship-majority', 0));
  if exists(select 1 from public.job_runs where job_name = 'guardianship-majority' and run_date = v_today) then
    return 0;
  end if;
  for v_athlete in
    select u.id from public.users u where u.birthdate is not null and not app_private.is_minor(u.birthdate)
      and exists(select 1 from public.guardianships gs where gs.athlete_user_id = u.id and gs.status = 'ACTIVE')
    order by u.id for update
  loop
    insert into app_private.guardianship_majority_deliveries(athlete_user_id, recipient_user_id, audience)
    select v_athlete, gs.guardian_user_id, 'GUARDIAN' from public.guardianships gs
    where gs.athlete_user_id = v_athlete and gs.status = 'ACTIVE'
    union select v_athlete, v_athlete, 'ATHLETE'
    on conflict do nothing;
    insert into app_private.guardianship_majority_deliveries(athlete_user_id, recipient_user_id, audience)
    select distinct v_athlete, admin_m.user_id, 'ADMIN'
    from public.users u join public.memberships athlete_m on athlete_m.user_id = u.id
      and athlete_m.role = 'ATHLETE' and athlete_m.status in ('ACTIVE','PENDING')
    join public.memberships admin_m on admin_m.group_id = athlete_m.group_id
      and admin_m.role = 'ADMIN' and admin_m.status = 'ACTIVE'
    where u.id = v_athlete and u.account_status = 'MANAGED'
    on conflict do nothing;
    update public.guardianships set status = 'INACTIVE', deactivated_at = now()
    where athlete_user_id = v_athlete and status = 'ACTIVE';
    v_count := v_count + 1;
  end loop;
  -- Conserva otros roles y al GUARDIAN con otro pupilo menor ACTIVE/PENDING.
  update public.memberships gm set status = 'INACTIVE'
  where gm.role = 'GUARDIAN' and gm.status = 'ACTIVE'
    and exists(select 1 from public.guardianships gs join public.users u on u.id = gs.athlete_user_id
      where gs.guardian_user_id = gm.user_id and u.birthdate is not null and not app_private.is_minor(u.birthdate))
    and not exists(select 1 from public.guardianships gs join public.users u on u.id = gs.athlete_user_id
      join public.memberships m on m.user_id = u.id and m.group_id = gm.group_id
        and m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')
      where gs.guardian_user_id = gm.user_id and gs.status = 'ACTIVE' and app_private.is_minor(u.birthdate));
  insert into public.job_runs(job_name, run_date, affected_count) values('guardianship-majority', v_today, v_count);
  return v_count;
end $$;


--
-- Name: native_session_user_id(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.native_session_user_id(p_session_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_id uuid; v_mode text; begin
 select mode into v_mode from app_private.auth_authority where singleton for share;
 if v_mode='FROZEN' or app_private.actor_claims()->>'auth_provider' is distinct from 'nest' then return null; end if;
 perform 1 from app_private.auth_families f join app_private.auth_subjects s on s.id=f.subject_id
  where f.id=p_session_id and f.subject_id=app_private.actor_subject_id()
   and f.revoked_at is null and f.expires_at>statement_timestamp()
   and (s.disabled_until is null or s.disabled_until<=statement_timestamp()) for share of f;
 if not found then return null; end if;
 select id into v_id from public.users where auth_user_id=app_private.actor_subject_id() and account_status='ACTIVE';
 return v_id;
end $$;


--
-- Name: normalize_activity_type_name(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.normalize_activity_type_name() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
    new.name := trim(new.name);
    return new;
end $$;


--
-- Name: password_auth_operation(text, jsonb); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.password_auth_operation(p_operation text, p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
 v_subject uuid; v_user uuid; v_family app_private.auth_families%rowtype;
 v_refresh app_private.auth_refresh%rowtype; v_recovery app_private.auth_recovery%rowtype;
 v_hash text; v_result jsonb; v_count integer; v_reset timestamptz;
begin
 if p_operation='rate' then
  perform pg_advisory_xact_lock(hashtextextended(p_data->>'key',162));
  delete from app_private.auth_attempts where reset_at<now()-interval '1 day';
  select count,reset_at into v_count,v_reset from app_private.auth_attempts where key=p_data->>'key';
  if v_reset is null or v_reset<=now() then v_count:=0;v_reset:=now()+interval '15 minutes'; end if;
  if v_count >= (p_data->>'limit')::integer then return jsonb_build_object('allowed',false); end if;
  insert into app_private.auth_attempts(key,count,reset_at) values(p_data->>'key',v_count+1,v_reset)
   on conflict(key) do update set count=excluded.count,reset_at=excluded.reset_at;
  return jsonb_build_object('allowed',true);
 elsif p_operation='rate_success' then
  delete from app_private.auth_attempts where key=p_data->>'key';
  return '{}'::jsonb;
 elsif p_operation='lookup' then
  select u.auth_user_id,c.password_hash into v_subject,v_hash from public.users u
   join app_private.auth_credentials c on c.subject_id=u.auth_user_id
   where lower(u.email)=lower(p_data->>'email') and u.account_status='ACTIVE';
  return jsonb_build_object('subject_id',v_subject,'password_hash',v_hash);
 elsif p_operation='subject' then
  select c.password_hash into v_hash from app_private.auth_credentials c join public.users u on u.auth_user_id=c.subject_id
    where c.subject_id=(p_data->>'subject_id')::uuid and u.account_status='ACTIVE';
  return jsonb_build_object('password_hash',v_hash);
 elsif p_operation='register' then
  -- Any business error rolls back identity, credentials, consent and claim.
  if p_data#>'{profile,terms_accepted}' is distinct from 'true'::jsonb
    or p_data#>>'{profile,terms_version}' is distinct from app_private.account_terms_version() then
   raise sqlstate 'PT400' using message='account_terms_required';
  end if;
  v_subject:=(p_data->>'subject_id')::uuid;
  insert into app_private.auth_subjects(id,email) values(v_subject,lower(p_data#>>'{profile,email}'));
  if p_data->>'invitation_hash' is not null then
   if p_data->>'claim'='true' then
    v_result:=app_private.accept_invitation(p_data->>'invitation_hash',v_subject,
      jsonb_build_object('managed_claim',true,'terms_version',p_data#>>'{profile,terms_version}'));
   else
    v_result:=app_private.accept_invitation(p_data->>'invitation_hash',v_subject,p_data->'profile');
   end if;
   if v_result ? 'error' then raise sqlstate 'PT422' using message=v_result->>'error'; end if;
   select id into v_user from public.users where auth_user_id=v_subject;
  else
   if length(trim(p_data#>>'{profile,full_name}')) not between 2 and 120
     or (p_data#>>'{profile,birthdate}')::date>=app_private.chile_today() then raise sqlstate 'PT400' using message='invalid_registration'; end if;
   insert into public.users(auth_user_id,email,full_name,birthdate,phone,account_status)
    values(v_subject,lower(p_data#>>'{profile,email}'),trim(p_data#>>'{profile,full_name}'),
      (p_data#>>'{profile,birthdate}')::date,nullif(p_data#>>'{profile,phone}',''),'ACTIVE') returning id into v_user;
  end if;
  insert into app_private.auth_credentials(subject_id,password_hash) values(v_subject,p_data->>'password_hash');
  perform app_private.record_account_consent(v_user,p_data#>>'{profile,terms_version}',case when p_data->>'invitation_hash' is null then 'EMAIL_SIGNUP' else 'INVITATION' end);
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('user_id',v_user);
 elsif p_operation='login' then
  v_subject:=(p_data->>'subject_id')::uuid;
  select password_hash into v_hash from app_private.auth_credentials where subject_id=v_subject for update;
  if v_hash is distinct from p_data->>'expected_hash' or not exists(select 1 from public.users where auth_user_id=v_subject and account_status='ACTIVE') then
   return jsonb_build_object('error','authentication_required');
  end if;
  if p_data->>'rehash' is not null then update app_private.auth_credentials set password_hash=p_data->>'rehash',updated_at=now() where subject_id=v_subject; end if;
  insert into app_private.auth_families(subject_id) values(v_subject) returning * into v_family;
  insert into app_private.auth_refresh(token_hash,family_id) values(p_data->>'refresh_hash',v_family.id);
  return jsonb_build_object('subject_id',v_subject,'session_id',v_family.id);
 elsif p_operation='refresh' then
  -- Find first, then lock family before token: all family operations share order.
  select * into v_refresh from app_private.auth_refresh where token_hash=p_data->>'token_hash';
  if not found then return jsonb_build_object('error','authentication_required'); end if;
  select * into v_family from app_private.auth_families where id=v_refresh.family_id for update;
  select * into v_refresh from app_private.auth_refresh where token_hash=p_data->>'token_hash' for update;
  if v_refresh.consumed_at is not null then
   update app_private.auth_families set revoked_at=coalesce(revoked_at,now()) where id=v_family.id;
   return jsonb_build_object('error','authentication_required');
  end if;
  if v_family.revoked_at is not null or v_family.expires_at<=now() or not exists(select 1 from public.users where auth_user_id=v_family.subject_id and account_status='ACTIVE') then
   return jsonb_build_object('error','authentication_required');
  end if;
  update app_private.auth_refresh set consumed_at=now() where token_hash=v_refresh.token_hash;
  insert into app_private.auth_refresh(token_hash,family_id) values(p_data->>'next_hash',v_family.id);
  return jsonb_build_object('subject_id',v_family.subject_id,'session_id',v_family.id);
 elsif p_operation='logout' then
  update app_private.auth_families set revoked_at=coalesce(revoked_at,now()) where id=(p_data->>'session_id')::uuid and subject_id=(p_data->>'subject_id')::uuid;
  return jsonb_build_object('success',true);
 elsif p_operation='recovery' then
  select u.auth_user_id into v_subject from public.users u join app_private.auth_credentials c on c.subject_id=u.auth_user_id
   where lower(u.email)=lower(p_data->>'email') and u.account_status='ACTIVE';
  if v_subject is null then return '{}'::jsonb; end if;
  insert into app_private.auth_recovery(token_hash,subject_id) values(p_data->>'token_hash',v_subject);
  return jsonb_build_object('send',true);
 elsif p_operation='reset' or p_operation='password' then
  if p_operation='reset' then
   select * into v_recovery from app_private.auth_recovery where token_hash=p_data->>'token_hash';
   v_subject:=v_recovery.subject_id;
  else v_subject:=(p_data->>'subject_id')::uuid; end if;
  -- Credential lock serializes login, password changes and concurrent recovery.
  select password_hash into v_hash from app_private.auth_credentials where subject_id=v_subject for update;
  if v_hash is null then return jsonb_build_object('error','authentication_required'); end if;
  if p_operation='reset' then
   select * into v_recovery from app_private.auth_recovery where token_hash=p_data->>'token_hash' for update;
   if v_recovery.consumed_at is not null or v_recovery.expires_at<=now() then return jsonb_build_object('error','authentication_required'); end if;
  elsif v_hash is distinct from p_data->>'expected_hash' then return jsonb_build_object('error','authentication_required');
  else
   perform 1 from app_private.auth_families where id=(p_data->>'session_id')::uuid and subject_id=v_subject and revoked_at is null and expires_at>now() for share;
   if not found then return jsonb_build_object('error','authentication_required'); end if;
  end if;
  if not exists(select 1 from public.users where auth_user_id=v_subject and account_status='ACTIVE') then return jsonb_build_object('error','authentication_required'); end if;
  update app_private.auth_credentials set password_hash=p_data->>'password_hash',updated_at=now() where subject_id=v_subject;
  update app_private.auth_recovery set consumed_at=coalesce(consumed_at,now()) where subject_id=v_subject;
  update app_private.auth_families set revoked_at=coalesce(revoked_at,now()) where subject_id=v_subject;
  -- Password replaced in Nest: invalidate legacy sessions and disable the old
  -- password authority for that migrated identity (remaining subjects unaffected).
  perform app_private.invalidate_legacy_subject(v_subject);
  return jsonb_build_object('success',true);
 end if;
 raise sqlstate 'PT400' using message='invalid_request';
end $$;


--
-- Name: preserve_minor_consent(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.preserve_minor_consent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_athlete uuid; v_birthdate date;
begin
    if tg_table_name = 'guardianships' then v_athlete := new.athlete_user_id;
    else select athlete_user_id into v_athlete from public.guardianships where id = new.guardianship_id; end if;
    select birthdate into v_birthdate from public.users where id = v_athlete for update;
    if app_private.is_minor(v_birthdate) then
        if not app_private.has_minor_consent(v_athlete) and exists(select 1 from public.memberships where user_id = v_athlete and role = 'ATHLETE' and status = 'ACTIVE') then
            raise exception using errcode = '23514', message = 'minor_requires_guardian_consent';
        end if;
        if not app_private.has_minor_consent(v_athlete, true) then update public.users set avatar_url = null where id = v_athlete and avatar_url is not null; end if;
    end if;
    return new;
end $$;


--
-- Name: protect_account_consent(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.protect_account_consent() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
    raise sqlstate 'PT409' using message = 'account_consent_immutable';
end $$;


--
-- Name: protect_consent(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.protect_consent() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
    if tg_op = 'DELETE' then raise exception using errcode = '23514', message = 'consent_history_required'; end if;
    if (to_jsonb(new) - 'revoked_at') is distinct from (to_jsonb(old) - 'revoked_at') or old.revoked_at is not null or new.revoked_at is null then
        raise exception using errcode = '23514', message = 'consent_append_only';
    end if;
    return new;
end $$;


--
-- Name: protect_system_activity_type(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.protect_system_activity_type() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
begin
    if (tg_op <> 'INSERT' and old.group_id is null)
       or (tg_op <> 'DELETE' and new.group_id is null) then
        raise exception using errcode = '23514', message = 'system_activity_type_immutable';
    end if;
    if tg_op = 'DELETE' then return old; end if;
    return new;
end $$;


--
-- Name: qr_checkin_status(timestamp with time zone, timestamp with time zone, integer, integer, integer); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.qr_checkin_status(p_starts_at timestamp with time zone, p_now timestamp with time zone, p_opens_before integer, p_closes_after integer, p_late_after integer) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select case when p_now < p_starts_at - make_interval(mins => p_opens_before)
    or p_now > p_starts_at + make_interval(mins => p_closes_after) then null
    when p_now > p_starts_at + make_interval(mins => p_late_after) then 'LATE' else 'PRESENT' end
$$;


--
-- Name: qr_checkin_token(uuid, bytea, timestamp with time zone); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.qr_checkin_token(p_activity_id uuid, p_secret bytea, p_now timestamp with time zone) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO ''
    AS $$
  select encode(extensions.hmac(convert_to(p_activity_id::text || ':' || floor(extract(epoch from p_now) / 60)::bigint::text, 'UTF8'), p_secret, 'sha256'), 'hex')
$$;


--
-- Name: record_account_consent(uuid, text, text); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.record_account_consent(p_user_id uuid, p_terms_version text, p_channel text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_id uuid;
begin
    if p_terms_version is distinct from app_private.account_terms_version() then
        raise sqlstate 'PT400' using message = 'account_terms_version_changed';
    end if;
    if p_channel is null or p_channel not in ('EMAIL_SIGNUP','INVITATION','IN_APP') then
        raise sqlstate 'PT400' using message = 'invalid_consent_channel';
    end if;
    perform 1 from public.users where id = p_user_id and account_status = 'ACTIVE' and auth_user_id is not null for update;
    if not found then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    insert into public.account_consents(user_id, terms_version, channel)
        values(p_user_id, p_terms_version, p_channel)
        on conflict(user_id, terms_version) do nothing;
    select id into v_id from public.account_consents where user_id = p_user_id and terms_version = p_terms_version;
    return v_id;
end $$;


--
-- Name: reject_subscription_creation(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.reject_subscription_creation(p_subscription_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ begin perform app_private.billing_gate('NEST'); perform app_private.billing_canonical_reject_subscription_creation(p_subscription_id); return; end $$;


--
-- Name: require_announcement_admin(uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.require_announcement_admin(p_group_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_actor uuid := public.auth_user_id();
begin
  if v_actor is null then raise sqlstate 'PT401' using message='authentication_required'; end if;
  if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message='group_not_found'; end if;
  -- Compartir lock de membresía impide revocar ADMIN durante la escritura.
  perform 1 from public.memberships where group_id=p_group_id and user_id=v_actor and role='ADMIN' and status='ACTIVE' for share;
  if not found then raise sqlstate 'PT403' using message='admin_required'; end if;
  return v_actor;
end $$;


--
-- Name: review_pending_membership(uuid, uuid, boolean); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.review_pending_membership(p_group_id uuid, p_membership_id uuid, p_approve boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
    v_actor uuid := public.auth_user_id();
    v_athlete uuid;
    v_birthdate date;
    v_status text;
    v_new_memberships integer := 1;
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not exists(select 1 from public.users where id = v_actor and account_status = 'ACTIVE') then
        raise sqlstate 'PT403' using message = 'active_account_required';
    end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_approve is null then raise sqlstate 'PT400' using message = 'invalid_membership_review'; end if;
    select user_id into v_athlete from public.memberships
      where id = p_membership_id and group_id = p_group_id and role = 'ATHLETE';
    if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;

    -- Personas antes de grupos: serializa el límite global de cada apoderado.
    -- Vínculos/consentimientos también bloquean el perfil del pupilo; R1 se
    -- revalida por el trigger incluso frente a una revocación concurrente.
    perform 1 from public.users u where u.id = v_athlete or (p_approve and exists(
      select 1 from public.guardianships g where g.athlete_user_id = v_athlete
        and g.guardian_user_id = u.id and g.status = 'ACTIVE')) order by u.id for update;
    select birthdate into v_birthdate from public.users where id = v_athlete;
    -- Recoge también cualquier vínculo confirmado mientras se esperaba al perfil.
    if p_approve and app_private.is_minor(v_birthdate) then
        perform 1 from public.users u where exists(select 1 from public.guardianships g
          where g.athlete_user_id = v_athlete and g.guardian_user_id = u.id and g.status = 'ACTIVE')
          order by u.id for update;
    end if;
    perform 1 from public.groups where id = p_group_id for update;
    perform 1 from public.memberships where user_id = v_actor and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    select status into v_status from public.memberships
      where id = p_membership_id and group_id = p_group_id and role = 'ATHLETE' for update;
    if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;
    if v_status <> 'PENDING' then raise sqlstate 'PT409' using message = 'membership_not_pending'; end if;

    if not p_approve then
        update public.memberships set status = 'INACTIVE' where id = p_membership_id;
        return;
    end if;
    if v_birthdate is null then raise sqlstate 'PT422' using message = 'athlete_birthdate_required'; end if;
    if app_private.is_minor(v_birthdate) then
        if not exists(select 1 from public.guardianships where athlete_user_id = v_athlete and status = 'ACTIVE') then
            raise sqlstate 'PT422' using message = 'minor_requires_guardian';
        end if;
        if not app_private.has_minor_consent(v_athlete) then
            raise sqlstate 'PT422' using message = 'minor_requires_guardian_consent';
        end if;
        -- HU-ADM-05: el alta MANAGED ya tiene aprobación ADMIN. La ratificación
        -- del apoderado designado debe seguir su flujo consent_managed_member.
        if exists(select 1 from app_private.managed_member_enrollments
          where membership_id = p_membership_id and activated_at is null) then
            raise sqlstate 'PT422' using message = 'managed_consent_required';
        end if;
        if exists(select 1 from public.guardianships g where g.athlete_user_id = v_athlete and g.status = 'ACTIVE'
          and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
            and m.group_id = p_group_id and m.status in ('ACTIVE','PENDING'))
          and (select count(distinct m.group_id) from public.memberships m where m.user_id = g.guardian_user_id
            and m.status in ('ACTIVE','PENDING')) >= 30) then
            raise sqlstate 'PT422' using message = 'guardian_group_limit';
        end if;
        v_new_memberships := v_new_memberships + (select count(*) from public.guardianships g
          where g.athlete_user_id = v_athlete and g.status = 'ACTIVE'
            and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
              and m.group_id = p_group_id and m.role = 'GUARDIAN' and m.status = 'ACTIVE'));
    end if;
    if (select count(*) from public.memberships where group_id = p_group_id and status = 'ACTIVE') + v_new_memberships > app_private.group_membership_limit(p_group_id) then
        raise sqlstate 'PT422' using message = 'group_member_limit';
    end if;
    -- El trigger canónico sincroniza GUARDIAN. La fecha de ingreso empieza aquí;
    -- no se crean convocatorias ni se arrastran ausencias del período pendiente.
    update public.memberships set status = 'ACTIVE', joined_at = now() where id = p_membership_id;
end $$;


--
-- Name: sync_group_subscription(uuid, text, text, timestamp with time zone, timestamp with time zone, text); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.sync_group_subscription(p_subscription_id uuid, p_provider_id text, p_status text, p_provider_updated_at timestamp with time zone, p_next_payment_at timestamp with time zone, p_checkout_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ begin perform app_private.billing_gate('NEST'); perform app_private.billing_canonical_sync_group_subscription(p_subscription_id,p_provider_id,p_status,p_provider_updated_at,p_next_payment_at,p_checkout_url); return; end $$;


--
-- Name: sync_guardian_memberships(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.sync_guardian_memberships() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_user uuid; v_membership uuid;
begin
    if tg_table_name = 'memberships' then
        if new.status <> 'ACTIVE' then return new; end if;
        v_user := new.user_id;
        v_membership := new.id;
    else v_user := new.athlete_user_id; end if;
    insert into public.memberships(user_id, group_id, role, status, joined_at)
    select distinct g.guardian_user_id, m.group_id, 'GUARDIAN', 'ACTIVE', now()
    from public.guardianships g join public.memberships m on m.user_id = g.athlete_user_id
    join public.users u on u.id = g.athlete_user_id
    where g.athlete_user_id = v_user and g.status = 'ACTIVE' and app_private.is_minor(u.birthdate)
      and m.role = 'ATHLETE' and m.status = 'ACTIVE' and (v_membership is null or m.id = v_membership)
    on conflict(user_id, group_id, role) do update set status = 'ACTIVE', joined_at = coalesce(public.memberships.joined_at, excluded.joined_at)
    where public.memberships.status <> 'ACTIVE';
    return new;
end $$;


--
-- Name: sync_subscription_invoice(text, text, timestamp with time zone, integer, text, text, text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.sync_subscription_invoice(p_provider_subscription_id text, p_invoice_id text, p_due_at timestamp with time zone, p_amount_clp integer, p_currency text, p_status text, p_payment_id text, p_paid_at timestamp with time zone, p_provider_updated_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ begin perform app_private.billing_gate('NEST'); perform app_private.billing_canonical_sync_subscription_invoice(p_provider_subscription_id,p_invoice_id,p_due_at,p_amount_clp,p_currency,p_status,p_payment_id,p_paid_at,p_provider_updated_at); return; end $$;


--
-- Name: validate_activity_type(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.validate_activity_type() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
    if tg_op = 'INSERT' or new.activity_type_id is distinct from old.activity_type_id
       or new.group_id is distinct from old.group_id then
        perform 1 from public.activity_types t where t.id = new.activity_type_id
          and t.is_active and (t.group_id is null or t.group_id = new.group_id) for share;
        if not found then
            raise exception using errcode = '23514', message = 'invalid_activity_type';
        end if;
    end if;
    return new;
end $$;


--
-- Name: validate_attendance_membership(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.validate_attendance_membership() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
    if tg_op = 'UPDATE' and (new.activity_id <> old.activity_id or new.membership_id <> old.membership_id) then
        raise exception using errcode = '23514', message = 'attendance_identity_immutable';
    end if;
    perform 1 from public.memberships m join public.activities a on a.group_id = m.group_id
    where a.id = new.activity_id and m.id = new.membership_id and m.role = 'ATHLETE' and m.status = 'ACTIVE'
    for share of m;
    if not found then raise exception using errcode = '23514', message = 'membership_not_athlete_in_group'; end if;
    return new;
end $$;


--
-- Name: validate_guardianship(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.validate_guardianship() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_birthdate date;
begin
    if tg_op = 'DELETE' then raise exception using errcode = '23514', message = 'guardianship_history_required'; end if;
    select birthdate into v_birthdate from public.users where id = new.athlete_user_id for update;
    if new.status = 'ACTIVE' and not coalesce(app_private.is_minor(v_birthdate), false) then
        raise exception using errcode = '23514', message = 'guardian_only_for_minor';
    end if;
    if tg_op = 'UPDATE' and (new.guardian_user_id <> old.guardian_user_id or new.athlete_user_id <> old.athlete_user_id) then
        raise exception using errcode = '23514', message = 'guardianship_identity_immutable';
    end if;
    if tg_op = 'UPDATE' and old.status = 'ACTIVE' and new.status = 'INACTIVE' and app_private.is_minor(v_birthdate)
      and exists(select 1 from public.memberships where user_id = new.athlete_user_id and role = 'ATHLETE' and status in ('ACTIVE','PENDING'))
      and not exists(select 1 from public.guardianships where athlete_user_id = new.athlete_user_id and id <> new.id and status = 'ACTIVE') then
        raise exception using errcode = '23514', message = 'minor_requires_guardian';
    end if;
    return new;
end $$;


--
-- Name: validate_membership(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.validate_membership() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_birthdate date;
begin
    select birthdate into v_birthdate from public.users where id = new.user_id for update;
    if new.role = 'ATHLETE' then
        if v_birthdate is null then raise exception using errcode = '23514', message = 'athlete_birthdate_required'; end if;
        if new.status = 'ACTIVE' and app_private.is_minor(v_birthdate) and not app_private.has_minor_consent(new.user_id) then
            raise exception using errcode = '23514', message = 'minor_requires_guardian_consent';
        end if;
    end if;
    return new;
end $$;


--
-- Name: validate_profile_update(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.validate_profile_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v_request uuid;
begin
    if new.full_name is distinct from old.full_name and length(trim(new.full_name)) not between 2 and 120 then
        raise exception using errcode = '23514', message = 'invalid_full_name';
    end if;
    if new.phone is distinct from old.phone and new.phone is not null and new.phone !~ '^\+[1-9][0-9]{7,14}$' then
        raise exception using errcode = '23514', message = 'invalid_phone';
    end if;
    if new.birthdate is distinct from old.birthdate then
        if new.birthdate is not null and (new.birthdate >= app_private.chile_today()
          or extract(year from age(app_private.chile_today(), new.birthdate)) > 110) then
            raise exception using errcode = '23514', message = 'invalid_birthdate';
        end if;
        if new.birthdate is null and exists(select 1 from public.memberships where user_id = new.id and role = 'ATHLETE') then
            raise exception using errcode = '23514', message = 'athlete_birthdate_required';
        end if;
        if app_private.is_minor(old.birthdate) and not coalesce(app_private.is_minor(new.birthdate), false)
          and exists(select 1 from public.memberships where user_id = new.id and role = 'ATHLETE' and status in ('ACTIVE','PENDING')) then
            select id into v_request from public.birthdate_change_requests
            where user_id = new.id and old_birthdate = old.birthdate and requested_birthdate = new.birthdate and status = 'APPROVED' for update;
            if v_request is null then raise exception using errcode = 'P0001', message = 'birthdate_admin_confirmation_required'; end if;
            update public.birthdate_change_requests set status = 'APPLIED', resolved_at = now() where id = v_request;
        end if;
        if app_private.is_minor(new.birthdate) and exists(select 1 from public.memberships where user_id = new.id and role = 'ATHLETE' and status = 'ACTIVE')
           and not app_private.has_minor_consent(new.id) then
            raise exception using errcode = '23514', message = 'minor_requires_guardian_consent';
        end if;
        update public.birthdate_change_requests set status = 'CANCELLED', resolved_at = now() where user_id = new.id and status = 'PENDING';
    end if;
    if new.avatar_url is not null then
        if new.birthdate is null or (app_private.is_minor(new.birthdate) and not app_private.has_minor_consent(new.id, true)) then
            if new.avatar_url is distinct from old.avatar_url then raise exception using errcode = 'P0001', message = 'avatar_consent_required'; end if;
            new.avatar_url := null;
        elsif new.avatar_url is distinct from old.avatar_url and (new.auth_user_id is null
          or new.avatar_url !~ ('^/profile/avatar/' || new.auth_user_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')) then
            raise exception using errcode = '23514', message = 'invalid_avatar';
        end if;
    end if;
    return new;
end $_$;


--
-- Name: worker_claim_announcement_push(boolean); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.worker_claim_announcement_push(p_receipts boolean DEFAULT false) RETURNS TABLE(delivery_id uuid, claim_token uuid, token text, announcement_id uuid, group_id uuid, ticket_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform 1 from app_private.announcement_executor where mode='WORKER' for share;
  if not found then return; end if;
  return query select c.delivery_id,c.claim_token,c.token,c.announcement_id,c.group_id,c.ticket_id from app_private.canonical_claim_announcement_push(p_receipts) c;
end $$;


--
-- Name: worker_claim_email(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.worker_claim_email() RETURNS TABLE(delivery_id uuid, claim_token uuid, email text, full_name text, audience text, payload jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_now timestamptz:=app_private.worker_now();
begin
  perform 1 from app_private.majority_executor where mode='WORKER' and (email_next_at is null or email_next_at<=v_now) for update;
  if not found then return; end if;
  update app_private.majority_executor set email_next_at=v_now+interval '600 milliseconds';
  update app_private.guardianship_majority_deliveries d set blocked_at=v_now
    where d.sent_at is null and d.blocked_at is null and d.first_attempt_at<=v_now-interval '23 hours';
  return query with pending as (
    select d.id from app_private.guardianship_majority_deliveries d join public.users u on u.id=d.recipient_user_id
    where d.sent_at is null and d.blocked_at is null and d.retry_at<=v_now
      and (d.claimed_at is null or d.claimed_at<=v_now-interval '1 minute') and u.email is not null
    order by d.created_at,d.id limit 1 for update of d skip locked
  ), claimed as (
    update app_private.guardianship_majority_deliveries d set claimed_at=v_now,claim_token=gen_random_uuid(),attempts=d.attempts+1
    from pending p where d.id=p.id returning d.id,d.claim_token,d.recipient_user_id,d.athlete_user_id,d.audience,d.payload
  ) select c.id,c.claim_token,u.email,a.full_name,c.audience,c.payload from claimed c
    join public.users u on u.id=c.recipient_user_id join public.users a on a.id=c.athlete_user_id;
end $$;


--
-- Name: worker_claim_transition(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.worker_claim_transition() RETURNS TABLE(run_date date, lease_token uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_now timestamptz:=app_private.worker_now();
begin
  perform 1 from app_private.majority_executor where mode='WORKER' for share;
  if not found then return; end if;
  -- Chile's missing 00:30 on spring DST runs at the first later local time.
  -- A task leased yesterday must not run the new day's transition before 00:30.
  if (v_now at time zone 'America/Santiago')::time<time '00:30' then return; end if;
  insert into app_private.majority_tasks(run_date) values((v_now at time zone 'America/Santiago')::date) on conflict do nothing;
  return query with pending as (
    select t.run_date from app_private.majority_tasks t where t.completed_at is null
      and (t.lease_until is null or t.lease_until<=v_now)
    order by t.run_date limit 1 for update skip locked
  ) update app_private.majority_tasks t set lease_token=gen_random_uuid(),lease_until=v_now+interval '1 minute',attempts=t.attempts+1
    from pending p where t.run_date=p.run_date returning t.run_date,t.lease_token;
end $$;


--
-- Name: worker_complete_announcement_push(uuid, uuid, text, text); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.worker_complete_announcement_push(p_delivery_id uuid, p_claim_token uuid, p_outcome text, p_ticket_id text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform 1 from app_private.announcement_executor where mode='WORKER' for share;
  if not found then raise exception using errcode='55000',message='Ejecutor deshabilitado'; end if;
  perform 1 from app_private.announcement_push_deliveries where id=p_delivery_id and claim_token=p_claim_token and claimed_until>now() for update;
  if not found then raise exception using errcode='55000',message='Reserva vencida o cancelada'; end if;
  perform app_private.canonical_complete_announcement_push(p_delivery_id,p_claim_token,p_outcome,p_ticket_id);
end $$;


--
-- Name: worker_complete_transition(date, uuid); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.worker_complete_transition(p_date date, p_token uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform 1 from app_private.majority_executor where mode='WORKER' for share;
  if not found then return false; end if;
  perform 1 from app_private.majority_tasks where run_date=p_date and lease_token=p_token and lease_until>app_private.worker_now() and completed_at is null for update;
  if not found then return false; end if;
  if (app_private.worker_now() at time zone 'America/Santiago')::time<time '00:30' then return false; end if;
  perform app_private.majority_transition();
  update app_private.majority_tasks set completed_at=app_private.worker_now(),lease_until=null where run_date=p_date;
  return true;
end $$;


--
-- Name: worker_email_payload(uuid, uuid, jsonb); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.worker_email_payload(p_id uuid, p_token uuid, p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_payload jsonb;
begin
  update app_private.guardianship_majority_deliveries set payload=coalesce(payload,p_payload),first_attempt_at=coalesce(first_attempt_at,app_private.worker_now())
    where id=p_id and claim_token=p_token and sent_at is null and blocked_at is null
      and claimed_at>app_private.worker_now()-interval '1 minute' returning payload into v_payload;
  return v_payload;
end $$;


--
-- Name: worker_finish_email(uuid, uuid, boolean); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.worker_finish_email(p_id uuid, p_token uuid, p_sent boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  update app_private.guardianship_majority_deliveries d set sent_at=case when p_sent then app_private.worker_now() else null end,
    retry_at=app_private.worker_now()+make_interval(secs=>least(3600,30*power(2,least(d.attempts,7))::integer)),
    claimed_at=null,claim_token=null
  where d.id=p_id and d.claim_token=p_token and d.sent_at is null and d.claimed_at>app_private.worker_now()-interval '1 minute';
  return found;
end $$;


--
-- Name: worker_metrics(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.worker_metrics() RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
select jsonb_build_object('pending',count(*) filter(where d.sent_at is null and u.email is not null),
 'blocked',count(*) filter(where d.sent_at is null and d.blocked_at is not null and u.email is not null),
 'retries',count(*) filter(where d.sent_at is null and d.attempts>1 and u.email is not null),
 'oldest_seconds',coalesce(extract(epoch from app_private.worker_now()-min(d.created_at) filter(where d.sent_at is null and u.email is not null))::integer,0),
 'transition_overdue',exists(select 1 from app_private.majority_executor where mode='WORKER')
   and (app_private.worker_now() at time zone 'America/Santiago')::time>=time '00:35'
   and not exists(select 1 from public.job_runs where job_name='guardianship-majority' and run_date=(app_private.worker_now() at time zone 'America/Santiago')::date))
from app_private.guardianship_majority_deliveries d join public.users u on u.id=d.recipient_user_id;
$$;


--
-- Name: worker_now(); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.worker_now() RETURNS timestamp with time zone
    LANGUAGE sql STABLE
    SET search_path TO ''
    AS $$ select statement_timestamp() $$;


--
-- Name: worker_record_announcement_push_run(integer); Type: FUNCTION; Schema: app_private; Owner: -
--

CREATE FUNCTION app_private.worker_record_announcement_push_run(p_processed integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform 1 from app_private.announcement_executor where mode='WORKER' for share;
  if not found then return; end if;
  if p_processed is null or p_processed<0 or p_processed>20 then raise exception using errcode='22023',message='Conteo inválido'; end if;
  perform app_private.canonical_record_announcement_push_run(p_processed);
end $$;


--
-- Name: accept_account_terms(boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_account_terms(p_accepted boolean, p_terms_version text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
    if app_private.actor_subject_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if p_accepted is distinct from true then raise sqlstate 'PT400' using message = 'account_terms_required'; end if;
    return app_private.record_account_consent(public.auth_user_id(), p_terms_version, 'IN_APP');
end $$;


--
-- Name: accept_invitation(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_invitation(p_token_hash text, p_auth_user_id uuid) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select app_private.accept_invitation(p_token_hash, p_auth_user_id)
$$;


--
-- Name: approve_membership(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_membership(p_group_id uuid, p_membership_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select app_private.review_pending_membership(p_group_id, p_membership_id, true)
$$;


--
-- Name: assign_member_coach(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_member_coach(p_group_id uuid, p_membership_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_actor uuid := public.auth_user_id(); v_user uuid; v_coach uuid;
begin
  if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
  if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
  select user_id into v_user from public.memberships where id = p_membership_id and group_id = p_group_id;
  if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;
  -- Mismo orden persona -> grupo -> membresías que las transiciones existentes.
  perform 1 from public.users where id = v_user for update;
  perform 1 from public.groups where id = p_group_id for update;
  perform 1 from public.memberships where user_id = v_actor and group_id = p_group_id
    and role = 'ADMIN' and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
  perform 1 from public.memberships where id = p_membership_id and group_id = p_group_id and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT409' using message = 'membership_status_changed'; end if;
  select id into v_coach from public.memberships
    where user_id = v_user and group_id = p_group_id and role = 'COACH' and status = 'ACTIVE';
  if found then return v_coach; end if;
  if (select count(*) from public.memberships where group_id = p_group_id and status = 'ACTIVE') >= app_private.group_membership_limit(p_group_id) then
    raise sqlstate 'PT422' using message = 'group_member_limit';
  end if;
  insert into public.memberships(user_id, group_id, role, status, joined_at)
    values(v_user, p_group_id, 'COACH', 'ACTIVE', now())
    on conflict(user_id, group_id, role) do update set status = 'ACTIVE',
      joined_at = coalesce(public.memberships.joined_at, excluded.joined_at)
    returning id into v_coach;
  return v_coach;
end $$;


--
-- Name: auth_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_user_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_subject uuid:=app_private.actor_subject_id(); v_id uuid;
begin
 select id into v_id from public.users where auth_user_id=v_subject;
 return v_id;
end $$;


--
-- Name: begin_subscription_checkout(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.begin_subscription_checkout(p_group_id uuid, p_actor_auth_id uuid, p_plan_code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ begin if session_user <> 'postgres' or current_setting('role',true) not in ('none','postgres') then perform app_private.billing_gate('LEGACY'); end if; return app_private.billing_canonical_begin_subscription_checkout(p_group_id,p_actor_auth_id,p_plan_code); end $$;


--
-- Name: can_read_avatar(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_read_avatar(p_name text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select exists(select 1 from public.users u where u.auth_user_id::text = split_part(p_name, '/', 1)
      and u.birthdate is not null and (not app_private.is_minor(u.birthdate) or app_private.has_minor_consent(u.id, true))
      and (u.id = public.auth_user_id() or (u.avatar_url = '/profile/avatar/' || p_name and exists(
        select 1 from public.memberships target join public.memberships viewer on viewer.group_id = target.group_id
        join public.groups g on g.id = target.group_id
        where target.user_id = u.id and viewer.user_id = public.auth_user_id() and viewer.status = 'ACTIVE'
          and (viewer.role = 'ADMIN' and target.status in ('ACTIVE','PENDING')
            or target.role = 'ATHLETE' and target.status = 'ACTIVE' and (
              viewer.role = 'COACH' or viewer.role = 'GUARDIAN' and public.is_guardian_of(u.id)
              or viewer.role = 'ATHLETE' and (g.settings ->> 'athletes_can_view_group_stats')::boolean
              or viewer.role = 'GUARDIAN' and (g.settings ->> 'guardians_can_view_group_stats')::boolean
                and exists(select 1 from public.guardianships wg join public.users wu on wu.id = wg.athlete_user_id
                  join public.memberships wm on wm.user_id = wu.id and wm.group_id = target.group_id and wm.role = 'ATHLETE' and wm.status = 'ACTIVE'
                  where wg.guardian_user_id = viewer.user_id and wg.status = 'ACTIVE' and app_private.is_minor(wu.birthdate))
            ))
      ))))
$$;


--
-- Name: can_upload_avatar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_upload_avatar() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select coalesce((select u.birthdate is not null and (not app_private.is_minor(u.birthdate)
       or app_private.has_minor_consent(u.id, true)) from public.users u
       where u.id = public.auth_user_id() and u.account_status = 'ACTIVE'), false)
$$;


--
-- Name: cancel_invitation_registration(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_invitation_registration(p_nonce_hash text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
    delete from app_private.invitation_registrations where nonce_hash = p_nonce_hash
$$;


--
-- Name: claim_announcement_push(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_announcement_push(p_receipts boolean DEFAULT false) RETURNS TABLE(delivery_id uuid, claim_token uuid, token text, announcement_id uuid, group_id uuid, ticket_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform 1 from app_private.announcement_executor where mode='LEGACY' for share;
  if not found then raise exception using errcode='55000',message='Ejecutor anterior deshabilitado'; end if;
  return query select c.delivery_id,c.claim_token,c.token,c.announcement_id,c.group_id,c.ticket_id from app_private.canonical_claim_announcement_push(p_receipts) c;
end $$;


--
-- Name: claim_guardianship_majority_emails(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_guardianship_majority_emails() RETURNS TABLE(delivery_id uuid, claim_token uuid, email text, full_name text, audience text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform 1 from app_private.majority_executor where mode='LEGACY' for share;
  if not found then raise exception using errcode='55000',message='Ejecutor anterior deshabilitado'; end if;
  return query select c.delivery_id,c.claim_token,c.email,c.full_name,c.audience from app_private.legacy_majority_claim() c;
end $$;


--
-- Name: claim_subscription_creation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_subscription_creation(p_subscription_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ begin if session_user <> 'postgres' or current_setting('role',true) not in ('none','postgres') then perform app_private.billing_gate('LEGACY'); end if; return app_private.billing_canonical_claim_subscription_creation(p_subscription_id); end $$;


--
-- Name: clear_attendance_record(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_attendance_record(p_activity_id uuid, p_membership_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_group_id uuid;
begin
    v_group_id := app_private.lock_attendance_activity(p_activity_id);
    -- Desmarcar elimina también la nota: se mantiene reservado a ADMIN.
    if not public.is_group_admin(v_group_id) then raise sqlstate 'PT403' using message = 'attendance_clear_admin_required'; end if;
    perform 1 from public.memberships where id = p_membership_id and group_id = v_group_id
      and role = 'ATHLETE' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT422' using message = 'membership_not_athlete_in_group'; end if;
    delete from public.attendance_records where activity_id = p_activity_id and membership_id = p_membership_id;
end $$;


--
-- Name: complete_announcement_push(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_announcement_push(p_delivery_id uuid, p_claim_token uuid, p_outcome text, p_ticket_id text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform 1 from app_private.announcement_executor where mode in ('LEGACY','DRAINING') for share;
  if not found then raise exception using errcode='55000',message='Ejecutor anterior deshabilitado'; end if;
  perform app_private.canonical_complete_announcement_push(p_delivery_id,p_claim_token,p_outcome,p_ticket_id);
end $$;


--
-- Name: complete_guardianship_majority_email(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_guardianship_majority_email(p_delivery_id uuid, p_claim_token uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform 1 from app_private.majority_executor where mode in ('LEGACY','DRAINING') for share;
  if not found then raise exception using errcode='55000',message='Ejecutor anterior deshabilitado'; end if;
  perform app_private.legacy_majority_complete(p_delivery_id,p_claim_token);
end $$;


--
-- Name: consent_managed_member(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consent_managed_member(p_membership_id uuid, p_accepted boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
    v_actor uuid := public.auth_user_id();
    v_enrollment app_private.managed_member_enrollments%rowtype;
    v_athlete uuid;
    v_group uuid;
    v_status text;
    v_new_memberships integer;
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if p_accepted is distinct from true then raise sqlstate 'PT422' using message = 'consent_required'; end if;
    select m.user_id, m.group_id into v_athlete, v_group
    from app_private.managed_member_enrollments e
    join public.memberships m on m.id = e.membership_id
    join public.guardianships g on g.id = e.guardianship_id
    where m.id = p_membership_id and g.guardian_user_id = v_actor and g.status = 'ACTIVE'
      and public.is_member(m.group_id) and public.is_guardian_of(m.user_id);
    if v_athlete is null then raise sqlstate 'PT404' using message = 'managed_consent_not_found'; end if;
    perform 1 from public.users where id = v_actor and account_status = 'ACTIVE' for update;
    if not found then raise sqlstate 'PT403' using message = 'active_account_required'; end if;
    perform 1 from public.users where id = v_athlete for update;
    perform 1 from public.groups where id = v_group for update;
    select * into v_enrollment from app_private.managed_member_enrollments
      where membership_id = p_membership_id for update;
    perform 1 from public.guardianships where id = v_enrollment.guardianship_id
      and guardian_user_id = v_actor and status = 'ACTIVE' for share;
    if not found or not public.is_member(v_group) or not public.is_guardian_of(v_athlete) then
        raise sqlstate 'PT404' using message = 'managed_consent_not_found';
    end if;
    select status into v_status from public.memberships where id = p_membership_id for update;
    if v_enrollment.activated_at is not null and v_status = 'ACTIVE' then return; end if;
    if v_status <> 'PENDING' or v_enrollment.activated_at is not null then
        raise sqlstate 'PT409' using message = 'managed_member_not_pending';
    end if;
    v_new_memberships := 1 + (select count(*) from public.guardianships g
      where g.athlete_user_id = v_athlete and g.status = 'ACTIVE'
        and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
          and m.group_id = v_group and m.role = 'GUARDIAN' and m.status = 'ACTIVE'));
    if (select count(*) from public.memberships where group_id = v_group and status = 'ACTIVE') + v_new_memberships > app_private.group_membership_limit(v_group) then
        raise sqlstate 'PT422' using message = 'group_member_limit';
    end if;
    if exists(select 1 from public.guardianships g where g.athlete_user_id = v_athlete and g.status = 'ACTIVE'
      and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
        and m.group_id = v_group and m.status in ('ACTIVE','PENDING'))
      and (select count(distinct group_id) from public.memberships where user_id = g.guardian_user_id
        and status in ('ACTIVE','PENDING')) >= 30) then
        raise sqlstate 'PT422' using message = 'guardian_group_limit';
    end if;
    insert into public.consents(guardianship_id,consent_type,terms_version,channel,allows_avatar)
    values(v_enrollment.guardianship_id,'DATA_PROCESSING_MINOR','2026-09-21','IN_APP',false);
    update public.memberships set status = 'ACTIVE', joined_at = now() where id = p_membership_id;
    update app_private.managed_member_enrollments set activated_at = now() where membership_id = p_membership_id;
end $$;


--
-- Name: consent_membership_data(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consent_membership_data(p_membership_id uuid, p_accepted boolean) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_actor uuid := public.auth_user_id(); v_athlete uuid; v_group uuid;
  v_guardianship uuid; v_status text;
begin
  if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if p_accepted is distinct from true then raise sqlstate 'PT422' using message = 'consent_required'; end if;
  if exists(select 1 from app_private.managed_member_enrollments where membership_id = p_membership_id) then
    perform public.consent_managed_member(p_membership_id, p_accepted);
    return 'ACTIVE';
  end if;
  select m.user_id, m.group_id into v_athlete, v_group from public.memberships m
    where m.id = p_membership_id and m.role = 'ATHLETE' and public.is_member(m.group_id)
      and public.is_guardian_of(m.user_id);
  if v_athlete is null then raise sqlstate 'PT404' using message = 'managed_consent_not_found'; end if;
  perform 1 from public.users where id = v_actor and account_status = 'ACTIVE' for update;
  if not found then raise sqlstate 'PT403' using message = 'active_account_required'; end if;
  perform 1 from public.users where id = v_athlete and app_private.is_minor(birthdate) for update;
  if not found then raise sqlstate 'PT404' using message = 'managed_consent_not_found'; end if;
  perform 1 from public.groups where id = v_group for update;
  perform 1 from public.memberships where group_id = v_group and user_id = v_actor
    and role = 'GUARDIAN' and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT404' using message = 'managed_consent_not_found'; end if;
  select id into v_guardianship from public.guardianships where athlete_user_id = v_athlete
    and guardian_user_id = v_actor and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT404' using message = 'managed_consent_not_found'; end if;
  select status into v_status from public.memberships where id = p_membership_id for update;
  if v_status <> 'PENDING' then raise sqlstate 'PT409' using message = 'managed_member_not_pending'; end if;
  if not exists(select 1 from public.consents where guardianship_id = v_guardianship
    and consent_type = 'DATA_PROCESSING_MINOR' and revoked_at is null and granted_at <= now()) then
    insert into public.consents(guardianship_id,consent_type,terms_version,channel,allows_avatar)
      values(v_guardianship,'DATA_PROCESSING_MINOR','2026-09-21','IN_APP',false);
  end if;
  return 'PENDING';
end $$;


--
-- Name: consume_invitation_attempt(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_invitation_attempt(p_key text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v_attempts timestamptz[];
begin
    if p_key is null or p_key !~ '^[0-9a-f]{64}$' then return false; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_key, 18));
    delete from app_private.invitation_attempts where updated_at < now() - interval '1 day';
    select array(select t from unnest(a.attempts) t where t > now() - interval '1 hour')
      into v_attempts from app_private.invitation_attempts a where key = p_key;
    v_attempts := coalesce(v_attempts, '{}'::timestamptz[]);
    if cardinality(v_attempts) >= 10 then return false; end if;
    insert into app_private.invitation_attempts(key, attempts) values(p_key, array_append(v_attempts, now()))
    on conflict(key) do update set attempts = excluded.attempts, updated_at = now();
    return true;
end $_$;


--
-- Name: create_activity(uuid, uuid, text, timestamp with time zone, timestamp with time zone, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_activity(p_group_id uuid, p_activity_type_id uuid, p_title text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_description text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_recurrence_rule jsonb DEFAULT NULL::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
  v_first uuid; v_id uuid; v_start timestamp; v_end timestamp;
  v_until date; v_date date; v_count integer := 0; v_days text[];
  v_weekdays constant text[] := array['MO','TU','WE','TH','FR','SA','SU'];
  v_occurrence_start timestamptz; v_occurrence_end timestamptz;
begin
  if p_recurrence_rule is null then
    return app_private.create_single_activity(p_group_id,p_activity_type_id,p_title,p_starts_at,p_ends_at,p_description,p_location);
  end if;
  -- La primera inserción valida autorización antes de procesar la recurrencia.
  -- Cualquier error posterior revierte todas las filas de esta RPC.
  v_first := app_private.create_single_activity(p_group_id,p_activity_type_id,p_title,p_starts_at,p_ends_at,p_description,p_location);
  if jsonb_typeof(p_recurrence_rule) <> 'object' or
     not (p_recurrence_rule ?& array['freq','by_weekday','until']) or
     p_recurrence_rule - array['freq','by_weekday','until'] <> '{}'::jsonb or
     p_recurrence_rule->>'freq' is distinct from 'WEEKLY' or
     jsonb_typeof(p_recurrence_rule->'by_weekday') <> 'array' or
     jsonb_typeof(p_recurrence_rule->'until') <> 'string' then
    raise sqlstate 'PT400' using message = 'invalid_recurrence';
  end if;
  if jsonb_array_length(p_recurrence_rule->'by_weekday') not between 1 and 7 or exists (
    select 1 from jsonb_array_elements(p_recurrence_rule->'by_weekday') d
    where jsonb_typeof(d) <> 'string' or not (d #>> '{}') = any(v_weekdays)
  ) then raise sqlstate 'PT400' using message = 'invalid_recurrence'; end if;
  select array_agg(d) into v_days from jsonb_array_elements_text(p_recurrence_rule->'by_weekday') d;
  if (select count(distinct d) from unnest(v_days) d) <> cardinality(v_days) then
    raise sqlstate 'PT400' using message = 'invalid_recurrence';
  end if;
  begin
    if (p_recurrence_rule->>'until') !~ '^\d{4}-\d{2}-\d{2}$' then
      raise sqlstate 'PT400' using message = 'invalid_recurrence';
    end if;
    v_until := (p_recurrence_rule->>'until')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise sqlstate 'PT400' using message = 'invalid_recurrence';
  end;
  v_start := p_starts_at at time zone 'America/Santiago';
  v_end := p_ends_at at time zone 'America/Santiago';
  if v_until < v_start::date then raise sqlstate 'PT422' using message = 'invalid_recurrence'; end if;
  if v_until > v_start::date + 182 then raise sqlstate 'PT422' using message = 'recurrence_limit_exceeded'; end if;
  v_date := v_start::date;
  while v_date <= v_until loop
    if v_weekdays[extract(isodow from v_date)::integer] = any(v_days) then
      v_count := v_count + 1;
      if v_count > 150 then raise sqlstate 'PT422' using message = 'recurrence_limit_exceeded'; end if;
      v_occurrence_start := app_private.activity_local_to_utc(v_date + v_start::time);
      v_occurrence_end := app_private.activity_local_to_utc(v_date + (v_end::date - v_start::date) + v_end::time);
      if v_occurrence_end <= v_occurrence_start or v_occurrence_end - v_occurrence_start > interval '24 hours' then
        raise sqlstate 'PT422' using message = 'invalid_date_range';
      end if;
      if v_count = 1 then
        update public.activities set starts_at = v_occurrence_start, ends_at = v_occurrence_end,
          recurrence_rule = p_recurrence_rule where id = v_first;
      else
        v_id := app_private.create_single_activity(p_group_id,p_activity_type_id,p_title,v_occurrence_start,v_occurrence_end,p_description,p_location);
        update public.activities set recurrence_rule = p_recurrence_rule, recurrence_source_id = v_first where id = v_id;
      end if;
    end if;
    v_date := v_date + 1;
  end loop;
  if v_count = 0 then raise sqlstate 'PT422' using message = 'invalid_recurrence'; end if;
  return v_first;
end $_$;


--
-- Name: create_group(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_group(p_name text, p_sport text, p_description text DEFAULT NULL::text, p_logo_url text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
    v_user_id uuid := public.auth_user_id();
    v_status text;
    v_id uuid;
    v_code text;
begin
    if v_user_id is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    -- Serializa altas del mismo usuario, incluido accept_invitation, para el límite de grupos.
    select account_status into v_status from public.users where id = v_user_id for update;
    if v_status is distinct from 'ACTIVE' then raise sqlstate 'PT403' using message = 'active_account_required'; end if;
    if p_name is null or length(trim(p_name)) not between 3 and 80
       or p_sport is null or length(trim(p_sport)) not between 2 and 50
       or (nullif(trim(p_logo_url), '') is not null and trim(p_logo_url) !~ '^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$') then
        raise sqlstate 'PT400' using message = 'invalid_group';
    end if;
    if (select count(distinct group_id) from public.memberships
        where user_id = v_user_id and status in ('ACTIVE', 'PENDING')) >= 30 then
        raise sqlstate 'PT422' using message = 'user_group_limit';
    end if;
    -- 8 caracteres alfanuméricos desde bytes aleatorios. UNIQUE arbitra colisiones.
    for attempt in 1..10 loop
        v_code := translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/', 'AZ');
        insert into public.groups(name, sport, description, logo_url, invite_code, created_by)
        values(trim(p_name), trim(p_sport), nullif(trim(p_description), ''),
               nullif(trim(p_logo_url), ''), v_code, v_user_id)
        on conflict (invite_code) do nothing returning id into v_id;
        exit when v_id is not null;
    end loop;
    if v_id is null then raise sqlstate 'PT409' using message = 'invite_code_unavailable'; end if;
    insert into public.memberships(user_id, group_id, role, status, joined_at)
    values(v_user_id, v_id, 'ADMIN', 'ACTIVE', now());
    return v_id;
end $_$;


--
-- Name: create_guardianship(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_guardianship(p_group_id uuid, p_athlete_user_id uuid, p_full_name text, p_email text, p_relationship text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
    v_actor uuid := public.auth_user_id();
    v_guardian uuid;
    v_guardianship uuid;
    v_birthdate date;
    v_email text := lower(trim(p_email));
    v_groups uuid[];
    v_group uuid;
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not exists(select 1 from public.users where id = v_actor and account_status = 'ACTIVE') then
        raise sqlstate 'PT403' using message = 'active_account_required';
    end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_full_name is null or length(trim(p_full_name)) not between 2 and 120
      or p_relationship is null or length(trim(p_relationship)) not between 2 and 40
      or v_email is null or length(v_email) > 254
      or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
        raise sqlstate 'PT400' using message = 'invalid_guardianship';
    end if;
    if not exists(select 1 from public.memberships where group_id = p_group_id
      and user_id = p_athlete_user_id and role = 'ATHLETE' and status in ('ACTIVE','PENDING')) then
        raise sqlstate 'PT404' using message = 'athlete_not_found';
    end if;
    -- Se resuelve por email sin ofrecer búsquedas globales ni sobrescribir perfiles.
    insert into public.users(full_name,email,account_status)
    values(trim(p_full_name),v_email,'INVITED')
    on conflict (lower(email)) where email is not null do nothing;
    select id into v_guardian from public.users where lower(email) = v_email for update;
    if v_guardian = p_athlete_user_id then raise sqlstate 'PT422' using message = 'invalid_guardian'; end if;
    -- Orden compartido con aceptación/consentimiento: personas antes de grupos.
    select birthdate into v_birthdate from public.users where id = p_athlete_user_id for update;
    if not app_private.is_minor(v_birthdate) then
        raise sqlstate 'PT422' using message = 'guardian_only_for_minor';
    end if;
    if exists(select 1 from public.guardianships where guardian_user_id = v_guardian and athlete_user_id = p_athlete_user_id) then
        raise sqlstate 'PT409' using message = 'guardianship_already_exists';
    end if;
    -- El vínculo es global: incluye el grupo solicitado y los grupos activos del pupilo (CB-02).
    select array_agg(id order by id) into v_groups from (
        select p_group_id as id union select group_id from public.memberships
        where user_id = p_athlete_user_id and role = 'ATHLETE' and status = 'ACTIVE'
    ) target_groups;
    perform 1 from public.groups where id = any(v_groups) order by id for update;
    perform 1 from public.memberships where user_id = v_actor and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    perform 1 from public.memberships where user_id = p_athlete_user_id and group_id = p_group_id
      and role = 'ATHLETE' and status in ('ACTIVE','PENDING') for share;
    if not found then raise sqlstate 'PT404' using message = 'athlete_not_found'; end if;
    if (select count(*) from (
        select group_id from public.memberships where user_id = v_guardian and status in ('ACTIVE','PENDING')
        union select unnest(v_groups)
    ) guardian_groups) > 30 then
        raise sqlstate 'PT422' using message = 'guardian_group_limit';
    end if;
    foreach v_group in array v_groups loop
        if not exists(select 1 from public.memberships where user_id = v_guardian
          and group_id = v_group and role = 'GUARDIAN' and status = 'ACTIVE')
          and (select count(*) from public.memberships where group_id = v_group and status = 'ACTIVE') >= app_private.group_membership_limit(v_group) then
            raise sqlstate 'PT422' using message = 'group_member_limit';
        end if;
        insert into public.memberships(user_id,group_id,role,status,joined_at)
        values(v_guardian,v_group,'GUARDIAN','ACTIVE',now())
        on conflict(user_id,group_id,role) do update set status = 'ACTIVE',
          joined_at = coalesce(public.memberships.joined_at,excluded.joined_at)
        where public.memberships.status <> 'ACTIVE';
    end loop;
    begin
        insert into public.guardianships(guardian_user_id,athlete_user_id,relationship)
        values(v_guardian,p_athlete_user_id,trim(p_relationship)) returning id into v_guardianship;
    exception when unique_violation then
        raise sqlstate 'PT409' using message = 'guardianship_already_exists';
    end;
    return v_guardianship;
end $_$;


--
-- Name: create_managed_member(uuid, text, date, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_managed_member(p_group_id uuid, p_full_name text, p_birthdate date, p_email text DEFAULT NULL::text, p_guardian jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
    v_actor uuid := public.auth_user_id();
    v_user uuid;
    v_membership uuid;
    v_guardian uuid;
    v_guardianship uuid;
    v_guardian_email text;
    v_minor boolean := app_private.is_minor(p_birthdate);
    v_email text := nullif(lower(trim(p_email)), '');
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not exists(select 1 from public.users where id = v_actor and account_status = 'ACTIVE') then
        raise sqlstate 'PT403' using message = 'active_account_required';
    end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_full_name is null or length(trim(p_full_name)) not between 2 and 120
      or p_birthdate is null or p_birthdate >= app_private.chile_today()
      or extract(year from age(app_private.chile_today(), p_birthdate)) > 110
      or (v_email is not null and (length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then
        raise sqlstate 'PT400' using message = 'invalid_managed_member';
    end if;
    if v_minor then
        v_guardian_email := lower(trim(p_guardian ->> 'email'));
        if p_guardian is null or jsonb_typeof(p_guardian) <> 'object'
          or not (p_guardian ?& array['full_name','email','relationship','authorized'])
          or p_guardian - array['full_name','email','relationship','authorized'] <> '{}'::jsonb
          or p_guardian -> 'authorized' is distinct from 'true'::jsonb
          or length(trim(coalesce(p_guardian ->> 'full_name',''))) not between 2 and 120
          or length(trim(coalesce(p_guardian ->> 'relationship',''))) not between 2 and 40
          or v_guardian_email is null or length(v_guardian_email) > 254
          or v_guardian_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
          or v_guardian_email = v_email then
            raise sqlstate 'PT422' using message = 'invalid_guardian';
        end if;
        -- Identidad por email; nunca se aceptan IDs de terceros desde el cliente.
        -- El perfil existente se conserva y no se expone en la respuesta.
        insert into public.users(full_name, email, account_status)
        values(trim(p_guardian ->> 'full_name'), v_guardian_email, 'INVITED')
        on conflict (lower(email)) where email is not null do nothing;
        select id into v_guardian from public.users where lower(email) = v_guardian_email for update;
    elsif p_guardian is not null then
        raise sqlstate 'PT400' using message = 'invalid_guardian';
    end if;
    -- Mismo orden que la aceptación de invitaciones: persona, luego grupo.
    perform 1 from public.groups where id = p_group_id for update;
    perform 1 from public.memberships where user_id = v_actor and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if (select count(*) from public.memberships where group_id = p_group_id and status = 'ACTIVE') >= app_private.group_membership_limit(p_group_id) then
        raise sqlstate 'PT422' using message = 'group_member_limit';
    end if;
    begin
        insert into public.users(full_name, birthdate, email, account_status)
        values(trim(p_full_name), p_birthdate, v_email, 'MANAGED') returning id into v_user;
    exception when unique_violation then
        raise sqlstate 'PT409' using message = 'managed_email_unavailable';
    end;
    if v_minor then
        insert into public.guardianships(guardian_user_id, athlete_user_id, relationship)
        values(v_guardian, v_user, trim(p_guardian ->> 'relationship')) returning id into v_guardianship;
    end if;
    insert into public.memberships(user_id, group_id, role, status, joined_at)
    values(v_user, p_group_id, 'ATHLETE', case when v_minor then 'PENDING' else 'ACTIVE' end,
      case when v_minor then null else now() end) returning id into v_membership;
    if v_minor then
        insert into app_private.managed_member_enrollments(membership_id,guardianship_id,declared_by)
        values(v_membership,v_guardianship,v_actor);
    end if;
    return jsonb_build_object('membership_id', v_membership, 'membership_status', case when v_minor then 'PENDING' else 'ACTIVE' end);
end $_$;


--
-- Name: deactivate_membership(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.deactivate_membership(p_group_id uuid, p_membership_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select app_private.change_membership_status(p_group_id, p_membership_id, false)
$$;


--
-- Name: delete_activity(uuid, uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_activity(p_group_id uuid, p_activity_id uuid, p_scope text DEFAULT 'single'::text, p_confirm_attendance boolean DEFAULT false) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_activity public.activities; v_ids uuid[]; v_root uuid; v_replacement uuid;
begin
  v_activity := app_private.lock_activity_series(p_group_id,p_activity_id);
  if p_scope is null or p_scope not in ('single','series') or (p_scope = 'series' and v_activity.recurrence_rule is null) then
    raise sqlstate 'PT400' using message = 'invalid_activity_scope';
  end if;
  v_root := coalesce(v_activity.recurrence_source_id,v_activity.id);
  select array_agg(a.id) into v_ids from public.activities a where a.group_id = p_group_id and (
    (p_scope = 'single' and a.id = p_activity_id) or
    (p_scope = 'series' and coalesce(a.recurrence_source_id,a.id) = v_root and a.starts_at >= v_activity.starts_at
      and a.starts_at >= now() and not exists(select 1 from public.attendance_records r where r.activity_id = a.id))
  );
  if v_ids is null then raise sqlstate 'PT409' using message = 'no_editable_occurrences'; end if;
  if p_scope = 'single' and not coalesce(p_confirm_attendance,false) and exists (
    select 1 from public.attendance_records where activity_id = p_activity_id
  ) then raise sqlstate 'PT409' using message = 'attendance_confirmation_required'; end if;
  if v_root = any(v_ids) then
    select id into v_replacement from public.activities where group_id = p_group_id and recurrence_source_id = v_root
      and not (id = any(v_ids)) order by starts_at,id limit 1;
    if v_replacement is not null then
      update public.activities set recurrence_source_id = case when id = v_replacement then null else v_replacement end
      where group_id = p_group_id and recurrence_source_id = v_root and not (id = any(v_ids));
    end if;
  end if;
  -- La FK RESTRICT existente obliga a hacer explícita la eliminación confirmada.
  delete from public.attendance_records where activity_id = any(v_ids);
  delete from public.activities where id = any(v_ids) and group_id = p_group_id;
  return cardinality(v_ids);
end $$;


--
-- Name: delete_group_announcement(uuid, uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_group_announcement(p_group_id uuid, p_announcement_id uuid, p_updated_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_updated timestamptz;
begin
  perform app_private.require_announcement_admin(p_group_id);
  select updated_at into v_updated from public.group_announcements where id=p_announcement_id and group_id=p_group_id and deleted_at is null for update;
  if not found then raise sqlstate 'PT404' using message='announcement_not_found'; end if;
  if p_updated_at is null or v_updated<>p_updated_at then raise sqlstate 'PT409' using message='announcement_changed'; end if;
  update public.group_announcements set deleted_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_announcement_id;
  update app_private.announcement_push_deliveries set status='CANCELLED',completed_at=now(),claim_token=null
    where announcement_id=p_announcement_id and status='PENDING';
end $$;


--
-- Name: get_group_attendance_report(uuid, text, date, date, uuid[], boolean, integer, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_group_attendance_report(p_group_id uuid, p_period text DEFAULT 'month'::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_activity_type_ids uuid[] DEFAULT '{}'::uuid[], p_include_inactive boolean DEFAULT false, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50, p_sort text DEFAULT 'attendance'::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
    v_created_at timestamptz; v_from date; v_to date;
    v_from_utc timestamptz; v_to_utc timestamptz; v_report jsonb;
begin
    if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    select g.created_at into v_created_at from public.groups g
    where g.id = p_group_id and public.is_member(g.id);
    if not found then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not app_private.can_manage_attendance(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_period is null or p_period not in ('week', 'month', 'custom', 'season')
      or p_page is null or p_page not between 1 and 1000000
      or p_page_size is null or p_page_size not between 1 and 100
      or p_sort is null or p_sort not in ('attendance', 'name')
      or p_include_inactive is null or p_activity_type_ids is null
      or cardinality(p_activity_type_ids) > 100
      or (p_from is not null and (not isfinite(p_from) or p_from not between date '0001-01-01' and date '9999-12-31'))
      or (p_to is not null and (not isfinite(p_to) or p_to not between date '0001-01-01' and date '9999-12-31')) then
        raise sqlstate 'PT400' using message = 'invalid_report_filters';
    end if;
    -- Tipos desactivados siguen siendo válidos para consultar su historia.
    if exists(select 1 from unnest(p_activity_type_ids) selected(id)
      where not exists(select 1 from public.activity_types t where t.id = selected.id
        and (t.group_id is null or t.group_id = p_group_id))) then
        raise sqlstate 'PT400' using message = 'invalid_report_activity_type';
    end if;
    select b.from_date, b.until_date, b.from_utc, b.until_utc
      into v_from, v_to, v_from_utc, v_to_utc
    from app_private.attendance_period_bounds(p_period, p_from, p_to, v_created_at) b;

    with roster as materialized (
      select m.id as membership_id, u.full_name, m.status as membership_status
      from public.memberships m join public.users u on u.id = m.user_id
      where m.group_id = p_group_id and m.role = 'ATHLETE'
        and (m.status = 'ACTIVE' or (p_include_inactive and m.status = 'INACTIVE'))
    ), eligible as materialized (
      select v.membership_id, v.activity_type_id, v.activity_date, v.present, v.late, v.absent, v.excused
      from app_private.attendance_report_counts v join roster r using(membership_id)
      where v.group_id = p_group_id and v.activity_date >= v_from and v.activity_date < v_to
        and (cardinality(p_activity_type_ids) = 0 or v.activity_type_id = any(p_activity_type_ids))
    ), athlete_counts as (
      select r.membership_id, r.full_name, r.membership_status,
        coalesce(sum(e.present), 0)::bigint as present, coalesce(sum(e.late), 0)::bigint as late,
        coalesce(sum(e.absent), 0)::bigint as absent, coalesce(sum(e.excused), 0)::bigint as excused
      from roster r left join eligible e using(membership_id)
      group by r.membership_id, r.full_name, r.membership_status
    ), athletes as materialized (
      select c.membership_id, c.full_name, c.membership_status, metric.*
      from athlete_counts c cross join lateral app_private.attendance_metrics(c.present, c.late, c.absent, c.excused) metric
    ), page as (
      select a.* from athletes a
      order by case when p_sort = 'attendance' then a.attendance_pct end desc nulls last, a.full_name, a.membership_id
      limit p_page_size offset (p_page - 1) * p_page_size
    ), total_counts as (
      select coalesce(sum(present), 0)::bigint as present, coalesce(sum(late), 0)::bigint as late,
        coalesce(sum(absent), 0)::bigint as absent, coalesce(sum(excused), 0)::bigint as excused from athletes
    ), filtered_activities as materialized (
      select a.id, a.activity_type_id from public.activities a where a.group_id = p_group_id
        and a.starts_at >= v_from_utc and a.starts_at < v_to_utc and a.starts_at <= now()
        and (p_period <> 'season' or a.starts_at >= v_created_at)
        and (cardinality(p_activity_type_ids) = 0 or a.activity_type_id = any(p_activity_type_ids))
    ), type_counts as (
      select e.activity_type_id, sum(e.present)::bigint as present, sum(e.late)::bigint as late,
        sum(e.absent)::bigint as absent, sum(e.excused)::bigint as excused
      from eligible e group by e.activity_type_id
    ), by_type as (
      select t.id as activity_type_id, t.name, t.color, (t.group_id is null) as is_system,
        (select count(*) from filtered_activities a where a.activity_type_id = t.id) as activities, metric.*
      from public.activity_types t left join type_counts c on c.activity_type_id = t.id
      cross join lateral app_private.attendance_metrics(coalesce(c.present, 0), coalesce(c.late, 0), coalesce(c.absent, 0), coalesce(c.excused, 0)) metric
      where (t.group_id is null or t.group_id = p_group_id)
        and (cardinality(p_activity_type_ids) = 0 or t.id = any(p_activity_type_ids))
        and (c.activity_type_id is not null or exists(select 1 from filtered_activities a where a.activity_type_id = t.id))
    ), weekly_athlete_counts as (
      select date_trunc('week', e.activity_date::timestamp)::date as week_from, e.membership_id,
        sum(e.present)::bigint as present, sum(e.late)::bigint as late,
        sum(e.absent)::bigint as absent, sum(e.excused)::bigint as excused
      from eligible e group by date_trunc('week', e.activity_date::timestamp)::date, e.membership_id
    ), trend as (
      select w.week_from, round(avg(metric.attendance_pct), 1) as attendance_pct,
        sum(metric.convened)::bigint as convened
      from weekly_athlete_counts w cross join lateral app_private.attendance_metrics(w.present, w.late, w.absent, w.excused) metric
      group by w.week_from
    )
    select jsonb_build_object(
      'group_id', p_group_id,
      'period', jsonb_build_object('type', p_period, 'from', v_from, 'to', v_to - 1, 'timezone', 'America/Santiago'),
      'has_activities', exists(select 1 from public.activities where group_id = p_group_id),
      'totals', (select to_jsonb(metric) || jsonb_build_object('athletes', (select count(*) from athletes),
        'activities', (select count(*) from filtered_activities), 'average_attendance_pct', (select round(avg(attendance_pct), 1) from athletes),
        'best_full_name', (select full_name from athletes where attendance_pct is not null order by attendance_pct desc, full_name, membership_id limit 1))
        from total_counts c cross join lateral app_private.attendance_metrics(c.present, c.late, c.absent, c.excused) metric),
      'by_athlete', coalesce((select jsonb_agg(to_jsonb(p) order by case when p_sort = 'attendance' then p.attendance_pct end desc nulls last, p.full_name, p.membership_id) from page p), '[]'::jsonb),
      'by_activity_type', coalesce((select jsonb_agg(to_jsonb(t) order by t.name, t.activity_type_id) from by_type t), '[]'::jsonb),
      'trend', coalesce((select jsonb_agg(to_jsonb(t) order by t.week_from) from trend t), '[]'::jsonb),
      'page', p_page, 'page_size', p_page_size
    ) into v_report;
    return v_report;
end $$;


--
-- Name: get_group_billing(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_group_billing(p_group_id uuid, p_page integer DEFAULT 1) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
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


--
-- Name: get_group_stats(uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_group_stats(p_group_id uuid, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_result jsonb;
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
  if not app_private.can_view_group_stats(p_group_id) then raise sqlstate 'PT403' using message = 'group_stats_disabled'; end if;
  if p_page is null or p_page not between 1 and 1000000 or p_page_size is null or p_page_size not between 1 and 100 then
    raise sqlstate 'PT400' using message = 'invalid_report_filters';
  end if;
  with members as materialized (
    select membership_id, full_name, avatar_url, convened, present, late, absent, excused, attendance_pct, late_rate
    from public.v_group_stats_members where group_id = p_group_id
  ), page as (
    select * from members order by full_name, membership_id limit p_page_size offset (p_page - 1) * p_page_size
  ), counts as (
    select count(*) as athletes, coalesce(sum(present), 0)::bigint as present, coalesce(sum(late), 0)::bigint as late,
      coalesce(sum(absent), 0)::bigint as absent, coalesce(sum(excused), 0)::bigint as excused from members
  )
  select jsonb_build_object('group_id', p_group_id, 'page', p_page, 'page_size', p_page_size,
    'members', coalesce((select jsonb_agg(to_jsonb(p) order by p.full_name, p.membership_id) from page p), '[]'::jsonb),
    'totals', (select to_jsonb(metric) || jsonb_build_object('athletes', c.athletes)
      from counts c cross join lateral app_private.attendance_metrics(c.present, c.late, c.absent, c.excused) metric)) into v_result;
  return v_result;
end $$;


--
-- Name: get_my_attendance_history(uuid, text, date, date, uuid[], integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_attendance_history(p_group_id uuid, p_period text DEFAULT 'month'::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_activity_type_ids uuid[] DEFAULT '{}'::uuid[], p_page integer DEFAULT 1, p_page_size integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_created_at timestamptz; v_membership_id uuid; v_full_name text;
  v_from date; v_until date; v_from_utc timestamptz; v_until_utc timestamptz; v_history jsonb;
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  select g.created_at, m.id, u.full_name into v_created_at, v_membership_id, v_full_name
  from public.groups g join public.memberships m on m.group_id = g.id
  join public.users u on u.id = m.user_id
  where g.id = p_group_id and m.user_id = public.auth_user_id() and m.role = 'ATHLETE'
    and m.status = 'ACTIVE' and public.is_member(g.id);
  if not found then raise sqlstate 'PT404' using message = 'attendance_history_not_found'; end if;
  if p_page is null or p_page not between 1 and 1000000
    or p_page_size is null or p_page_size not between 1 and 100
    or p_activity_type_ids is null or cardinality(p_activity_type_ids) > 100 then
    raise sqlstate 'PT400' using message = 'invalid_report_filters';
  end if;
  if exists(select 1 from unnest(p_activity_type_ids) selected(id)
    where not exists(select 1 from public.activity_types t where t.id = selected.id
      and (t.group_id is null or t.group_id = p_group_id))) then
    raise sqlstate 'PT400' using message = 'invalid_report_activity_type';
  end if;
  select b.from_date, b.until_date, b.from_utc, b.until_utc into v_from, v_until, v_from_utc, v_until_utc
  from app_private.attendance_period_bounds(p_period, p_from, p_to, v_created_at) b;

  with eligible as materialized (
    select h.id, h.activity_id, h.title, h.starts_at, h.activity_type_id,
      h.activity_type_name, h.activity_type_color, h.is_system_type, h.status, h.note
    from public.v_athlete_attendance_history h
    where h.group_id = p_group_id and h.membership_id = v_membership_id
      and h.starts_at >= v_from_utc and h.starts_at < v_until_utc
      and (p_period <> 'season' or h.starts_at >= v_created_at)
      and (cardinality(p_activity_type_ids) = 0 or h.activity_type_id = any(p_activity_type_ids))
  ), page as (
    select * from eligible order by starts_at desc, id desc limit p_page_size offset (p_page - 1) * p_page_size
  ), counts as (
    select count(*) filter(where status = 'PRESENT') as present, count(*) filter(where status = 'LATE') as late,
      count(*) filter(where status = 'ABSENT') as absent, count(*) filter(where status = 'EXCUSED') as excused from eligible
  )
  select jsonb_build_object('group_id', p_group_id, 'membership_id', v_membership_id, 'full_name', v_full_name,
    'period', jsonb_build_object('type', p_period, 'from', v_from, 'to', v_until - 1, 'timezone', 'America/Santiago'),
    'totals', (select to_jsonb(metric) from counts c
      cross join lateral app_private.attendance_metrics(c.present, c.late, c.absent, c.excused) metric),
    'records', coalesce((select jsonb_agg(to_jsonb(p) order by p.starts_at desc, p.id desc) from page p), '[]'::jsonb),
    'page', p_page, 'page_size', p_page_size) into v_history;
  return v_history;
end $$;


--
-- Name: get_qr_checkin_settings(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_qr_checkin_settings(p_group_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_settings jsonb;
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
  if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
  select to_jsonb(s) - 'group_id' into v_settings from app_private.qr_checkin_settings s where group_id = p_group_id;
  return coalesce(v_settings, '{"opens_before_minutes":15,"closes_after_minutes":60,"late_after_minutes":10}'::jsonb);
end $$;


--
-- Name: get_subscription_context(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_subscription_context(p_group_id uuid, p_actor_auth_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ begin if session_user <> 'postgres' or current_setting('role',true) not in ('none','postgres') then perform app_private.billing_gate('LEGACY'); end if; return app_private.billing_canonical_get_subscription_context(p_group_id,p_actor_auth_id); end $$;


--
-- Name: get_ward_attendance_history(uuid, uuid, text, date, date, uuid[], integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_ward_attendance_history(p_group_id uuid, p_athlete_user_id uuid, p_period text DEFAULT 'month'::text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_activity_type_ids uuid[] DEFAULT '{}'::uuid[], p_page integer DEFAULT 1, p_page_size integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  v_created_at timestamptz; v_membership_id uuid; v_full_name text;
  v_from date; v_until date; v_from_utc timestamptz; v_until_utc timestamptz; v_history jsonb;
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  select g.created_at, m.id, u.full_name into v_created_at, v_membership_id, v_full_name
  from public.groups g join public.memberships m on m.group_id = g.id
  join public.users u on u.id = m.user_id
  join public.v_my_ward_groups w on w.group_id = m.group_id and w.athlete_user_id = m.user_id
  where g.id = p_group_id and m.user_id = p_athlete_user_id and m.role = 'ATHLETE'
    and m.status = 'ACTIVE' and w.membership_status = 'ACTIVE';
  if not found then raise sqlstate 'PT404' using message = 'attendance_history_not_found'; end if;
  if p_page is null or p_page not between 1 and 1000000
    or p_page_size is null or p_page_size not between 1 and 100
    or p_activity_type_ids is null or cardinality(p_activity_type_ids) > 100 then
    raise sqlstate 'PT400' using message = 'invalid_report_filters';
  end if;
  if exists(select 1 from unnest(p_activity_type_ids) selected(id)
    where not exists(select 1 from public.activity_types t where t.id = selected.id
      and (t.group_id is null or t.group_id = p_group_id))) then
    raise sqlstate 'PT400' using message = 'invalid_report_activity_type';
  end if;
  select b.from_date, b.until_date, b.from_utc, b.until_utc into v_from, v_until, v_from_utc, v_until_utc
  from app_private.attendance_period_bounds(p_period, p_from, p_to, v_created_at) b;

  with eligible as materialized (
    select h.id, h.activity_id, h.title, h.starts_at, h.activity_type_id,
      h.activity_type_name, h.activity_type_color, h.is_system_type, h.status, h.note
    from public.v_ward_attendance_history h
    where h.group_id = p_group_id and h.membership_id = v_membership_id
      and h.starts_at >= v_from_utc and h.starts_at < v_until_utc
      and (p_period <> 'season' or h.starts_at >= v_created_at)
      and (cardinality(p_activity_type_ids) = 0 or h.activity_type_id = any(p_activity_type_ids))
  ), page as (
    select * from eligible order by starts_at desc, id desc limit p_page_size offset (p_page - 1) * p_page_size
  ), counts as (
    select count(*) filter(where status = 'PRESENT') as present, count(*) filter(where status = 'LATE') as late,
      count(*) filter(where status = 'ABSENT') as absent, count(*) filter(where status = 'EXCUSED') as excused from eligible
  )
  select jsonb_build_object('group_id', p_group_id, 'membership_id', v_membership_id, 'full_name', v_full_name,
    'period', jsonb_build_object('type', p_period, 'from', v_from, 'to', v_until - 1, 'timezone', 'America/Santiago'),
    'totals', (select to_jsonb(metric) from counts c
      cross join lateral app_private.attendance_metrics(c.present, c.late, c.absent, c.excused) metric),
    'records', coalesce((select jsonb_agg(to_jsonb(p) order by p.starts_at desc, p.id desc) from page p), '[]'::jsonb),
    'page', p_page, 'page_size', p_page_size) into v_history;
  return v_history;
end $$;


--
-- Name: has_account_consent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_account_consent() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select exists(select 1 from public.account_consents c join public.users u on u.id = c.user_id
        where u.auth_user_id = app_private.actor_subject_id() and u.account_status = 'ACTIVE'
          and c.terms_version = app_private.account_terms_version());
$$;


--
-- Name: invitation_context(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invitation_context(p_token_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_inv public.invitations%rowtype; v_user public.users%rowtype; v_name text;
begin
    select * into v_inv from public.invitations where token = p_token_hash for update;
    if not found then return jsonb_build_object('error', 'invitation_not_available'); end if;
    if v_inv.status = 'PENDING' and v_inv.expires_at <= now() then
        update public.invitations set status = 'EXPIRED' where id = v_inv.id;
        v_inv.status := 'EXPIRED';
    end if;
    if v_inv.status = 'EXPIRED' then return jsonb_build_object('error', 'invitation_expired'); end if;
    if v_inv.status <> 'PENDING' then return jsonb_build_object('error', 'invitation_not_available'); end if;
    select * into v_user from public.users
      where (v_inv.invited_user_id is not null and id = v_inv.invited_user_id)
         or (v_inv.invited_user_id is null and lower(email) = lower(v_inv.email));
    select name into v_name from public.groups where id = v_inv.group_id;
    return jsonb_build_object('group_id', v_inv.group_id, 'group_name', v_name, 'role', v_inv.role,
      'email', coalesce(v_inv.email, v_user.email), 'account_status', v_user.account_status,
      'managed_activation', v_inv.activation_membership_id is not null);
end $$;


--
-- Name: invitation_registration_result(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invitation_registration_result(p_token_hash text, p_auth_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select jsonb_build_object('group_id',i.group_id,'membership_status',m.status)
    from public.invitations i join public.users u on u.id = i.invited_user_id
    join public.memberships m on m.user_id = u.id and m.group_id = i.group_id and m.role = i.role
    where i.token = p_token_hash and i.status = 'ACCEPTED' and u.auth_user_id = p_auth_user_id
$$;


--
-- Name: is_group_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_group_admin(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select exists(select 1 from public.memberships where group_id = p_group_id and user_id = public.auth_user_id() and status = 'ACTIVE' and role = 'ADMIN')
$$;


--
-- Name: is_guardian_of(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_guardian_of(p_athlete_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select exists(select 1 from public.guardianships g join public.users u on u.id = g.athlete_user_id
      where g.guardian_user_id = public.auth_user_id() and g.athlete_user_id = p_athlete_user_id
        and g.status = 'ACTIVE' and app_private.is_minor(u.birthdate))
$$;


--
-- Name: is_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_member(p_group_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select exists(select 1 from public.memberships where group_id = p_group_id and user_id = public.auth_user_id() and status = 'ACTIVE')
$$;


--
-- Name: issue_activity_checkin_qr(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.issue_activity_checkin_qr(p_activity_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_activity public.activities; v_settings app_private.qr_checkin_settings;
  v_secret bytea; v_now timestamptz; v_expires timestamptz;
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  -- Mismo bloqueo que tomar/editar/borrar asistencia; el permiso aquí es ADMIN.
  select a.* into v_activity from public.activities a
    where a.id = p_activity_id and public.is_member(a.group_id) for update;
  if not found then raise sqlstate 'PT404' using message = 'activity_not_found'; end if;
  perform 1 from public.memberships where group_id = v_activity.group_id and user_id = public.auth_user_id()
    and role = 'ADMIN' and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
  insert into app_private.qr_checkin_settings(group_id) values(v_activity.group_id) on conflict do nothing;
  select s.* into v_settings from app_private.qr_checkin_settings s where group_id = v_activity.group_id for share;
  v_now := clock_timestamp();
  if app_private.qr_checkin_status(v_activity.starts_at, v_now, v_settings.opens_before_minutes,
    v_settings.closes_after_minutes, v_settings.late_after_minutes) is null then
    raise sqlstate 'PT422' using message = 'checkin_window_closed';
  end if;
  insert into app_private.qr_checkin_keys(activity_id) values(p_activity_id) on conflict do nothing;
  select secret into v_secret from app_private.qr_checkin_keys where activity_id = p_activity_id;
  v_expires := least(to_timestamp((floor(extract(epoch from v_now) / 60) + 1) * 60),
    v_activity.starts_at + make_interval(mins => v_settings.closes_after_minutes));
  return jsonb_build_object('activity_id', p_activity_id,
    'token', app_private.qr_checkin_token(p_activity_id, v_secret, v_now),
    'server_time', v_now, 'expires_at', v_expires);
end $$;


--
-- Name: issue_invitation(uuid, uuid, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.issue_invitation(p_auth_user_id uuid, p_group_id uuid, p_token_hash text, p_email text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_invitation_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
    v_actor uuid;
    v_invitation public.invitations%rowtype;
    v_email text;
    v_role text;
    v_user_id uuid;
    v_group_name text;
    v_day date := app_private.chile_today();
    v_attempts integer;
    v_profile public.users%rowtype;
    v_activation_membership uuid;
begin
    -- El actor procede del JWT validado por Auth en Edge, no del payload web.
    select id into v_actor from public.users
      where auth_user_id = p_auth_user_id and account_status = 'ACTIVE';
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not exists(select 1 from public.memberships where group_id = p_group_id
      and user_id = v_actor and status = 'ACTIVE') then
        raise sqlstate 'PT404' using message = 'group_not_found';
    end if;
    perform 1 from public.memberships where group_id = p_group_id and user_id = v_actor
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
        raise sqlstate 'PT400' using message = 'invalid_invitation';
    end if;

    -- Compartido entre instancias Edge; no toma el lock de groups que usa
    -- aceptación después de bloquear la invitación. Incluye los reenvíos.
    perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 23));
    if p_invitation_id is not null then
        if p_email is not null or p_role is not null then
            raise sqlstate 'PT400' using message = 'invalid_invitation';
        end if;
        -- Las activaciones bloquean primero la persona y luego el token,
        -- igual que aceptación; así reenvío y claim no se interbloquean.
        perform 1 from public.users where id = (select invited_user_id from public.invitations
          where id = p_invitation_id and group_id = p_group_id and activation_membership_id is not null) for update;
        select * into v_invitation from public.invitations
          where id = p_invitation_id and group_id = p_group_id for update;
        if not found or v_invitation.status <> 'PENDING' then
            raise sqlstate 'PT404' using message = 'invitation_not_available';
        end if;
        v_email := v_invitation.email;
        v_role := v_invitation.role;
        v_user_id := v_invitation.invited_user_id;
        if v_email is null then
            select email into v_email from public.users where id = v_user_id;
        end if;
    else
        v_email := p_email;
        v_role := p_role;
    end if;
    v_email := lower(btrim(v_email));
    if v_email is null or length(v_email) > 254
      or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      or v_role is null or v_role not in ('ATHLETE', 'GUARDIAN') then
        raise sqlstate 'PT400' using message = 'invalid_invitation';
    end if;

    select case when day = v_day then attempts else 0 end into v_attempts
      from app_private.invitation_send_limits where group_id = p_group_id;
    if coalesce(v_attempts, 0) >= 50 then
        raise sqlstate 'PT429' using message = 'invitation_send_rate_limited';
    end if;

    if v_user_id is null then
        -- UNIQUE(lower(email)) arbitra dos grupos invitando simultáneamente.
        insert into public.users(full_name, email, account_status)
        values('Persona invitada', v_email, 'INVITED')
        on conflict (lower(email)) where email is not null do nothing
        returning id into v_user_id;
        if v_user_id is null then
            select id into v_user_id from public.users where lower(email) = v_email;
        end if;
    end if;
    select * into v_profile from public.users where id = v_user_id for update;
    if v_profile.account_status = 'MANAGED' then
        select id into v_activation_membership from public.memberships
          where user_id = v_user_id and group_id = p_group_id and role = 'ATHLETE';
        if v_activation_membership is null or v_role <> 'ATHLETE' then
            raise sqlstate 'PT404' using message = 'membership_not_found';
        end if;
        if v_profile.email is null then raise sqlstate 'PT422' using message = 'managed_email_required'; end if;
        if v_email is distinct from lower(v_profile.email) then
            raise sqlstate 'PT409' using message = 'activation_request_changed';
        end if;
        if app_private.is_minor(v_profile.birthdate) and (not app_private.has_minor_consent(v_user_id)
          or not app_private.has_account_activation_consent(v_user_id)) then
            raise sqlstate 'PT422' using message = 'guardian_consent_required';
        end if;
        update public.invitations set status = 'EXPIRED'
          where invited_user_id = v_user_id and activation_membership_id is not null and status = 'PENDING';
    elsif p_invitation_id is not null and v_invitation.activation_membership_id is not null then
        raise sqlstate 'PT409' using message = 'managed_account_required';
    end if;
    if p_invitation_id is not null then
        update public.invitations set status = 'EXPIRED' where id = p_invitation_id;
    end if;
    insert into public.invitations(group_id, email, role, token, invited_user_id, created_by, created_at, expires_at, activation_membership_id)
    values(p_group_id, v_email, v_role, p_token_hash, v_user_id, v_actor, now(), now() + interval '7 days', v_activation_membership)
    returning * into v_invitation;
    insert into app_private.invitation_send_limits(group_id, day, attempts)
    values(p_group_id, v_day, coalesce(v_attempts, 0) + 1)
    on conflict(group_id) do update set day = excluded.day, attempts = excluded.attempts;
    select name into v_group_name from public.groups where id = p_group_id;
    -- Respuesta solo para Edge. Nunca exponer email/ID/estado de la cuenta.
    return jsonb_build_object('id', v_invitation.id, 'status', v_invitation.status,
      'expires_at', v_invitation.expires_at, 'email', v_email, 'role', v_role, 'group_name', v_group_name);
end $_$;


--
-- Name: issue_managed_activation(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.issue_managed_activation(p_auth_user_id uuid, p_group_id uuid, p_membership_id uuid, p_token_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_actor uuid; v_issuer_auth uuid; v_user public.users%rowtype; v_user_id uuid;
begin
    select id into v_actor from public.users where auth_user_id = p_auth_user_id and account_status = 'ACTIVE';
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not exists(select 1 from public.memberships where group_id = p_group_id and user_id = v_actor and status = 'ACTIVE') then
        raise sqlstate 'PT404' using message = 'group_not_found';
    end if;
    select user_id into v_user_id from public.memberships where id = p_membership_id and group_id = p_group_id and role = 'ATHLETE';
    if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_group_id::text, 23));
    select * into v_user from public.users where id = v_user_id for update;
    if exists(select 1 from public.memberships where group_id = p_group_id and user_id = v_actor and role = 'ADMIN' and status = 'ACTIVE') then
        v_issuer_auth := p_auth_user_id;
    else
        select issuer.auth_user_id into v_issuer_auth from app_private.managed_activation_requests r
        join public.consents c on c.id = r.consent_id
        join public.guardianships g on g.id = c.guardianship_id
        join public.users issuer on issuer.id = r.requested_by and issuer.account_status = 'ACTIVE'
        where r.membership_id = p_membership_id and r.status = 'APPROVED' and r.email = v_user.email
          and g.guardian_user_id = v_actor and g.athlete_user_id = v_user_id and g.status = 'ACTIVE'
          and app_private.is_minor(v_user.birthdate) and c.revoked_at is null
          and c.consent_type = 'ACCOUNT_ACTIVATION_MINOR' and c.terms_version = '2026-09-21'
          and exists(select 1 from public.memberships a where a.user_id = r.requested_by
            and a.group_id = p_group_id and a.role = 'ADMIN' and a.status = 'ACTIVE')
        order by r.resolved_at desc limit 1;
        if v_issuer_auth is null then raise sqlstate 'PT403' using message = 'activation_sender_required'; end if;
    end if;
    if v_user.account_status <> 'MANAGED' or v_user.auth_user_id is not null then
        raise sqlstate 'PT409' using message = 'managed_account_required';
    end if;
    if v_user.email is null then raise sqlstate 'PT422' using message = 'managed_email_required'; end if;
    return public.issue_invitation(v_issuer_auth,p_group_id,p_token_hash,v_user.email,'ATHLETE');
end $$;


--
-- Name: join_group_as_athlete(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_group_as_athlete(p_group_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
    v_user_id uuid := public.auth_user_id();
    v_status text;
    v_birthdate date;
    v_id uuid;
    v_membership_status text;
    v_new_memberships integer := 1;
begin
    if v_user_id is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    select account_status, birthdate into v_status, v_birthdate from public.users where id = v_user_id for update;
    if v_status is distinct from 'ACTIVE' then raise sqlstate 'PT403' using message = 'active_account_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    perform 1 from public.groups where id = p_group_id for update;
    perform 1 from public.memberships where user_id = v_user_id and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    select id, status into v_id, v_membership_status from public.memberships
      where user_id = v_user_id and group_id = p_group_id and role = 'ATHLETE';
    if v_membership_status = 'ACTIVE' then return v_id; end if;
    -- Aprobar/reactivar membresías existentes pertenece a sus RPC específicas.
    if v_id is not null then raise sqlstate 'PT409' using message = 'membership_already_exists'; end if;
    if v_birthdate is null then raise sqlstate 'PT422' using message = 'athlete_birthdate_required'; end if;
    if app_private.is_minor(v_birthdate) then
        if not app_private.has_minor_consent(v_user_id) then
            raise sqlstate 'PT422' using message = 'minor_requires_guardian_consent';
        end if;
        -- Las altas automáticas también respetan el límite de grupos del apoderado.
        perform 1 from public.users u where exists(select 1 from public.guardianships g
          where g.guardian_user_id = u.id and g.athlete_user_id = v_user_id and g.status = 'ACTIVE')
          order by u.id for update;
        if exists(select 1 from public.guardianships g where g.athlete_user_id = v_user_id and g.status = 'ACTIVE'
          and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
            and m.group_id = p_group_id and m.status in ('ACTIVE', 'PENDING'))
          and (select count(distinct m.group_id) from public.memberships m
            where m.user_id = g.guardian_user_id and m.status in ('ACTIVE', 'PENDING')) >= 30) then
            raise sqlstate 'PT422' using message = 'guardian_group_limit';
        end if;
        -- El trigger canónico agrega también las membresías GUARDIAN.
        v_new_memberships := v_new_memberships + (select count(*) from public.guardianships g
          where g.athlete_user_id = v_user_id and g.status = 'ACTIVE'
            and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
              and m.group_id = p_group_id and m.role = 'GUARDIAN' and m.status = 'ACTIVE'));
    end if;
    if (select count(*) from public.memberships where group_id = p_group_id and status = 'ACTIVE') + v_new_memberships > app_private.group_membership_limit(p_group_id) then
        raise sqlstate 'PT422' using message = 'group_member_limit';
    end if;
    insert into public.memberships(user_id, group_id, role, status, joined_at)
    values(v_user_id, p_group_id, 'ATHLETE', 'ACTIVE', now()) returning id into v_id;
    return v_id;
end $$;


--
-- Name: join_group_by_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_group_by_code(p_invite_code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
    v_user_id uuid := public.auth_user_id();
    v_account_status text;
    v_birthdate date;
    v_attempts timestamptz[];
    v_group_id uuid;
    v_group_name text;
    v_sport text;
    v_membership_id uuid;
    v_status text;
    v_joined_at timestamptz;
begin
    if v_user_id is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    -- El perfil bloqueado serializa incorporaciones simultáneas del mismo usuario.
    select account_status, birthdate into v_account_status, v_birthdate
      from public.users where id = v_user_id for update;
    if v_account_status is distinct from 'ACTIVE' then
        raise sqlstate 'PT403' using message = 'active_account_required';
    end if;
    select array(select attempt from unnest(a.attempts) attempt
                 where attempt > now() - interval '15 minutes')
      into v_attempts from app_private.join_code_attempts a where a.user_id = v_user_id;
    v_attempts := coalesce(v_attempts, '{}'::timestamptz[]);
    if cardinality(v_attempts) >= 10 then
        raise sqlstate 'PT429' using message = 'join_rate_limited';
    end if;
    insert into app_private.join_code_attempts(user_id, attempts, updated_at)
    values(v_user_id, array_append(v_attempts, now()), now())
    on conflict(user_id) do update set attempts = excluded.attempts, updated_at = excluded.updated_at;

    -- Los errores esperados se devuelven: una excepción revertiría también
    -- el contador y permitiría probar códigos sin límite.
    if p_invite_code is null or btrim(p_invite_code) !~ '^[A-Za-z0-9]{8}$' then
        return jsonb_build_object('error', jsonb_build_object('code', 'invalid_invite_code',
          'message', 'Código no válido', 'details', '{}'::jsonb));
    end if;
    -- FOR UPDATE arbitra una rotación concurrente antes de aceptar el código.
    select id, name, sport into v_group_id, v_group_name, v_sport
      from public.groups where invite_code = btrim(p_invite_code) for update;
    if v_group_id is null then
        return jsonb_build_object('error', jsonb_build_object('code', 'invalid_invite_code',
          'message', 'Código no válido', 'details', '{}'::jsonb));
    end if;
    if exists(select 1 from public.memberships where user_id = v_user_id
      and group_id = v_group_id and role = 'ATHLETE') then
        return jsonb_build_object('error', jsonb_build_object('code', 'membership_already_exists',
          'message', 'Ya perteneces a este grupo como deportista', 'details', '{}'::jsonb));
    end if;
    if v_birthdate is null then
        return jsonb_build_object('error', jsonb_build_object('code', 'athlete_birthdate_required',
          'message', 'Completa tu fecha de nacimiento en Mi perfil', 'details', '{}'::jsonb));
    end if;
    if not exists(select 1 from public.memberships where user_id = v_user_id
      and group_id = v_group_id and status in ('ACTIVE', 'PENDING'))
      and (select count(distinct group_id) from public.memberships
           where user_id = v_user_id and status in ('ACTIVE', 'PENDING')) >= 30 then
        return jsonb_build_object('error', jsonb_build_object('code', 'user_group_limit',
          'message', 'Ya alcanzaste el límite de 30 grupos', 'details', '{}'::jsonb));
    end if;

    if app_private.is_minor(v_birthdate) then
        v_status := 'PENDING';
    else
        v_status := 'ACTIVE';
        v_joined_at := now();
        if (select count(*) from public.memberships where group_id = v_group_id
          and status = 'ACTIVE') >= app_private.group_membership_limit(v_group_id) then
            return jsonb_build_object('error', jsonb_build_object('code', 'group_member_limit',
              'message', 'Este grupo alcanzó el límite de membresías activas', 'details', '{}'::jsonb));
        end if;
    end if;
    insert into public.memberships(user_id, group_id, role, status, joined_at)
    values(v_user_id, v_group_id, 'ATHLETE', v_status, v_joined_at)
    returning id into v_membership_id;
    return jsonb_build_object(
      'membership', jsonb_build_object('id', v_membership_id, 'group_id', v_group_id,
        'role', 'ATHLETE', 'status', v_status, 'joined_at', v_joined_at),
      'group', jsonb_build_object('name', v_group_name, 'sport', v_sport)
    ) || case when v_status = 'PENDING' then
      jsonb_build_object('pending_reason', 'minor_requires_guardian_and_admin_approval')
    else '{}'::jsonb end;
end $_$;


--
-- Name: list_avatar_permissions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_avatar_permissions() RETURNS TABLE(guardianship_id uuid, full_name text, allows_avatar boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select g.id, u.full_name, bool_or(c.allows_avatar)
    from public.guardianships g join public.users u on u.id = g.athlete_user_id
    join public.consents c on c.guardianship_id = g.id and c.consent_type = 'DATA_PROCESSING_MINOR' and c.revoked_at is null and c.granted_at <= now()
    where g.guardian_user_id = public.auth_user_id() and g.status = 'ACTIVE' and app_private.is_minor(u.birthdate)
    group by g.id, u.full_name
$$;


--
-- Name: list_birthdate_reviews(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_birthdate_reviews() RETURNS TABLE(request_id uuid, group_id uuid, group_name text, full_name text, old_birthdate date, requested_birthdate date, approved boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select r.id, g.id, g.name, u.full_name, r.old_birthdate, r.requested_birthdate,
      exists(select 1 from public.birthdate_change_approvals a join public.memberships am
        on am.user_id = a.approved_by and am.group_id = a.group_id and am.role = 'ADMIN' and am.status = 'ACTIVE'
        where a.request_id = r.id and a.group_id = g.id)
    from public.birthdate_change_requests r join public.users u on u.id = r.user_id
      join public.memberships m on m.user_id = r.user_id and m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')
      join public.groups g on g.id = m.group_id
    where r.status = 'PENDING' and r.user_id <> public.auth_user_id() and public.is_group_admin(g.id)
    order by r.created_at, g.name
$$;


--
-- Name: list_group_announcements(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_group_announcements(p_group_id uuid, p_page integer DEFAULT 1) RETURNS TABLE(id uuid, group_id uuid, title text, body text, created_at timestamp with time zone, updated_at timestamp with time zone, total_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message='authentication_required'; end if;
  if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message='group_not_found'; end if;
  if p_page is null or p_page<1 or p_page>100000 then raise sqlstate 'PT400' using message='invalid_announcement_page'; end if;
  return query select a.id,a.group_id,a.title,a.body,a.created_at,a.updated_at,count(*) over ()
    from public.group_announcements a where a.group_id=p_group_id and a.deleted_at is null
    order by a.created_at desc,a.id desc limit 50 offset (p_page-1)*50;
end $$;


--
-- Name: list_group_members(uuid, text, text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_group_members(p_group_id uuid, p_role text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_offset integer DEFAULT 0, p_search text DEFAULT NULL::text) RETURNS TABLE(membership_id uuid, full_name text, email text, phone text, birthdate date, account_status text, role text, status text, total_count bigint, user_id uuid, person_roles jsonb, is_last_admin boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
    if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_offset is null or p_offset < 0 or p_offset > 5000000
      or (p_role is not null and p_role not in ('ADMIN','ATHLETE','GUARDIAN','COACH'))
      or (p_status is not null and p_status not in ('ACTIVE','INACTIVE','PENDING','INVITED'))
      or length(trim(p_search)) > 120 then
        raise sqlstate 'PT400' using message = 'invalid_member_filters';
    end if;
    return query select m.id, u.full_name, u.email, u.phone, u.birthdate,
      u.account_status, m.role, m.status, count(*) over (), u.id,
      (select jsonb_agg(jsonb_build_object('role', other.role, 'status', other.status) order by other.role)
       from public.memberships other where other.user_id = m.user_id and other.group_id = p_group_id),
      m.role = 'ADMIN' and m.status = 'ACTIVE' and not exists (
        select 1 from public.memberships admin_member where admin_member.group_id = p_group_id
          and admin_member.role = 'ADMIN' and admin_member.status = 'ACTIVE' and admin_member.id <> m.id
      )
    from public.memberships m join public.users u on u.id = m.user_id
    where m.group_id = p_group_id and (p_role is null or m.role = p_role)
      and (p_status is null or m.status = p_status)
      -- position treats %, _ and backslash literally; users are searching names.
      and (nullif(trim(p_search), '') is null or position(lower(trim(p_search)) in lower(u.full_name)) > 0)
    order by u.full_name, u.id, m.role, m.id limit 50 offset p_offset;
end $$;


--
-- Name: list_guardianship_athletes(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_guardianship_athletes(p_group_id uuid, p_search text DEFAULT ''::text, p_offset integer DEFAULT 0) RETURNS TABLE(user_id uuid, full_name text, total_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
    if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if length(coalesce(p_search,'')) > 120 or coalesce(p_offset,0) < 0 then
        raise sqlstate 'PT400' using message = 'invalid_guardianship';
    end if;
    return query select u.id, u.full_name, count(*) over ()
    from public.memberships m join public.users u on u.id = m.user_id
    where m.group_id = p_group_id and m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')
      and app_private.is_minor(u.birthdate)
      and strpos(lower(u.full_name),lower(trim(coalesce(p_search,'')))) > 0
    order by u.full_name,u.id limit 50 offset coalesce(p_offset,0);
end $$;


--
-- Name: list_managed_activation_requests(uuid, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_managed_activation_requests(p_group_id uuid, p_offset integer DEFAULT 0, p_athlete_user_id uuid DEFAULT NULL::uuid) RETURNS TABLE(request_id uuid, membership_id uuid, full_name text, relationship text, status text, total_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
    if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    return query select r.id, m.id, u.full_name, g.relationship, r.status, count(*) over()
    from app_private.managed_activation_requests r
    join public.memberships m on m.id = r.membership_id
    join public.users u on u.id = m.user_id
    join public.guardianships g on g.athlete_user_id = u.id
    where m.group_id = p_group_id and (p_athlete_user_id is null or u.id = p_athlete_user_id) and u.account_status = 'MANAGED' and u.email = r.email
      and r.status in ('PENDING','APPROVED') and app_private.is_minor(u.birthdate)
      and g.guardian_user_id = public.auth_user_id() and g.status = 'ACTIVE'
      and (r.status = 'PENDING' or exists(select 1 from public.consents c
        where c.id = r.consent_id and c.guardianship_id = g.id and c.revoked_at is null))
      and exists(select 1 from public.memberships a where a.user_id = r.requested_by
        and a.group_id = p_group_id and a.role = 'ADMIN' and a.status = 'ACTIVE')
    order by r.requested_at, r.id limit 50 offset greatest(coalesce(p_offset,0),0);
end $$;


--
-- Name: list_managed_member_consents(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_managed_member_consents(p_group_id uuid, p_offset integer DEFAULT 0) RETURNS TABLE(membership_id uuid, full_name text, relationship text, total_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
    if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    return query select m.id, u.full_name, g.relationship, count(*) over ()
    from app_private.managed_member_enrollments e
    join public.memberships m on m.id = e.membership_id
    join public.users u on u.id = m.user_id
    join public.guardianships g on g.id = e.guardianship_id
    where m.group_id = p_group_id and m.status = 'PENDING' and e.activated_at is null
      and g.guardian_user_id = public.auth_user_id() and g.status = 'ACTIVE'
      and app_private.is_minor(u.birthdate)
    order by e.declared_at, m.id limit 50 offset greatest(coalesce(p_offset,0),0);
end $$;


--
-- Name: list_membership_onboarding(uuid, uuid, uuid, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_membership_onboarding(p_group_id uuid DEFAULT NULL::uuid, p_athlete_user_id uuid DEFAULT NULL::uuid, p_membership_id uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0, p_as_guardian boolean DEFAULT false) RETURNS TABLE(membership_id uuid, athlete_user_id uuid, group_id uuid, group_name text, full_name text, membership_status text, account_status text, is_minor boolean, guardian_linked boolean, guardian_ready boolean, requires_managed_consent boolean, can_consent boolean, relationship text, capacity_block text, total_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_actor uuid := public.auth_user_id(); v_admin boolean := false;
begin
  if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if p_offset is null or p_offset < 0 then raise sqlstate 'PT400' using message = 'invalid_membership_review'; end if;
  if p_group_id is not null then
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    v_admin := public.is_group_admin(p_group_id) and not coalesce(p_as_guardian, false);
  end if;
  return query
  select m.id, u.id, g.id, g.name, u.full_name, m.status, u.account_status,
    app_private.is_minor(u.birthdate),
    exists(select 1 from public.guardianships gs where gs.athlete_user_id = u.id and gs.status = 'ACTIVE'),
    app_private.has_minor_consent(u.id),
    app_private.is_minor(u.birthdate) and e.membership_id is not null and e.activated_at is null,
    m.status = 'PENDING' and own.id is not null and app_private.is_minor(u.birthdate)
      and exists(select 1 from public.users actor where actor.id = v_actor and actor.account_status = 'ACTIVE')
      and ((e.membership_id is not null and e.activated_at is null and e.guardianship_id = own.id)
        or (e.membership_id is null and not app_private.has_minor_consent(u.id))),
    own.relationship,
    case when v_admin and m.status = 'PENDING' then
      case when (select count(*) from public.memberships active_m where active_m.group_id = g.id
        and active_m.role = 'ATHLETE' and active_m.status = 'ACTIVE') >= app_private.group_athlete_limit(g.id)
        then 'subscription_athlete_limit'
      when (select count(*) from public.memberships active_m where active_m.group_id = g.id and active_m.status = 'ACTIVE')
        + 1 + (select count(*) from public.guardianships gs where gs.athlete_user_id = u.id and gs.status = 'ACTIVE'
          and app_private.is_minor(u.birthdate) and not exists(select 1 from public.memberships gm where gm.group_id = g.id
            and gm.user_id = gs.guardian_user_id and gm.role = 'GUARDIAN' and gm.status = 'ACTIVE'))
        > app_private.group_membership_limit(g.id) then 'group_member_limit'
      else null end
    else null end,
    count(*) over ()
  from public.memberships m join public.users u on u.id = m.user_id
  join public.groups g on g.id = m.group_id
  left join app_private.managed_member_enrollments e on e.membership_id = m.id
  left join public.guardianships own on own.athlete_user_id = u.id and own.guardian_user_id = v_actor
    and own.status = 'ACTIVE' and public.is_guardian_of(u.id)
    and exists(select 1 from public.memberships viewer where viewer.group_id = m.group_id
      and viewer.user_id = v_actor and viewer.role = 'GUARDIAN' and viewer.status = 'ACTIVE')
  where m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')
    and (p_athlete_user_id is null or u.id = p_athlete_user_id)
    and (p_membership_id is null or m.id = p_membership_id)
    and ((p_group_id is null and m.user_id = v_actor and m.status = 'PENDING')
      or (m.group_id = p_group_id and ((v_admin and (m.status = 'PENDING' or p_membership_id is not null)) or (not v_admin and own.id is not null))))
  order by g.name, m.created_at, m.id limit 50 offset p_offset;
end $$;


--
-- Name: list_my_wards(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_my_wards() RETURNS TABLE(athlete_user_id uuid, full_name text, avatar_url text, age integer, days_until_majority integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
select u.id as athlete_user_id, u.full_name,
  case when app_private.has_minor_consent(u.id, true) then u.avatar_url end as avatar_url,
  extract(year from age(app_private.chile_today(), u.birthdate))::integer as age,
  (u.birthdate + interval '18 years')::date - app_private.chile_today() as days_until_majority
from public.users u
where exists(select 1 from public.v_my_ward_groups g where g.athlete_user_id = u.id);
$$;


--
-- Name: list_pending_athletes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_pending_athletes(p_group_id uuid) RETURNS TABLE(membership_id uuid, full_name text, is_minor boolean, guardian_ready boolean, total_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
    if public.auth_user_id() is null then
        raise sqlstate 'PT401' using message = 'authentication_required';
    end if;
    if not public.is_member(p_group_id) then
        raise sqlstate 'PT404' using message = 'group_not_found';
    end if;
    if not public.is_group_admin(p_group_id) then
        raise sqlstate 'PT403' using message = 'admin_required';
    end if;
    return query
      select m.id, u.full_name, app_private.is_minor(u.birthdate),
        app_private.has_minor_consent(u.id), count(*) over ()
      from public.memberships m join public.users u on u.id = m.user_id
      where m.group_id = p_group_id and m.role = 'ATHLETE' and m.status = 'PENDING'
      order by m.created_at, m.id limit 100;
end $$;


--
-- Name: list_pending_memberships(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_pending_memberships(p_group_id uuid, p_offset integer DEFAULT 0) RETURNS TABLE(membership_id uuid, full_name text, is_minor boolean, guardian_linked boolean, guardian_ready boolean, requires_managed_consent boolean, total_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
    if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_offset is null or p_offset < 0 then raise sqlstate 'PT400' using message = 'invalid_membership_review'; end if;
    return query select m.id, u.full_name, app_private.is_minor(u.birthdate),
      exists(select 1 from public.guardianships g where g.athlete_user_id = u.id and g.status = 'ACTIVE'),
      app_private.has_minor_consent(u.id),
      app_private.is_minor(u.birthdate) and exists(select 1 from app_private.managed_member_enrollments e
        where e.membership_id = m.id and e.activated_at is null), count(*) over ()
    from public.memberships m join public.users u on u.id = m.user_id
    where m.group_id = p_group_id and m.role = 'ATHLETE' and m.status = 'PENDING'
    order by m.created_at, m.id limit 50 offset p_offset;
end $$;


--
-- Name: lookup_billing_subscription(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.lookup_billing_subscription(p_subscription_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ begin if session_user <> 'postgres' or current_setting('role',true) not in ('none','postgres') then perform app_private.billing_gate('LEGACY'); end if; return app_private.billing_canonical_lookup_billing_subscription(p_subscription_id); end $$;


--
-- Name: prepare_invitation_registration(text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prepare_invitation_registration(p_token_hash text, p_nonce_hash text, p_email text, p_registration jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_user public.users%rowtype; v_inv public.invitations%rowtype;
begin
    -- Auth bloquea primero su prueba efímera; limpiarlas antes de bloquear
    -- usuarios evita invertir ese orden durante una expiración concurrente.
    delete from app_private.invitation_registrations where expires_at <= now();
    if p_registration -> 'managed_claim' = 'true'::jsonb then
        -- Mismo orden de bloqueo que emisión y aceptación de activaciones.
        select * into v_user from public.users where id = (
          select invited_user_id from public.invitations where token = p_token_hash
            and activation_membership_id is not null
        ) for update;
        select * into v_inv from public.invitations where token = p_token_hash for update;
        if v_user.id is null or v_inv.id is null or v_inv.status <> 'PENDING'
          or v_inv.expires_at <= now() or v_user.account_status <> 'MANAGED'
          or v_user.auth_user_id is not null
          or lower(v_inv.email) is distinct from lower(p_email)
          or lower(v_user.email) is distinct from lower(p_email) then
            raise sqlstate 'PT404' using message = 'invitation_not_available';
        end if;
        if coalesce(p_registration ->> 'terms_version', '') <> '2026-09-21' then
            raise sqlstate 'PT400' using message = 'invalid_registration';
        end if;
        if app_private.is_minor(v_user.birthdate) and (
          not app_private.has_minor_consent(v_user.id)
          or not app_private.has_account_activation_consent(v_user.id)
        ) then raise sqlstate 'PT422' using message = 'guardian_consent_required'; end if;
    end if;
    insert into app_private.invitation_registrations(nonce_hash, token_hash, email, registration)
    values(p_nonce_hash, p_token_hash, lower(p_email), p_registration);
end $$;


--
-- Name: publish_group_announcement(uuid, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_group_announcement(p_group_id uuid, p_title text, p_body text, p_request_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_actor uuid; v_existing public.group_announcements;
begin
  v_actor := app_private.require_announcement_admin(p_group_id);
  if p_request_id is null or p_title is null or p_body is null
    or length(btrim(p_title)) not between 1 and 120 or length(btrim(p_body)) not between 1 and 5000
    or p_title !~ '[^[:space:]]' or p_body !~ '[^[:space:]]' then
    raise sqlstate 'PT400' using message='invalid_announcement';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,57));
  select * into v_existing from public.group_announcements where id=p_request_id;
  if found then
    if v_existing.group_id=p_group_id and v_existing.created_by=v_actor and v_existing.deleted_at is null
      and v_existing.title=btrim(p_title) and v_existing.body=btrim(p_body) then return v_existing.id; end if;
    raise sqlstate 'PT409' using message='announcement_request_conflict';
  end if;
  insert into public.group_announcements(id,group_id,title,body,created_by)
    values(p_request_id,p_group_id,btrim(p_title),btrim(p_body),v_actor);
  -- EXISTS evita duplicados de usuarios multirol; solo dispositivos opt-in actuales.
  insert into app_private.announcement_push_deliveries(announcement_id,user_id,push_token_id)
    select p_request_id,t.user_id,t.id from public.push_tokens t
    join public.announcement_push_preferences pref on pref.user_id=t.user_id and pref.enabled
    join public.users u on u.id=t.user_id and u.account_status='ACTIVE'
    where t.is_active and exists(select 1 from public.memberships m where m.user_id=t.user_id and m.group_id=p_group_id and m.status='ACTIVE');
  return p_request_id;
end $$;


--
-- Name: reactivate_membership(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reactivate_membership(p_group_id uuid, p_membership_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select app_private.change_membership_status(p_group_id, p_membership_id, true)
$$;


--
-- Name: record_announcement_push_run(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_announcement_push_run(p_processed integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform 1 from app_private.announcement_executor where mode in ('LEGACY','DRAINING') for share;
  if not found then raise exception using errcode='55000',message='Ejecutor anterior deshabilitado'; end if;
  perform app_private.canonical_record_announcement_push_run(p_processed);
end $$;


--
-- Name: record_attendance_bulk(uuid, jsonb, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_attendance_bulk(p_activity_id uuid, p_records jsonb, p_only_unmarked boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
    v_group_id uuid; v_is_admin boolean; v_record jsonb; v_mid uuid; v_existing boolean;
    v_user_id uuid := public.auth_user_id(); v_recorded_at timestamptz;
    v_created integer := 0; v_updated integer := 0; v_summary jsonb; v_records jsonb;
begin
    v_group_id := app_private.lock_attendance_activity(p_activity_id);
    v_is_admin := public.is_group_admin(v_group_id);
    if p_records is null or jsonb_typeof(p_records) <> 'array' then
        raise sqlstate 'PT400' using message = 'invalid_attendance_batch';
    end if;
    if jsonb_array_length(p_records) not between 1 and 500 then
        raise sqlstate 'PT400' using message = 'invalid_attendance_batch';
    end if;
    for v_record in select value from jsonb_array_elements(p_records) loop
        if jsonb_typeof(v_record) <> 'object' then
            raise sqlstate 'PT400' using message = 'invalid_attendance_batch';
        end if;
        if not (v_record ?& array['membership_id','status'])
          or v_record - array['membership_id','status','note'] <> '{}'::jsonb
          or jsonb_typeof(v_record->'membership_id') <> 'string'
          or (v_record->>'membership_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          or jsonb_typeof(v_record->'status') <> 'string'
          or (v_record->>'status') not in ('PRESENT','ABSENT','LATE','EXCUSED')
          or (v_record ? 'note' and (jsonb_typeof(v_record->'note') not in ('string','null') or length(v_record->>'note') > 500)) then
            raise sqlstate 'PT400' using message = 'invalid_attendance_batch';
        end if;
        if not v_is_admin and v_record ? 'note' then
            raise sqlstate 'PT403' using message = 'attendance_notes_admin_required';
        end if;
    end loop;
    if (select count(distinct (value->>'membership_id')::uuid) from jsonb_array_elements(p_records)) <> jsonb_array_length(p_records) then
        raise sqlstate 'PT400' using message = 'duplicate_membership';
    end if;
    -- Bloquea todas las membresías antes de escribir; un lote inválido no deja
    -- filas parciales ni puede activarse sobre otro rol/grupo durante la RPC.
    perform 1 from public.memberships where id in (
      select (value->>'membership_id')::uuid from jsonb_array_elements(p_records)
    ) order by id for share;
    if exists (
      select 1 from jsonb_array_elements(p_records) i
      left join public.memberships m on m.id = (i.value->>'membership_id')::uuid
      where m.id is null or m.group_id <> v_group_id or m.role <> 'ATHLETE' or m.status <> 'ACTIVE'
    ) then raise sqlstate 'PT422' using message = 'membership_not_athlete_in_group'; end if;

    v_recorded_at := clock_timestamp();
    for v_record in select value from jsonb_array_elements(p_records) loop
        v_mid := (v_record->>'membership_id')::uuid;
        select exists(select 1 from public.attendance_records where activity_id = p_activity_id and membership_id = v_mid) into v_existing;
        if coalesce(p_only_unmarked, false) and v_existing then continue; end if;
        insert into public.attendance_records(activity_id, membership_id, status, note, recorded_by, recorded_at)
        values(p_activity_id, v_mid, v_record->>'status', nullif(trim(v_record->>'note'), ''), v_user_id, v_recorded_at)
        on conflict(activity_id, membership_id) do update set
          status = excluded.status,
          note = case when v_record ? 'note' then excluded.note else public.attendance_records.note end,
          recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at;
        if v_existing then v_updated := v_updated + 1; else v_created := v_created + 1; end if;
    end loop;
    select jsonb_build_object('PRESENT', count(*) filter(where status='PRESENT'),
      'ABSENT', count(*) filter(where status='ABSENT'), 'LATE', count(*) filter(where status='LATE'),
      'EXCUSED', count(*) filter(where status='EXCUSED')) into v_summary
    from public.attendance_records where activity_id = p_activity_id;
    select coalesce(jsonb_agg(jsonb_build_object('membership_id', membership_id, 'status', status, 'note', case when v_is_admin then note end) order by membership_id), '[]'::jsonb)
    into v_records from public.attendance_records where activity_id = p_activity_id and membership_id in (
      select (value->>'membership_id')::uuid from jsonb_array_elements(p_records)
    );
    return jsonb_build_object('activity_id', p_activity_id, 'recorded_by', v_user_id, 'recorded_at', v_recorded_at,
      'created', v_created, 'updated', v_updated, 'summary', v_summary, 'records', v_records);
end $_$;


--
-- Name: register_announcement_push_token(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.register_announcement_push_token(p_token text, p_platform text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v_actor uuid := public.auth_user_id(); v_id uuid;
begin
  if v_actor is null or not exists(select 1 from public.users where id=v_actor and account_status='ACTIVE') then
    raise sqlstate 'PT401' using message='authentication_required';
  end if;
  if p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$'
    or p_platform is null or p_platform not in ('IOS','ANDROID') then
    raise sqlstate 'PT400' using message='invalid_push_token';
  end if;
  -- Solo reasigna un token después de que su propietario lo desregistre.
  perform pg_advisory_xact_lock(hashtextextended(p_token,57));
  if exists(select 1 from public.push_tokens where token=p_token and user_id<>v_actor and is_active) then
    raise sqlstate 'PT409' using message='push_token_unavailable';
  end if;
  insert into public.push_tokens(user_id,platform,token) values(v_actor,p_platform,p_token)
    on conflict(token) do update set user_id=excluded.user_id,platform=excluded.platform,is_active=true,last_seen_at=now()
    returning id into v_id;
  return v_id;
end $_$;


--
-- Name: reject_pending_membership(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_pending_membership(p_group_id uuid, p_membership_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO ''
    AS $$
    select app_private.review_pending_membership(p_group_id, p_membership_id, false)
$$;


--
-- Name: reject_subscription_creation(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_subscription_creation(p_subscription_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ begin if session_user <> 'postgres' or current_setting('role',true) not in ('none','postgres') then perform app_private.billing_gate('LEGACY'); end if; perform app_private.billing_canonical_reject_subscription_creation(p_subscription_id); return; end $$;


--
-- Name: request_birthdate_change(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_birthdate_change(p_birthdate date) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_user public.users%rowtype; v_id uuid;
begin
    select * into v_user from public.users where id = public.auth_user_id() and account_status = 'ACTIVE' for update;
    if v_user.id is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
    if p_birthdate is null or not app_private.is_minor(v_user.birthdate) or app_private.is_minor(p_birthdate)
      or extract(year from age(app_private.chile_today(), p_birthdate)) > 110 then
        raise exception using errcode = '22023', message = 'invalid_birthdate_request';
    end if;
    if not exists(select 1 from public.memberships where user_id = v_user.id and role = 'ATHLETE' and status in ('ACTIVE','PENDING')) then
        raise exception using errcode = '22023', message = 'birthdate_confirmation_not_required';
    end if;
    select id into v_id from public.birthdate_change_requests where user_id = v_user.id and status = 'PENDING' and requested_birthdate = p_birthdate;
    if v_id is not null then return v_id; end if;
    update public.birthdate_change_requests set status = 'CANCELLED', resolved_at = now() where user_id = v_user.id and status = 'PENDING';
    insert into public.birthdate_change_requests(user_id, old_birthdate, requested_birthdate) values(v_user.id, v_user.birthdate, p_birthdate) returning id into v_id;
    return v_id;
end $$;


--
-- Name: request_managed_activation(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_managed_activation(p_group_id uuid, p_membership_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_user public.users%rowtype; v_user_id uuid; v_actor uuid := public.auth_user_id();
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    select user_id into v_user_id from public.memberships
      where id = p_membership_id and group_id = p_group_id and role = 'ATHLETE';
    if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;
    select * into v_user from public.users where id = v_user_id for update;
    perform 1 from public.groups where id = p_group_id for update;
    perform 1 from public.memberships where group_id = p_group_id and user_id = v_actor
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if v_user.account_status <> 'MANAGED' or v_user.auth_user_id is not null then
        raise sqlstate 'PT409' using message = 'managed_account_required';
    end if;
    if v_user.email is null then raise sqlstate 'PT422' using message = 'managed_email_required'; end if;
    if not app_private.is_minor(v_user.birthdate) then return 'READY'; end if;
    if not app_private.has_minor_consent(v_user.id) then
        raise sqlstate 'PT422' using message = 'minor_requires_guardian_consent';
    end if;
    if app_private.has_account_activation_consent(v_user.id) then return 'READY'; end if;
    update app_private.managed_activation_requests set status = 'CANCELLED', resolved_at = now()
      where membership_id = p_membership_id and status = 'PENDING' and email <> v_user.email;
    insert into app_private.managed_activation_requests(membership_id,requested_by,email)
    values(p_membership_id,v_actor,v_user.email)
    on conflict(membership_id) where status = 'PENDING' do nothing;
    return 'CONSENT_PENDING';
end $$;


--
-- Name: review_birthdate_change(uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.review_birthdate_change(p_request_id uuid, p_group_id uuid, p_approve boolean) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_user_id uuid; v_request public.birthdate_change_requests%rowtype;
begin
    perform 1 from public.memberships where user_id = public.auth_user_id() and group_id = p_group_id and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise exception using errcode = 'P0002', message = 'request_not_found'; end if;
    select user_id into v_user_id from public.birthdate_change_requests where id = p_request_id;
    if v_user_id is null or v_user_id = public.auth_user_id() then raise exception using errcode = 'P0002', message = 'request_not_found'; end if;
    perform 1 from public.users where id = v_user_id for update;
    select * into v_request from public.birthdate_change_requests where id = p_request_id for update;
    if v_request.status <> 'PENDING' or not exists(select 1 from public.memberships where user_id = v_user_id and group_id = p_group_id and role = 'ATHLETE' and status in ('ACTIVE','PENDING')) then
        raise exception using errcode = 'P0002', message = 'request_not_found';
    end if;
    if p_approve is null then raise exception using errcode = '22023', message = 'invalid_decision'; end if;
    if not p_approve then
        update public.birthdate_change_requests set status = 'REJECTED', resolved_at = now() where id = p_request_id;
        return 'REJECTED';
    end if;
    insert into public.birthdate_change_approvals(request_id, group_id, approved_by)
      values(p_request_id, p_group_id, public.auth_user_id())
      on conflict(request_id, group_id) do update set approved_by = excluded.approved_by, approved_at = now();
    perform 1 from public.memberships am join public.birthdate_change_approvals a on a.approved_by = am.user_id and a.group_id = am.group_id
      where a.request_id = p_request_id and am.role = 'ADMIN' and am.status = 'ACTIVE' for share of am;
    -- Revalidar grupos y rol actual del aprobador: una aprobación deja de
    -- contar si su ADMIN pierde el rol mientras la solicitud está pendiente.
    if exists(select 1 from public.memberships m where m.user_id = v_user_id and m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')
      and not exists(select 1 from public.birthdate_change_approvals a join public.memberships admin_m
        on admin_m.user_id = a.approved_by and admin_m.group_id = a.group_id and admin_m.role = 'ADMIN' and admin_m.status = 'ACTIVE'
        where a.request_id = p_request_id and a.group_id = m.group_id)) then return 'PENDING'; end if;
    update public.birthdate_change_requests set status = 'APPROVED' where id = p_request_id;
    update public.users set birthdate = v_request.requested_birthdate where id = v_user_id and birthdate = v_request.old_birthdate;
    if not found then raise exception using errcode = '40001', message = 'birthdate_request_stale'; end if;
    -- Puede haber cumplido 18 durante la espera; en ese caso el trigger ya
    -- no necesita consumir la autorización, pero el flujo igual concluye.
    update public.birthdate_change_requests set status = 'APPLIED', resolved_at = now()
      where id = p_request_id and status = 'APPROVED';
    return 'APPLIED';
end $$;


--
-- Name: review_managed_activation(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.review_managed_activation(p_request_id uuid, p_accepted boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
    v_actor uuid := public.auth_user_id(); v_request app_private.managed_activation_requests%rowtype;
    v_user public.users%rowtype; v_user_id uuid; v_group uuid; v_guardianship uuid; v_consent uuid;
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if p_accepted is null then raise sqlstate 'PT400' using message = 'invalid_activation_request'; end if;
    select m.user_id, m.group_id into v_user_id, v_group
      from app_private.managed_activation_requests r join public.memberships m on m.id = r.membership_id
      where r.id = p_request_id and public.is_member(m.group_id) and public.is_guardian_of(m.user_id);
    if not found then raise sqlstate 'PT404' using message = 'activation_request_not_found'; end if;
    select * into v_user from public.users where id = v_user_id for update;
    perform 1 from public.groups where id = v_group for update;
    select * into v_request from app_private.managed_activation_requests where id = p_request_id for update;
    select id into v_guardianship from public.guardianships where athlete_user_id = v_user_id
      and guardian_user_id = v_actor and status = 'ACTIVE' for share;
    if not found or not public.is_member(v_group) or not app_private.is_minor(v_user.birthdate)
      or not exists(select 1 from public.users where id = v_actor and account_status = 'ACTIVE') then
        raise sqlstate 'PT404' using message = 'activation_request_not_found';
    end if;
    if v_request.status not in ('PENDING','APPROVED') or v_request.email is distinct from v_user.email
      or v_user.account_status <> 'MANAGED' or not exists(select 1 from public.memberships
        where user_id = v_request.requested_by and group_id = v_group and role = 'ADMIN' and status = 'ACTIVE') then
        raise sqlstate 'PT409' using message = 'activation_request_changed';
    end if;
    if v_request.status = 'APPROVED' then
        if not p_accepted or not exists(select 1 from public.consents where id = v_request.consent_id
          and guardianship_id = v_guardianship and revoked_at is null) then
            raise sqlstate 'PT409' using message = 'activation_request_changed';
        end if;
    elsif p_accepted then
        if not app_private.has_minor_consent(v_user_id) then
            raise sqlstate 'PT422' using message = 'minor_requires_guardian_consent';
        end if;
        insert into public.consents(guardianship_id,consent_type,terms_version,channel)
        values(v_guardianship,'ACCOUNT_ACTIVATION_MINOR','2026-09-21','IN_APP') returning id into v_consent;
        update app_private.managed_activation_requests set status = 'APPROVED', consent_id = v_consent, resolved_at = now()
          where id = p_request_id;
    else
        update app_private.managed_activation_requests set status = 'REJECTED', resolved_at = now() where id = p_request_id;
    end if;
    return jsonb_build_object('group_id',v_group,'membership_id',v_request.membership_id);
end $$;


--
-- Name: rotate_invite_code(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rotate_invite_code(p_group_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
    v_old_code text;
    v_new_code text;
begin
    if public.auth_user_id() is null then
        raise sqlstate 'PT401' using message = 'authentication_required';
    end if;
    if not public.is_member(p_group_id) then
        raise sqlstate 'PT404' using message = 'group_not_found';
    end if;
    -- La membresía queda bloqueada hasta completar la rotación; una
    -- revocación concurrente no puede intercalarse después de este control.
    perform 1 from public.memberships
    where user_id = public.auth_user_id() and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then
        raise sqlstate 'PT403' using message = 'admin_required';
    end if;
    select invite_code into v_old_code from public.groups where id = p_group_id for update;
    if v_old_code is null then
        raise sqlstate 'PT404' using message = 'group_not_found';
    end if;
    for attempt in 1..10 loop
        v_new_code := translate(encode(extensions.gen_random_bytes(6), 'base64'), '+/', 'AZ');
        if v_new_code = v_old_code then continue; end if;
        begin
            update public.groups set invite_code = v_new_code where id = p_group_id;
            return v_new_code;
        exception when unique_violation then
            -- Un código emitido a otro grupo durante la rotación se reintenta.
        end;
    end loop;
    raise sqlstate 'PT409' using message = 'invite_code_unavailable';
end $$;


--
-- Name: run_guardianship_majority(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.run_guardianship_majority() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform 1 from app_private.majority_executor where mode='LEGACY' for share;
  if not found then raise exception using errcode='55000',message='Ejecutor anterior deshabilitado'; end if;
  return app_private.majority_transition();
end $$;


--
-- Name: self_checkin(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.self_checkin(p_activity_id uuid, p_token text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v_user uuid := public.auth_user_id(); v_activity public.activities;
  v_settings app_private.qr_checkin_settings; v_membership uuid;
  v_secret bytea; v_now timestamptz; v_status text; v_record public.attendance_records; v_created boolean := false;
begin
  if v_user is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  select a.* into v_activity from public.activities a
    where a.id = p_activity_id and public.is_member(a.group_id) for update;
  if not found then raise sqlstate 'PT404' using message = 'checkin_not_available'; end if;
  select id into v_membership from public.memberships
    where group_id = v_activity.group_id and user_id = v_user and role = 'ATHLETE' and status = 'ACTIVE' for share;
  if not found then
    raise sqlstate 'PT404' using message = 'checkin_not_available';
  end if;
  select s.* into v_settings from app_private.qr_checkin_settings s where group_id = v_activity.group_id for share;
  select secret into v_secret from app_private.qr_checkin_keys where activity_id = p_activity_id;
  v_now := clock_timestamp();
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' or v_secret is null
    or p_token <> app_private.qr_checkin_token(p_activity_id, v_secret, v_now) then
    raise sqlstate 'PT422' using message = 'checkin_qr_expired';
  end if;
  v_status := app_private.qr_checkin_status(v_activity.starts_at, v_now, v_settings.opens_before_minutes,
    v_settings.closes_after_minutes, v_settings.late_after_minutes);
  if v_status is null then raise sqlstate 'PT422' using message = 'checkin_window_closed'; end if;
  -- Nunca modifica una marca previa (incluidos ABSENT/EXCUSED manuales).
  -- El bloqueo de actividad serializa escaneos y las RPC de ADMIN/COACH.
  select r.* into v_record from public.attendance_records r
    where activity_id = p_activity_id and membership_id = v_membership;
  if not found then
    insert into public.attendance_records(activity_id, membership_id, status, recorded_by, recorded_at)
      values(p_activity_id, v_membership, v_status, v_user, v_now) returning * into v_record;
    v_created := true;
  end if;
  return jsonb_build_object('activity_id', p_activity_id, 'group_id', v_activity.group_id,
    'activity_title', v_activity.title, 'status', v_record.status, 'recorded_at', v_record.recorded_at, 'created', v_created);
end $_$;


--
-- Name: set_announcement_push_enabled(boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_announcement_push_enabled(p_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_actor uuid := public.auth_user_id();
begin
  if v_actor is null then raise sqlstate 'PT401' using message='authentication_required'; end if;
  if p_enabled is null then raise sqlstate 'PT400' using message='invalid_push_preference'; end if;
  insert into public.announcement_push_preferences(user_id,enabled) values(v_actor,p_enabled)
    on conflict(user_id) do update set enabled=excluded.enabled;
  if not p_enabled then
    update app_private.announcement_push_deliveries set status='CANCELLED',completed_at=now(),claim_token=null
      where user_id=v_actor and status='PENDING';
  end if;
end $$;


--
-- Name: set_avatar_permission(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_avatar_permission(p_guardianship_id uuid, p_allow boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_athlete uuid; v_terms text; v_consent uuid;
begin
    if public.auth_user_id() is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
    select athlete_user_id into v_athlete from public.guardianships
    where id = p_guardianship_id and guardian_user_id = public.auth_user_id() and status = 'ACTIVE';
    if v_athlete is null then raise exception using errcode = 'P0002', message = 'guardianship_not_found'; end if;
    perform 1 from public.users where id = v_athlete and app_private.is_minor(birthdate) for update;
    if not found or p_allow is null then raise exception using errcode = '22023', message = 'invalid_avatar_permission'; end if;
    perform 1 from public.guardianships where id = p_guardianship_id and status = 'ACTIVE' for share;
    if not found then raise exception using errcode = 'P0002', message = 'guardianship_not_found'; end if;
    select terms_version into v_terms from public.consents where guardianship_id = p_guardianship_id
      and consent_type = 'DATA_PROCESSING_MINOR' and revoked_at is null and granted_at <= now()
      order by granted_at desc, id limit 1;
    if v_terms is null then raise exception using errcode = 'P0001', message = 'minor_consent_required'; end if;
    -- El perfil bloqueado serializa decisiones/lecturas del invariante.
    insert into public.consents(guardianship_id,consent_type,terms_version,channel,allows_avatar)
      values(p_guardianship_id,'DATA_PROCESSING_MINOR',v_terms,'IN_APP',p_allow) returning id into v_consent;
    update public.consents set revoked_at = now() where guardianship_id = p_guardianship_id and consent_type = 'DATA_PROCESSING_MINOR' and revoked_at is null and id <> v_consent;
    if not app_private.has_minor_consent(v_athlete, true) then update public.users set avatar_url = null where id = v_athlete; end if;
end $$;


--
-- Name: set_qr_checkin_settings(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_qr_checkin_settings(p_group_id uuid, p_settings jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare v_value jsonb; v_open integer; v_close integer; v_late integer;
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
  perform 1 from public.memberships where group_id = p_group_id and user_id = public.auth_user_id()
    and role = 'ADMIN' and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object'
    or not (p_settings ?& array['opens_before_minutes','closes_after_minutes','late_after_minutes'])
    or p_settings - array['opens_before_minutes','closes_after_minutes','late_after_minutes'] <> '{}'::jsonb then
    raise sqlstate 'PT400' using message = 'invalid_qr_settings';
  end if;
  for v_value in select value from jsonb_each(p_settings) loop
    if jsonb_typeof(v_value) <> 'number' or v_value::text !~ '^[0-9]{1,4}$' then
      raise sqlstate 'PT400' using message = 'invalid_qr_settings';
    end if;
  end loop;
  v_open := (p_settings->>'opens_before_minutes')::integer;
  v_close := (p_settings->>'closes_after_minutes')::integer;
  v_late := (p_settings->>'late_after_minutes')::integer;
  if v_open not between 0 and 1440 or v_close not between 1 and 1440 or v_late not between 0 and v_close then
    raise sqlstate 'PT400' using message = 'invalid_qr_settings';
  end if;
  insert into app_private.qr_checkin_settings values(p_group_id, v_open, v_close, v_late)
    on conflict(group_id) do update set opens_before_minutes = excluded.opens_before_minutes,
      closes_after_minutes = excluded.closes_after_minutes, late_after_minutes = excluded.late_after_minutes;
  return p_settings;
end $_$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
    new.updated_at := now();
    return new;
end;
$$;


--
-- Name: sync_group_subscription(uuid, text, text, timestamp with time zone, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_group_subscription(p_subscription_id uuid, p_provider_id text, p_status text, p_provider_updated_at timestamp with time zone, p_next_payment_at timestamp with time zone, p_checkout_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ begin if session_user <> 'postgres' or current_setting('role',true) not in ('none','postgres') then perform app_private.billing_gate('LEGACY'); end if; perform app_private.billing_canonical_sync_group_subscription(p_subscription_id,p_provider_id,p_status,p_provider_updated_at,p_next_payment_at,p_checkout_url); return; end $$;


--
-- Name: sync_subscription_invoice(text, text, timestamp with time zone, integer, text, text, text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_subscription_invoice(p_provider_subscription_id text, p_invoice_id text, p_due_at timestamp with time zone, p_amount_clp integer, p_currency text, p_status text, p_payment_id text, p_paid_at timestamp with time zone, p_provider_updated_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$ begin if session_user <> 'postgres' or current_setting('role',true) not in ('none','postgres') then perform app_private.billing_gate('LEGACY'); end if; perform app_private.billing_canonical_sync_subscription_invoice(p_provider_subscription_id,p_invoice_id,p_due_at,p_amount_clp,p_currency,p_status,p_payment_id,p_paid_at,p_provider_updated_at); return; end $$;


--
-- Name: unregister_announcement_push_token(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unregister_announcement_push_token(p_token text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message='authentication_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_token,57));
  update public.push_tokens set is_active=false where token=p_token and user_id=public.auth_user_id();
end $$;


--
-- Name: update_activity(uuid, uuid, uuid, text, timestamp with time zone, timestamp with time zone, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_activity(p_group_id uuid, p_activity_id uuid, p_activity_type_id uuid, p_title text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_description text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_scope text DEFAULT 'single'::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_activity public.activities; v_row public.activities; v_count integer := 0;
  v_start timestamp; v_end timestamp; v_new_start timestamptz; v_new_end timestamptz;
begin
  v_activity := app_private.lock_activity_series(p_group_id,p_activity_id);
  if p_scope is null or p_scope not in ('single','series') or (p_scope = 'series' and v_activity.recurrence_rule is null) then
    raise sqlstate 'PT400' using message = 'invalid_activity_scope';
  end if;
  if p_title is null or length(trim(p_title)) not between 3 and 120 or length(p_description) > 2000 or length(p_location) > 200 then
    raise sqlstate 'PT400' using message = 'invalid_activity';
  end if;
  if p_starts_at is null or p_ends_at is null or not isfinite(p_starts_at) or not isfinite(p_ends_at)
    or p_ends_at <= p_starts_at or p_ends_at - p_starts_at > interval '24 hours' then
    raise sqlstate 'PT422' using message = 'invalid_date_range';
  end if;
  perform 1 from public.activity_types where id = p_activity_type_id
    and (is_active or id = v_activity.activity_type_id) and (group_id is null or group_id = p_group_id) for share;
  if not found then raise sqlstate 'PT422' using message = 'invalid_activity_type'; end if;
  v_start := p_starts_at at time zone 'America/Santiago';
  v_end := p_ends_at at time zone 'America/Santiago';
  if p_scope = 'series' and v_start::date <> (v_activity.starts_at at time zone 'America/Santiago')::date then
    raise sqlstate 'PT422' using message = 'series_date_change';
  end if;
  for v_row in select a.* from public.activities a where a.group_id = p_group_id and (
    (p_scope = 'single' and a.id = p_activity_id) or
    (p_scope = 'series' and coalesce(a.recurrence_source_id,a.id) = coalesce(v_activity.recurrence_source_id,v_activity.id)
      and a.starts_at >= v_activity.starts_at and a.starts_at >= now()
      and not exists(select 1 from public.attendance_records r where r.activity_id = a.id))
  ) order by a.id loop
    if p_scope = 'single' then v_new_start := p_starts_at; v_new_end := p_ends_at;
    else
      v_new_start := app_private.activity_local_to_utc((v_row.starts_at at time zone 'America/Santiago')::date + v_start::time);
      v_new_end := app_private.activity_local_to_utc((v_row.starts_at at time zone 'America/Santiago')::date + (v_end::date - v_start::date) + v_end::time);
      if v_new_start < now() then raise sqlstate 'PT422' using message = 'invalid_date_range'; end if;
    end if;
    if v_new_end <= v_new_start or v_new_end - v_new_start > interval '24 hours' then
      raise sqlstate 'PT422' using message = 'invalid_date_range';
    end if;
    update public.activities set title = trim(p_title), activity_type_id = p_activity_type_id,
      description = nullif(trim(p_description),''), location = nullif(trim(p_location),''),
      starts_at = v_new_start, ends_at = v_new_end where id = v_row.id;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise sqlstate 'PT409' using message = 'no_editable_occurrences'; end if;
  return v_count;
end $$;


--
-- Name: update_attendance_record(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_attendance_record(p_record_id uuid, p_changes jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
    v_activity_id uuid;
    v_membership_id uuid;
    v_status text;
begin
    if public.auth_user_id() is null then
        raise sqlstate 'PT401' using message = 'authentication_required';
    end if;
    select r.activity_id into v_activity_id
    from public.attendance_records r join public.activities a on a.id = r.activity_id
    where r.id = p_record_id and public.is_member(a.group_id);
    if not found then raise sqlstate 'PT404' using message = 'attendance_record_not_found'; end if;

    -- Mismo orden de bloqueo que alta, desmarcado y edición/eliminación de
    -- actividades. Se relee el estado solo después de adquirir el bloqueo.
    perform app_private.lock_attendance_activity(v_activity_id);
    select membership_id, status into v_membership_id, v_status
    from public.attendance_records where id = p_record_id for update;
    if not found then raise sqlstate 'PT404' using message = 'attendance_record_not_found'; end if;

    if p_changes is null or jsonb_typeof(p_changes) <> 'object'
      or p_changes = '{}'::jsonb or p_changes - array['status','note'] <> '{}'::jsonb then
        raise sqlstate 'PT400' using message = 'invalid_attendance_changes';
    end if;

    -- La RPC canónica valida estados/notas y membresía, conserva la nota
    -- omitida y asigna recorded_by/recorded_at exclusivamente en el servidor.
    return public.record_attendance_bulk(v_activity_id, jsonb_build_array(
        jsonb_build_object('membership_id', v_membership_id, 'status', v_status) || p_changes
    ));
end $$;


--
-- Name: update_group_announcement(uuid, uuid, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_group_announcement(p_group_id uuid, p_announcement_id uuid, p_title text, p_body text, p_updated_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_updated timestamptz;
begin
  perform app_private.require_announcement_admin(p_group_id);
  if p_title is null or p_body is null or length(btrim(p_title)) not between 1 and 120
    or length(btrim(p_body)) not between 1 and 5000 or p_updated_at is null
    or p_title !~ '[^[:space:]]' or p_body !~ '[^[:space:]]' then
    raise sqlstate 'PT400' using message='invalid_announcement';
  end if;
  select updated_at into v_updated from public.group_announcements where id=p_announcement_id and group_id=p_group_id and deleted_at is null for update;
  if not found then raise sqlstate 'PT404' using message='announcement_not_found'; end if;
  if v_updated<>p_updated_at then raise sqlstate 'PT409' using message='announcement_changed'; end if;
  update public.group_announcements set title=btrim(p_title),body=btrim(p_body),updated_at=clock_timestamp() where id=p_announcement_id;
end $$;


--
-- Name: update_group_settings(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_group_settings(p_group_id uuid, p_changes jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_settings jsonb;
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
  perform 1 from public.memberships where group_id = p_group_id and user_id = public.auth_user_id()
    and role = 'ADMIN' and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb
    or p_changes - array['athletes_can_view_group_stats', 'guardians_can_view_group_stats'] <> '{}'::jsonb then
    raise sqlstate 'PT400' using message = 'invalid_group_settings';
  end if;
  if exists(select 1 from jsonb_each(p_changes) entry where jsonb_typeof(entry.value) <> 'boolean') then
    raise sqlstate 'PT400' using message = 'invalid_group_settings';
  end if;
  -- La combinación se hace sobre la fila bloqueada por UPDATE: cambiar un
  -- toggle nunca repone el valor obsoleto del otro desde otra pestaña.
  update public.groups set settings = settings || p_changes,
    settings_updated_by = public.auth_user_id(), settings_updated_at = clock_timestamp()
  where id = p_group_id returning settings into v_settings;
  return v_settings;
end $$;


--
-- Name: update_managed_member(uuid, uuid, text, date, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_managed_member(p_group_id uuid, p_membership_id uuid, p_full_name text, p_birthdate date, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
declare
    v_actor uuid := public.auth_user_id(); v_user uuid; v_profile public.users%rowtype;
    v_email text := nullif(lower(trim(p_email)), ''); v_pending boolean := false;
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    select user_id into v_user from public.memberships where id = p_membership_id and group_id = p_group_id;
    if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;
    select * into v_profile from public.users where id = v_user for update;
    perform 1 from public.groups where id = p_group_id for update;
    perform 1 from public.memberships where user_id = v_actor and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if v_profile.account_status <> 'MANAGED' then raise sqlstate 'PT403' using message = 'managed_profile_required'; end if;
    if p_full_name is null or length(trim(p_full_name)) not between 2 and 120
      or p_birthdate is null or not isfinite(p_birthdate) or p_birthdate >= app_private.chile_today()
      or extract(year from age(app_private.chile_today(), p_birthdate)) > 110
      or (v_email is not null and (length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
      or (p_phone is not null and p_phone !~ '^\+[1-9][0-9]{7,14}$') then
        raise sqlstate 'PT400' using message = 'invalid_managed_member';
    end if;
    -- La corrección de mayoría de edad conserva la protección multi-grupo de
    -- HU-GEN-04: registra solicitud para el flujo existente de aprobaciones.
    v_pending := app_private.is_minor(v_profile.birthdate) and not app_private.is_minor(p_birthdate)
      and exists(select 1 from public.memberships where user_id = v_user and role = 'ATHLETE' and status in ('ACTIVE','PENDING'));
    if v_pending then
        update public.birthdate_change_requests set status = 'CANCELLED', resolved_at = now()
          where user_id = v_user and status = 'PENDING';
        insert into public.birthdate_change_requests(user_id, old_birthdate, requested_birthdate)
          values(v_user, v_profile.birthdate, p_birthdate);
    end if;
    begin
        update public.users set full_name = trim(p_full_name), email = v_email, phone = p_phone,
          birthdate = case when v_pending then birthdate else p_birthdate end where id = v_user;
    exception when unique_violation then
        raise sqlstate 'PT409' using message = 'managed_email_unavailable';
    when check_violation then
        if sqlerrm = 'minor_requires_guardian_consent' then
            raise sqlstate 'PT422' using message = 'minor_requires_guardian_consent';
        end if;
        raise;
    end;
    return case when v_pending then 'BIRTHDATE_PENDING' else 'UPDATED' end;
end $_$;


--
-- Name: announcement_executor; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.announcement_executor (
    singleton boolean DEFAULT true NOT NULL,
    mode text DEFAULT 'LEGACY'::text NOT NULL,
    draining_since timestamp with time zone,
    activated_at timestamp with time zone,
    CONSTRAINT announcement_executor_mode_check CHECK ((mode = ANY (ARRAY['LEGACY'::text, 'DRAINING'::text, 'WORKER'::text]))),
    CONSTRAINT announcement_executor_singleton_check CHECK (singleton)
);


--
-- Name: announcement_push_deliveries; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.announcement_push_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    announcement_id uuid NOT NULL,
    user_id uuid NOT NULL,
    push_token_id uuid NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    claimed_until timestamp with time zone,
    claim_token uuid,
    ticket_id text,
    accepted_at timestamp with time zone,
    completed_at timestamp with time zone,
    failure_code text,
    CONSTRAINT announcement_push_deliveries_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'AWAITING_RECEIPT'::text, 'DELIVERED'::text, 'CANCELLED'::text, 'FAILED'::text])))
);


--
-- Name: attendance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.attendance_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    status text NOT NULL,
    note text,
    recorded_by uuid NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attendance_records_note_check CHECK ((length(note) <= 500)),
    CONSTRAINT attendance_records_status_check CHECK ((status = ANY (ARRAY['PRESENT'::text, 'ABSENT'::text, 'LATE'::text, 'EXCUSED'::text])))
);


--
-- Name: memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    group_id uuid NOT NULL,
    role text NOT NULL,
    status text NOT NULL,
    joined_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT memberships_role_check CHECK ((role = ANY (ARRAY['ADMIN'::text, 'ATHLETE'::text, 'GUARDIAN'::text, 'COACH'::text]))),
    CONSTRAINT memberships_status_check CHECK ((status = ANY (ARRAY['INVITED'::text, 'PENDING'::text, 'ACTIVE'::text, 'INACTIVE'::text])))
);


--
-- Name: attendance_report_counts; Type: VIEW; Schema: app_private; Owner: -
--

CREATE VIEW app_private.attendance_report_counts WITH (security_barrier='true') AS
 SELECT counts.group_id,
    counts.membership_id,
    counts.activity_type_id,
    counts.activity_date,
    metric.convened,
    metric.present,
    metric.late,
    metric.absent,
    metric.excused,
    metric.attendance_pct,
    metric.late_rate
   FROM (( SELECT m.group_id,
            m.id AS membership_id,
            a.activity_type_id,
            ((a.starts_at AT TIME ZONE 'America/Santiago'::text))::date AS activity_date,
            count(*) FILTER (WHERE (r.status = 'PRESENT'::text)) AS present,
            count(*) FILTER (WHERE (r.status = 'LATE'::text)) AS late,
            count(*) FILTER (WHERE (r.status = 'ABSENT'::text)) AS absent,
            count(*) FILTER (WHERE (r.status = 'EXCUSED'::text)) AS excused
           FROM ((public.attendance_records r
             JOIN public.memberships m ON ((m.id = r.membership_id)))
             JOIN public.activities a ON (((a.id = r.activity_id) AND (a.group_id = m.group_id))))
          WHERE ((m.role = 'ATHLETE'::text) AND (m.status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text])) AND (a.starts_at <= now()) AND (a.starts_at >= m.joined_at))
          GROUP BY m.group_id, m.id, a.activity_type_id, (((a.starts_at AT TIME ZONE 'America/Santiago'::text))::date)) counts
     CROSS JOIN LATERAL app_private.attendance_metrics(counts.present, counts.late, counts.absent, counts.excused) metric(convened, present, late, absent, excused, attendance_pct, late_rate));


--
-- Name: auth_attempts; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.auth_attempts (
    key text NOT NULL,
    count integer NOT NULL,
    reset_at timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL,
    CONSTRAINT auth_attempts_key_check CHECK ((key ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: auth_authority; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.auth_authority (
    singleton boolean DEFAULT true NOT NULL,
    mode text DEFAULT 'LEGACY'::text NOT NULL,
    frozen_at timestamp with time zone,
    activated_at timestamp with time zone,
    recovery_started_at timestamp with time zone,
    CONSTRAINT auth_authority_mode_check CHECK ((mode = ANY (ARRAY['LEGACY'::text, 'FROZEN'::text, 'NATIVE'::text]))),
    CONSTRAINT auth_authority_singleton_check CHECK (singleton)
);


--
-- Name: auth_credentials; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.auth_credentials (
    subject_id uuid NOT NULL,
    password_hash text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_credentials_password_hash_check CHECK (((length(password_hash) >= 20) AND (length(password_hash) <= 512)))
);


--
-- Name: auth_families; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.auth_families (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_id uuid NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auth_import_ledger; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.auth_import_ledger (
    subject_id uuid NOT NULL,
    profile_id uuid NOT NULL,
    source_digest text NOT NULL,
    recovery_required boolean NOT NULL,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: auth_oauth_transactions; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.auth_oauth_transactions (
    id uuid NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    consumed_at timestamp with time zone,
    link_subject_id uuid,
    link_session_id uuid,
    CONSTRAINT auth_oauth_transactions_check CHECK (((link_subject_id IS NULL) = (link_session_id IS NULL)))
);


--
-- Name: auth_recovery; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.auth_recovery (
    token_hash text NOT NULL,
    subject_id uuid NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '01:00:00'::interval) NOT NULL,
    consumed_at timestamp with time zone,
    CONSTRAINT auth_recovery_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: auth_refresh; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.auth_refresh (
    token_hash text NOT NULL,
    family_id uuid NOT NULL,
    consumed_at timestamp with time zone,
    CONSTRAINT auth_refresh_token_hash_check CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: auth_social_identities; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.auth_social_identities (
    provider text NOT NULL,
    provider_subject text NOT NULL,
    subject_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_social_identities_provider_check CHECK ((provider = ANY (ARRAY['google'::text, 'apple'::text]))),
    CONSTRAINT auth_social_identities_provider_subject_check CHECK (((length(provider_subject) >= 1) AND (length(provider_subject) <= 255)))
);


--
-- Name: auth_subjects; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.auth_subjects (
    id uuid NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    disabled_until timestamp with time zone,
    native_owned boolean DEFAULT false NOT NULL
);


--
-- Name: billing_legacy_groups; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.billing_legacy_groups (
    group_id uuid NOT NULL
);


--
-- Name: billing_transport; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.billing_transport (
    singleton boolean DEFAULT true NOT NULL,
    mode text NOT NULL,
    CONSTRAINT billing_transport_mode_check CHECK ((mode = ANY (ARRAY['LEGACY'::text, 'NEST'::text]))),
    CONSTRAINT billing_transport_singleton_check CHECK (singleton)
);


--
-- Name: guardianship_majority_deliveries; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.guardianship_majority_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    athlete_user_id uuid NOT NULL,
    recipient_user_id uuid NOT NULL,
    audience text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    claimed_at timestamp with time zone,
    claim_token uuid,
    attempts integer DEFAULT 0 NOT NULL,
    retry_at timestamp with time zone DEFAULT now() NOT NULL,
    first_attempt_at timestamp with time zone,
    blocked_at timestamp with time zone,
    payload jsonb,
    CONSTRAINT guardianship_majority_deliveries_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT guardianship_majority_deliveries_audience_check CHECK ((audience = ANY (ARRAY['ATHLETE'::text, 'GUARDIAN'::text, 'ADMIN'::text])))
);


--
-- Name: invitation_attempts; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.invitation_attempts (
    key text NOT NULL,
    attempts timestamp with time zone[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invitation_attempts_key_check CHECK ((key ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: invitation_registrations; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.invitation_registrations (
    nonce_hash text NOT NULL,
    token_hash text NOT NULL,
    email text NOT NULL,
    registration jsonb NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:02:00'::interval) NOT NULL,
    CONSTRAINT invitation_registrations_nonce_hash_check CHECK ((nonce_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: invitation_send_limits; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.invitation_send_limits (
    group_id uuid NOT NULL,
    day date NOT NULL,
    attempts integer NOT NULL,
    CONSTRAINT invitation_send_limits_attempts_check CHECK (((attempts >= 1) AND (attempts <= 50)))
);


--
-- Name: join_code_attempts; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.join_code_attempts (
    user_id uuid NOT NULL,
    attempts timestamp with time zone[] NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: majority_executor; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.majority_executor (
    singleton boolean DEFAULT true NOT NULL,
    mode text DEFAULT 'LEGACY'::text NOT NULL,
    draining_since timestamp with time zone,
    email_next_at timestamp with time zone,
    CONSTRAINT majority_executor_mode_check CHECK ((mode = ANY (ARRAY['LEGACY'::text, 'DRAINING'::text, 'WORKER'::text]))),
    CONSTRAINT majority_executor_singleton_check CHECK (singleton)
);


--
-- Name: majority_tasks; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.majority_tasks (
    run_date date NOT NULL,
    completed_at timestamp with time zone,
    lease_until timestamp with time zone,
    lease_token uuid,
    attempts integer DEFAULT 0 NOT NULL,
    CONSTRAINT majority_tasks_attempts_check CHECK ((attempts >= 0))
);


--
-- Name: managed_activation_requests; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.managed_activation_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    membership_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    email text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    consent_id uuid,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT managed_activation_requests_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'REJECTED'::text, 'CANCELLED'::text])))
);


--
-- Name: managed_member_enrollments; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.managed_member_enrollments (
    membership_id uuid NOT NULL,
    guardianship_id uuid NOT NULL,
    declared_by uuid NOT NULL,
    declared_at timestamp with time zone DEFAULT now() NOT NULL,
    activated_at timestamp with time zone
);


--
-- Name: qr_checkin_keys; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.qr_checkin_keys (
    activity_id uuid NOT NULL,
    secret bytea DEFAULT extensions.gen_random_bytes(32) NOT NULL,
    CONSTRAINT qr_checkin_keys_secret_check CHECK ((octet_length(secret) = 32))
);


--
-- Name: qr_checkin_settings; Type: TABLE; Schema: app_private; Owner: -
--

CREATE TABLE app_private.qr_checkin_settings (
    group_id uuid NOT NULL,
    opens_before_minutes integer DEFAULT 15 NOT NULL,
    closes_after_minutes integer DEFAULT 60 NOT NULL,
    late_after_minutes integer DEFAULT 10 NOT NULL,
    CONSTRAINT qr_checkin_settings_check CHECK (((late_after_minutes >= 0) AND (late_after_minutes <= closes_after_minutes))),
    CONSTRAINT qr_checkin_settings_closes_after_minutes_check CHECK (((closes_after_minutes >= 1) AND (closes_after_minutes <= 1440))),
    CONSTRAINT qr_checkin_settings_opens_before_minutes_check CHECK (((opens_before_minutes >= 0) AND (opens_before_minutes <= 1440)))
);


--
-- Name: account_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    terms_version text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    channel text NOT NULL,
    CONSTRAINT account_consents_channel_check CHECK ((channel = ANY (ARRAY['EMAIL_SIGNUP'::text, 'INVITATION'::text, 'IN_APP'::text]))),
    CONSTRAINT account_consents_terms_version_check CHECK ((length(TRIM(BOTH FROM terms_version)) > 0))
);


--
-- Name: activity_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid,
    name text NOT NULL,
    color text DEFAULT '#6B7280'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT activity_types_color_check CHECK ((color ~ '^#[0-9a-fA-F]{6}$'::text)),
    CONSTRAINT activity_types_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 2) AND (length(TRIM(BOTH FROM name)) <= 40)))
);


--
-- Name: announcement_push_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcement_push_preferences (
    user_id uuid NOT NULL,
    enabled boolean DEFAULT false NOT NULL
);


--
-- Name: billing_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_plans (
    code text NOT NULL,
    name text NOT NULL,
    amount_clp integer NOT NULL,
    athlete_limit integer NOT NULL,
    currency text DEFAULT 'CLP'::text NOT NULL,
    CONSTRAINT billing_plans_amount_clp_check CHECK ((amount_clp > 0)),
    CONSTRAINT billing_plans_athlete_limit_check CHECK ((athlete_limit > 0)),
    CONSTRAINT billing_plans_code_check CHECK ((code = ANY (ARRAY['TEAM'::text, 'CLUB'::text, 'ACADEMY'::text]))),
    CONSTRAINT billing_plans_currency_check CHECK ((currency = 'CLP'::text))
);


--
-- Name: birthdate_change_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.birthdate_change_approvals (
    request_id uuid NOT NULL,
    group_id uuid NOT NULL,
    approved_by uuid NOT NULL,
    approved_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: birthdate_change_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.birthdate_change_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    old_birthdate date NOT NULL,
    requested_birthdate date NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    CONSTRAINT birthdate_change_requests_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'APPLIED'::text, 'REJECTED'::text, 'CANCELLED'::text])))
);


--
-- Name: consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guardianship_id uuid NOT NULL,
    consent_type text NOT NULL,
    terms_version text NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    channel text,
    allows_avatar boolean DEFAULT false NOT NULL,
    CONSTRAINT consents_channel_check CHECK ((channel = ANY (ARRAY['EMAIL_LINK'::text, 'IN_APP'::text]))),
    CONSTRAINT consents_check CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at))),
    CONSTRAINT consents_consent_type_check CHECK ((consent_type = ANY (ARRAY['DATA_PROCESSING_MINOR'::text, 'ACCOUNT_ACTIVATION_MINOR'::text]))),
    CONSTRAINT consents_terms_version_check CHECK ((length(TRIM(BOTH FROM terms_version)) > 0))
);


--
-- Name: group_announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT group_announcements_body_check CHECK (((length(btrim(body)) >= 1) AND (length(btrim(body)) <= 5000) AND (body ~ '[^[:space:]]'::text))),
    CONSTRAINT group_announcements_title_check CHECK (((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 120) AND (title ~ '[^[:space:]]'::text)))
);


--
-- Name: group_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.group_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    plan_code text NOT NULL,
    amount_clp integer NOT NULL,
    athlete_limit integer NOT NULL,
    requested_by uuid NOT NULL,
    status text DEFAULT 'CREATING'::text NOT NULL,
    provider_subscription_id text,
    checkout_url text,
    creation_attempted_at timestamp with time zone,
    provider_updated_at timestamp with time zone,
    next_payment_at timestamp with time zone,
    activated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT group_subscriptions_amount_clp_check CHECK ((amount_clp > 0)),
    CONSTRAINT group_subscriptions_athlete_limit_check CHECK ((athlete_limit > 0)),
    CONSTRAINT group_subscriptions_status_check CHECK ((status = ANY (ARRAY['CREATING'::text, 'PENDING'::text, 'AUTHORIZED'::text, 'PAUSED'::text, 'CANCELLED'::text, 'FAILED'::text])))
);


--
-- Name: groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sport text,
    description text,
    logo_url text,
    invite_code text NOT NULL,
    settings jsonb DEFAULT '{"athletes_can_view_group_stats": false, "guardians_can_view_group_stats": false}'::jsonb NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    settings_updated_by uuid,
    settings_updated_at timestamp with time zone,
    CONSTRAINT groups_invite_code_check CHECK ((invite_code ~ '^[A-Za-z0-9]{8}$'::text)),
    CONSTRAINT groups_logo_url_format CHECK (((logo_url IS NULL) OR (logo_url = ''::text) OR (logo_url ~ '^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$'::text))),
    CONSTRAINT groups_name_check CHECK (((length(TRIM(BOTH FROM name)) >= 3) AND (length(TRIM(BOTH FROM name)) <= 80))),
    CONSTRAINT groups_settings_check CHECK (((jsonb_typeof((settings -> 'athletes_can_view_group_stats'::text)) = 'boolean'::text) AND (jsonb_typeof((settings -> 'guardians_can_view_group_stats'::text)) = 'boolean'::text) AND (settings ?& ARRAY['athletes_can_view_group_stats'::text, 'guardians_can_view_group_stats'::text]) AND ((settings - ARRAY['athletes_can_view_group_stats'::text, 'guardians_can_view_group_stats'::text]) = '{}'::jsonb))),
    CONSTRAINT groups_sport_format CHECK (((sport IS NULL) OR ((length(TRIM(BOTH FROM sport)) >= 2) AND (length(TRIM(BOTH FROM sport)) <= 50))))
);


--
-- Name: guardianships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guardianships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    guardian_user_id uuid NOT NULL,
    athlete_user_id uuid NOT NULL,
    relationship text NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deactivated_at timestamp with time zone,
    CONSTRAINT guardianships_check CHECK ((guardian_user_id <> athlete_user_id)),
    CONSTRAINT guardianships_relationship_check CHECK (((length(TRIM(BOTH FROM relationship)) >= 2) AND (length(TRIM(BOTH FROM relationship)) <= 40))),
    CONSTRAINT guardianships_status_check CHECK ((status = ANY (ARRAY['ACTIVE'::text, 'INACTIVE'::text])))
);


--
-- Name: invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    email text,
    role text NOT NULL,
    token text NOT NULL,
    invited_user_id uuid,
    status text DEFAULT 'PENDING'::text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    terms_version text,
    activation_membership_id uuid,
    CONSTRAINT invitations_check CHECK (((email IS NOT NULL) OR (invited_user_id IS NOT NULL))),
    CONSTRAINT invitations_check1 CHECK (((expires_at > created_at) AND (expires_at <= (created_at + '7 days'::interval)))),
    CONSTRAINT invitations_role_check CHECK ((role = ANY (ARRAY['ATHLETE'::text, 'GUARDIAN'::text]))),
    CONSTRAINT invitations_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACCEPTED'::text, 'EXPIRED'::text]))),
    CONSTRAINT invitations_token_check CHECK ((token ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: job_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_name text NOT NULL,
    run_date date NOT NULL,
    completed_at timestamp with time zone DEFAULT now() NOT NULL,
    affected_count integer NOT NULL,
    CONSTRAINT job_runs_affected_count_check CHECK ((affected_count >= 0)),
    CONSTRAINT job_runs_job_name_check CHECK ((job_name = ANY (ARRAY['guardianship-majority'::text, 'send-announcement-push'::text])))
);


--
-- Name: push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    platform text NOT NULL,
    token text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT push_tokens_platform_check CHECK ((platform = ANY (ARRAY['IOS'::text, 'ANDROID'::text]))),
    CONSTRAINT push_tokens_token_check CHECK ((token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$'::text))
);


--
-- Name: subscription_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_invoices (
    provider_invoice_id text NOT NULL,
    subscription_id uuid NOT NULL,
    due_at timestamp with time zone NOT NULL,
    amount_clp integer NOT NULL,
    status text NOT NULL,
    provider_payment_id text,
    paid_at timestamp with time zone,
    provider_updated_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscription_invoices_amount_clp_check CHECK ((amount_clp > 0)),
    CONSTRAINT subscription_invoices_check CHECK (((status = 'PAID'::text) = (paid_at IS NOT NULL))),
    CONSTRAINT subscription_invoices_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'PAID'::text, 'CANCELLED'::text, 'REFUNDED'::text])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_user_id uuid,
    full_name text NOT NULL,
    email text,
    phone text,
    birthdate date,
    avatar_url text,
    account_status text DEFAULT 'ACTIVE'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_account_status_check CHECK ((account_status = ANY (ARRAY['ACTIVE'::text, 'INVITED'::text, 'MANAGED'::text]))),
    CONSTRAINT users_email_required_unless_managed CHECK (((account_status = 'MANAGED'::text) OR (email IS NOT NULL))),
    CONSTRAINT users_managed_has_no_auth_user CHECK (((account_status <> 'MANAGED'::text) OR (auth_user_id IS NULL)))
);


--
-- Name: TABLE users; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.users IS 'Perfiles de personas (ADMIN/ATHLETE/GUARDIAN por membresía). Desacoplada de auth.users para soportar cuentas MANAGED sin credenciales.';


--
-- Name: COLUMN users.auth_user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.auth_user_id IS 'Authentication subject UUID; legacy/native compatibility map in app_private.auth_subjects, NULL for MANAGED/INVITED without credentials.';


--
-- Name: v_activity_types; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_activity_types WITH (security_barrier='true') AS
 SELECT id,
    group_id,
    name,
    color,
    is_active
   FROM public.activity_types t
  WHERE (((group_id IS NULL) AND (public.auth_user_id() IS NOT NULL)) OR app_private.can_read_group_activities(group_id));


--
-- Name: v_athlete_attendance_history; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_athlete_attendance_history WITH (security_barrier='true') AS
 SELECT r.id,
    m.group_id,
    m.id AS membership_id,
    a.id AS activity_id,
    a.title,
    a.starts_at,
    t.id AS activity_type_id,
    t.name AS activity_type_name,
    t.color AS activity_type_color,
    (t.group_id IS NULL) AS is_system_type,
    r.status,
    r.note
   FROM (((public.attendance_records r
     JOIN public.memberships m ON ((m.id = r.membership_id)))
     JOIN public.activities a ON (((a.id = r.activity_id) AND (a.group_id = m.group_id))))
     JOIN public.activity_types t ON ((t.id = a.activity_type_id)))
  WHERE ((m.user_id = public.auth_user_id()) AND (m.role = 'ATHLETE'::text) AND (m.status = 'ACTIVE'::text) AND public.is_member(m.group_id) AND (a.starts_at <= now()) AND (a.starts_at >= m.joined_at));


--
-- Name: VIEW v_athlete_attendance_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_athlete_attendance_history IS 'HU-DEP-03: registros propios pasados y desde joined_at; notas propias, sin terceros ni ampliación por toggles o multirol.';


--
-- Name: v_attendance_admin; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_attendance_admin WITH (security_barrier='true') AS
 SELECT r.id,
    a.group_id,
    r.activity_id,
    r.membership_id,
    r.status,
    r.note,
    r.recorded_by,
    r.recorded_at
   FROM (public.attendance_records r
     JOIN public.activities a ON ((a.id = r.activity_id)))
  WHERE public.is_group_admin(a.group_id);


--
-- Name: v_attendance_operator; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_attendance_operator WITH (security_barrier='true') AS
 SELECT r.id,
    a.group_id,
    r.activity_id,
    r.membership_id,
    r.status,
        CASE
            WHEN public.is_group_admin(a.group_id) THEN r.note
            ELSE NULL::text
        END AS note
   FROM (public.attendance_records r
     JOIN public.activities a ON ((a.id = r.activity_id)))
  WHERE app_private.can_manage_attendance(a.group_id);


--
-- Name: v_attendance_own; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_attendance_own WITH (security_barrier='true') AS
 SELECT r.id,
    a.group_id,
    r.activity_id,
    r.membership_id,
    r.status,
    r.note,
    r.recorded_at
   FROM ((public.attendance_records r
     JOIN public.activities a ON ((a.id = r.activity_id)))
     JOIN public.memberships m ON ((m.id = r.membership_id)))
  WHERE (public.is_member(a.group_id) AND ((m.user_id = public.auth_user_id()) OR ((m.status = 'ACTIVE'::text) AND public.is_guardian_of(m.user_id) AND (EXISTS ( SELECT 1
           FROM public.memberships viewer
          WHERE ((viewer.user_id = public.auth_user_id()) AND (viewer.group_id = a.group_id) AND (viewer.role = 'GUARDIAN'::text) AND (viewer.status = 'ACTIVE'::text)))))));


--
-- Name: v_attendance_roster; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_attendance_roster WITH (security_barrier='true') AS
 SELECT m.id AS membership_id,
    m.group_id,
    u.full_name,
        CASE
            WHEN public.can_read_avatar(substr(u.avatar_url, (length('/profile/avatar/'::text) + 1))) THEN u.avatar_url
            ELSE NULL::text
        END AS avatar_url
   FROM (public.memberships m
     JOIN public.users u ON ((u.id = m.user_id)))
  WHERE ((m.role = 'ATHLETE'::text) AND (m.status = 'ACTIVE'::text) AND app_private.can_manage_attendance(m.group_id));


--
-- Name: v_group_activities; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_group_activities WITH (security_barrier='true') AS
 SELECT a.id,
    a.group_id,
    a.activity_type_id,
    a.title,
    a.description,
    a.location,
    a.starts_at,
    a.ends_at,
    t.name AS activity_type_name,
    t.color AS activity_type_color,
    (t.group_id IS NULL) AS is_system_type,
    a.recurrence_rule,
    a.recurrence_source_id
   FROM (public.activities a
     JOIN public.activity_types t ON ((t.id = a.activity_type_id)))
  WHERE app_private.can_read_group_activities(a.group_id);


--
-- Name: v_group_attendance_report; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_group_attendance_report WITH (security_barrier='true') AS
 SELECT group_id,
    membership_id,
    activity_type_id,
    activity_date,
    convened,
    present,
    late,
    absent,
    excused,
    attendance_pct,
    late_rate
   FROM app_private.attendance_report_counts
  WHERE public.is_group_admin(group_id);


--
-- Name: v_my_groups; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_my_groups WITH (security_barrier='true') AS
 SELECT g.id,
    g.name,
    g.sport,
    g.logo_url,
    array_agg(m.role ORDER BY m.role) AS roles
   FROM (public.groups g
     JOIN public.memberships m ON ((m.group_id = g.id)))
  WHERE ((m.user_id = ( SELECT public.auth_user_id() AS auth_user_id)) AND (m.status = 'ACTIVE'::text))
  GROUP BY g.id, g.name, g.sport, g.logo_url;


--
-- Name: VIEW v_my_groups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_my_groups IS 'Grupos y roles ACTIVE del usuario autenticado; una fila por grupo, sin datos de terceros.';


--
-- Name: v_group_detail; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_group_detail WITH (security_barrier='true') AS
 SELECT g.id,
    g.name,
    g.sport,
    g.description,
    g.logo_url,
    mine.roles,
        CASE
            WHEN public.is_group_admin(g.id) THEN g.invite_code
            ELSE NULL::text
        END AS invite_code,
        CASE
            WHEN public.is_group_admin(g.id) THEN g.settings
            ELSE NULL::jsonb
        END AS settings,
    app_private.can_view_group_stats(g.id) AS can_view_group_stats,
        CASE
            WHEN public.is_group_admin(g.id) THEN g.settings_updated_at
            ELSE NULL::timestamp with time zone
        END AS settings_updated_at,
        CASE
            WHEN public.is_group_admin(g.id) THEN author.full_name
            ELSE NULL::text
        END AS settings_updated_by_name
   FROM ((public.groups g
     JOIN public.v_my_groups mine ON ((mine.id = g.id)))
     LEFT JOIN public.users author ON ((author.id = g.settings_updated_by)))
  WHERE public.is_member(g.id);


--
-- Name: VIEW v_group_detail; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_group_detail IS 'Detalle de miembro ACTIVE; settings, código y autor/fecha solo ADMIN. can_view_group_stats expresa permiso efectivo actual.';


--
-- Name: v_group_stats_members; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_group_stats_members AS
SELECT
    NULL::uuid AS group_id,
    NULL::uuid AS membership_id,
    NULL::text AS full_name,
    NULL::text AS avatar_url,
    NULL::bigint AS convened,
    NULL::bigint AS present,
    NULL::bigint AS late,
    NULL::bigint AS absent,
    NULL::bigint AS excused,
    NULL::numeric AS attendance_pct,
    NULL::numeric AS late_rate;


--
-- Name: VIEW v_group_stats_members; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_group_stats_members IS 'Agregados de temporada por ATHLETE ACTIVE, autorizados por toggle vigente y rol; proyección mínima V5.';


--
-- Name: v_my_ward_groups; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_my_ward_groups WITH (security_barrier='true') AS
 SELECT gs.athlete_user_id,
    g.id AS group_id,
    g.name,
    g.sport,
    m.status AS membership_status
   FROM ((((public.guardianships gs
     JOIN public.users u ON ((u.id = gs.athlete_user_id)))
     JOIN public.memberships m ON (((m.user_id = u.id) AND (m.role = 'ATHLETE'::text) AND (m.status = ANY (ARRAY['ACTIVE'::text, 'PENDING'::text])))))
     JOIN public.groups g ON ((g.id = m.group_id)))
     JOIN public.memberships viewer ON (((viewer.group_id = g.id) AND (viewer.user_id = gs.guardian_user_id) AND (viewer.role = 'GUARDIAN'::text) AND (viewer.status = 'ACTIVE'::text))))
  WHERE ((gs.guardian_user_id = ( SELECT public.auth_user_id() AS auth_user_id)) AND (gs.status = 'ACTIVE'::text) AND public.is_guardian_of(u.id));


--
-- Name: v_my_wards; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_my_wards WITH (security_barrier='true') AS
 SELECT athlete_user_id,
    full_name,
    avatar_url,
    age,
    days_until_majority
   FROM public.list_my_wards() list_my_wards(athlete_user_id, full_name, avatar_url, age, days_until_majority);


--
-- Name: v_ward_attendance_history; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_ward_attendance_history WITH (security_barrier='true') AS
 SELECT r.id,
    m.group_id,
    m.user_id AS athlete_user_id,
    m.id AS membership_id,
    a.id AS activity_id,
    a.title,
    a.starts_at,
    t.id AS activity_type_id,
    t.name AS activity_type_name,
    t.color AS activity_type_color,
    (t.group_id IS NULL) AS is_system_type,
    r.status,
    r.note
   FROM ((((public.attendance_records r
     JOIN public.memberships m ON (((m.id = r.membership_id) AND (m.role = 'ATHLETE'::text) AND (m.status = 'ACTIVE'::text))))
     JOIN public.v_my_ward_groups w ON (((w.group_id = m.group_id) AND (w.athlete_user_id = m.user_id) AND (w.membership_status = 'ACTIVE'::text))))
     JOIN public.activities a ON (((a.id = r.activity_id) AND (a.group_id = m.group_id))))
     JOIN public.activity_types t ON ((t.id = a.activity_type_id)))
  WHERE ((a.starts_at <= now()) AND (a.starts_at >= m.joined_at));


--
-- Name: VIEW v_ward_attendance_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_ward_attendance_history IS 'HU-APO-03: solo historial de pupilos menores vigentes en grupos compartidos, independiente de toggles.';


--
-- Name: announcement_executor announcement_executor_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.announcement_executor
    ADD CONSTRAINT announcement_executor_pkey PRIMARY KEY (singleton);


--
-- Name: announcement_push_deliveries announcement_push_deliveries_announcement_id_push_token_id_key; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.announcement_push_deliveries
    ADD CONSTRAINT announcement_push_deliveries_announcement_id_push_token_id_key UNIQUE (announcement_id, push_token_id);


--
-- Name: announcement_push_deliveries announcement_push_deliveries_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.announcement_push_deliveries
    ADD CONSTRAINT announcement_push_deliveries_pkey PRIMARY KEY (id);


--
-- Name: auth_attempts auth_attempts_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_attempts
    ADD CONSTRAINT auth_attempts_pkey PRIMARY KEY (key);


--
-- Name: auth_authority auth_authority_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_authority
    ADD CONSTRAINT auth_authority_pkey PRIMARY KEY (singleton);


--
-- Name: auth_credentials auth_credentials_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_credentials
    ADD CONSTRAINT auth_credentials_pkey PRIMARY KEY (subject_id);


--
-- Name: auth_families auth_families_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_families
    ADD CONSTRAINT auth_families_pkey PRIMARY KEY (id);


--
-- Name: auth_import_ledger auth_import_ledger_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_import_ledger
    ADD CONSTRAINT auth_import_ledger_pkey PRIMARY KEY (subject_id);


--
-- Name: auth_oauth_transactions auth_oauth_transactions_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_oauth_transactions
    ADD CONSTRAINT auth_oauth_transactions_pkey PRIMARY KEY (id);


--
-- Name: auth_recovery auth_recovery_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_recovery
    ADD CONSTRAINT auth_recovery_pkey PRIMARY KEY (token_hash);


--
-- Name: auth_refresh auth_refresh_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_refresh
    ADD CONSTRAINT auth_refresh_pkey PRIMARY KEY (token_hash);


--
-- Name: auth_social_identities auth_social_identities_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_social_identities
    ADD CONSTRAINT auth_social_identities_pkey PRIMARY KEY (provider, provider_subject);


--
-- Name: auth_subjects auth_subjects_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_subjects
    ADD CONSTRAINT auth_subjects_pkey PRIMARY KEY (id);


--
-- Name: billing_legacy_groups billing_legacy_groups_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.billing_legacy_groups
    ADD CONSTRAINT billing_legacy_groups_pkey PRIMARY KEY (group_id);


--
-- Name: billing_transport billing_transport_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.billing_transport
    ADD CONSTRAINT billing_transport_pkey PRIMARY KEY (singleton);


--
-- Name: guardianship_majority_deliveries guardianship_majority_deliver_athlete_user_id_recipient_use_key; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.guardianship_majority_deliveries
    ADD CONSTRAINT guardianship_majority_deliver_athlete_user_id_recipient_use_key UNIQUE (athlete_user_id, recipient_user_id, audience);


--
-- Name: guardianship_majority_deliveries guardianship_majority_deliveries_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.guardianship_majority_deliveries
    ADD CONSTRAINT guardianship_majority_deliveries_pkey PRIMARY KEY (id);


--
-- Name: invitation_attempts invitation_attempts_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.invitation_attempts
    ADD CONSTRAINT invitation_attempts_pkey PRIMARY KEY (key);


--
-- Name: invitation_registrations invitation_registrations_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.invitation_registrations
    ADD CONSTRAINT invitation_registrations_pkey PRIMARY KEY (nonce_hash);


--
-- Name: invitation_send_limits invitation_send_limits_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.invitation_send_limits
    ADD CONSTRAINT invitation_send_limits_pkey PRIMARY KEY (group_id);


--
-- Name: join_code_attempts join_code_attempts_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.join_code_attempts
    ADD CONSTRAINT join_code_attempts_pkey PRIMARY KEY (user_id);


--
-- Name: majority_executor majority_executor_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.majority_executor
    ADD CONSTRAINT majority_executor_pkey PRIMARY KEY (singleton);


--
-- Name: majority_tasks majority_tasks_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.majority_tasks
    ADD CONSTRAINT majority_tasks_pkey PRIMARY KEY (run_date);


--
-- Name: managed_activation_requests managed_activation_requests_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.managed_activation_requests
    ADD CONSTRAINT managed_activation_requests_pkey PRIMARY KEY (id);


--
-- Name: managed_member_enrollments managed_member_enrollments_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.managed_member_enrollments
    ADD CONSTRAINT managed_member_enrollments_pkey PRIMARY KEY (membership_id);


--
-- Name: qr_checkin_keys qr_checkin_keys_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.qr_checkin_keys
    ADD CONSTRAINT qr_checkin_keys_pkey PRIMARY KEY (activity_id);


--
-- Name: qr_checkin_settings qr_checkin_settings_pkey; Type: CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.qr_checkin_settings
    ADD CONSTRAINT qr_checkin_settings_pkey PRIMARY KEY (group_id);


--
-- Name: account_consents account_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_consents
    ADD CONSTRAINT account_consents_pkey PRIMARY KEY (id);


--
-- Name: account_consents account_consents_user_id_terms_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_consents
    ADD CONSTRAINT account_consents_user_id_terms_version_key UNIQUE (user_id, terms_version);


--
-- Name: activities activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_pkey PRIMARY KEY (id);


--
-- Name: activity_types activity_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_types
    ADD CONSTRAINT activity_types_pkey PRIMARY KEY (id);


--
-- Name: announcement_push_preferences announcement_push_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_push_preferences
    ADD CONSTRAINT announcement_push_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: attendance_records attendance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);


--
-- Name: billing_plans billing_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_plans
    ADD CONSTRAINT billing_plans_pkey PRIMARY KEY (code);


--
-- Name: birthdate_change_approvals birthdate_change_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthdate_change_approvals
    ADD CONSTRAINT birthdate_change_approvals_pkey PRIMARY KEY (request_id, group_id);


--
-- Name: birthdate_change_requests birthdate_change_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthdate_change_requests
    ADD CONSTRAINT birthdate_change_requests_pkey PRIMARY KEY (id);


--
-- Name: consents consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consents
    ADD CONSTRAINT consents_pkey PRIMARY KEY (id);


--
-- Name: group_announcements group_announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_announcements
    ADD CONSTRAINT group_announcements_pkey PRIMARY KEY (id);


--
-- Name: group_subscriptions group_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_subscriptions
    ADD CONSTRAINT group_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: group_subscriptions group_subscriptions_provider_subscription_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_subscriptions
    ADD CONSTRAINT group_subscriptions_provider_subscription_id_key UNIQUE (provider_subscription_id);


--
-- Name: groups groups_invite_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_invite_code_key UNIQUE (invite_code);


--
-- Name: groups groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);


--
-- Name: guardianships guardianships_guardian_user_id_athlete_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardianships
    ADD CONSTRAINT guardianships_guardian_user_id_athlete_user_id_key UNIQUE (guardian_user_id, athlete_user_id);


--
-- Name: guardianships guardianships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardianships
    ADD CONSTRAINT guardianships_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_token_key UNIQUE (token);


--
-- Name: job_runs job_runs_job_name_run_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_runs
    ADD CONSTRAINT job_runs_job_name_run_date_key UNIQUE (job_name, run_date);


--
-- Name: job_runs job_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_runs
    ADD CONSTRAINT job_runs_pkey PRIMARY KEY (id);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (id);


--
-- Name: memberships memberships_user_id_group_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_user_id_group_id_role_key UNIQUE (user_id, group_id, role);


--
-- Name: push_tokens push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_pkey PRIMARY KEY (id);


--
-- Name: push_tokens push_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_token_key UNIQUE (token);


--
-- Name: subscription_invoices subscription_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_invoices
    ADD CONSTRAINT subscription_invoices_pkey PRIMARY KEY (provider_invoice_id);


--
-- Name: attendance_records uq_attendance; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT uq_attendance UNIQUE (activity_id, membership_id);


--
-- Name: users users_auth_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_auth_user_id_key UNIQUE (auth_user_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: announcement_push_pending; Type: INDEX; Schema: app_private; Owner: -
--

CREATE INDEX announcement_push_pending ON app_private.announcement_push_deliveries USING btree (next_attempt_at) WHERE (status = ANY (ARRAY['PENDING'::text, 'AWAITING_RECEIPT'::text]));


--
-- Name: auth_families_subject_id_idx; Type: INDEX; Schema: app_private; Owner: -
--

CREATE INDEX auth_families_subject_id_idx ON app_private.auth_families USING btree (subject_id);


--
-- Name: auth_social_identities_subject_id_idx; Type: INDEX; Schema: app_private; Owner: -
--

CREATE INDEX auth_social_identities_subject_id_idx ON app_private.auth_social_identities USING btree (subject_id);


--
-- Name: invitation_attempts_updated_at_idx; Type: INDEX; Schema: app_private; Owner: -
--

CREATE INDEX invitation_attempts_updated_at_idx ON app_private.invitation_attempts USING btree (updated_at);


--
-- Name: managed_activation_requests_membership_id_idx; Type: INDEX; Schema: app_private; Owner: -
--

CREATE UNIQUE INDEX managed_activation_requests_membership_id_idx ON app_private.managed_activation_requests USING btree (membership_id) WHERE (status = 'PENDING'::text);


--
-- Name: group_announcements_wall; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX group_announcements_wall ON public.group_announcements USING btree (group_id, created_at DESC, id DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_activities_group_starts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_group_starts ON public.activities USING btree (group_id, starts_at);


--
-- Name: idx_activities_recurrence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_recurrence ON public.activities USING btree (recurrence_source_id);


--
-- Name: idx_activities_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_type ON public.activities USING btree (activity_type_id);


--
-- Name: idx_attendance_membership; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_attendance_membership ON public.attendance_records USING btree (membership_id, status);


--
-- Name: idx_consents_guardianship; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consents_guardianship ON public.consents USING btree (guardianship_id) WHERE (revoked_at IS NULL);


--
-- Name: idx_group_subscription_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_group_subscription_history ON public.group_subscriptions USING btree (group_id, created_at DESC);


--
-- Name: idx_guardianships_athlete; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guardianships_athlete ON public.guardianships USING btree (athlete_user_id) WHERE (status = 'ACTIVE'::text);


--
-- Name: idx_guardianships_guardian; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_guardianships_guardian ON public.guardianships USING btree (guardian_user_id) WHERE (status = 'ACTIVE'::text);


--
-- Name: idx_invitations_group_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_group_created ON public.invitations USING btree (group_id, created_at DESC, id DESC);


--
-- Name: idx_memberships_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_group ON public.memberships USING btree (group_id, role, status);


--
-- Name: idx_memberships_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_user ON public.memberships USING btree (user_id);


--
-- Name: idx_subscription_invoices_history; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscription_invoices_history ON public.subscription_invoices USING btree (subscription_id, due_at DESC);


--
-- Name: uq_activity_types_group; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_activity_types_group ON public.activity_types USING btree (group_id, lower(name)) WHERE (group_id IS NOT NULL);


--
-- Name: uq_activity_types_system; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_activity_types_system ON public.activity_types USING btree (lower(name)) WHERE (group_id IS NULL);


--
-- Name: uq_group_open_subscription; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_group_open_subscription ON public.group_subscriptions USING btree (group_id) WHERE (status <> ALL (ARRAY['CANCELLED'::text, 'FAILED'::text]));


--
-- Name: uq_pending_birthdate_change; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_pending_birthdate_change ON public.birthdate_change_requests USING btree (user_id) WHERE (status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text]));


--
-- Name: uq_subscription_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_subscription_payment ON public.subscription_invoices USING btree (provider_payment_id) WHERE (provider_payment_id IS NOT NULL);


--
-- Name: uq_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_users_email ON public.users USING btree (lower(email)) WHERE (email IS NOT NULL);


--
-- Name: v_group_stats_members _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.v_group_stats_members WITH (security_barrier='true') AS
 SELECT counts.group_id,
    counts.membership_id,
    counts.full_name,
    counts.avatar_url,
    metric.convened,
    metric.present,
    metric.late,
    metric.absent,
    metric.excused,
    metric.attendance_pct,
    metric.late_rate
   FROM (( SELECT m.group_id,
            m.id AS membership_id,
            u.full_name,
                CASE
                    WHEN public.can_read_avatar(substr(u.avatar_url, (length('/profile/avatar/'::text) + 1))) THEN u.avatar_url
                    ELSE NULL::text
                END AS avatar_url,
            count(*) FILTER (WHERE (r.status = 'PRESENT'::text)) AS present,
            count(*) FILTER (WHERE (r.status = 'LATE'::text)) AS late,
            count(*) FILTER (WHERE (r.status = 'ABSENT'::text)) AS absent,
            count(*) FILTER (WHERE (r.status = 'EXCUSED'::text)) AS excused
           FROM ((public.memberships m
             JOIN public.users u ON ((u.id = m.user_id)))
             LEFT JOIN (public.attendance_records r
             JOIN public.activities a ON ((a.id = r.activity_id))) ON (((r.membership_id = m.id) AND (a.group_id = m.group_id) AND (a.starts_at <= now()) AND (a.starts_at >= m.joined_at))))
          WHERE ((m.role = 'ATHLETE'::text) AND (m.status = 'ACTIVE'::text) AND app_private.can_view_group_stats(m.group_id))
          GROUP BY m.group_id, m.id, u.id) counts
     CROSS JOIN LATERAL app_private.attendance_metrics(counts.present, counts.late, counts.absent, counts.excused) metric(convened, present, late, absent, excused, attendance_pct, late_rate));


--
-- Name: account_consents trg_account_consent_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_account_consent_history BEFORE DELETE OR UPDATE ON public.account_consents FOR EACH ROW EXECUTE FUNCTION app_private.protect_account_consent();


--
-- Name: activities trg_activities_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_activities_updated_at BEFORE UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: activities trg_activity_type; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_activity_type BEFORE INSERT OR UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION app_private.validate_activity_type();


--
-- Name: activity_types trg_activity_type_name; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_activity_type_name BEFORE INSERT OR UPDATE OF name ON public.activity_types FOR EACH ROW EXECUTE FUNCTION app_private.normalize_activity_type_name();


--
-- Name: memberships trg_athlete_guardian_memberships; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_athlete_guardian_memberships AFTER INSERT OR UPDATE ON public.memberships FOR EACH ROW WHEN ((new.role = 'ATHLETE'::text)) EXECUTE FUNCTION app_private.sync_guardian_memberships();


--
-- Name: attendance_records trg_attendance_membership; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_attendance_membership BEFORE INSERT OR UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION app_private.validate_attendance_membership();


--
-- Name: consents trg_consent_history; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_consent_history BEFORE DELETE OR UPDATE ON public.consents FOR EACH ROW EXECUTE FUNCTION app_private.protect_consent();


--
-- Name: consents trg_consent_minor_invariant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_consent_minor_invariant AFTER UPDATE ON public.consents FOR EACH ROW EXECUTE FUNCTION app_private.preserve_minor_consent();


--
-- Name: group_subscriptions trg_group_subscription_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_group_subscription_updated_at BEFORE UPDATE ON public.group_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: groups trg_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_groups_updated_at BEFORE UPDATE ON public.groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: guardianships trg_guardianship_consent_invariant; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guardianship_consent_invariant AFTER UPDATE ON public.guardianships FOR EACH ROW EXECUTE FUNCTION app_private.preserve_minor_consent();


--
-- Name: guardianships trg_guardianship_memberships; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guardianship_memberships AFTER INSERT OR UPDATE ON public.guardianships FOR EACH ROW WHEN ((new.status = 'ACTIVE'::text)) EXECUTE FUNCTION app_private.sync_guardian_memberships();


--
-- Name: guardianships trg_guardianship_minor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_guardianship_minor BEFORE INSERT OR DELETE OR UPDATE ON public.guardianships FOR EACH ROW EXECUTE FUNCTION app_private.validate_guardianship();


--
-- Name: memberships trg_membership_minor; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_membership_minor BEFORE INSERT OR UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION app_private.validate_membership();


--
-- Name: memberships trg_memberships_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_memberships_updated_at BEFORE UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users trg_profile_majority; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profile_majority AFTER UPDATE OF birthdate ON public.users FOR EACH ROW EXECUTE FUNCTION app_private.deactivate_adult_guardianships();


--
-- Name: users trg_profile_validation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profile_validation BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION app_private.validate_profile_update();


--
-- Name: memberships trg_subscription_capacity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_subscription_capacity BEFORE INSERT OR UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION app_private.enforce_subscription_capacity();


--
-- Name: activity_types trg_system_activity_type; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_system_activity_type BEFORE INSERT OR DELETE OR UPDATE ON public.activity_types FOR EACH ROW EXECUTE FUNCTION app_private.protect_system_activity_type();


--
-- Name: users trg_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: announcement_push_deliveries announcement_push_deliveries_announcement_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.announcement_push_deliveries
    ADD CONSTRAINT announcement_push_deliveries_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.group_announcements(id) ON DELETE RESTRICT;


--
-- Name: announcement_push_deliveries announcement_push_deliveries_push_token_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.announcement_push_deliveries
    ADD CONSTRAINT announcement_push_deliveries_push_token_id_fkey FOREIGN KEY (push_token_id) REFERENCES public.push_tokens(id) ON DELETE RESTRICT;


--
-- Name: announcement_push_deliveries announcement_push_deliveries_user_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.announcement_push_deliveries
    ADD CONSTRAINT announcement_push_deliveries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: auth_credentials auth_credentials_subject_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_credentials
    ADD CONSTRAINT auth_credentials_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES app_private.auth_subjects(id);


--
-- Name: auth_families auth_families_subject_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_families
    ADD CONSTRAINT auth_families_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES app_private.auth_subjects(id);


--
-- Name: auth_import_ledger auth_import_ledger_profile_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_import_ledger
    ADD CONSTRAINT auth_import_ledger_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.users(id);


--
-- Name: auth_import_ledger auth_import_ledger_subject_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_import_ledger
    ADD CONSTRAINT auth_import_ledger_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES app_private.auth_subjects(id);


--
-- Name: auth_oauth_transactions auth_oauth_transactions_link_session_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_oauth_transactions
    ADD CONSTRAINT auth_oauth_transactions_link_session_id_fkey FOREIGN KEY (link_session_id) REFERENCES app_private.auth_families(id);


--
-- Name: auth_oauth_transactions auth_oauth_transactions_link_subject_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_oauth_transactions
    ADD CONSTRAINT auth_oauth_transactions_link_subject_id_fkey FOREIGN KEY (link_subject_id) REFERENCES app_private.auth_subjects(id);


--
-- Name: auth_recovery auth_recovery_subject_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_recovery
    ADD CONSTRAINT auth_recovery_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES app_private.auth_subjects(id);


--
-- Name: auth_refresh auth_refresh_family_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_refresh
    ADD CONSTRAINT auth_refresh_family_id_fkey FOREIGN KEY (family_id) REFERENCES app_private.auth_families(id);


--
-- Name: auth_social_identities auth_social_identities_subject_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.auth_social_identities
    ADD CONSTRAINT auth_social_identities_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES app_private.auth_subjects(id);


--
-- Name: billing_legacy_groups billing_legacy_groups_group_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.billing_legacy_groups
    ADD CONSTRAINT billing_legacy_groups_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT;


--
-- Name: guardianship_majority_deliveries guardianship_majority_deliveries_athlete_user_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.guardianship_majority_deliveries
    ADD CONSTRAINT guardianship_majority_deliveries_athlete_user_id_fkey FOREIGN KEY (athlete_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: guardianship_majority_deliveries guardianship_majority_deliveries_recipient_user_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.guardianship_majority_deliveries
    ADD CONSTRAINT guardianship_majority_deliveries_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: invitation_registrations invitation_registrations_token_hash_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.invitation_registrations
    ADD CONSTRAINT invitation_registrations_token_hash_fkey FOREIGN KEY (token_hash) REFERENCES public.invitations(token) ON DELETE CASCADE;


--
-- Name: invitation_send_limits invitation_send_limits_group_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.invitation_send_limits
    ADD CONSTRAINT invitation_send_limits_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: join_code_attempts join_code_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.join_code_attempts
    ADD CONSTRAINT join_code_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: managed_activation_requests managed_activation_requests_consent_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.managed_activation_requests
    ADD CONSTRAINT managed_activation_requests_consent_id_fkey FOREIGN KEY (consent_id) REFERENCES public.consents(id) ON DELETE RESTRICT;


--
-- Name: managed_activation_requests managed_activation_requests_membership_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.managed_activation_requests
    ADD CONSTRAINT managed_activation_requests_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.memberships(id) ON DELETE RESTRICT;


--
-- Name: managed_activation_requests managed_activation_requests_requested_by_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.managed_activation_requests
    ADD CONSTRAINT managed_activation_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: managed_member_enrollments managed_member_enrollments_declared_by_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.managed_member_enrollments
    ADD CONSTRAINT managed_member_enrollments_declared_by_fkey FOREIGN KEY (declared_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: managed_member_enrollments managed_member_enrollments_guardianship_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.managed_member_enrollments
    ADD CONSTRAINT managed_member_enrollments_guardianship_id_fkey FOREIGN KEY (guardianship_id) REFERENCES public.guardianships(id) ON DELETE RESTRICT;


--
-- Name: managed_member_enrollments managed_member_enrollments_membership_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.managed_member_enrollments
    ADD CONSTRAINT managed_member_enrollments_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.memberships(id) ON DELETE RESTRICT;


--
-- Name: qr_checkin_keys qr_checkin_keys_activity_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.qr_checkin_keys
    ADD CONSTRAINT qr_checkin_keys_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE CASCADE;


--
-- Name: qr_checkin_settings qr_checkin_settings_group_id_fkey; Type: FK CONSTRAINT; Schema: app_private; Owner: -
--

ALTER TABLE ONLY app_private.qr_checkin_settings
    ADD CONSTRAINT qr_checkin_settings_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;


--
-- Name: account_consents account_consents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_consents
    ADD CONSTRAINT account_consents_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: activities activities_activity_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_activity_type_id_fkey FOREIGN KEY (activity_type_id) REFERENCES public.activity_types(id) ON DELETE RESTRICT;


--
-- Name: activities activities_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: activities activities_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT;


--
-- Name: activities activities_recurrence_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activities
    ADD CONSTRAINT activities_recurrence_source_id_fkey FOREIGN KEY (recurrence_source_id) REFERENCES public.activities(id) ON DELETE SET NULL;


--
-- Name: activity_types activity_types_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_types
    ADD CONSTRAINT activity_types_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT;


--
-- Name: announcement_push_preferences announcement_push_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcement_push_preferences
    ADD CONSTRAINT announcement_push_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: attendance_records attendance_records_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.activities(id) ON DELETE RESTRICT;


--
-- Name: attendance_records attendance_records_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_membership_id_fkey FOREIGN KEY (membership_id) REFERENCES public.memberships(id) ON DELETE RESTRICT;


--
-- Name: attendance_records attendance_records_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: birthdate_change_approvals birthdate_change_approvals_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthdate_change_approvals
    ADD CONSTRAINT birthdate_change_approvals_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: birthdate_change_approvals birthdate_change_approvals_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthdate_change_approvals
    ADD CONSTRAINT birthdate_change_approvals_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT;


--
-- Name: birthdate_change_approvals birthdate_change_approvals_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthdate_change_approvals
    ADD CONSTRAINT birthdate_change_approvals_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.birthdate_change_requests(id) ON DELETE RESTRICT;


--
-- Name: birthdate_change_requests birthdate_change_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthdate_change_requests
    ADD CONSTRAINT birthdate_change_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: consents consents_guardianship_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consents
    ADD CONSTRAINT consents_guardianship_id_fkey FOREIGN KEY (guardianship_id) REFERENCES public.guardianships(id) ON DELETE RESTRICT;


--
-- Name: group_announcements group_announcements_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_announcements
    ADD CONSTRAINT group_announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: group_announcements group_announcements_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_announcements
    ADD CONSTRAINT group_announcements_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT;


--
-- Name: group_subscriptions group_subscriptions_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_subscriptions
    ADD CONSTRAINT group_subscriptions_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT;


--
-- Name: group_subscriptions group_subscriptions_plan_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_subscriptions
    ADD CONSTRAINT group_subscriptions_plan_code_fkey FOREIGN KEY (plan_code) REFERENCES public.billing_plans(code);


--
-- Name: group_subscriptions group_subscriptions_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.group_subscriptions
    ADD CONSTRAINT group_subscriptions_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);


--
-- Name: groups groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: groups groups_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.groups
    ADD CONSTRAINT groups_settings_updated_by_fkey FOREIGN KEY (settings_updated_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: guardianships guardianships_athlete_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardianships
    ADD CONSTRAINT guardianships_athlete_user_id_fkey FOREIGN KEY (athlete_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: guardianships guardianships_guardian_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guardianships
    ADD CONSTRAINT guardianships_guardian_user_id_fkey FOREIGN KEY (guardian_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: invitations invitations_activation_membership_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_activation_membership_id_fkey FOREIGN KEY (activation_membership_id) REFERENCES public.memberships(id) ON DELETE RESTRICT;


--
-- Name: invitations invitations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: invitations invitations_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT;


--
-- Name: invitations invitations_invited_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_invited_user_id_fkey FOREIGN KEY (invited_user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: memberships memberships_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE RESTRICT;


--
-- Name: memberships memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: push_tokens push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_tokens
    ADD CONSTRAINT push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: subscription_invoices subscription_invoices_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_invoices
    ADD CONSTRAINT subscription_invoices_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.group_subscriptions(id) ON DELETE RESTRICT;


--
-- Name: users users_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES app_private.auth_subjects(id) ON DELETE SET NULL;


--
-- Name: announcement_executor; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.announcement_executor ENABLE ROW LEVEL SECURITY;

--
-- Name: announcement_push_deliveries; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.announcement_push_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_attempts; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.auth_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_authority; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.auth_authority ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_credentials; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.auth_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_families; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.auth_families ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_import_ledger; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.auth_import_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_oauth_transactions; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.auth_oauth_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_recovery; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.auth_recovery ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_refresh; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.auth_refresh ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_social_identities; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.auth_social_identities ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_subjects; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.auth_subjects ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_legacy_groups; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.billing_legacy_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_transport; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.billing_transport ENABLE ROW LEVEL SECURITY;

--
-- Name: guardianship_majority_deliveries; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.guardianship_majority_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: invitation_attempts; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.invitation_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: invitation_registrations; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.invitation_registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: invitation_send_limits; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.invitation_send_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: join_code_attempts; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.join_code_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: majority_executor; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.majority_executor ENABLE ROW LEVEL SECURITY;

--
-- Name: majority_tasks; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.majority_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: managed_activation_requests; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.managed_activation_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: managed_member_enrollments; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.managed_member_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: qr_checkin_keys; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.qr_checkin_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: qr_checkin_settings; Type: ROW SECURITY; Schema: app_private; Owner: -
--

ALTER TABLE app_private.qr_checkin_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: account_consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_consents ENABLE ROW LEVEL SECURITY;

--
-- Name: account_consents account_consents_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY account_consents_select_own ON public.account_consents FOR SELECT TO asisteam_member USING ((user_id = ( SELECT public.auth_user_id() AS auth_user_id)));


--
-- Name: activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

--
-- Name: activities activities_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activities_read ON public.activities FOR SELECT TO asisteam_member USING (app_private.can_read_group_activities(group_id));


--
-- Name: activity_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.activity_types ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_types activity_types_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_types_insert_admin ON public.activity_types FOR INSERT TO asisteam_member WITH CHECK (((group_id IS NOT NULL) AND public.is_group_admin(group_id)));


--
-- Name: activity_types activity_types_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_types_read ON public.activity_types FOR SELECT TO asisteam_member USING ((((group_id IS NULL) AND (public.auth_user_id() IS NOT NULL)) OR app_private.can_read_group_activities(group_id)));


--
-- Name: activity_types activity_types_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY activity_types_update_admin ON public.activity_types FOR UPDATE TO asisteam_member USING (((group_id IS NOT NULL) AND public.is_group_admin(group_id))) WITH CHECK (((group_id IS NOT NULL) AND public.is_group_admin(group_id)));


--
-- Name: announcement_push_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcement_push_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: announcement_push_preferences announcement_push_preferences_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY announcement_push_preferences_owner ON public.announcement_push_preferences FOR SELECT TO asisteam_member USING ((user_id = public.auth_user_id()));


--
-- Name: attendance_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_plans; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;

--
-- Name: billing_plans billing_plans_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY billing_plans_read ON public.billing_plans FOR SELECT TO asisteam_member USING (true);


--
-- Name: birthdate_change_approvals birthdate_approvals_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY birthdate_approvals_select_own ON public.birthdate_change_approvals FOR SELECT TO asisteam_member USING ((EXISTS ( SELECT 1
   FROM public.birthdate_change_requests r
  WHERE (r.id = birthdate_change_approvals.request_id))));


--
-- Name: birthdate_change_approvals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.birthdate_change_approvals ENABLE ROW LEVEL SECURITY;

--
-- Name: birthdate_change_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.birthdate_change_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: birthdate_change_requests birthdate_requests_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY birthdate_requests_select_own ON public.birthdate_change_requests FOR SELECT TO asisteam_member USING ((user_id = ( SELECT public.auth_user_id() AS auth_user_id)));


--
-- Name: consents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

--
-- Name: consents consents_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY consents_select_own ON public.consents FOR SELECT TO asisteam_member USING ((EXISTS ( SELECT 1
   FROM public.guardianships g
  WHERE (g.id = consents.guardianship_id))));


--
-- Name: group_announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: group_announcements group_announcements_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY group_announcements_read ON public.group_announcements FOR SELECT TO asisteam_member USING (((deleted_at IS NULL) AND public.is_member(group_id)));


--
-- Name: group_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.group_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

--
-- Name: groups groups_select_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_select_member ON public.groups FOR SELECT TO asisteam_member USING (public.is_member(id));


--
-- Name: groups groups_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY groups_update_admin ON public.groups FOR UPDATE TO asisteam_member USING (public.is_member(id)) WITH CHECK (public.is_group_admin(id));


--
-- Name: guardianships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.guardianships ENABLE ROW LEVEL SECURITY;

--
-- Name: guardianships guardianships_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY guardianships_select_own ON public.guardianships FOR SELECT TO asisteam_member USING (((athlete_user_id = ( SELECT public.auth_user_id() AS auth_user_id)) OR ((guardian_user_id = ( SELECT public.auth_user_id() AS auth_user_id)) AND public.is_guardian_of(athlete_user_id))));


--
-- Name: invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations invitations_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_select_admin ON public.invitations FOR SELECT TO asisteam_member USING (public.is_group_admin(group_id));


--
-- Name: job_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: memberships memberships_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY memberships_select_own ON public.memberships FOR SELECT TO asisteam_member USING ((user_id = ( SELECT public.auth_user_id() AS auth_user_id)));


--
-- Name: push_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: push_tokens push_tokens_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_tokens_owner ON public.push_tokens FOR SELECT TO asisteam_member USING ((user_id = public.auth_user_id()));


--
-- Name: subscription_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_select_own ON public.users FOR SELECT TO asisteam_member USING ((auth_user_id = ( SELECT app_private.actor_subject_id() AS uid)));


--
-- Name: users users_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_own ON public.users FOR UPDATE TO asisteam_member USING (((auth_user_id = ( SELECT app_private.actor_subject_id() AS uid)) AND (account_status = 'ACTIVE'::text))) WITH CHECK (((auth_user_id = ( SELECT app_private.actor_subject_id() AS uid)) AND (account_status = 'ACTIVE'::text)));


--
-- PostgreSQL database dump complete
--



REVOKE ALL ON SCHEMA public,app_private FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public,app_private FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public,app_private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public,app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA public,app_private,extensions TO asisteam_member,asisteam_api,asisteam_jobs,asisteam_auth,asisteam_invitation,asisteam_billing;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA extensions TO asisteam_migrator;
-- The source exposed this identity helper via implicit PUBLIC EXECUTE. RLS
-- callers need it, so replace that default with the own membership grant.
GRANT EXECUTE ON FUNCTION public.auth_user_id() TO asisteam_member;
ALTER DEFAULT PRIVILEGES FOR ROLE asisteam_migrator IN SCHEMA public,app_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE asisteam_migrator IN SCHEMA public,app_private REVOKE ALL ON TABLES FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app_private.actor_claims() TO asisteam_api;
GRANT EXECUTE ON FUNCTION app_private.actor_claims() TO asisteam_member;
GRANT EXECUTE ON FUNCTION app_private.actor_role() TO asisteam_api;
GRANT EXECUTE ON FUNCTION app_private.actor_role() TO asisteam_member;
GRANT EXECUTE ON FUNCTION app_private.actor_subject_id() TO asisteam_api;
GRANT EXECUTE ON FUNCTION app_private.actor_subject_id() TO asisteam_member;
GRANT EXECUTE ON FUNCTION app_private.announcement_worker_metrics() TO asisteam_jobs;
GRANT EXECUTE ON FUNCTION app_private.api_accept_invitation(p_token_hash text) TO asisteam_api;
GRANT EXECUTE ON FUNCTION app_private.api_issue_invitation(p_group_id uuid, p_token_hash text, p_email text, p_role text, p_invitation_id uuid, p_membership_id uuid) TO asisteam_api;
GRANT EXECUTE ON FUNCTION app_private.api_session_user_id(p_session_id uuid) TO asisteam_api;
GRANT EXECUTE ON FUNCTION app_private.attendance_metrics(p_present bigint, p_late bigint, p_absent bigint, p_excused bigint) TO asisteam_member;
GRANT EXECUTE ON FUNCTION app_private.auth_is_native() TO asisteam_api;
GRANT EXECUTE ON FUNCTION app_private.auth_is_native() TO asisteam_auth;
GRANT EXECUTE ON FUNCTION app_private.auth_operation(p_operation text, p_data jsonb) TO asisteam_auth;
GRANT EXECUTE ON FUNCTION app_private.begin_subscription_checkout(p_group_id uuid, p_actor_auth_id uuid, p_plan_code text) TO asisteam_billing;
GRANT EXECUTE ON FUNCTION app_private.can_manage_attendance(p_group_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION app_private.can_read_group_activities(p_group_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION app_private.can_view_group_stats(p_group_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION app_private.claim_subscription_creation(p_subscription_id uuid) TO asisteam_billing;
GRANT EXECUTE ON FUNCTION app_private.get_subscription_context(p_group_id uuid, p_actor_auth_id uuid) TO asisteam_billing;
GRANT EXECUTE ON FUNCTION app_private.lookup_billing_subscription(p_subscription_id uuid) TO asisteam_billing;
GRANT EXECUTE ON FUNCTION app_private.native_session_user_id(p_session_id uuid) TO asisteam_api;
GRANT EXECUTE ON FUNCTION app_private.reject_subscription_creation(p_subscription_id uuid) TO asisteam_billing;
GRANT EXECUTE ON FUNCTION app_private.sync_group_subscription(p_subscription_id uuid, p_provider_id text, p_status text, p_provider_updated_at timestamp with time zone, p_next_payment_at timestamp with time zone, p_checkout_url text) TO asisteam_billing;
GRANT EXECUTE ON FUNCTION app_private.sync_subscription_invoice(p_provider_subscription_id text, p_invoice_id text, p_due_at timestamp with time zone, p_amount_clp integer, p_currency text, p_status text, p_payment_id text, p_paid_at timestamp with time zone, p_provider_updated_at timestamp with time zone) TO asisteam_billing;
GRANT EXECUTE ON FUNCTION app_private.worker_claim_announcement_push(p_receipts boolean) TO asisteam_jobs;
GRANT EXECUTE ON FUNCTION app_private.worker_claim_email() TO asisteam_jobs;
GRANT EXECUTE ON FUNCTION app_private.worker_claim_transition() TO asisteam_jobs;
GRANT EXECUTE ON FUNCTION app_private.worker_complete_announcement_push(p_delivery_id uuid, p_claim_token uuid, p_outcome text, p_ticket_id text) TO asisteam_jobs;
GRANT EXECUTE ON FUNCTION app_private.worker_complete_transition(p_date date, p_token uuid) TO asisteam_jobs;
GRANT EXECUTE ON FUNCTION app_private.worker_email_payload(p_id uuid, p_token uuid, p_payload jsonb) TO asisteam_jobs;
GRANT EXECUTE ON FUNCTION app_private.worker_finish_email(p_id uuid, p_token uuid, p_sent boolean) TO asisteam_jobs;
GRANT EXECUTE ON FUNCTION app_private.worker_metrics() TO asisteam_jobs;
GRANT EXECUTE ON FUNCTION app_private.worker_record_announcement_push_run(p_processed integer) TO asisteam_jobs;
GRANT EXECUTE ON FUNCTION public.accept_account_terms(p_accepted boolean, p_terms_version text) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.approve_membership(p_group_id uuid, p_membership_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.assign_member_coach(p_group_id uuid, p_membership_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.can_read_avatar(p_name text) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.can_upload_avatar() TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.cancel_invitation_registration(p_nonce_hash text) TO asisteam_invitation;
GRANT EXECUTE ON FUNCTION public.clear_attendance_record(p_activity_id uuid, p_membership_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.consent_managed_member(p_membership_id uuid, p_accepted boolean) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.consent_membership_data(p_membership_id uuid, p_accepted boolean) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.consume_invitation_attempt(p_key text) TO asisteam_invitation;
GRANT EXECUTE ON FUNCTION public.create_activity(p_group_id uuid, p_activity_type_id uuid, p_title text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_description text, p_location text, p_recurrence_rule jsonb) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.create_group(p_name text, p_sport text, p_description text, p_logo_url text) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.create_guardianship(p_group_id uuid, p_athlete_user_id uuid, p_full_name text, p_email text, p_relationship text) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.create_managed_member(p_group_id uuid, p_full_name text, p_birthdate date, p_email text, p_guardian jsonb) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.deactivate_membership(p_group_id uuid, p_membership_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.delete_activity(p_group_id uuid, p_activity_id uuid, p_scope text, p_confirm_attendance boolean) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.delete_group_announcement(p_group_id uuid, p_announcement_id uuid, p_updated_at timestamp with time zone) TO asisteam_api;
GRANT EXECUTE ON FUNCTION public.delete_group_announcement(p_group_id uuid, p_announcement_id uuid, p_updated_at timestamp with time zone) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.get_group_attendance_report(p_group_id uuid, p_period text, p_from date, p_to date, p_activity_type_ids uuid[], p_include_inactive boolean, p_page integer, p_page_size integer, p_sort text) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.get_group_billing(p_group_id uuid, p_page integer) TO asisteam_api;
GRANT EXECUTE ON FUNCTION public.get_group_billing(p_group_id uuid, p_page integer) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.get_group_stats(p_group_id uuid, p_page integer, p_page_size integer) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.get_my_attendance_history(p_group_id uuid, p_period text, p_from date, p_to date, p_activity_type_ids uuid[], p_page integer, p_page_size integer) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.get_qr_checkin_settings(p_group_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.get_ward_attendance_history(p_group_id uuid, p_athlete_user_id uuid, p_period text, p_from date, p_to date, p_activity_type_ids uuid[], p_page integer, p_page_size integer) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.has_account_consent() TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.invitation_context(p_token_hash text) TO asisteam_invitation;
GRANT EXECUTE ON FUNCTION public.invitation_registration_result(p_token_hash text, p_auth_user_id uuid) TO asisteam_invitation;
GRANT EXECUTE ON FUNCTION public.is_group_admin(p_group_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.is_guardian_of(p_athlete_user_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.is_member(p_group_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.issue_activity_checkin_qr(p_activity_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.join_group_as_athlete(p_group_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.join_group_by_code(p_invite_code text) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.list_avatar_permissions() TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.list_birthdate_reviews() TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.list_group_announcements(p_group_id uuid, p_page integer) TO asisteam_api;
GRANT EXECUTE ON FUNCTION public.list_group_announcements(p_group_id uuid, p_page integer) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.list_group_members(p_group_id uuid, p_role text, p_status text, p_offset integer, p_search text) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.list_guardianship_athletes(p_group_id uuid, p_search text, p_offset integer) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.list_managed_activation_requests(p_group_id uuid, p_offset integer, p_athlete_user_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.list_managed_member_consents(p_group_id uuid, p_offset integer) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.list_membership_onboarding(p_group_id uuid, p_athlete_user_id uuid, p_membership_id uuid, p_offset integer, p_as_guardian boolean) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.list_my_wards() TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.list_pending_athletes(p_group_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.list_pending_memberships(p_group_id uuid, p_offset integer) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.prepare_invitation_registration(p_token_hash text, p_nonce_hash text, p_email text, p_registration jsonb) TO asisteam_invitation;
GRANT EXECUTE ON FUNCTION public.publish_group_announcement(p_group_id uuid, p_title text, p_body text, p_request_id uuid) TO asisteam_api;
GRANT EXECUTE ON FUNCTION public.publish_group_announcement(p_group_id uuid, p_title text, p_body text, p_request_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.reactivate_membership(p_group_id uuid, p_membership_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.record_attendance_bulk(p_activity_id uuid, p_records jsonb, p_only_unmarked boolean) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.register_announcement_push_token(p_token text, p_platform text) TO asisteam_api;
GRANT EXECUTE ON FUNCTION public.register_announcement_push_token(p_token text, p_platform text) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.reject_pending_membership(p_group_id uuid, p_membership_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.request_birthdate_change(p_birthdate date) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.request_managed_activation(p_group_id uuid, p_membership_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.review_birthdate_change(p_request_id uuid, p_group_id uuid, p_approve boolean) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.review_managed_activation(p_request_id uuid, p_accepted boolean) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.rotate_invite_code(p_group_id uuid) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.self_checkin(p_activity_id uuid, p_token text) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.set_announcement_push_enabled(p_enabled boolean) TO asisteam_api;
GRANT EXECUTE ON FUNCTION public.set_announcement_push_enabled(p_enabled boolean) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.set_avatar_permission(p_guardianship_id uuid, p_allow boolean) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.set_qr_checkin_settings(p_group_id uuid, p_settings jsonb) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.unregister_announcement_push_token(p_token text) TO asisteam_api;
GRANT EXECUTE ON FUNCTION public.unregister_announcement_push_token(p_token text) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.update_activity(p_group_id uuid, p_activity_id uuid, p_activity_type_id uuid, p_title text, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_description text, p_location text, p_scope text) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.update_attendance_record(p_record_id uuid, p_changes jsonb) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.update_group_announcement(p_group_id uuid, p_announcement_id uuid, p_title text, p_body text, p_updated_at timestamp with time zone) TO asisteam_api;
GRANT EXECUTE ON FUNCTION public.update_group_announcement(p_group_id uuid, p_announcement_id uuid, p_title text, p_body text, p_updated_at timestamp with time zone) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.update_group_settings(p_group_id uuid, p_changes jsonb) TO asisteam_member;
GRANT EXECUTE ON FUNCTION public.update_managed_member(p_group_id uuid, p_membership_id uuid, p_full_name text, p_birthdate date, p_email text, p_phone text) TO asisteam_member;
GRANT INSERT (color) ON TABLE public.activity_types TO asisteam_member;
GRANT INSERT (group_id) ON TABLE public.activity_types TO asisteam_member;
GRANT INSERT (name) ON TABLE public.activity_types TO asisteam_member;
GRANT SELECT (accepted_at) ON TABLE public.invitations TO asisteam_member;
GRANT SELECT (body) ON TABLE public.group_announcements TO asisteam_member;
GRANT SELECT (color) ON TABLE public.activity_types TO asisteam_member;
GRANT SELECT (created_at) ON TABLE public.group_announcements TO asisteam_member;
GRANT SELECT (created_at) ON TABLE public.invitations TO asisteam_member;
GRANT SELECT (created_by) ON TABLE public.invitations TO asisteam_member;
GRANT SELECT (email) ON TABLE public.invitations TO asisteam_member;
GRANT SELECT (enabled) ON TABLE public.announcement_push_preferences TO asisteam_api;
GRANT SELECT (enabled) ON TABLE public.announcement_push_preferences TO asisteam_member;
GRANT SELECT (expires_at) ON TABLE public.invitations TO asisteam_member;
GRANT SELECT (group_id) ON TABLE public.activity_types TO asisteam_member;
GRANT SELECT (group_id) ON TABLE public.group_announcements TO asisteam_member;
GRANT SELECT (group_id) ON TABLE public.invitations TO asisteam_member;
GRANT SELECT (id) ON TABLE public.activity_types TO asisteam_member;
GRANT SELECT (id) ON TABLE public.group_announcements TO asisteam_member;
GRANT SELECT (id) ON TABLE public.groups TO asisteam_member;
GRANT SELECT (id) ON TABLE public.invitations TO asisteam_member;
GRANT SELECT (id) ON TABLE public.push_tokens TO asisteam_api;
GRANT SELECT (id) ON TABLE public.push_tokens TO asisteam_member;
GRANT SELECT (invited_user_id) ON TABLE public.invitations TO asisteam_member;
GRANT SELECT (is_active) ON TABLE public.activity_types TO asisteam_member;
GRANT SELECT (is_active) ON TABLE public.push_tokens TO asisteam_api;
GRANT SELECT (is_active) ON TABLE public.push_tokens TO asisteam_member;
GRANT SELECT (last_seen_at) ON TABLE public.push_tokens TO asisteam_member;
GRANT SELECT (name) ON TABLE public.activity_types TO asisteam_member;
GRANT SELECT (platform) ON TABLE public.push_tokens TO asisteam_member;
GRANT SELECT (role) ON TABLE public.invitations TO asisteam_member;
GRANT SELECT (status) ON TABLE public.invitations TO asisteam_member;
GRANT SELECT (title) ON TABLE public.group_announcements TO asisteam_member;
GRANT SELECT (updated_at) ON TABLE public.group_announcements TO asisteam_member;
GRANT SELECT ON TABLE public.account_consents TO asisteam_member;
GRANT SELECT ON TABLE public.billing_plans TO asisteam_member;
GRANT SELECT ON TABLE public.birthdate_change_approvals TO asisteam_member;
GRANT SELECT ON TABLE public.birthdate_change_requests TO asisteam_member;
GRANT SELECT ON TABLE public.consents TO asisteam_member;
GRANT SELECT ON TABLE public.guardianships TO asisteam_member;
GRANT SELECT ON TABLE public.memberships TO asisteam_member;
GRANT SELECT ON TABLE public.users TO asisteam_member;
GRANT SELECT ON TABLE public.v_activity_types TO asisteam_member;
GRANT SELECT ON TABLE public.v_athlete_attendance_history TO asisteam_member;
GRANT SELECT ON TABLE public.v_attendance_admin TO asisteam_member;
GRANT SELECT ON TABLE public.v_attendance_operator TO asisteam_member;
GRANT SELECT ON TABLE public.v_attendance_own TO asisteam_member;
GRANT SELECT ON TABLE public.v_attendance_roster TO asisteam_member;
GRANT SELECT ON TABLE public.v_group_activities TO asisteam_member;
GRANT SELECT ON TABLE public.v_group_attendance_report TO asisteam_member;
GRANT SELECT ON TABLE public.v_group_detail TO asisteam_member;
GRANT SELECT ON TABLE public.v_group_stats_members TO asisteam_member;
GRANT SELECT ON TABLE public.v_my_groups TO asisteam_member;
GRANT SELECT ON TABLE public.v_my_ward_groups TO asisteam_member;
GRANT SELECT ON TABLE public.v_my_wards TO asisteam_member;
GRANT SELECT ON TABLE public.v_ward_attendance_history TO asisteam_member;
GRANT UPDATE (avatar_url) ON TABLE public.users TO asisteam_member;
GRANT UPDATE (birthdate) ON TABLE public.users TO asisteam_member;
GRANT UPDATE (color) ON TABLE public.activity_types TO asisteam_member;
GRANT UPDATE (description) ON TABLE public.groups TO asisteam_member;
GRANT UPDATE (full_name) ON TABLE public.users TO asisteam_member;
GRANT UPDATE (is_active) ON TABLE public.activity_types TO asisteam_member;
GRANT UPDATE (logo_url) ON TABLE public.groups TO asisteam_member;
GRANT UPDATE (name) ON TABLE public.activity_types TO asisteam_member;
GRANT UPDATE (name) ON TABLE public.groups TO asisteam_member;
GRANT UPDATE (phone) ON TABLE public.users TO asisteam_member;
GRANT UPDATE (sport) ON TABLE public.groups TO asisteam_member;

ALTER TABLE public.activity_types DISABLE TRIGGER trg_system_activity_type;
INSERT INTO public.billing_plans SELECT * FROM jsonb_populate_record(NULL::public.billing_plans, '{"code": "ACADEMY", "name": "Academia", "currency": "CLP", "amount_clp": 15990, "athlete_limit": 1000}'::jsonb);
INSERT INTO public.billing_plans SELECT * FROM jsonb_populate_record(NULL::public.billing_plans, '{"code": "CLUB", "name": "Club", "currency": "CLP", "amount_clp": 9990, "athlete_limit": 200}'::jsonb);
INSERT INTO public.billing_plans SELECT * FROM jsonb_populate_record(NULL::public.billing_plans, '{"code": "TEAM", "name": "Equipo", "currency": "CLP", "amount_clp": 4990, "athlete_limit": 50}'::jsonb);
INSERT INTO public.activity_types SELECT * FROM jsonb_populate_record(NULL::public.activity_types, '{"id": "b2c3d4e5-0001-4b3c-8d4e-111111111111", "name": "TRAINING", "color": "#2563EB", "group_id": null, "is_active": true}'::jsonb);
INSERT INTO public.activity_types SELECT * FROM jsonb_populate_record(NULL::public.activity_types, '{"id": "b2c3d4e5-0002-4b3c-8d4e-222222222222", "name": "PHYSICAL_PREP", "color": "#7C3AED", "group_id": null, "is_active": true}'::jsonb);
INSERT INTO public.activity_types SELECT * FROM jsonb_populate_record(NULL::public.activity_types, '{"id": "b2c3d4e5-0003-4b3c-8d4e-333333333333", "name": "COMPETITION", "color": "#DC2626", "group_id": null, "is_active": true}'::jsonb);
INSERT INTO public.activity_types SELECT * FROM jsonb_populate_record(NULL::public.activity_types, '{"id": "b2c3d4e5-0004-4b3c-8d4e-444444444444", "name": "MEETING", "color": "#6B7280", "group_id": null, "is_active": true}'::jsonb);

ALTER TABLE public.activity_types ENABLE TRIGGER trg_system_activity_type;
-- Clean installs start after all source handoffs. Imported deployments must
-- restore their actual control/history rows and reconcile before admission.
INSERT INTO app_private.auth_authority(singleton,mode,activated_at) VALUES(true,'NATIVE',now());
INSERT INTO app_private.majority_executor(singleton,mode) VALUES(true,'WORKER');
INSERT INTO app_private.announcement_executor(singleton,mode,activated_at) VALUES(true,'WORKER',now());
INSERT INTO app_private.billing_transport(singleton,mode) VALUES(true,'NEST');
