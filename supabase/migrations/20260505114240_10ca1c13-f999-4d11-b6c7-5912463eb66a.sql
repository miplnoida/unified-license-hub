CREATE OR REPLACE FUNCTION public._resolve_application_workflow(_license_type text, _regulator_id uuid, _sector_id uuid, _category_id uuid)
 RETURNS TABLE(workflow_id uuid, first_step_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wf_id uuid;
  v_step_id uuid;
  v_lt text := lower(coalesce(_license_type, ''));
BEGIN
  IF _regulator_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows
     WHERE license_type = _license_type
       AND entity_type = 'application'
       AND is_active = true
       AND regulator_id = _regulator_id
       AND ((_category_id IS NOT NULL AND category_id = _category_id)
            OR (_sector_id IS NOT NULL AND sector_id = _sector_id))
     ORDER BY (category_id IS NOT NULL AND category_id = _category_id) DESC,
              (sector_id IS NOT NULL AND sector_id = _sector_id) DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL AND _regulator_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows
     WHERE license_type = _license_type
       AND entity_type = 'application'
       AND is_active = true
       AND regulator_id = _regulator_id
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows
     WHERE license_type = _license_type
       AND entity_type = 'application'
       AND is_active = true
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = 'application'
       AND aw.is_active = true
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL THEN
    RETURN;
  END IF;

  SELECT s.id INTO v_step_id FROM public.approval_steps s
   WHERE s.workflow_id = v_wf_id
   ORDER BY s.step_order ASC
   LIMIT 1;

  workflow_id := v_wf_id;
  first_step_id := v_step_id;
  RETURN NEXT;
END;
$function$;