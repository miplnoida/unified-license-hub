CREATE OR REPLACE FUNCTION public._resolve_application_workflow(
  _license_type text,
  _regulator_id uuid,
  _sector_id uuid,
  _category_id uuid,
  _is_post_license boolean DEFAULT false
)
RETURNS TABLE(workflow_id uuid, first_step_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wf_id uuid;
  v_step_id uuid;
  v_eff_reg uuid;
  v_lt text := lower(coalesce(_license_type, ''));
  v_entity_types text[];
  v_is_post boolean := COALESCE(_is_post_license, false);
BEGIN
  v_eff_reg := public._resolve_effective_regulator(_regulator_id, _sector_id, _category_id);

  v_entity_types := CASE WHEN v_is_post
                         THEN ARRAY['post_application','application']
                         ELSE ARRAY['registration','pre_application','application'] END;

  IF v_eff_reg IS NOT NULL AND _category_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg AND aw.category_id=_category_id
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY array_position(v_entity_types, aw.entity_type), length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL AND _sector_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg AND aw.sector_id=_sector_id
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY array_position(v_entity_types, aw.entity_type), length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY array_position(v_entity_types, aw.entity_type),
              (aw.category_id IS NULL), (aw.sector_id IS NULL),
              length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL AND _regulator_id IS NOT NULL AND _regulator_id IS DISTINCT FROM v_eff_reg THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=_regulator_id
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY array_position(v_entity_types, aw.entity_type), length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.license_type=_license_type AND aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
     ORDER BY array_position(v_entity_types, aw.entity_type)
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true AND aw.license_type<>''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY array_position(v_entity_types, aw.entity_type), length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  -- Final fallbacks for new-licensee context only: a real, admin-configured
  -- Registration / Pre-Application workflow, regulator-scoped then global.
  IF v_wf_id IS NULL AND NOT v_is_post AND v_eff_reg IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type IN ('registration','pre_application')
       AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg
     ORDER BY (aw.entity_type = 'registration') DESC,
              (aw.category_id IS NULL), (aw.sector_id IS NULL),
              aw.updated_at DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL AND NOT v_is_post THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type IN ('registration','pre_application')
       AND aw.is_active=true
       AND aw.regulator_id IS NULL
     ORDER BY (aw.entity_type = 'registration') DESC,
              aw.updated_at DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL THEN RETURN; END IF;

  SELECT s.id INTO v_step_id FROM public.approval_steps s
   WHERE s.workflow_id=v_wf_id ORDER BY s.step_order ASC LIMIT 1;

  workflow_id := v_wf_id;
  first_step_id := v_step_id;
  RETURN NEXT;
END;
$function$;

-- Re-run backfill now that the resolver also handles NULL post-license flag.
DO $$
DECLARE
  r record;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);
  FOR r IN
    SELECT id FROM public.applications
     WHERE workflow_id IS NULL
       AND status IN ('submitted','in_progress','resubmission_requested',
                      'resubmission_required','returned_for_correction',
                      'info_requested','query_raised','in_review',
                      'pending_review','under_review','forwarded','awaiting_approval')
  LOOP
    PERFORM public.repair_application_workflow(r.id);
  END LOOP;
END $$;