
-- 1. Allow internal staff to view all registrations + form submissions for review
DROP POLICY IF EXISTS "Internal staff read all registrations" ON public.registrations;
CREATE POLICY "Internal staff read all registrations"
  ON public.registrations FOR SELECT
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
  );

DROP POLICY IF EXISTS "Internal staff update registrations" ON public.registrations;
CREATE POLICY "Internal staff update registrations"
  ON public.registrations FOR UPDATE
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
  );

DROP POLICY IF EXISTS "Internal staff read all registration submissions" ON public.registration_form_submissions;
CREATE POLICY "Internal staff read all registration submissions"
  ON public.registration_form_submissions FOR SELECT
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'licensing_officer'::app_role)
    OR has_role(auth.uid(), 'analyst'::app_role)
  );

-- 2. Add dedicated "Registration Management" permission module
INSERT INTO public.permissions (module, name)
SELECT 'registration_management', a
FROM (VALUES ('view'), ('create'), ('edit'), ('approve'), ('reject')) AS x(a)
WHERE NOT EXISTS (
  SELECT 1 FROM public.permissions p
  WHERE p.module = 'registration_management' AND p.name = x.a
);
