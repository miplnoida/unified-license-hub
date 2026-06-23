CREATE OR REPLACE FUNCTION public.create_approval_workflow_with_steps(_workflow jsonb, _steps jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_workflow_id uuid;
  v_step jsonb;
  v_idx int := 0;
  v_step_count int;
  v_role app_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT (
    public.has_role(v_uid, 'super_admin'::app_role)
    OR public.has_role(v_uid, 'admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'insufficient privileges' USING ERRCODE = '42501';
  END IF;

  IF _workflow IS NULL OR jsonb_typeof(_workflow) <> 'object' THEN
    RAISE EXCEPTION 'workflow payload must be a JSON object';
  END IF;
  IF _steps IS NULL OR jsonb_typeof(_steps) <> 'array' THEN
    RAISE EXCEPTION 'steps payload must be a JSON array';
  END IF;
  v_step_count := jsonb_array_length(_steps);
  IF v_step_count = 0 THEN
    RAISE EXCEPTION 'at least one step is required';
  END IF;

  FOR v_step IN SELECT * FROM jsonb_array_elements(_steps)
  LOOP
    IF NULLIF(v_step->>'approver_role', '') IS NULL THEN
      RAISE EXCEPTION 'every step requires approver_role';
    END IF;
    IF NULLIF(v_step->>'name', '') IS NULL THEN
      RAISE EXCEPTION 'every step requires a name';
    END IF;
    IF NOT (v_step ? 'allowed_actions')
       OR jsonb_typeof(v_step->'allowed_actions') <> 'array'
       OR jsonb_array_length(v_step->'allowed_actions') = 0 THEN
      RAISE EXCEPTION 'every step requires a non-empty allowed_actions array';
    END IF;
  END LOOP;

  INSERT INTO public.approval_workflows(
    name, description, license_type, entity_type, regulator_id,
    sector_id, sub_sector_id, category_id, service_id, is_active
  ) VALUES (
    _workflow->>'name',
    NULLIF(_workflow->>'description',''),
    _workflow->>'license_type',
    _workflow->>'entity_type',
    NULLIF(_workflow->>'regulator_id','')::uuid,
    NULLIF(_workflow->>'sector_id','')::uuid,
    NULLIF(_workflow->>'sub_sector_id','')::uuid,
    NULLIF(_workflow->>'category_id','')::uuid,
    NULLIF(_workflow->>'service_id','')::uuid,
    COALESCE((_workflow->>'is_active')::boolean, true)
  )
  RETURNING id INTO v_workflow_id;

  FOR v_step IN SELECT * FROM jsonb_array_elements(_steps)
  LOOP
    v_idx := v_idx + 1;
    v_role := (v_step->>'approver_role')::app_role;
    INSERT INTO public.approval_steps(
      workflow_id, step_order, name, description,
      approver_role, approver_role_id,
      step_type, is_required, sla_hours,
      allowed_actions, escalation_role, escalation_after_hours
    ) VALUES (
      v_workflow_id,
      COALESCE((v_step->>'step_order')::int, v_idx),
      v_step->>'name',
      NULLIF(v_step->>'description',''),
      v_role,
      NULLIF(v_step->>'approver_role_id','')::uuid,
      COALESCE(NULLIF(v_step->>'step_type',''), 'sequential'),
      COALESCE((v_step->>'is_required')::boolean, true),
      COALESCE((v_step->>'sla_hours')::int, 48),
      ARRAY(SELECT jsonb_array_elements_text(v_step->'allowed_actions'))::workflow_action_type[],
      NULLIF(v_step->>'escalation_role','')::app_role,
      NULLIF(v_step->>'escalation_after_hours','')::int
    );
  END LOOP;

  RETURN jsonb_build_object('workflow_id', v_workflow_id, 'step_count', v_step_count);
END;
$function$;