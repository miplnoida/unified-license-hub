DO $$
DECLARE
  v_default_wf uuid := '45f769f4-0ffd-4c94-a85f-dea0a00b2ccd';
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  UPDATE public.applications
     SET workflow_id = NULL,
         current_step_id = NULL
   WHERE workflow_id = v_default_wf;

  DELETE FROM public.workflow_instances
   WHERE workflow_id = v_default_wf;

  DELETE FROM public.approval_step_actions
   WHERE step_id IN (SELECT id FROM public.approval_steps WHERE workflow_id = v_default_wf);
  DELETE FROM public.approval_step_entry_notifications
   WHERE step_id IN (SELECT id FROM public.approval_steps WHERE workflow_id = v_default_wf);
  DELETE FROM public.approval_action_notifications
   WHERE step_id IN (SELECT id FROM public.approval_steps WHERE workflow_id = v_default_wf);
  DELETE FROM public.approval_steps WHERE workflow_id = v_default_wf;
  DELETE FROM public.approval_workflows WHERE id = v_default_wf;
END $$;

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

  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
       AND aw.regulator_id=v_eff_reg
       AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     ORDER BY (aw.entity_type = v_entity_types[1]) DESC,
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
     ORDER BY (aw.entity_type = v_entity_types[1]) DESC, length(aw.license_type) DESC
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.license_type=_license_type AND aw.entity_type = ANY(v_entity_types) AND aw.is_active=true
     ORDER BY (aw.entity_type = v_entity_types[1]) DESC
     LIMIT 1;
  END IF;

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

  -- Generic "empty license_type" fallbacks intentionally removed: an
  -- application must match a user-configured workflow by license_type.
  -- Otherwise workflow_id stays NULL and the UI shows "not configured" —
  -- so admins attach a real workflow rather than inheriting a synthetic one.

  IF v_wf_id IS NULL THEN RETURN; END IF;

  SELECT s.id INTO v_step_id FROM public.approval_steps s
   WHERE s.workflow_id=v_wf_id ORDER BY s.step_order ASC LIMIT 1;

  workflow_id := v_wf_id;
  first_step_id := v_step_id;
  RETURN NEXT;
END;
$function$;