-- 1) Replace resolver to prefer regulator-scoped workflow regardless of sector
CREATE OR REPLACE FUNCTION public.resolve_registration_workflow(_sector_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_workflow_id uuid;
  v_regulator_id uuid;
BEGIN
  IF _sector_id IS NOT NULL THEN
    SELECT regulator_id INTO v_regulator_id FROM public.sectors WHERE id = _sector_id;

    -- exact sector match
    SELECT id INTO v_workflow_id FROM public.approval_workflows
     WHERE entity_type = 'registration' AND is_active = true AND sector_id = _sector_id
     ORDER BY updated_at DESC LIMIT 1;
    IF v_workflow_id IS NOT NULL THEN RETURN v_workflow_id; END IF;

    -- same regulator (any sector)
    IF v_regulator_id IS NOT NULL THEN
      SELECT id INTO v_workflow_id FROM public.approval_workflows
       WHERE entity_type = 'registration' AND is_active = true
         AND regulator_id = v_regulator_id
       ORDER BY updated_at DESC LIMIT 1;
      IF v_workflow_id IS NOT NULL THEN RETURN v_workflow_id; END IF;
    END IF;
  END IF;

  -- global fallback
  SELECT id INTO v_workflow_id FROM public.approval_workflows
   WHERE entity_type = 'registration' AND is_active = true
     AND sector_id IS NULL AND regulator_id IS NULL
   ORDER BY updated_at DESC LIMIT 1;
  IF v_workflow_id IS NOT NULL THEN RETURN v_workflow_id; END IF;

  -- last-resort: any active registration workflow
  SELECT id INTO v_workflow_id FROM public.approval_workflows
   WHERE entity_type = 'registration' AND is_active = true
   ORDER BY updated_at DESC LIMIT 1;
  RETURN v_workflow_id;
END;
$$;

-- 2) Re-pin pending instances currently on the default workflow to the resolved (user) workflow
DO $$
DECLARE
  r record;
  v_new_wf uuid;
  v_first_step record;
  v_version_id uuid;
  v_snapshot jsonb;
BEGIN
  FOR r IN
    SELECT wi.id AS instance_id, wi.entity_id, reg.sector_id
    FROM public.workflow_instances wi
    JOIN public.registrations reg ON reg.id = wi.entity_id
    WHERE wi.entity_type = 'registration'
      AND wi.workflow_id = '7441328c-e7e4-4668-abe4-e16145e26c43'
  LOOP
    v_new_wf := public.resolve_registration_workflow(r.sector_id);
    IF v_new_wf IS NULL OR v_new_wf = '7441328c-e7e4-4668-abe4-e16145e26c43' THEN
      RAISE NOTICE 'No alternate workflow for registration % (sector %)', r.entity_id, r.sector_id;
      CONTINUE;
    END IF;

    SELECT id, name INTO v_first_step FROM public.approval_steps
     WHERE workflow_id = v_new_wf ORDER BY step_order ASC LIMIT 1;

    SELECT id INTO v_version_id FROM public.approval_workflow_versions
     WHERE workflow_id = v_new_wf ORDER BY version_number DESC LIMIT 1;

    -- Build a minimal snapshot from the live workflow + steps
    SELECT jsonb_build_object(
      'workflow_id', v_new_wf,
      'steps', COALESCE(jsonb_agg(jsonb_build_object(
        'local_id', s.id::text,
        'name', s.name,
        'step_order', s.step_order,
        'sla_hours', s.sla_hours,
        'sla_warning_threshold_percent', s.sla_warning_threshold_percent,
        'escalation_after_hours', s.escalation_after_hours
      ) ORDER BY s.step_order), '[]'::jsonb)
    ) INTO v_snapshot
    FROM public.approval_steps s WHERE s.workflow_id = v_new_wf;

    UPDATE public.workflow_instances
       SET workflow_id = v_new_wf,
           workflow_version_id = v_version_id,
           current_step_id = v_first_step.id,
           current_step_key = v_first_step.id::text,
           version_snapshot = v_snapshot,
           started_at = COALESCE(started_at, now()),
           status = 'active'
     WHERE id = r.instance_id;
  END LOOP;
END $$;

-- 3) Delete the auto-seeded Default Registration Workflow (only if no instances reference it any more)
DO $$
DECLARE
  v_default uuid := '7441328c-e7e4-4668-abe4-e16145e26c43';
  v_remaining int;
BEGIN
  SELECT count(*) INTO v_remaining FROM public.workflow_instances WHERE workflow_id = v_default;
  IF v_remaining > 0 THEN
    RAISE NOTICE 'Default workflow still referenced by % instance(s); deactivating instead of deleting.', v_remaining;
    UPDATE public.approval_workflows SET is_active = false WHERE id = v_default;
  ELSE
    DELETE FROM public.approval_step_actions WHERE step_id IN (SELECT id FROM public.approval_steps WHERE workflow_id = v_default);
    DELETE FROM public.approval_step_entry_notifications WHERE step_id IN (SELECT id FROM public.approval_steps WHERE workflow_id = v_default);
    DELETE FROM public.approval_steps WHERE workflow_id = v_default;
    DELETE FROM public.approval_workflow_versions WHERE workflow_id = v_default;
    DELETE FROM public.approval_workflows WHERE id = v_default;
  END IF;
END $$;