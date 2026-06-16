CREATE OR REPLACE FUNCTION public.get_registration_reviewer_remarks(_registration_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_caller uuid := auth.uid();
  v_remark text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT user_id INTO v_owner FROM public.registrations WHERE id = _registration_id;
  IF v_owner IS NULL THEN
    RETURN NULL;
  END IF;

  -- Authorize: owner or internal staff
  IF v_owner <> v_caller
     AND NOT public.has_role(v_caller, 'super_admin')
     AND NOT public.has_role(v_caller, 'admin')
     AND NOT public.has_role(v_caller, 'supervisor')
     AND NOT public.has_role(v_caller, 'licensing_officer')
     AND NOT public.has_role(v_caller, 'analyst') THEN
    RETURN NULL;
  END IF;

  SELECT aa.comments INTO v_remark
    FROM public.approval_actions aa
   WHERE aa.entity_type = 'registration'
     AND aa.entity_id = _registration_id
     AND aa.actor_id IS DISTINCT FROM v_owner
     AND aa.action_type IN ('request_resubmission','return_for_correction','request_more_info','reject','send_back','approve','escalate','remark')
     AND nullif(trim(aa.comments), '') IS NOT NULL
   ORDER BY aa.created_at DESC
   LIMIT 1;

  RETURN v_remark;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_registration_reviewer_remarks(uuid) TO authenticated, service_role;