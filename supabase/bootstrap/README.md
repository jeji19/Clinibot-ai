# Supabase bootstrap

This folder contains the core schema needed to provision a **new** CliniBot AI Supabase project.

## New project setup

1. Create a new Supabase project in the intended region.
2. Open the SQL Editor using the project owner role.
3. Run `initial_schema.sql` once. It creates the five core tables, their keys/indexes, RLS, and baseline policies. It does not create a Super Admin user or sample clinic.
4. Apply every SQL migration in `../migrations/` in chronological filename order. This creates `demo_requests` and applies the least-privilege grants, default-privilege hardening, optimized policies, and the one-manager-per-clinic database constraint.
5. Run `../audits/20261109_rls_audit.sql` and confirm the expected tables, policies, grants, and indexes.
6. Create the first Super Admin account in Supabase Authentication. Add that exact Auth user UUID to `public.super_admins` using the SQL Editor as the project owner. Do not insert a placeholder UUID.
7. Configure the server-side environment variables listed in the repository's `DEPLOYMENT.md`.
8. Create the first clinic from the Super Admin dashboard and complete the onboarding checklist in `docs/LAUNCH_PLAN.md`.

## Important

- Do **not** run this bootstrap as a new migration on the already-connected production project. It is a fresh-project provisioning script, intentionally outside `supabase/migrations/`.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` in browser code.
- The baseline policies use the pre-optimization policy names expected by the subsequent hardening migration. Apply the migrations after this script; do not skip them.
- This bootstrap does not configure billing, legal/privacy controls, Cloudflare deployment, or production secrets.
- A new project must be tested with real manager and Super Admin accounts before handling patient data.
