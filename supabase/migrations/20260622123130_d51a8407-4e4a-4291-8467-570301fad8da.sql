CREATE OR REPLACE FUNCTION public.external_can_access_application(_user_id uuid, _application_id uuid, _capability text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
  -- Static external roles inherently can act on their own application.
  EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.id = _application_id
      AND a.applicant_id = _user_id
      AND (
        public.has_role(_user_id, 'applicant'::app_role)
        OR public.has_role(_user_id, 'pre_licensee'::app_role)
        OR public.has_role(_user_id, 'licensee_primary'::app_role)
        OR public.has_role(_user_id, 'licensee_secondary'::app_role)
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.applications a
    WHERE a.id = _application_id
      AND a.applicant_id = _user_id
      AND public.has_portal_capability(_user_id, NULL, 'licensing'::public.portal_area, _capability)
  )
  OR EXISTS (
    SELECT 1
    FROM public.portal_application_entity_ids(_application_id) e(entity_id)
    WHERE public.has_portal_capability(_user_id, e.entity_id, 'licensing'::public.portal_area, _capability)
  );
$function$;