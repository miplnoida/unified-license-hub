
-- ============================================================
-- Application workflow: add save_comment as first-class action
-- ============================================================
CREATE OR REPLACE FUNCTION public.perform_workflow_transition(_application_id uuid, _instance_id uuid, _step_id uuid, _action_type text, _comments text, _actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app record;
  v_instance record;
  v_step record;
  v_auth jsonb;
  v_allowed_actions text[];
  v_steps_total int;
  v_current_idx int;
  v_is_first boolean;
  v_is_last boolean;
  v_next_step record;
  v_prev_step record;
  v_new_step_id uuid;
  v_new_app_status text;
  v_new_instance_status text;
  v_now timestamptz := now();
  v_role_match boolean;
  v_is_internal boolean;
  v_action_cfg record;
  v_has_cfg boolean := false;
  v_effective_action text;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;
  IF _action_type NOT IN (
    'approve','reject','send_back','escalate',
    'request_resubmission','return_for_correction','request_more_info',
    'save_comment'
  ) THEN
    RETURN jsonb_build_object('error','Invalid action_type','code','BAD_ACTION','http',400);
  END IF;

  -- save_comment progresses like approve internally but is recorded as itself.
  v_effective_action := CASE WHEN _action_type = 'save_comment' THEN 'approve' ELSE _action_type END;

  SELECT id, applicant_id, application_number, status, workflow_id
    INTO v_app FROM public.applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.status NOT IN ('submitted','in_progress') THEN
    IF v_effective_action = 'approve' AND v_app.status = 'approved' THEN
      RETURN jsonb_build_object('final_approval', true, 'http', 200);
    END IF;
    RETURN jsonb_build_object('error',format('Application is in ''%s'' status', v_app.status),
                              'code','INVALID_STATUS','http',409);
  END IF;

  SELECT id, workflow_id, current_step_id, status INTO v_instance
    FROM public.workflow_instances
   WHERE entity_id = _application_id AND entity_type = 'application' AND status = 'active'
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

  -- Load per-action config using the effective action (save_comment reuses approve config)
  SELECT * INTO v_action_cfg FROM public.approval_step_actions
   WHERE step_id = v_step.id AND action_type = v_effective_action;
  v_has_cfg := FOUND AND COALESCE(v_action_cfg.is_enabled, true);

  -- Mandatory remarks
  IF (_action_type IN (
        'approve','reject','request_resubmission',
        'return_for_correction','request_more_info','save_comment'
      ) OR (v_has_cfg AND v_action_cfg.require_comments))
     AND (_comments IS NULL OR length(trim(_comments)) = 0) THEN
    RETURN jsonb_build_object('error','Remarks are mandatory for this action','code','REMARKS_REQUIRED','http',422);
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
      RETURN jsonb_build_object('error','Only internal staff can reject this application',
                                'code','FORBIDDEN','http',403,'diagnostic',v_auth);
    END IF;
  ELSIF _action_type = 'save_comment' THEN
    -- Save Comment requires internal user on the step but does not need role match to approve.
    IF NOT v_is_internal THEN
      RETURN jsonb_build_object('error','Only internal staff can save a comment on this step',
                                'code','FORBIDDEN','http',403,'diagnostic',v_auth);
    END IF;
  ELSIF NOT v_role_match THEN
    RETURN jsonb_build_object(
      'error', format('Only %s can act on this step',
                      COALESCE(v_auth->>'required_role_name', v_step.approver_role::text)),
      'code','WRONG_APPROVER','http',403,
      'diagnostic', v_auth
    );
  END IF;

  -- Skip allowed_actions gate for save_comment (implicitly available on every step)
  IF _action_type <> 'save_comment' THEN
    v_allowed_actions := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step.allowed_actions, '[]'::jsonb)));
    IF NOT (_action_type = ANY(v_allowed_actions)) THEN
      RETURN jsonb_build_object('error',format('Action ''%s'' is not allowed on this step', _action_type),
                                'code','ACTION_NOT_ALLOWED','http',422);
    END IF;
  END IF;

  v_new_step_id := v_step.id;
  v_new_app_status := NULL;
  v_new_instance_status := NULL;

  IF v_has_cfg AND _action_type <> 'save_comment' THEN
    IF v_action_cfg.next_step_mode = 'end_workflow' THEN
      IF v_action_cfg.end_state = 'approved' THEN
        RETURN jsonb_build_object('final_approval', true, 'http', 200);
      ELSIF v_action_cfg.end_state = 'rejected' THEN
        v_new_app_status := 'rejected';
        v_new_instance_status := 'completed';
      ELSIF v_action_cfg.end_state = 'cancelled' THEN
        v_new_app_status := 'cancelled';
        v_new_instance_status := 'completed';
      ELSE
        v_new_app_status := CASE WHEN _action_type='reject' THEN 'rejected' ELSE 'approved' END;
        v_new_instance_status := 'completed';
      END IF;
    ELSIF v_action_cfg.next_step_mode = 'specific_step' AND v_action_cfg.next_step_id IS NOT NULL THEN
      v_new_step_id := v_action_cfg.next_step_id;
      v_new_app_status := 'in_progress';
    ELSIF v_action_cfg.next_step_mode = 'previous' THEN
      SELECT id INTO v_prev_step FROM public.approval_steps
       WHERE workflow_id = v_instance.workflow_id AND step_order < v_step.step_order
       ORDER BY step_order DESC LIMIT 1;
      IF FOUND THEN
        v_new_step_id := v_prev_step.id;
        v_new_app_status := 'in_progress';
      END IF;
    ELSIF v_action_cfg.next_step_mode = 'return_to_applicant' THEN
      v_new_app_status := CASE
        WHEN _action_type = 'request_more_info' THEN 'info_requested'
        WHEN _action_type = 'return_for_correction' THEN 'returned_for_correction'
        ELSE 'resubmission_required'
      END;
      v_new_instance_status := 'paused';
    ELSIF v_action_cfg.next_step_mode = 'keep' THEN
      v_new_app_status := 'in_progress';
    ELSE
      SELECT id INTO v_next_step FROM public.approval_steps
       WHERE workflow_id = v_instance.workflow_id AND step_order > v_step.step_order
       ORDER BY step_order ASC LIMIT 1;
      IF FOUND THEN
        v_new_step_id := v_next_step.id;
        v_new_app_status := 'in_progress';
      ELSIF _action_type = 'approve' THEN
        RETURN jsonb_build_object('final_approval', true, 'http', 200);
      END IF;
    END IF;

    IF v_action_cfg.result_status_override IS NOT NULL
       AND length(trim(v_action_cfg.result_status_override)) > 0
       AND v_new_instance_status IS DISTINCT FROM 'completed' THEN
      v_new_app_status := v_action_cfg.result_status_override;
    END IF;
  ELSE
    -- Legacy / save_comment path: use built-in progression by effective action
    IF _action_type = 'send_back' AND v_is_first THEN
      RETURN jsonb_build_object('error','Cannot send back from the first step','code','CANNOT_SEND_BACK','http',422);
    END IF;
    IF _action_type = 'escalate' AND v_is_last THEN
      RETURN jsonb_build_object('error','Cannot escalate from the last step','code','CANNOT_ESCALATE','http',422);
    END IF;

    IF v_effective_action = 'approve' AND v_is_last THEN
      -- For save_comment on the last step: final approval path
      RETURN jsonb_build_object('final_approval', true, 'http', 200);
    END IF;

    IF v_effective_action = 'approve' THEN
      SELECT id INTO v_next_step FROM public.approval_steps
       WHERE workflow_id = v_instance.workflow_id AND step_order > v_step.step_order
       ORDER BY step_order ASC LIMIT 1;
      IF FOUND THEN v_new_step_id := v_next_step.id; v_new_app_status := 'in_progress'; END IF;
    ELSIF _action_type = 'reject' THEN
      v_new_app_status := 'rejected'; v_new_instance_status := 'completed';
    ELSIF _action_type = 'send_back' THEN
      SELECT id INTO v_prev_step FROM public.approval_steps
       WHERE workflow_id = v_instance.workflow_id AND step_order < v_step.step_order
       ORDER BY step_order DESC LIMIT 1;
      IF FOUND THEN v_new_step_id := v_prev_step.id; v_new_app_status := 'in_progress'; END IF;
    ELSIF _action_type = 'escalate' THEN
      SELECT id INTO v_next_step FROM public.approval_steps
       WHERE workflow_id = v_instance.workflow_id AND step_order > v_step.step_order
       ORDER BY step_order ASC LIMIT 1;
      IF FOUND THEN v_new_step_id := v_next_step.id; v_new_app_status := 'in_progress'; END IF;
    ELSIF _action_type = 'request_resubmission' THEN
      v_new_app_status := 'resubmission_required'; v_new_instance_status := 'paused';
    ELSIF _action_type = 'return_for_correction' THEN
      v_new_app_status := 'returned_for_correction'; v_new_instance_status := 'paused';
    ELSIF _action_type = 'request_more_info' THEN
      v_new_app_status := 'info_requested'; v_new_instance_status := 'paused';
    END IF;
  END IF;

  -- Enforce one save_comment per (actor, step) — replace older row
  IF _action_type = 'save_comment' THEN
    DELETE FROM public.approval_actions
     WHERE application_id = _application_id
       AND step_id = v_step.id
       AND actor_id = _actor_id
       AND action_type = 'save_comment';
  END IF;

  INSERT INTO public.approval_actions (
    application_id, workflow_instance_id, step_id, actor_id, action, action_type, comments
  )
  VALUES (
    _application_id, v_instance.id, v_step.id, _actor_id,
    CASE WHEN _action_type = 'save_comment' THEN 'comment_saved' ELSE _action_type END,
    _action_type, _comments
  );

  UPDATE public.workflow_instances
     SET current_step_id = v_new_step_id,
         status = COALESCE(v_new_instance_status, status),
         updated_at = v_now
   WHERE id = v_instance.id;

  IF v_new_app_status IS NOT NULL THEN
    UPDATE public.applications
       SET status = v_new_app_status,
           current_step_id = v_new_step_id,
           updated_at = v_now
     WHERE id = _application_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action_type', _action_type,
    'application_id', _application_id,
    'application_number', v_app.application_number,
    'new_step_id', v_new_step_id,
    'new_status', COALESCE(v_new_app_status, v_app.status),
    'instance_paused', (v_new_instance_status = 'paused'),
    'used_action_config', v_has_cfg,
    'http', 200
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.perform_workflow_transition(uuid, uuid, uuid, text, text, uuid) TO authenticated, service_role;

-- ============================================================
-- Registration workflow: add save_comment
-- ============================================================
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
  v_effective_action text;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;
  IF _action_type NOT IN (
    'approve','reject','send_back','escalate',
    'request_resubmission','return_for_correction','request_more_info',
    'save_comment'
  ) THEN
    RETURN jsonb_build_object('error','Invalid action_type','code','BAD_ACTION','http',400);
  END IF;

  v_effective_action := CASE WHEN _action_type = 'save_comment' THEN 'approve' ELSE _action_type END;

  IF _action_type IN (
    'approve','reject','request_resubmission','return_for_correction','request_more_info','save_comment'
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
  ELSIF _action_type = 'save_comment' THEN
    IF NOT v_is_internal THEN
      RETURN jsonb_build_object('error','Only internal staff can save a comment on this step',
                                'code','FORBIDDEN','http',403,'diagnostic',v_auth);
    END IF;
  ELSIF NOT v_role_match THEN
    RETURN jsonb_build_object(
      'error', format('Only %s can act on this step',
                      COALESCE(v_auth->>'required_role_name', v_step.approver_role::text)),
      'code','WRONG_APPROVER','http',403, 'diagnostic', v_auth);
  END IF;

  IF _action_type <> 'save_comment' THEN
    v_allowed := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step.allowed_actions, '[]'::jsonb)));
    IF NOT (_action_type = ANY(v_allowed)) THEN
      RETURN jsonb_build_object('error',format('Action ''%s'' is not allowed on this step', _action_type),
                                'code','ACTION_NOT_ALLOWED','http',422);
    END IF;
  END IF;

  IF _action_type = 'send_back' AND v_is_first THEN
    RETURN jsonb_build_object('error','Cannot send back from the first step','code','CANNOT_SEND_BACK','http',422);
  END IF;
  IF _action_type = 'escalate' AND v_is_last THEN
    RETURN jsonb_build_object('error','Cannot escalate from the last step','code','CANNOT_ESCALATE','http',422);
  END IF;

  v_new_step_id := v_step.id;

  IF v_effective_action = 'approve' THEN
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
    v_new_reg_status := 'resubmission_required';
    v_new_instance_status := 'paused';
  END IF;

  IF _action_type = 'save_comment' THEN
    DELETE FROM public.approval_actions
     WHERE entity_type = 'registration'
       AND entity_id = _registration_id
       AND step_id = v_step.id
       AND actor_id = _actor_id
       AND action_type = 'save_comment';
  END IF;

  INSERT INTO public.approval_actions (
    workflow_instance_id, step_id, actor_id, action, action_type, comments,
    entity_type, entity_id
  ) VALUES (
    v_instance.id, v_step.id, _actor_id,
    CASE WHEN _action_type = 'save_comment' THEN 'comment_saved' ELSE _action_type END,
    _action_type, _comments,
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

-- ============================================================
-- Return workflow: add save_comment
-- ============================================================
CREATE OR REPLACE FUNCTION public.perform_return_workflow_transition(
  _return_id uuid,
  _instance_id uuid,
  _step_id uuid,
  _action_type text,
  _comments text,
  _actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ret record;
  v_instance record;
  v_step record;
  v_auth jsonb;
  v_allowed_actions text[];
  v_steps_total int;
  v_current_idx int;
  v_is_last boolean;
  v_next_step record;
  v_prev_step record;
  v_new_step_id uuid;
  v_new_status text;
  v_new_instance_status text;
  v_now timestamptz := now();
  v_prev_status text;
  v_prev_step_id uuid;
  v_action_key text;
  v_event_key text;
  v_actor_role text;
  v_effective_action text;
BEGIN
  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;

  IF _action_type NOT IN ('approve','reject','send_back','escalate','request_resubmission','save_comment') THEN
    RETURN jsonb_build_object('error','Invalid action_type','code','BAD_ACTION','http',400);
  END IF;

  v_effective_action := CASE WHEN _action_type = 'save_comment' THEN 'approve' ELSE _action_type END;

  IF _action_type IN ('approve','reject','request_resubmission','save_comment')
     AND (_comments IS NULL OR length(trim(_comments)) = 0) THEN
    RETURN jsonb_build_object('error','Remarks are mandatory for this action','code','REMARKS_REQUIRED','http',422);
  END IF;

  SELECT id, unique_id, workflow_status, workflow_id, current_step_id
    INTO v_ret
    FROM public.returns_filed
   WHERE id = _return_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Return not found','code','NOT_FOUND','http',404);
  END IF;

  v_prev_status := v_ret.workflow_status::text;
  v_prev_step_id := v_ret.current_step_id;

  IF upper(v_prev_status) <> 'SUB' THEN
    RETURN jsonb_build_object('error', format('Return is in ''%s'' status', v_ret.workflow_status), 'code','INVALID_STATUS','http',409);
  END IF;

  SELECT id, workflow_id, current_step_id, status
    INTO v_instance
    FROM public.workflow_instances
   WHERE entity_id = _return_id
     AND entity_type = 'return'
     AND status = 'active'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','No active workflow instance','code','NO_ACTIVE_INSTANCE','http',409);
  END IF;

  IF _instance_id IS NOT NULL AND _instance_id <> v_instance.id THEN
    RETURN jsonb_build_object('error','Stale workflow instance','code','STALE_INSTANCE','http',409);
  END IF;

  SELECT s.* INTO v_step FROM public.approval_steps s WHERE s.id = v_instance.current_step_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Current step missing','code','BAD_STEP','http',409);
  END IF;

  IF _step_id IS NOT NULL AND _step_id <> v_step.id THEN
    RETURN jsonb_build_object('error','Stale step','code','STALE_STEP','http',409);
  END IF;

  SELECT public.user_can_act_on_workflow_step(_actor_id, v_step.id) INTO v_auth;
  IF NOT COALESCE((v_auth->>'can_act')::boolean, false) THEN
    -- save_comment: allow if user is internal even without full role match
    IF NOT (_action_type = 'save_comment' AND COALESCE((v_auth->>'is_internal')::boolean, false)) THEN
      RETURN jsonb_build_object('error','You are not authorized to act on this step','code','FORBIDDEN','http',403);
    END IF;
  END IF;

  IF _action_type <> 'save_comment' THEN
    v_allowed_actions := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_auth->'allowed_actions')), ARRAY[]::text[]);
    IF NOT (_action_type = ANY(v_allowed_actions)) THEN
      RETURN jsonb_build_object('error', format('Action ''%s'' not allowed at this step', _action_type), 'code','ACTION_NOT_ALLOWED','http',403);
    END IF;
  END IF;

  v_actor_role := NULLIF(COALESCE(v_auth->>'required_role_name', v_auth->>'required_role_id'), '');

  SELECT count(*) INTO v_steps_total FROM public.approval_steps WHERE workflow_id = v_instance.workflow_id;
  SELECT count(*) INTO v_current_idx
    FROM public.approval_steps
   WHERE workflow_id = v_instance.workflow_id
     AND step_order <= v_step.step_order;
  v_is_last := v_current_idx = v_steps_total;

  SELECT * INTO v_next_step
    FROM public.approval_steps
   WHERE workflow_id = v_instance.workflow_id
     AND step_order > v_step.step_order
   ORDER BY step_order ASC
   LIMIT 1;

  SELECT * INTO v_prev_step
    FROM public.approval_steps
   WHERE workflow_id = v_instance.workflow_id
     AND step_order < v_step.step_order
   ORDER BY step_order DESC
   LIMIT 1;

  IF _action_type = 'send_back' AND v_prev_step.id IS NULL THEN
    RETURN jsonb_build_object('error','Cannot send back from the first step','code','CANNOT_SEND_BACK','http',422);
  END IF;

  IF _action_type = 'escalate' AND v_next_step.id IS NULL THEN
    RETURN jsonb_build_object('error','Cannot escalate from the last step','code','CANNOT_ESCALATE','http',422);
  END IF;

  IF v_effective_action = 'approve' THEN
    IF v_is_last THEN
      v_new_step_id := v_step.id;
      v_new_status := 'VAL';
      v_new_instance_status := 'completed';
      v_action_key := CASE WHEN _action_type = 'save_comment' THEN 'comment_saved' ELSE 'return_approved' END;
      v_event_key  := CASE WHEN _action_type = 'save_comment' THEN 'return.comment_saved' ELSE 'return.approved' END;
    ELSE
      v_new_step_id := v_next_step.id;
      v_new_status := v_prev_status;
      v_action_key := CASE WHEN _action_type = 'save_comment' THEN 'comment_saved' ELSE 'workflow_step_approved' END;
      v_event_key  := CASE WHEN _action_type = 'save_comment' THEN 'return.comment_saved' ELSE 'return.workflow_step_approved' END;
    END IF;
  ELSIF _action_type = 'reject' THEN
    v_new_step_id := v_step.id;
    v_new_status := 'REJ';
    v_new_instance_status := 'completed';
    v_action_key := 'return_rejected';
    v_event_key := 'return.rejected';
  ELSIF _action_type = 'send_back' THEN
    v_new_step_id := v_prev_step.id;
    v_new_status := v_prev_status;
    v_action_key := 'return_sent_back';
    v_event_key := 'return.send_back';
  ELSIF _action_type = 'request_resubmission' THEN
    v_new_step_id := v_step.id;
    v_new_status := 'TBR';
    v_new_instance_status := 'paused';
    v_action_key := 'edit_requested';
    v_event_key := 'return.edit_requested';

    INSERT INTO public.return_requests (return_id, reasons, status, requested_by)
    VALUES (_return_id, _comments, 'active', _actor_id);
  ELSIF _action_type = 'escalate' THEN
    v_new_step_id := v_next_step.id;
    v_new_status := v_prev_status;
    v_action_key := 'workflow_step_escalated';
    v_event_key := 'return.workflow_step_escalated';
  END IF;

  IF _action_type = 'save_comment' THEN
    DELETE FROM public.approval_actions
     WHERE entity_type = 'return'
       AND entity_id = _return_id
       AND step_id = v_step.id
       AND actor_id = _actor_id
       AND action_type = 'save_comment';
  END IF;

  INSERT INTO public.approval_actions
    (entity_type, entity_id, application_id, workflow_instance_id, step_id, actor_id, action, action_type, comments)
  VALUES
    ('return', _return_id, NULL, v_instance.id, v_step.id, _actor_id,
     CASE WHEN _action_type = 'save_comment' THEN 'comment_saved' ELSE _action_type END,
     _action_type, _comments);

  INSERT INTO public.return_audit_log
    (return_id, action, previous_status, new_status, comments, performed_by,
     previous_step_id, new_step_id, actor_role, metadata, event_key, source)
  VALUES
    (_return_id, v_action_key, v_prev_status, COALESCE(v_new_status, v_prev_status),
     _comments, _actor_id,
     v_prev_step_id, v_new_step_id, v_actor_role,
     jsonb_build_object(
       'workflow_id', v_instance.workflow_id,
       'instance_id', v_instance.id,
       'action_type', _action_type,
       'is_final', v_is_last,
       'step_order', v_step.step_order
     ),
     v_event_key, 'rpc:perform_return_workflow_transition');

  IF v_new_step_id IS DISTINCT FROM v_prev_step_id AND _action_type IN ('approve','save_comment','send_back','escalate') THEN
    INSERT INTO public.return_audit_log
      (return_id, action, previous_status, new_status, comments, performed_by,
       previous_step_id, new_step_id, actor_role, metadata, event_key, source)
    VALUES
      (_return_id, 'workflow_step_changed', v_prev_status, COALESCE(v_new_status, v_prev_status),
       CASE
         WHEN _action_type = 'send_back' THEN 'Workflow sent back to previous step'
         WHEN _action_type = 'escalate' THEN 'Workflow escalated to next step'
         ELSE 'Workflow step changed'
       END,
       _actor_id,
       v_prev_step_id, v_new_step_id, v_actor_role,
       jsonb_build_object('workflow_id', v_instance.workflow_id, 'instance_id', v_instance.id, 'action_type', _action_type),
       'return.workflow_step_changed', 'rpc:perform_return_workflow_transition');
  END IF;

  IF v_new_step_id IS DISTINCT FROM v_prev_step_id AND v_effective_action = 'approve' AND NOT v_is_last THEN
    INSERT INTO public.return_audit_log
      (return_id, action, previous_status, new_status, comments, performed_by,
       previous_step_id, new_step_id, actor_role, metadata, event_key, source)
    VALUES
      (_return_id, 'workflow_step_moved', v_prev_status, COALESCE(v_new_status, v_prev_status),
       'Workflow advanced to next step', _actor_id,
       v_prev_step_id, v_new_step_id, v_actor_role,
       jsonb_build_object('workflow_id', v_instance.workflow_id, 'instance_id', v_instance.id),
       'return.workflow_step_moved', 'rpc:perform_return_workflow_transition');
  END IF;

  IF v_new_status IS NOT NULL AND v_new_status <> v_prev_status THEN
    INSERT INTO public.return_audit_log
      (return_id, action, previous_status, new_status, comments, performed_by, actor_role, metadata, event_key, source)
    VALUES
      (_return_id, 'status_changed', v_prev_status, v_new_status,
       'Status changed by workflow action', _actor_id, v_actor_role,
       jsonb_build_object('from', v_prev_status, 'to', v_new_status, 'action_type', _action_type),
       'return.status_changed', 'rpc:perform_return_workflow_transition');

    IF v_new_status = 'TBR' THEN
      INSERT INTO public.return_audit_log
        (return_id, action, previous_status, new_status, comments, performed_by, actor_role, metadata, event_key, source)
      VALUES
        (_return_id, 'status_changed_to_tbr', v_prev_status, 'TBR',
         COALESCE(_comments, 'Return moved to TBR'), _actor_id, v_actor_role,
         jsonb_build_object('action_type', _action_type),
         'return.status_changed_to_tbr', 'rpc:perform_return_workflow_transition');
    END IF;
  END IF;

  UPDATE public.workflow_instances
     SET current_step_id = v_new_step_id,
         status = COALESCE(v_new_instance_status, status),
         completed_at = CASE WHEN COALESCE(v_new_instance_status, '') = 'completed' THEN v_now ELSE completed_at END,
         updated_at = v_now
   WHERE id = v_instance.id;

  IF v_new_status IS NOT NULL THEN
    UPDATE public.returns_filed
       SET workflow_status = v_new_status::public.return_workflow_status,
           current_step_id = CASE WHEN v_new_instance_status = 'completed' THEN NULL ELSE v_new_step_id END,
           updated_by = _actor_id,
           updated_at = v_now
     WHERE id = _return_id;
  ELSE
    UPDATE public.returns_filed
       SET current_step_id = v_new_step_id,
           updated_by = _actor_id,
           updated_at = v_now
     WHERE id = _return_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action_type', _action_type,
    'action_key', v_action_key,
    'event_key', v_event_key,
    'return_id', _return_id,
    'unique_id', v_ret.unique_id,
    'new_step_id', v_new_step_id,
    'previous_step_id', v_prev_step_id,
    'new_status', COALESCE(v_new_status, v_prev_status),
    'previous_status', v_prev_status,
    'instance_id', v_instance.id,
    'http', 200
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.perform_return_workflow_transition(uuid, uuid, uuid, text, text, uuid) TO authenticated, service_role;
