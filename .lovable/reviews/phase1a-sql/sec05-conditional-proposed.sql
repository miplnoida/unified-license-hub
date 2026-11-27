CREATE OR REPLACE FUNCTION public.has_portal_capability(_user_id uuid, _entity_id uuid, _area portal_area, _capability text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_module text;
  v_action text;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> _user_id AND NOT public.is_internal_staff_user(auth.uid()) THEN
    RETURN false;
  END IF;
  IF public.is_internal_staff_user(_user_id) OR public.has_role(_user_id, 'super_admin'::app_role) THEN
    RETURN true;
  END IF;

  IF _entity_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.entity_user_memberships m
    WHERE m.user_id = _user_id AND m.entity_id = _entity_id
      AND m.status = 'APPROVED'
  ) THEN RETURN false; END IF;

  v_module := CASE _area
    WHEN 'licensing'        THEN 'licensing'
    WHEN 'returns'          THEN 'returns_management'
    WHEN 'complaints'       THEN 'complaint_management'
    WHEN 'fp_declarations'  THEN 'fit_and_proper'
  END;

  v_action := CASE _capability
    WHEN 'can_submit'                  THEN 'submit'
    WHEN 'can_submit_returns'          THEN 'submit'
    WHEN 'can_submit_complaints'       THEN 'submit'
    WHEN 'can_submit_fp_declarations'  THEN 'submit'
    WHEN 'can_upload_documents'        THEN 'upload_documents'
    WHEN 'can_view_status'             THEN 'view_status'
    WHEN 'can_respond_rfi'             THEN 'respond_rfi'
    ELSE _capability
  END;

  RETURN public.sec_has_permission(_user_id, v_module, v_action);
END;
$function$
;
