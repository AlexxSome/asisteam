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
