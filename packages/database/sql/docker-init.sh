#!/bin/sh
# Runs once, when the local Postgres container starts with an empty volume.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v migrator_password="$GEARVA_MIGRATOR_PASSWORD" \
  -v app_password="$GEARVA_APP_PASSWORD" \
  -v platform_password="$GEARVA_PLATFORM_PASSWORD" \
  -f /gearva-sql/bootstrap-roles.sql

# Local only: `prisma migrate dev` creates a shadow database, so the migrator needs CREATEDB.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "ALTER ROLE gearva_migrator CREATEDB;"
