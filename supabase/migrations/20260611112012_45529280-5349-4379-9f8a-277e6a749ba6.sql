
-- ============================================================
-- user_can_act_on_workflow_step: honor approver_type / approver_config
-- ============================================================
CREATE OR REPLACE FUNCTION public.user_can_act_on_workflow_step(_user_id uuid, _step_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_step record;
  v_actor_system_roles text[];
  v_actor_dynamic_role_ids uuid[];
  v_required_role_name text;
  v_required_system_role text;
  v_role_match boolean := false;
  v_reason text := 'WRONG_APPROVER';
  v_internal_roles text[] := ARRAY['super_admin','admin','supervisor','licensing_officer','analyst','developer'];
  v_is_internal boolean := false;
  v_allowed text[];
  v_steps_total int := 0;
  v_current_idx int := 0;
  v_is_last boolean := false;
  v_is_first boolean := false;
  v_can_add_remark boolean := false;
  v_can_reject boolean := false;
  v_can_forward boolean := false;
  v_can_approve boolean := false;
  v_can_send_back boolean := false;
  v_can_escalate boolean := false;
  v_can_request_resubmission boolean := false;
  v_can_return_for_correction boolean := false;
  v_can_request_more_info boolean := false;
  v_cfg_role_ids uuid[];
  v_cfg_user_ids uuid[];
BEGIN
  IF _user_id IS NULL OR _step_id IS NULL THEN
    RETURN jsonb_build_object('can_act', false, 'reason', 'BAD_INPUT');
  END IF;

  SELECT id, approver_role, approver_role_id, allowed_actions, name, step_order, workflow_id,
         approver_type, approver_config
    INTO v_step FROM public.approval_steps WHERE id = _step_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('can_act', false, 'reason', 'STEP_NOT_FOUND');
  END IF;

  SELECT array_agg(DISTINCT r) INTO v_actor_system_roles FROM (
    SELECT role::text AS r FROM public.user_roles WHERE user_id = _user_id
    UNION
    SELECT ro.system_role FROM public.user_dynamic_roles udr
      JOIN public.roles ro ON ro.id = udr.role_id
     WHERE udr.user_id = _user_id AND ro.system_role IS NOT NULL
  ) sub;
  v_actor_system_roles := COALESCE(v_actor_system_roles, ARRAY[]::text[]);

  SELECT array_agg(DISTINCT role_id) INTO v_actor_dynamic_role_ids
    FROM public.user_dynamic_roles WHERE user_id = _user_id;
  v_actor_dynamic_role_ids := COALESCE(v_actor_dynamic_role_ids, ARRAY[]::uuid[]);

  v_is_internal := EXISTS (
    SELECT 1 FROM unnest(v_actor_system_roles) AS r WHERE r = ANY(v_internal_roles)
  );

  -- NEW: specific-users approver type
  IF COALESCE(v_step.approver_type, 'role_based_user') = 'specific_users' THEN
    SELECT ARRAY(
      SELECT (value)::uuid FROM jsonb_array_elements_text(
        COALESCE(v_step.approver_config->'user_ids', '[]'::jsonb)
      )
    ) INTO v_cfg_user_ids;
    IF _user_id = ANY(v_cfg_user_ids) THEN
      v_role_match := true; v_reason := 'SPECIFIC_USER_MATCH';
    ELSIF 'super_admin' = ANY(v_actor_system_roles) THEN
      v_role_match := true; v_reason := 'SUPER_ADMIN_OVERRIDE';
    END IF;
    v_required_role_name := 'specific users';
    v_required_system_role := NULL;
  ELSE
    -- NEW: multi-role list in approver_config.role_ids (in addition to legacy single role)
    SELECT ARRAY(
      SELECT (value)::uuid FROM jsonb_array_elements_text(
        COALESCE(v_step.approver_config->'role_ids', '[]'::jsonb)
      )
    ) INTO v_cfg_role_ids;

    IF v_step.approver_role_id IS NOT NULL THEN
      SELECT name, system_role INTO v_required_role_name, v_required_system_role
        FROM public.roles WHERE id = v_step.approver_role_id;
      IF v_step.approver_role_id = ANY(v_actor_dynamic_role_ids) THEN
        v_role_match := true; v_reason := 'DYNAMIC_ROLE_MATCH';
      ELSIF v_required_system_role IS NOT NULL
         AND v_required_system_role = ANY(v_actor_system_roles) THEN
        v_role_match := true; v_reason := 'SYSTEM_ROLE_EQUIVALENT_MATCH';
      END IF;
    ELSE
      v_required_role_name := v_step.approver_role::text;
      v_required_system_role := v_step.approver_role::text;
      IF v_step.approver_role::text = ANY(v_actor_system_roles) THEN
        v_role_match := true; v_reason := 'LEGACY_SYSTEM_ROLE_MATCH';
      END IF;
    END IF;

    -- Extra role_ids from approver_config
    IF NOT v_role_match AND array_length(v_cfg_role_ids, 1) > 0 THEN
      IF EXISTS (
        SELECT 1 FROM unnest(v_cfg_role_ids) AS rid
        WHERE rid = ANY(v_actor_dynamic_role_ids)
      ) THEN
        v_role_match := true; v_reason := 'CFG_ROLE_MATCH';
      ELSIF EXISTS (
        SELECT 1 FROM public.roles ro
        WHERE ro.id = ANY(v_cfg_role_ids)
          AND ro.system_role IS NOT NULL
          AND ro.system_role = ANY(v_actor_system_roles)
      ) THEN
        v_role_match := true; v_reason := 'CFG_ROLE_SYSTEM_MATCH';
      END IF;
    END IF;

    IF NOT v_role_match AND 'super_admin' = ANY(v_actor_system_roles) THEN
      v_role_match := true; v_reason := 'SUPER_ADMIN_OVERRIDE';
    END IF;
  END IF;

  SELECT count(*),
         (SELECT count(*) FROM public.approval_steps s2
          WHERE s2.workflow_id = v_step.workflow_id AND s2.step_order < v_step.step_order)
    INTO v_steps_total, v_current_idx
    FROM public.approval_steps WHERE workflow_id = v_step.workflow_id;
  v_is_first := (v_current_idx = 0);
  v_is_last  := (v_steps_total > 0 AND v_current_idx = v_steps_total - 1);

  v_allowed := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step.allowed_actions, '[]'::jsonb)));

  v_can_add_remark := v_is_internal;
  v_can_reject := v_is_internal AND ('reject' = ANY(v_allowed));
  IF v_role_match THEN
    IF 'approve' = ANY(v_allowed) THEN
      IF v_is_last THEN v_can_approve := true; ELSE v_can_forward := true; END IF;
    END IF;
    v_can_send_back := (NOT v_is_first) AND ('send_back' = ANY(v_allowed));
    v_can_escalate := (NOT v_is_last) AND ('escalate' = ANY(v_allowed));
    v_can_request_resubmission := ('request_resubmission' = ANY(v_allowed));
    v_can_return_for_correction := ('return_for_correction' = ANY(v_allowed));
    v_can_request_more_info := ('request_more_info' = ANY(v_allowed));
  END IF;

  RETURN jsonb_build_object(
    'can_act', v_role_match,
    'reason', v_reason,
    'is_internal', v_is_internal,
    'approver_type', COALESCE(v_step.approver_type, 'role_based_user'),
    'required_role_name', v_required_role_name,
    'required_system_role', v_required_system_role,
    'actor_system_roles', to_jsonb(v_actor_system_roles),
    'is_first', v_is_first,
    'is_last', v_is_last,
    'allowed_actions', to_jsonb(v_allowed),
    'can_add_remark', v_can_add_remark,
    'can_reject', v_can_reject,
    'can_forward', v_can_forward,
    'can_approve', v_can_approve,
    'can_send_back', v_can_send_back,
    'can_escalate', v_can_escalate,
    'can_request_resubmission', v_can_request_resubmission,
    'can_return_for_correction', v_can_return_for_correction,
    'can_request_more_info', v_can_request_more_info
  );
END;
$function$;

-- ============================================================
-- perform_workflow_transition: honor approval_step_actions config
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

  SELECT id, applicant_id, application_number, status, workflow_id
    INTO v_app FROM public.applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.status NOT IN ('submitted','in_progress') THEN
    IF _action_type = 'approve' AND v_app.status = 'approved' THEN
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

  -- Load per-action config if present
  SELECT * INTO v_action_cfg FROM public.approval_step_actions
   WHERE step_id = v_step.id AND action_type = _action_type;
  v_has_cfg := FOUND AND COALESCE(v_action_cfg.is_enabled, true);

  -- Mandatory remarks: built-in defaults OR per-action override
  IF (_action_type IN (
        'approve','reject','request_resubmission',
        'return_for_correction','request_more_info'
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
  ELSIF NOT v_role_match THEN
    RETURN jsonb_build_object(
      'error', format('Only %s can act on this step',
                      COALESCE(v_auth->>'required_role_name', v_step.approver_role::text)),
      'code','WRONG_APPROVER','http',403,
      'diagnostic', v_auth
    );
  END IF;

  v_allowed_actions := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step.allowed_actions, '[]'::jsonb)));
  IF NOT (_action_type = ANY(v_allowed_actions)) THEN
    RETURN jsonb_build_object('error',format('Action ''%s'' is not allowed on this step', _action_type),
                              'code','ACTION_NOT_ALLOWED','http',422);
  END IF;

  v_new_step_id := v_step.id;
  v_new_app_status := NULL;
  v_new_instance_status := NULL;

  -- ── Per-action routing (preferred when config row exists) ──
  IF v_has_cfg THEN
    IF v_action_cfg.next_step_mode = 'end_workflow' THEN
      IF v_action_cfg.end_state = 'approved' THEN
        -- Delegates to perform_final_workflow_approval via edge function
        RETURN jsonb_build_object('final_approval', true, 'http', 200);
      ELSIF v_action_cfg.end_state = 'rejected' THEN
        v_new_app_status := 'rejected';
        v_new_instance_status := 'completed';
      ELSIF v_action_cfg.end_state = 'cancelled' THEN
        v_new_app_status := 'cancelled';
        v_new_instance_status := 'completed';
      ELSE
        -- default end state when not set
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
    ELSE -- 'next' (default)
      SELECT id INTO v_next_step FROM public.approval_steps
       WHERE workflow_id = v_instance.workflow_id AND step_order > v_step.step_order
       ORDER BY step_order ASC LIMIT 1;
      IF FOUND THEN
        v_new_step_id := v_next_step.id;
        v_new_app_status := 'in_progress';
      ELSIF _action_type = 'approve' THEN
        -- no next step + approve = final approval
        RETURN jsonb_build_object('final_approval', true, 'http', 200);
      END IF;
    END IF;

    -- Result status override (takes precedence over computed status, but
    -- never overrides terminal states the routing already set)
    IF v_action_cfg.result_status_override IS NOT NULL
       AND length(trim(v_action_cfg.result_status_override)) > 0
       AND v_new_instance_status IS DISTINCT FROM 'completed' THEN
      v_new_app_status := v_action_cfg.result_status_override;
    END IF;
  ELSE
    -- ── Legacy hardcoded routing (back-compat for steps with no action config) ──
    IF _action_type = 'send_back' AND v_is_first THEN
      RETURN jsonb_build_object('error','Cannot send back from the first step','code','CANNOT_SEND_BACK','http',422);
    END IF;
    IF _action_type = 'escalate' AND v_is_last THEN
      RETURN jsonb_build_object('error','Cannot escalate from the last step','code','CANNOT_ESCALATE','http',422);
    END IF;

    IF _action_type = 'approve' AND v_is_last THEN
      RETURN jsonb_build_object('final_approval', true, 'http', 200);
    END IF;

    IF _action_type = 'approve' THEN
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

  INSERT INTO public.approval_actions (
    application_id, workflow_instance_id, step_id, actor_id, action, action_type, comments
  )
  VALUES (
    _application_id, v_instance.id, v_step.id, _actor_id,
    _action_type, _action_type, _comments
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
