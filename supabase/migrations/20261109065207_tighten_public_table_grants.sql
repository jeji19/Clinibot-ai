-- Least-privilege access for CliniBot AI public tables.
-- Public endpoints use the Worker with service_role; authenticated manager
-- and super-admin endpoints use user JWTs and the RLS policies already in place.

REVOKE ALL PRIVILEGES ON TABLE
  public.clinics,
  public.clinic_settings,
  public.clinic_members,
  public.super_admins,
  public.appointment_requests,
  public.demo_requests
FROM anon, authenticated;

-- Managers and Super Admins: only the operations required by src/index.js.
GRANT SELECT, INSERT, UPDATE ON TABLE public.clinics TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.clinic_settings TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.clinic_members TO authenticated;
GRANT SELECT ON TABLE public.super_admins TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.appointment_requests TO authenticated;

-- demo_requests and public appointment creation remain server-only via service_role.
-- No direct table access is granted to anon.
