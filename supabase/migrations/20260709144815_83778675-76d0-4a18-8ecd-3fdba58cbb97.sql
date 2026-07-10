CREATE OR REPLACE FUNCTION public.is_internal_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role IN (
        'super_admin'::public.app_role,
        'admin'::public.app_role,
        'supervisor'::public.app_role,
        'licensing_officer'::public.app_role,
        'analyst'::public.app_role,
        'legal_compliance'::public.app_role,
        'developer'::public.app_role
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_dynamic_roles udr
    JOIN public.roles r ON r.id = udr.role_id
    WHERE udr.user_id = _user_id
      AND (
        r.role_type = 'internal'
        OR r.system_role IN (
          'super_admin',
          'admin',
          'supervisor',
          'licensing_officer',
          'analyst',
          'legal_compliance',
          'developer'
        )
      )
  );
$$;

DROP POLICY IF EXISTS "Internal staff can insert internal complaints" ON public.complaints;
DROP POLICY IF EXISTS "Staff can insert internal complaints" ON public.complaints;

CREATE POLICY "Internal staff can insert internal complaints"
  ON public.complaints
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_internal_staff(auth.uid()));

DROP POLICY IF EXISTS "external_complaints_insert_capability_gate" ON public.complaints;

CREATE POLICY "external_complaints_insert_capability_gate"
  ON public.complaints
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_internal_staff(auth.uid())
    OR (
      NOT public.has_external_role(auth.uid())
      OR public.external_can_access_complaint_values(
        auth.uid(),
        complainant_id,
        license_holder_id,
        'can_submit_complaints'::text
      )
    )
  );