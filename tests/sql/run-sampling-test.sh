#!/usr/bin/env bash
# Runs the real-Postgres test of the practice sampling migration.
# Needs psql and a Postgres server reachable via the standard PG* env vars
# (PGHOST, PGPORT, PGUSER, ...). It creates a SCRATCH database, applies the
# migration plus synthetic fixtures, runs the assertions, then drops only that
# scratch database. It never touches any other database.
set -euo pipefail
cd "$(dirname "$0")"
DB="mdcat_sampling_test"
ADMIN_DB="${PGADMINDB:-postgres}"
psql -X -q -v ON_ERROR_STOP=1 -d "$ADMIN_DB" -c "drop database if exists $DB" -c "create database $DB"
trap 'psql -X -q -d "$ADMIN_DB" -c "drop database if exists '"$DB"'" >/dev/null' EXIT
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f sampling-fixtures.sql
psql -X -q -v ON_ERROR_STOP=1 -d "$DB" -f ../../supabase/migrations/20261124000000_practice_question_sampling.sql
psql -X -v ON_ERROR_STOP=1 -d "$DB" -f sampling.test.sql
