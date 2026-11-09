-- Public appointment creation is handled server-side with service_role.
-- The anon role no longer has INSERT privileges on appointment_requests,
-- so this legacy policy is unnecessary and is removed.
DROP POLICY IF EXISTS "Allow public appointment requests" ON public.appointment_requests;
