-- Workflow step authorization hardening (see description)

CREATE OR REPLACE FUNCTION public.log_workflow_authz_denial(
  _actor_id uuid,
  _step_id uuid,
  _action_type text,
  _reason text,
  _diagnostic jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.security_event_logs (
    user_id, event_type, severity, module, action,
    object_type, object_id, detail
  ) VALUES (
    _actor_id, 'ACCESS_DENIED', 'high', 'workflow_management',
    COALESCE(_action_type, 'unknown'),
    'approval_step', _step_id::text,
    jsonb_build_object('reason', COALESCE(_reason, 'WRONG_APPROVER'),
                       'diagnostic', COALESCE(_diagnostic, '{}'::jsonb))
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.log_workflow_authz_denial(uuid, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_workflow_authz_denial(uuid, uuid, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_workflow_authz_denial(uuid, uuid, text, text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.workflow_actor_sector_allowed(
  _user_id uuid,
  _sector_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_sector_scope boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF _sector_id IS NULL THEN RETURN true; END IF;
  IF public.is_super_admin(_user_id) THEN RETURN true; END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.sec_user_roles sur
      JOIN public.sec_role_scopes srs ON srs.role_id = sur.role_id
      JOIN public.sec_scope_types st ON st.id = srs.scope_type_id
      JOIN public.sec_role_scope_values v ON v.role_scope_id = srs.id
     WHERE sur.user_id = _user_id AND st.key = 'sector'
  ) INTO v_has_sector_scope;

  IF NOT COALESCE(v_has_sector_scope, false) THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.sec_user_roles sur
      JOIN public.sec_role_scopes srs ON srs.role_id = sur.role_id
      JOIN public.sec_scope_types st ON st.id = srs.scope_type_id
      JOIN public.sec_role_scope_values v ON v.role_scope_id = srs.id
     WHERE sur.user_id = _user_id
       AND st.key = 'sector'
       AND v.value_id = _sector_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.workflow_actor_sector_allowed(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.workflow_actor_sector_allowed(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.workflow_actor_sector_allowed(uuid, uuid) TO authenticated, service_role;

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
  v_role_exact boolean := false;
  v_reason text := 'WRONG_APPROVER';
  v_internal_roles text[] := ARRAY['super_admin','admin','supervisor','licensing_officer','analyst','developer'];
  v_is_internal boolean := false;
  v_allow_equiv boolean := false;
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
    RETURN jsonb_build_object('can_act', false, 'reason', 'BAD_INPUT', 'deny_reason', 'BAD_INPUT');
  END IF;

  SELECT id, approver_role, approver_role_id, allowed_actions, name, step_order, workflow_id,
         approver_type, approver_config
    INTO v_step FROM public.approval_steps WHERE id = _step_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('can_act', false, 'reason', 'STEP_NOT_FOUND', 'deny_reason', 'STEP_NOT_FOUND');
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

  -- `is_internal` is informational ONLY: it grants no decision right, it only
  -- permits a non-decisional remark (save_comment).
  v_is_internal := EXISTS (
    SELECT 1 FROM unnest(v_actor_system_roles) AS r WHERE r = ANY(v_internal_roles)
  );

  v_allow_equiv := COALESCE((v_step.approver_config->>'allow_system_role_equivalence')::boolean, false);

  IF COALESCE(v_step.approver_type, 'role_based_user') = 'specific_users' THEN
    SELECT ARRAY(
      SELECT (value)::uuid FROM jsonb_array_elements_text(
        COALESCE(v_step.approver_config->'user_ids', '[]'::jsonb)
      )
    ) INTO v_cfg_user_ids;
    IF _user_id = ANY(v_cfg_user_ids) THEN
      v_role_match := true; v_role_exact := true; v_reason := 'SPECIFIC_USER_MATCH';
    END IF;
    v_required_role_name := 'specific users';
    v_required_system_role := NULL;
  ELSE
    SELECT ARRAY(
      SELECT (value)::uuid FROM jsonb_array_elements_text(
        COALESCE(v_step.approver_config->'role_ids', '[]'::jsonb)
      )
    ) INTO v_cfg_role_ids;

    IF v_step.approver_role_id IS NOT NULL THEN
      SELECT name, system_role INTO v_required_role_name, v_required_system_role
        FROM public.roles WHERE id = v_step.approver_role_id;
      IF v_step.approver_role_id = ANY(v_actor_dynamic_role_ids) THEN
        v_role_match := true; v_role_exact := true; v_reason := 'DYNAMIC_ROLE_MATCH';
      ELSIF v_allow_equiv
         AND v_required_system_role IS NOT NULL
         AND v_required_system_role = ANY(v_actor_system_roles) THEN
        v_role_match := true; v_reason := 'SYSTEM_ROLE_EQUIVALENT_MATCH';
      END IF;
    ELSE
      v_required_role_name := v_step.approver_role::text;
      v_required_system_role := v_step.approver_role::text;
      IF v_step.approver_role::text = ANY(v_actor_system_roles) THEN
        v_role_match := true; v_role_exact := true; v_reason := 'LEGACY_SYSTEM_ROLE_MATCH';
      END IF;
    END IF;

    IF NOT v_role_match AND array_length(v_cfg_role_ids, 1) > 0 THEN
      IF EXISTS (
        SELECT 1 FROM unnest(v_cfg_role_ids) AS rid
        WHERE rid = ANY(v_actor_dynamic_role_ids)
      ) THEN
        v_role_match := true; v_role_exact := true; v_reason := 'CFG_ROLE_MATCH';
      ELSIF v_allow_equiv AND EXISTS (
        SELECT 1 FROM public.roles ro
        WHERE ro.id = ANY(v_cfg_role_ids)
          AND ro.system_role IS NOT NULL
          AND ro.system_role = ANY(v_actor_system_roles)
      ) THEN
        v_role_match := true; v_reason := 'CFG_ROLE_SYSTEM_MATCH';
      END IF;
    END IF;
  END IF;

  IF NOT v_role_match AND 'super_admin' = ANY(v_actor_system_roles) THEN
    v_role_match := true; v_reason := 'SUPER_ADMIN_OVERRIDE';
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
  IF v_role_match THEN
    v_can_reject := ('reject' = ANY(v_allowed));
    IF 'approve' = ANY(v_allowed) THEN
      IF v_is_last THEN v_can_approve := true; ELSE v_can_forward := true; END IF;
    END IF;
    v_can_send_back := ('send_back' = ANY(v_allowed));
    v_can_escalate := (NOT v_is_last) AND ('escalate' = ANY(v_allowed));
    v_can_request_resubmission := ('request_resubmission' = ANY(v_allowed));
    v_can_return_for_correction := ('return_for_correction' = ANY(v_allowed));
    v_can_request_more_info := ('request_more_info' = ANY(v_allowed));
  END IF;

  RETURN jsonb_build_object(
    'can_act', v_role_match,
    'reason', v_reason,
    'deny_reason', CASE WHEN v_role_match THEN NULL ELSE 'WRONG_APPROVER' END,
    'role_exact', v_role_exact,
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

DO $patch$
DECLARE
  v_def text;
  v_new text;
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.perform_workflow_transition(uuid,uuid,uuid,text,text,uuid)',
    'public.perform_registration_workflow_transition(uuid,uuid,uuid,text,text,uuid)'
  ] LOOP
    v_def := pg_get_functiondef(v_fn::regprocedure);

    v_new := regexp_replace(
      v_def,
      'IF _action_type = ''reject'' THEN.*?ELSIF _action_type = ''save_comment'' THEN',
      'IF _action_type = ''save_comment'' THEN',
      'gs'
    );
    IF v_new = v_def THEN
      RAISE EXCEPTION 'Could not locate reject bypass in %', v_fn;
    END IF;

    v_def := v_new;
    v_new := replace(
      v_def,
      'ELSIF NOT v_role_match THEN',
      'ELSIF NOT v_role_match THEN'
        || E'\n    PERFORM public.log_workflow_authz_denial(_actor_id, v_step.id, _action_type, COALESCE(v_auth->>''reason'',''WRONG_APPROVER''), v_auth);'
    );
    IF v_new = v_def THEN
      RAISE EXCEPTION 'Could not locate role-match denial in %', v_fn;
    END IF;

    EXECUTE v_new;
  END LOOP;

  v_def := pg_get_functiondef('public.perform_return_workflow_transition(uuid,uuid,uuid,text,text,uuid)'::regprocedure);
  v_new := replace(
    v_def,
    'RETURN jsonb_build_object(''error'',''You are not authorized to act on this step'',''code'',''FORBIDDEN'',''http'',403);',
    'PERFORM public.log_workflow_authz_denial(_actor_id, v_step.id, _action_type, COALESCE(v_auth->>''reason'',''WRONG_APPROVER''), v_auth);'
      || E'\n      RETURN jsonb_build_object(''error'',''You are not authorized to act on this step'',''code'',''FORBIDDEN'',''http'',403);'
  );
  IF v_new <> v_def THEN EXECUTE v_new; END IF;

  v_def := pg_get_functiondef('public.perform_final_workflow_approval(uuid,uuid,uuid,text,uuid)'::regprocedure);
  v_new := replace(
    v_def,
    'IF NOT (v_auth->>''can_act'')::boolean THEN',
    'IF NOT (v_auth->>''can_act'')::boolean THEN'
      || E'\n    PERFORM public.log_workflow_authz_denial(_actor_id, v_step.id, ''approve'', COALESCE(v_auth->>''reason'',''WRONG_APPROVER''), v_auth);'
  );
  IF v_new <> v_def THEN EXECUTE v_new; END IF;
END
$patch$;