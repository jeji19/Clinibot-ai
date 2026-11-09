-- Optimize RLS predicates and remove redundant permissive SELECT policies.
-- Authorization semantics are preserved: managers remain clinic-scoped;
-- Super Admins retain their allowlisted global access.

DROP POLICY IF EXISTS "Managers can view their clinic" ON public.clinics;
DROP POLICY IF EXISTS "Super admins can view all clinics" ON public.clinics;
CREATE POLICY "Managers and super admins can view clinics"
ON public.clinics FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clinic_members
    WHERE clinic_members.clinic_id = clinics.id
      AND clinic_members.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE super_admins.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Managers can view their membership" ON public.clinic_members;
DROP POLICY IF EXISTS "Super admins can view all clinic members" ON public.clinic_members;
CREATE POLICY "Managers and super admins can view clinic members"
ON public.clinic_members FOR SELECT TO authenticated
USING (
  clinic_members.user_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE super_admins.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Managers can view clinic appointments" ON public.appointment_requests;
DROP POLICY IF EXISTS "Super admins can view all appointments" ON public.appointment_requests;
CREATE POLICY "Managers and super admins can view appointments"
ON public.appointment_requests FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clinic_members
    WHERE clinic_members.clinic_id = appointment_requests.clinic_id
      AND clinic_members.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE super_admins.user_id = (SELECT auth.uid())
  )
);

ALTER POLICY "Managers can update clinic appointments"
ON public.appointment_requests
USING (
  EXISTS (
    SELECT 1 FROM public.clinic_members
    WHERE clinic_members.clinic_id = appointment_requests.clinic_id
      AND clinic_members.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clinic_members
    WHERE clinic_members.clinic_id = appointment_requests.clinic_id
      AND clinic_members.user_id = (SELECT auth.uid())
  )
);

ALTER POLICY "Super admins can add clinic members"
ON public.clinic_members
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE super_admins.user_id = (SELECT auth.uid())
  )
);

ALTER POLICY "Super admins can remove clinic members"
ON public.clinic_members
USING (
  EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE super_admins.user_id = (SELECT auth.uid())
  )
);

ALTER POLICY "Managers and super admins can view clinic settings"
ON public.clinic_settings
USING (
  EXISTS (
    SELECT 1 FROM public.clinic_members
    WHERE clinic_members.clinic_id = clinic_settings.clinic_id
      AND clinic_members.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE super_admins.user_id = (SELECT auth.uid())
  )
);

ALTER POLICY "Managers and super admins can insert clinic settings"
ON public.clinic_settings
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clinic_members
    WHERE clinic_members.clinic_id = clinic_settings.clinic_id
      AND clinic_members.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE super_admins.user_id = (SELECT auth.uid())
  )
);

ALTER POLICY "Managers and super admins can update clinic settings"
ON public.clinic_settings
USING (
  EXISTS (
    SELECT 1 FROM public.clinic_members
    WHERE clinic_members.clinic_id = clinic_settings.clinic_id
      AND clinic_members.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE super_admins.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.clinic_members
    WHERE clinic_members.clinic_id = clinic_settings.clinic_id
      AND clinic_members.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE super_admins.user_id = (SELECT auth.uid())
  )
);

ALTER POLICY "Super admins can view their own record"
ON public.super_admins
USING (user_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS clinic_members_user_id_idx
ON public.clinic_members (user_id);
