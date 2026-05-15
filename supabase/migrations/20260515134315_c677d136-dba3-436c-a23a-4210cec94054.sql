CREATE OR REPLACE FUNCTION public.ppoc_accessible_license_ids(_user_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH mapped_licensees AS (
    SELECT public.ppoc_mapped_licensee_ids(_user_id) AS licensee_id
  ),
  mapped_profiles AS (
    SELECT p.id AS user_id, p.licensee_id
    FROM public.profiles p
    JOIN mapped_licensees ml ON ml.licensee_id = p.licensee_id
  ),
  mapped_applications AS (
    SELECT a.id
    FROM public.applications a
    JOIN mapped_profiles mp ON mp.user_id = a.applicant_id

    UNION

    SELECT lic.application_id
    FROM public.licensees l
    JOIN mapped_licensees ml ON ml.licensee_id = l.id
    JOIN public.licenses lic ON lic.id = l.license_id
    WHERE lic.application_id IS NOT NULL
  )
  SELECT DISTINCT lic.id
  FROM public.licenses lic
  LEFT JOIN public.licensees linked_licensee ON linked_licensee.license_id = lic.id
  WHERE lic.holder_id IN (SELECT licensee_id FROM mapped_licensees)
     OR lic.holder_id IN (SELECT user_id FROM mapped_profiles)
     OR linked_licensee.id IN (SELECT licensee_id FROM mapped_licensees)
     OR lic.application_id IN (SELECT id FROM mapped_applications)
$function$;