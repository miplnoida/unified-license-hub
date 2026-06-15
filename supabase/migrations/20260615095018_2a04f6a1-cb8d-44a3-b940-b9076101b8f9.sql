CREATE OR REPLACE FUNCTION public.perform_registration_workflow_transition(
  _registration_id uuid, _instance_id uuid, _step_id uuid,
  _action_type text, _comments text, _actor_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reg record;
  v_instance record;
  v_step record;
  v_auth jsonb;
  v_allowed text[];
  v_steps_total int;
  v_current_idx int;
  v_is_first boolean;
  v_is_last boolean;
  v_next record;
  v_prev record;
  v_new_step_id uuid;
  v_new_reg_status text;
  v_new_instance_status text;
  v_now timestamptz := now();
  v_is_internal boolean;
  v_role_match boolean;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;
  IF _action_type NOT IN (
    'approve','reject','send_back','escalate',
    'request_resubmission','return_for_correction','request_more_info'
  ) THEN
    RETURN jsonb_build_object('error','Invalid action_type','code','BAD_ACTION','http',400);
  END IF;
  IF _action_type IN (
    'approve','reject','request_resubmission','return_for_correction','request_more_info'
  ) AND (_comments IS NULL OR length(trim(_comments)) = 0) THEN
    RETURN jsonb_build_object('error','Remarks are mandatory for this action','code','REMARKS_REQUIRED','http',422);
  END IF;

  SELECT id, status, registration_reference, sector_id
    INTO v_reg FROM public.registrations WHERE id = _registration_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Registration not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_reg.status NOT IN ('pending_review','in_progress','resubmission_required') THEN
    RETURN jsonb_build_object('error',format('Registration is in ''%s'' status', v_reg.status),
                              'code','INVALID_STATUS','http',409);
  END IF;

  SELECT id, workflow_id, current_step_id, status INTO v_instance
    FROM public.workflow_instances
   WHERE entity_id = _registration_id AND entity_type = 'registration'
     AND status IN ('active','paused')
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','No active workflow instance','code','NO_ACTIVE_INSTANCE','http',409);
  END IF;
  IF _instance_id IS NOT NULL AND _instance_id <> v_instance.id THEN
    RETURN jsonb_build_object('error','Stale workflow instance','code','STALE_INSTANCE','http',409);
  END IF;
  IF _step_id IS NOT NULL AND _step_id <> v_instance.current_step_id THEN
    RETURN jsonb_build_object('error','Stale step','code','STALE_STEP','http',409);
  END IF;

  SELECT id, step_order, name, approver_role, approver_role_id, allowed_actions
    INTO v_step FROM public.approval_steps WHERE id = v_instance.current_step_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Current step not found','code','STEP_NOT_FOUND','http',409);
  END IF;

  SELECT count(*),
         (SELECT count(*) FROM public.approval_steps s2
           WHERE s2.workflow_id = v_instance.workflow_id AND s2.step_order < v_step.step_order)
    INTO v_steps_total, v_current_idx
    FROM public.approval_steps WHERE workflow_id = v_instance.workflow_id;
  v_is_first := (v_current_idx = 0);
  v_is_last  := (v_current_idx = v_steps_total - 1);

  v_auth := public.user_can_act_on_workflow_step(_actor_id, v_step.id);
  v_role_match := COALESCE((v_auth->>'can_act')::boolean, false);
  v_is_internal := COALESCE((v_auth->>'is_internal')::boolean, false);

  IF _action_type = 'reject' THEN
    IF NOT v_is_internal THEN
      RETURN jsonb_build_object('error','Only internal staff can reject this registration',
                                'code','FORBIDDEN','http',403,'diagnostic',v_auth);
    END IF;
  ELSIF NOT v_role_match THEN
    RETURN jsonb_build_object(
      'error', format('Only %s can act on this step',
                      COALESCE(v_auth->>'required_role_name', v_step.approver_role::text)),
      'code','WRONG_APPROVER','http',403, 'diagnostic', v_auth);
  END IF;

  v_allowed := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step.allowed_actions, '[]'::jsonb)));
  IF NOT (_action_type = ANY(v_allowed)) THEN
    RETURN jsonb_build_object('error',format('Action ''%s'' is not allowed on this step', _action_type),
                              'code','ACTION_NOT_ALLOWED','http',422);
  END IF;
  IF _action_type = 'send_back' AND v_is_first THEN
    RETURN jsonb_build_object('error','Cannot send back from the first step','code','CANNOT_SEND_BACK','http',422);
  END IF;
  IF _action_type = 'escalate' AND v_is_last THEN
    RETURN jsonb_build_object('error','Cannot escalate from the last step','code','CANNOT_ESCALATE','http',422);
  END IF;

  v_new_step_id := v_step.id;

  IF _action_type = 'approve' THEN
    IF v_is_last THEN
      v_new_reg_status := 'approved';
      v_new_instance_status := 'completed';
    ELSE
      SELECT id INTO v_next FROM public.approval_steps
       WHERE workflow_id = v_instance.workflow_id AND step_order > v_step.step_order
       ORDER BY step_order ASC LIMIT 1;
      v_new_step_id := v_next.id;
      v_new_reg_status := 'in_progress';
    END IF;
  ELSIF _action_type = 'reject' THEN
    v_new_reg_status := 'rejected';
    v_new_instance_status := 'completed';
  ELSIF _action_type = 'send_back' THEN
    SELECT id INTO v_prev FROM public.approval_steps
     WHERE workflow_id = v_instance.workflow_id AND step_order < v_step.step_order
     ORDER BY step_order DESC LIMIT 1;
    v_new_step_id := v_prev.id;
    v_new_reg_status := 'in_progress';
  ELSIF _action_type = 'escalate' THEN
    SELECT id INTO v_next FROM public.approval_steps
     WHERE workflow_id = v_instance.workflow_id AND step_order > v_step.step_order
     ORDER BY step_order ASC LIMIT 1;
    v_new_step_id := v_next.id;
    v_new_reg_status := 'in_progress';
  ELSIF _action_type IN ('request_resubmission','return_for_correction','request_more_info') THEN
    -- All three return the registration to the applicant and pause the instance.
    v_new_reg_status := 'resubmission_required';
    v_new_instance_status := 'paused';
  END IF;

  INSERT INTO public.approval_actions (
    workflow_instance_id, step_id, actor_id, action, action_type, comments,
    entity_type, entity_id
  ) VALUES (
    v_instance.id, v_step.id, _actor_id, _action_type, _action_type, _comments,
    'registration', _registration_id
  );

  UPDATE public.workflow_instances
     SET current_step_id = v_new_step_id,
         status = COALESCE(v_new_instance_status, status),
         completed_at = CASE WHEN COALESCE(v_new_instance_status, status) = 'completed' THEN v_now ELSE completed_at END,
         updated_at = v_now
   WHERE id = v_instance.id;

  IF v_new_reg_status IS NOT NULL THEN
    UPDATE public.registrations SET status = v_new_reg_status, updated_at = v_now
     WHERE id = _registration_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action_type', _action_type,
    'registration_id', _registration_id,
    'registration_reference', v_reg.registration_reference,
    'new_step_id', v_new_step_id,
    'new_status', COALESCE(v_new_reg_status, v_reg.status),
    'instance_id', v_instance.id,
    'http', 200
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.perform_registration_workflow_transition(uuid, uuid, uuid, text, text, uuid) TO authenticated, service_role;