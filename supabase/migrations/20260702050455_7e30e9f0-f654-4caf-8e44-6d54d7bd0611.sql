CREATE OR REPLACE FUNCTION public.start_return_workflow(_return_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workflow_id uuid;
  v_first_step uuid;
  v_instance_id uuid;
  v_existing_instance uuid;
  v_existing_step uuid;
  v_existing_status text;
  v_ret record;
BEGIN
  SELECT id, workflow_id, current_step_id, workflow_status
    INTO v_ret
    FROM public.returns_filed
   WHERE id = _return_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Return not found','code','NOT_FOUND','http',404);
  END IF;

  SELECT id, current_step_id, status
    INTO v_existing_instance, v_existing_step, v_existing_status
    FROM public.workflow_instances
   WHERE entity_id = _return_id
     AND entity_type = 'return'
     AND status IN ('active','paused')
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_existing_instance IS NOT NULL THEN
    SELECT workflow_id INTO v_workflow_id FROM public.workflow_instances WHERE id = v_existing_instance;
    UPDATE public.returns_filed
       SET current_step_id = COALESCE(v_existing_step, current_step_id),
           workflow_id = COALESCE(v_workflow_id, workflow_id),
           updated_at = now()
     WHERE id = _return_id;

    RETURN jsonb_build_object(
      'success', true,
      'reused', true,
      'instance_id', v_existing_instance,
      'workflow_id', v_workflow_id,
      'step_id', v_existing_step,
      'http', 200
    );
  END IF;

  -- Prefer the cached workflow_id on the row, but fall back to the dynamic
  -- routing resolver so returns whose workflow_id was never persisted still
  -- start correctly.
  v_workflow_id := v_ret.workflow_id;
  IF v_workflow_id IS NULL THEN
    v_workflow_id := public.resolve_return_workflow(_return_id);
  END IF;

  IF v_workflow_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'no_workflow', true, 'http', 200);
  END IF;

  SELECT id INTO v_first_step
    FROM public.approval_steps
   WHERE workflow_id = v_workflow_id
   ORDER BY step_order ASC
   LIMIT 1;

  IF v_first_step IS NULL THEN
    RETURN jsonb_build_object('error','Workflow has no steps','code','NO_STEPS','http',422);
  END IF;

  INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status, started_at)
  VALUES (v_workflow_id, 'return', _return_id, v_first_step, 'active', now())
  RETURNING id INTO v_instance_id;

  UPDATE public.returns_filed
     SET current_step_id = v_first_step,
         workflow_id = v_workflow_id,
         updated_at = now()
   WHERE id = _return_id;

  INSERT INTO public.return_audit_log
    (return_id, action, previous_status, new_status, comments, performed_by,
     previous_step_id, new_step_id, actor_role, metadata, event_key, source)
  VALUES
    (_return_id, 'workflow_started', v_ret.workflow_status::text, v_ret.workflow_status::text,
     'Workflow started', NULL, v_ret.current_step_id, v_first_step, NULL,
     jsonb_build_object('workflow_id', v_workflow_id, 'instance_id', v_instance_id),
     'return.workflow_started', 'rpc:start_return_workflow'),
    (_return_id, 'workflow_step_assigned', v_ret.workflow_status::text, v_ret.workflow_status::text,
     'Initial workflow step assigned', NULL, v_ret.current_step_id, v_first_step, NULL,
     jsonb_build_object('workflow_id', v_workflow_id, 'instance_id', v_instance_id, 'step_id', v_first_step),
     'return.workflow_step_assigned', 'rpc:start_return_workflow');

  RETURN jsonb_build_object(
    'success', true,
    'reused', false,
    'instance_id', v_instance_id,
    'workflow_id', v_workflow_id,
    'step_id', v_first_step,
    'http', 200
  );
END;
$function$;