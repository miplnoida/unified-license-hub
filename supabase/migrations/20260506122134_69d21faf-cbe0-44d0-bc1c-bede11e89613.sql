
CREATE OR REPLACE FUNCTION public._resolve_application_workflow(
  _license_type text, _regulator_id uuid, _sector_id uuid, _category_id uuid
) RETURNS TABLE(workflow_id uuid, first_step_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_wf_id uuid;
  v_step_id uuid;
  v_eff_reg uuid;
  v_lt text := lower(coalesce(_license_type, ''));
BEGIN
  v_eff_reg := public._resolve_effective_regulator(_regulator_id, _sector_id, _category_id);

  -- Helper expression for prefix-tolerant license_type match (current row alias `aw`)
  -- Used in subsequent SELECTs.

  -- 1. effective regulator + category (prefix-tolerant license_type)
  IF v_eff_reg IS NOT NULL AND _category_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type='application' AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg AND aw.category_id=_category_id
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  -- 2. effective regulator + sector
  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL AND _sector_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type='application' AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg AND aw.sector_id=_sector_id
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  -- 3. effective regulator only
  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type='application' AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY (aw.category_id IS NULL), (aw.sector_id IS NULL), length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  -- 4. fallback: original regulator
  IF v_wf_id IS NULL AND _regulator_id IS NOT NULL AND _regulator_id IS DISTINCT FROM v_eff_reg THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type='application' AND aw.is_active=true
       AND aw.regulator_id=_regulator_id
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  -- 5. license_type exact only (no regulator)
  IF v_wf_id IS NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows
     WHERE license_type=_license_type AND entity_type='application' AND is_active=true
     LIMIT 1;
  END IF;

  -- 6. prefix-tolerant license_type only
  IF v_wf_id IS NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type='application' AND aw.is_active=true AND aw.license_type<>''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY length(aw.license_type) DESC
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

-- Re-route in-flight apps (no reviewer action yet) to best-matching workflow now
DO $$
DECLARE
  r record; v_wf uuid; v_step uuid; v_eff_reg uuid;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);
  FOR r IN
    SELECT a.id AS app_id, a.license_type, a.regulator_id, a.data,
           wi.id AS instance_id, wi.workflow_id AS current_wf_id
      FROM public.applications a
      JOIN public.workflow_instances wi
        ON wi.entity_id=a.id AND wi.entity_type='application' AND wi.status='active'
     WHERE a.status IN ('submitted','in_progress')
       AND NOT EXISTS (
         SELECT 1 FROM public.approval_actions aa
          WHERE aa.application_id=a.id
            AND aa.action_type IN ('approve','reject','send_back','escalate','request_resubmission'))
  LOOP
    v_eff_reg := public._resolve_effective_regulator(
      r.regulator_id, NULLIF(r.data->>'sector_id','')::uuid,
      NULLIF(r.data->>'category_id','')::uuid);
    SELECT workflow_id, first_step_id INTO v_wf, v_step
      FROM public._resolve_application_workflow(
        r.license_type, v_eff_reg,
        NULLIF(r.data->>'sector_id','')::uuid,
        NULLIF(r.data->>'category_id','')::uuid);
    IF v_wf IS NOT NULL AND v_wf <> r.current_wf_id THEN
      UPDATE public.workflow_instances
         SET workflow_id=v_wf, current_step_id=v_step, updated_at=now()
       WHERE id=r.instance_id;
      UPDATE public.applications
         SET workflow_id=v_wf, current_step_id=v_step,
             status='submitted', updated_at=now()
       WHERE id=r.app_id;
    END IF;
  END LOOP;
END $$;
