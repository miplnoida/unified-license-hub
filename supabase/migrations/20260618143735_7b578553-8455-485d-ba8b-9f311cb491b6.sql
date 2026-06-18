DO $$
DECLARE
  v_default uuid := '7441328c-e7e4-4668-abe4-e16145e26c43';
  v_new_wf uuid;
  v_first_step uuid;
  v_version_id uuid;
  v_snapshot jsonb;
  r record;
BEGIN
  FOR r IN
    SELECT wi.id AS instance_id, reg.sector_id
    FROM public.workflow_instances wi
    JOIN public.registrations reg ON reg.id = wi.entity_id
    WHERE wi.entity_type='registration' AND wi.workflow_id = v_default
  LOOP
    v_new_wf := public.resolve_registration_workflow(r.sector_id);
    IF v_new_wf IS NULL OR v_new_wf = v_default THEN CONTINUE; END IF;

    SELECT id INTO v_first_step FROM public.approval_steps
     WHERE workflow_id = v_new_wf ORDER BY step_order ASC LIMIT 1;
    SELECT id INTO v_version_id FROM public.approval_workflow_versions
     WHERE workflow_id = v_new_wf ORDER BY version_number DESC LIMIT 1;
    SELECT jsonb_build_object(
      'workflow_id', v_new_wf,
      'steps', COALESCE(jsonb_agg(jsonb_build_object(
        'local_id', s.id::text, 'name', s.name, 'step_order', s.step_order,
        'sla_hours', s.sla_hours,
        'sla_warning_threshold_percent', s.sla_warning_threshold_percent,
        'escalation_after_hours', s.escalation_after_hours
      ) ORDER BY s.step_order), '[]'::jsonb)
    ) INTO v_snapshot
    FROM public.approval_steps s WHERE s.workflow_id = v_new_wf;

    UPDATE public.workflow_instances
       SET workflow_id = v_new_wf,
           workflow_version_id = v_version_id,
           current_step_id = v_first_step,
           current_step_key = v_first_step::text,
           version_snapshot = v_snapshot,
           started_at = COALESCE(started_at, now()),
           status = 'active'
     WHERE id = r.instance_id;
  END LOOP;

  -- Now delete the default
  IF NOT EXISTS (SELECT 1 FROM public.workflow_instances WHERE workflow_id = v_default) THEN
    DELETE FROM public.approval_step_actions WHERE step_id IN (SELECT id FROM public.approval_steps WHERE workflow_id = v_default);
    DELETE FROM public.approval_step_entry_notifications WHERE step_id IN (SELECT id FROM public.approval_steps WHERE workflow_id = v_default);
    DELETE FROM public.approval_steps WHERE workflow_id = v_default;
    DELETE FROM public.approval_workflow_versions WHERE workflow_id = v_default;
    DELETE FROM public.approval_workflows WHERE id = v_default;
  ELSE
    UPDATE public.approval_workflows SET is_active = false WHERE id = v_default;
  END IF;
END $$;