-- MIG-05 (#149): trusted API session adapter; no password or cloud provisioning.
do $$ begin
  if not exists(select 1 from pg_roles where rolname = 'asisteam_api') then
    create role asisteam_api nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname = 'asisteam_jobs') then
    create role asisteam_jobs nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname = 'asisteam_webhook') then
    create role asisteam_webhook nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
  end if;
end $$;
-- Reuse existing policies and authenticated RPC grants; API cannot SET ROLE to
-- authenticated or gain service_role. Jobs/webhooks receive no domain grants.
grant authenticated to asisteam_api with inherit true, set false;
-- Supabase migrator can audit SET ROLE; API never receives the inverse grant.
grant asisteam_api to postgres with inherit false, set true;
grant usage on schema public, app_private to asisteam_api;

create or replace function app_private.api_session_user_id(p_session_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid; v_auth_id uuid := auth.uid();
begin
  if v_auth_id is null or p_session_id is null then return null; end if;
  -- Keep the session row until transaction end: logout cannot interleave a
  -- successful authorization and its write. No access to refresh/hash data.
  perform 1 from auth.sessions s join auth.users a on a.id = s.user_id
    where s.id = p_session_id and s.user_id = v_auth_id
      and (s.not_after is null or s.not_after > statement_timestamp())
      and a.deleted_at is null and (a.banned_until is null or a.banned_until <= statement_timestamp())
    for key share of s;
  if not found then return null; end if;
  select id into v_user_id from public.users
    where auth_user_id = v_auth_id and account_status = 'ACTIVE';
  return v_user_id;
end $$;
revoke all on function app_private.api_session_user_id(uuid) from public, anon, authenticated, service_role;
grant execute on function app_private.api_session_user_id(uuid) to asisteam_api;
comment on function app_private.api_session_user_id(uuid) is
  'Internal Nest adapter: verified token sub + session_id, live session and ACTIVE profile. Never expose via PostgREST.';
