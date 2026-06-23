
-- 1) Improve _resolve_application_workflow with generic-license-type fallbacks.
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
BEGIN
  v_eff_reg := public._resolve_effective_regulator(_regulator_id, _sector_id, _category_id);

  v_entity_types := CASE WHEN _is_post_license
                         THEN ARRAY['post_application','application']
                         ELSE ARRAY['pre_application','application'] END;

  -- 1. effective regulator + category (license type match)
  IF v_eff_reg IS NOT NULL AND _category_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg AND aw.category_id=_category_id
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY (aw.entity_type = v_entity_types[1]) DESC, length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  -- 2. effective regulator + sector (license type match)
  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL AND _sector_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg AND aw.sector_id=_sector_id
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY (aw.entity_type = v_entity_types[1]) DESC, length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  -- 3. effective regulator only (license type match)
  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY (aw.entity_type = v_entity_types[1]) DESC, (aw.category_id IS NULL), (aw.sector_id IS NULL), length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  -- 4. original regulator (license type match)
  IF v_wf_id IS NULL AND _regulator_id IS NOT NULL AND _regulator_id IS DISTINCT FROM v_eff_reg THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=_regulator_id
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY (aw.entity_type = v_entity_types[1]) DESC, length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  -- 5. license_type exact only (no regulator)
  IF v_wf_id IS NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.license_type=_license_type AND aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
     ORDER BY (aw.entity_type = v_entity_types[1]) DESC
     LIMIT 1;
  END IF;

  -- 6. prefix-tolerant license_type only
  IF v_wf_id IS NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true AND aw.license_type<>''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY (aw.entity_type = v_entity_types[1]) DESC, length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  -- 7. NEW: generic workflow (empty/null license_type) for effective regulator
  --    Prefer most-specific taxonomy first (category > sector > regulator-only).
  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id = v_eff_reg
       AND COALESCE(aw.license_type, '') = ''
       AND (aw.category_id IS NULL OR aw.category_id = _category_id)
       AND (aw.sector_id IS NULL OR aw.sector_id = _sector_id)
     ORDER BY (aw.entity_type = v_entity_types[1]) DESC,
              (aw.category_id IS NOT NULL) DESC,
              (aw.sector_id IS NOT NULL) DESC
     LIMIT 1;
  END IF;

  -- 8. NEW: globally generic workflow (no regulator, no license_type)
  IF v_wf_id IS NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND COALESCE(aw.license_type, '') = ''
       AND aw.regulator_id IS NULL
       AND (aw.category_id IS NULL OR aw.category_id = _category_id)
       AND (aw.sector_id IS NULL OR aw.sector_id = _sector_id)
     ORDER BY (aw.entity_type = v_entity_types[1]) DESC,
              (aw.category_id IS NOT NULL) DESC,
              (aw.sector_id IS NOT NULL) DESC
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

-- 2) Idempotent repair helper. Attaches a workflow + creates a workflow_instance
--    for one application if none exists. Safe for completed/approved/rejected
--    applications (skipped). Returns the (possibly newly-created) instance id.
CREATE OR REPLACE FUNCTION public.repair_application_workflow(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app record;
  v_sector uuid;
  v_category uuid;
  v_is_post boolean;
  v_eff_reg uuid;
  v_wf_id uuid;
  v_step_id uuid;
  v_existing record;
  v_new_instance uuid;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  SELECT id, status, license_type, regulator_id, data, workflow_id, current_step_id
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_app.status NOT IN ('submitted','in_progress','resubmission_requested',
                          'resubmission_required','returned_for_correction',
                          'info_requested','query_raised','in_review',
                          'pending_review','under_review','forwarded','awaiting_approval') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'status_not_eligible', 'status', v_app.status);
  END IF;

  -- already attached?
  SELECT id, workflow_id, current_step_id, status INTO v_existing
    FROM public.workflow_instances
   WHERE entity_id = _application_id
     AND entity_type = 'application'
     AND status IN ('active','paused')
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    -- backfill application columns if missing
    IF v_app.workflow_id IS NULL OR v_app.current_step_id IS NULL THEN
      UPDATE public.applications
         SET workflow_id = COALESCE(workflow_id, v_existing.workflow_id),
             current_step_id = COALESCE(current_step_id, v_existing.current_step_id),
             updated_at = now()
       WHERE id = _application_id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'instance_id', v_existing.id, 'created', false);
  END IF;

  v_sector := NULLIF(v_app.data->>'sector_id','')::uuid;
  v_category := NULLIF(v_app.data->>'category_id','')::uuid;
  v_is_post := COALESCE(NULLIF(v_app.data->>'service_id','') IS NOT NULL, false)
               OR (v_app.data->>'type') = 'post_license';

  v_eff_reg := public._resolve_effective_regulator(v_app.regulator_id, v_sector, v_category);

  SELECT r.workflow_id, r.first_step_id INTO v_wf_id, v_step_id
    FROM public._resolve_application_workflow(
           v_app.license_type, v_eff_reg, v_sector, v_category, v_is_post) r;

  IF v_wf_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_matching_workflow');
  END IF;

  INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status)
  VALUES (v_wf_id, 'application', _application_id, v_step_id, 'active')
  RETURNING id INTO v_new_instance;

  UPDATE public.applications
     SET workflow_id = COALESCE(workflow_id, v_wf_id),
         current_step_id = COALESCE(current_step_id, v_step_id),
         regulator_id = COALESCE(v_eff_reg, regulator_id),
         updated_at = now()
   WHERE id = _application_id;

  RETURN jsonb_build_object('ok', true, 'instance_id', v_new_instance, 'workflow_id', v_wf_id, 'created', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.repair_application_workflow(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.repair_application_workflow(uuid) TO service_role;

-- 3) Backfill all currently-broken submitted/in_progress applications.
DO $$
DECLARE
  r record;
  res jsonb;
BEGIN
  FOR r IN
    SELECT a.id
      FROM public.applications a
      LEFT JOIN public.workflow_instances wi
        ON wi.entity_id = a.id AND wi.entity_type = 'application'
       AND wi.status IN ('active','paused')
     WHERE a.status IN ('submitted','in_progress','resubmission_requested',
                        'resubmission_required','returned_for_correction',
                        'info_requested','query_raised','in_review',
                        'pending_review','under_review','forwarded','awaiting_approval')
       AND (a.workflow_id IS NULL OR wi.id IS NULL)
  LOOP
    BEGIN
      res := public.repair_application_workflow(r.id);
      RAISE NOTICE 'repair % => %', r.id, res;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'repair % failed: %', r.id, SQLERRM;
    END;
  END LOOP;
END$$;
