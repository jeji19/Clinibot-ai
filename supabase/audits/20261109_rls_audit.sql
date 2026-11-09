-- CliniBot AI: read-only Supabase RLS and grants audit
-- Run in the Supabase SQL Editor using a project owner/admin role.
-- This script only reads PostgreSQL metadata; it does not change schema, data, or policies.

with target_tables(table_name) as (
  values
    ('clinics'),
    ('clinic_settings'),
    ('clinic_members'),
    ('super_admins'),
    ('appointment_requests'),
    ('demo_requests')
)
select
  t.table_name,
  case when c.oid is null then 'MISSING' else 'EXISTS' end as table_status,
  coalesce(c.relrowsecurity, false) as rls_enabled,
  coalesce(c.relforcerowsecurity, false) as rls_forced
from target_tables t
left join pg_namespace n on n.nspname = 'public'
left join pg_class c on c.relnamespace = n.oid
  and c.relname = t.table_name
  and c.relkind in ('r', 'p')
order by t.table_name;

-- Every policy attached to the target tables, including command, roles,
-- USING expression, and WITH CHECK expression.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check as check_expression
from pg_policies
where schemaname = 'public'
  and tablename in (
    'clinics',
    'clinic_settings',
    'clinic_members',
    'super_admins',
    'appointment_requests',
    'demo_requests'
  )
order by tablename, policyname;

-- Explicit table grants for the API roles. RLS policies still apply;
-- a grant alone does not grant access to rows.
select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'clinics',
    'clinic_settings',
    'clinic_members',
    'super_admins',
    'appointment_requests',
    'demo_requests'
  )
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

-- Indexes that enforce manager membership uniqueness and support clinic-scoped lookups.
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'clinic_members'
order by indexname;
