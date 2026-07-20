CREATE OR REPLACE FUNCTION public.can_view_entity_returns(_user_id uuid, _licensee_id uuid, _workflow_status text, _status text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _user_id IS NULL OR _licensee_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(_user_id, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;

  IF public.user_has_permission(_user_id, 'returns_management', 'view_all_entities') THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.licensees l
    WHERE l.id = _licensee_id
      AND (
        l.lead_regulator_id = _user_id
        OR l.regulator_officer_id = _user_id
        OR l.alternate_regulator_id = _user_id
      )
  );
END;
$function$;