#!/bin/bash
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_password="$PULSOO_DB_PASSWORD" <<'SQL'
CREATE ROLE pulsoo_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE pulsoo TO pulsoo_app;
GRANT USAGE, CREATE ON SCHEMA public TO pulsoo_app;
SQL
