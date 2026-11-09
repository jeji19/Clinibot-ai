ALTER POLICY "Super admins can create clinics"
ON public.clinics
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE super_admins.user_id = (SELECT auth.uid())
  )
);

ALTER POLICY "Super admins can update clinics"
ON public.clinics
USING (
  EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE super_admins.user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE super_admins.user_id = (SELECT auth.uid())
  )
);
