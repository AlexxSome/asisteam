-- MIG-06 rehearsal only. Roles never receive credentials or BYPASSRLS.
-- CREATE ROLE is cluster-wide; apply only to the owned standalone container.
create role anon nologin nosuperuser nobypassrls;
create role authenticated nologin nosuperuser nobypassrls;
create role service_role nologin nosuperuser nobypassrls;
create role dashboard_user nologin nosuperuser nobypassrls;
create role supabase_admin nologin nosuperuser nobypassrls;
create role supabase_auth_admin nologin nosuperuser nobypassrls;
create role supabase_storage_admin nologin nosuperuser nobypassrls;
create role asisteam_api nologin nosuperuser nobypassrls noinherit;
create role asisteam_jobs nologin nosuperuser nobypassrls noinherit;
create role asisteam_webhook nologin nosuperuser nobypassrls noinherit;
create role asisteam_invitation nologin nosuperuser nocreatedb nocreaterole nobypassrls noinherit;
grant authenticated to asisteam_api with inherit true, set false;
grant asisteam_api to postgres with inherit false, set true;
create role asisteam_billing nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls noinherit;
