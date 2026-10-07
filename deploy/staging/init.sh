#!/bin/sh
set -eu
# Values reach psql through stdin, never argv/stdout or a committed env file.
# Generated secrets contain hex characters only.
runtime_password=$(cat /run/secrets/runtime_password)
migrator_password=$(cat /run/secrets/migrator_password)
case "$runtime_password:$migrator_password" in *[!a-f0-9:]*) exit 1;; esac
{
  printf "CREATE ROLE asisteam_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '%s';\n" "$migrator_password"
  printf "CREATE ROLE asisteam_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '%s';\n" "$runtime_password"
  cat <<'SQL'
REVOKE ALL ON DATABASE asisteam_staging FROM PUBLIC;
GRANT CONNECT ON DATABASE asisteam_staging TO asisteam_runtime, asisteam_migrator;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA staging_runtime AUTHORIZATION asisteam_migrator;
SQL
} | psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --no-psqlrc --quiet --set ON_ERROR_STOP=1 >/dev/null 2>&1 || { printf 'staging_role_bootstrap_failed\n' >&2; exit 1; }
