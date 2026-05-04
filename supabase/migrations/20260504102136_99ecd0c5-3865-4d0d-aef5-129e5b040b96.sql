-- Fix ambiguous column reference in get_application_actions:
-- The RETURNS TABLE column "id" shadows applications.id in the inner SELECT.
CREATE OR REPLACE FUNCTION public.get_application_actions(_application_id uuid)
RETURNS TABLE(id uuid, application_id uuid, action text, comments text, actor_id uuid, actor_email text, actor_name text, created_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_internal boolean;
  v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_is_internal := public.has_role(v_uid, 'super_admin'::app_role)
                OR public.has_role(v_uid, 'admin'::app_role)
                OR public.has_role(v_uid, 'supervisor'::app_role)
                OR public.has_role(v_uid, 'licensing_officer'::app_role)
                OR public.has_role(v_uid, 'analyst'::app_role);

  SELECT a.applicant_id INTO v_owner
  FROM public.applications a
  WHERE a.id = _application_id;

  IF v_owner IS NULL THEN
    RETURN;
  END IF;
  IF NOT v_is_internal AND v_owner <> v_uid THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    aa.id,
    aa.application_id,
    aa.action,
    aa.comments,
    aa.actor_id,
    COALESCE(p.email, pl.email)         AS actor_email,
    COALESCE(p.full_name, pl.full_name) AS actor_name,
    aa.created_at
  FROM public.approval_actions aa
  LEFT JOIN public.profiles          p  ON p.id  = aa.actor_id
  LEFT JOIN public.pre_license_users pl ON pl.id = aa.actor_id
  WHERE aa.application_id = _application_id
  ORDER BY aa.created_at ASC;
END;
$function$;