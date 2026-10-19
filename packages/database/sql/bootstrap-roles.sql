-- One-time setup of the three database roles (docs/database.md section 6.1).
-- Run as a superuser / the database admin, never as gearva_migrator:
--
--   psql "<admin connection url>" \
--     -v migrator_password=... -v app_password=... -v platform_password=... \
--     -f bootstrap-roles.sql
--
-- Locally, Docker Compose runs it automatically (docker-init.sh) on an empty volume.
-- Safe to run again: existing roles are left alone.
\set ON_ERROR_STOP on

SELECT format('CREATE ROLE gearva_migrator LOGIN NOSUPERUSER PASSWORD %L', :'migrator_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gearva_migrator')
\gexec

SELECT format('CREATE ROLE gearva_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gearva_app')
\gexec

-- If the host refuses BYPASSRLS (managed Postgres), create this role without it and
-- use the platform_access policy fallback from database.md section 6.1.
SELECT format('CREATE ROLE gearva_platform LOGIN NOSUPERUSER BYPASSRLS PASSWORD %L', :'platform_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gearva_platform')
\gexec

-- The migrator owns the schema and every table it creates.
ALTER SCHEMA public OWNER TO gearva_migrator;
GRANT USAGE ON SCHEMA public TO gearva_app, gearva_platform;
