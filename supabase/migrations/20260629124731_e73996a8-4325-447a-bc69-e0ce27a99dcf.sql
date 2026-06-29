
CREATE OR REPLACE FUNCTION public.get_in_flight_renewals(license_ids uuid[])
RETURNS TABLE (
  application_id uuid,
  license_id uuid,
  status text,
  is_pending boolean,
  is_in_progress boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller AS (
    SELECT
      auth.uid() AS uid,
      public.user_licensee_id(auth.uid()) AS lic_id
  ),
  scoped_app_ids AS (
    SELECT a.id
    FROM public.applications a, caller c
    WHERE a.applicant_id = c.uid
    UNION
    SELECT app_id
    FROM caller c,
         LATERAL public.application_ids_for_licensee(c.lic_id) AS app_id
    WHERE c.lic_id IS NOT NULL
    UNION
    SELECT a.id
    FROM public.applications a, caller c
    WHERE a.applicant_id IN (
      SELECT p.id FROM public.profiles p
      WHERE p.licensee_id IN (
        SELECT public.ppoc_mapped_licensee_ids(c.uid)
      )
    )
  )
  SELECT
    a.id AS application_id,
    ((a.data->>'renewal_of_license_id')::uuid) AS license_id,
    a.status::text AS status,
    (a.status::text = ANY (ARRAY['submitted','under_review','query_raised','resubmission_requested'])) AS is_pending,
    (a.status::text = ANY (ARRAY['draft','in_progress'])) AS is_in_progress
  FROM public.applications a
  WHERE a.id IN (SELECT id FROM scoped_app_ids)
    AND (a.data->>'is_renewal') = 'true'
    AND (a.data->>'renewal_of_license_id') IS NOT NULL
    AND ((a.data->>'renewal_of_license_id')::uuid) = ANY (license_ids)
    AND a.status::text = ANY (ARRAY['draft','in_progress','submitted','under_review','query_raised','resubmission_requested']);
$$;

GRANT EXECUTE ON FUNCTION public.get_in_flight_renewals(uuid[]) TO authenticated;
