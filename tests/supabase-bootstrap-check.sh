#!/usr/bin/env bash
set -euo pipefail

export PGPASSWORD="${POSTGRES_PASSWORD:-postgres}"
PSQL=(psql -h "${PGHOST:-localhost}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-postgres}" -v ON_ERROR_STOP=1)

# Simulate the Supabase roles and auth schema, including default service-role
# grants that Supabase applies to tables created by the postgres owner.
"${PSQL[@]}" <<'SQL'
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to public;
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
SQL

"${PSQL[@]}" -f supabase/bootstrap/initial_schema.sql

for migration in supabase/migrations/*.sql; do
  echo "Applying $migration"
  "${PSQL[@]}" -f "$migration"
done

"${PSQL[@]}" <<'SQL'
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'clinics', 'clinic_settings', 'clinic_members',
    'super_admins', 'appointment_requests', 'demo_requests'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = table_name
        AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS is missing or disabled on public.%', table_name;
    END IF;
  END LOOP;

  IF has_table_privilege('anon', 'public.clinics', 'SELECT')
    OR has_table_privilege('anon', 'public.appointment_requests', 'INSERT')
    OR has_table_privilege('anon', 'public.demo_requests', 'SELECT') THEN
    RAISE EXCEPTION 'anon unexpectedly has direct application-table privileges';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.clinics', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'public.clinic_settings', 'UPDATE')
    OR NOT has_table_privilege('authenticated', 'public.clinic_members', 'INSERT')
    OR NOT has_table_privilege('authenticated', 'public.super_admins', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'public.appointment_requests', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated is missing a required manager/Super Admin grant';
  END IF;

  IF has_table_privilege('authenticated', 'public.clinic_members', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.appointment_requests', 'INSERT')
    OR has_table_privilege('authenticated', 'public.demo_requests', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated has an unexpected direct table privilege';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.demo_requests', 'INSERT') THEN
    RAISE EXCEPTION 'service_role is missing server-side demo lead insert access';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'demo_requests'
  ) THEN
    RAISE EXCEPTION 'demo_requests must not have direct client RLS policies';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'clinic_members'
      AND indexname = 'clinic_members_one_clinic_per_user_idx'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
  ) THEN
    RAISE EXCEPTION 'The unique one-clinic-per-manager index is missing';
  END IF;
END $$;

INSERT INTO public.clinics (id, name, slug)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'Bootstrap Clinic A', 'bootstrap-clinic-a'),
  ('22222222-2222-4222-8222-222222222222', 'Bootstrap Clinic B', 'bootstrap-clinic-b');

INSERT INTO auth.users (id)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

INSERT INTO public.clinic_members (clinic_id, user_id)
VALUES ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

INSERT INTO public.super_admins (user_id)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

INSERT INTO public.appointment_requests (clinic_id, patient_name, patient_phone, service, status)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'Synthetic Patient A', '+10000000001', 'Test service', 'new'),
  ('22222222-2222-4222-8222-222222222222', 'Synthetic Patient B', '+10000000002', 'Test service', 'new');

SQL

# Verify the unique index rejects a concurrent/duplicate manager assignment.
if "${PSQL[@]}" -c "INSERT INTO public.clinic_members (clinic_id, user_id) VALUES ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');" >/tmp/clinibot-duplicate-membership.log 2>&1; then
  echo "Expected duplicate manager membership to fail, but it succeeded." >&2
  exit 1
fi
grep -q "clinic_members_one_clinic_per_user_idx" /tmp/clinibot-duplicate-membership.log

MANAGER_CLINICS=$("${PSQL[@]}" -qAt -c "set request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; set role authenticated; select count(*) from public.clinics;")
MANAGER_APPOINTMENTS=$("${PSQL[@]}" -qAt -c "set request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; set role authenticated; select count(*) from public.appointment_requests;")
if [[ "$MANAGER_CLINICS" != "1" || "$MANAGER_APPOINTMENTS" != "1" ]]; then
  echo "Manager RLS isolation failed: clinics=$MANAGER_CLINICS appointments=$MANAGER_APPOINTMENTS" >&2
  exit 1
fi

"${PSQL[@]}" -q -c "set request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; set role authenticated; update public.appointment_requests set status = 'confirmed' where clinic_id = '11111111-1111-4111-8111-111111111111';"
FIRST_STATUS=$("${PSQL[@]}" -qAt -c "select status from public.appointment_requests where clinic_id = '11111111-1111-4111-8111-111111111111';")
SECOND_STATUS=$("${PSQL[@]}" -qAt -c "select status from public.appointment_requests where clinic_id = '22222222-2222-4222-8222-222222222222';")
if [[ "$FIRST_STATUS" != "confirmed" || "$SECOND_STATUS" != "new" ]]; then
  echo "Manager update isolation failed: first=$FIRST_STATUS second=$SECOND_STATUS" >&2
  exit 1
fi

SUPERADMIN_CLINICS=$("${PSQL[@]}" -qAt -c "set request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; set role authenticated; select count(*) from public.clinics;")
SUPERADMIN_APPOINTMENTS=$("${PSQL[@]}" -qAt -c "set request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; set role authenticated; select count(*) from public.appointment_requests;")
if [[ "$SUPERADMIN_CLINICS" != "2" || "$SUPERADMIN_APPOINTMENTS" != "2" ]]; then
  echo "Super Admin allowlist access failed: clinics=$SUPERADMIN_CLINICS appointments=$SUPERADMIN_APPOINTMENTS" >&2
  exit 1
fi

echo "Fresh Supabase bootstrap, migrations, grants, unique manager constraint, and RLS isolation passed."
