
-- 1) Backfill approver_role_id from approval_steps.approver_role using roles.system_role
UPDATE public.approval_steps s
   SET approver_role_id = r.id
  FROM public.roles r
 WHERE s.approver_role_id IS NULL
   AND r.system_role = s.approver_role::text
   AND r.id = (
     SELECT r2.id FROM public.roles r2
      WHERE r2.system_role = s.approver_role::text
      ORDER BY r2.created_at ASC NULLS LAST, r2.id ASC
      LIMIT 1
   );

-- 2) Helper: can user act on a given workflow step?
CREATE OR REPLACE FUNCTION public.user_can_act_on_workflow_step(_user_id uuid, _step_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_step record;
  v_actor_system_roles text[];
  v_actor_dynamic_role_ids uuid[];
  v_required_role_name text;
  v_required_system_role text;
  v_is_super boolean;
  v_can boolean := false;
  v_reason text := 'WRONG_APPROVER';
BEGIN
  IF _user_id IS NULL OR _step_id IS NULL THEN
    RETURN jsonb_build_object('can_act', false, 'reason', 'BAD_INPUT');
  END IF;

  SELECT id, approver_role, approver_role_id, allowed_actions, name, step_order, workflow_id
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

  v_is_super := 'super_admin' = ANY(v_actor_system_roles);

  IF v_step.approver_role_id IS NOT NULL THEN
    SELECT name, system_role INTO v_required_role_name, v_required_system_role
      FROM public.roles WHERE id = v_step.approver_role_id;
    IF v_is_super THEN
      v_can := true; v_reason := 'SUPER_ADMIN_OVERRIDE';
    ELSIF v_step.approver_role_id = ANY(v_actor_dynamic_role_ids) THEN
      v_can := true; v_reason := 'DYNAMIC_ROLE_MATCH';
    END IF;
  ELSE
    v_required_role_name := v_step.approver_role::text;
    v_required_system_role := v_step.approver_role::text;
    IF v_is_super THEN
      v_can := true; v_reason := 'SUPER_ADMIN_OVERRIDE';
    ELSIF v_step.approver_role::text = ANY(v_actor_system_roles) THEN
      v_can := true; v_reason := 'LEGACY_SYSTEM_ROLE_MATCH';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'can_act', v_can,
    'reason', v_reason,
    'step_id', v_step.id,
    'step_name', v_step.name,
    'required_role_id', v_step.approver_role_id,
    'required_role_name', v_required_role_name,
    'required_system_role', v_required_system_role,
    'legacy_approver_role', v_step.approver_role::text,
    'actor_system_roles', to_jsonb(v_actor_system_roles),
    'actor_dynamic_role_ids', to_jsonb(v_actor_dynamic_role_ids),
    'allowed_actions', COALESCE(v_step.allowed_actions, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_can_act_on_workflow_step(uuid, uuid) TO authenticated;

-- 3) Update perform_workflow_transition to use the helper
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
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;
  IF _action_type NOT IN ('approve','reject','send_back','escalate','request_resubmission') THEN
    RETURN jsonb_build_object('error','Invalid action_type','code','BAD_ACTION','http',400);
  END IF;
  IF _action_type IN ('approve','reject','request_resubmission')
     AND (_comments IS NULL OR length(trim(_comments)) = 0) THEN
    RETURN jsonb_build_object('error','Remarks are mandatory for this action','code','REMARKS_REQUIRED','http',422);
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

  SELECT count(*),
         (SELECT count(*) FROM public.approval_steps s2
          WHERE s2.workflow_id = v_instance.workflow_id AND s2.step_order < v_step.step_order)
    INTO v_steps_total, v_current_idx
    FROM public.approval_steps WHERE workflow_id = v_instance.workflow_id;
  v_is_first := (v_current_idx = 0);
  v_is_last  := (v_current_idx = v_steps_total - 1);

  IF _action_type = 'approve' AND v_is_last THEN
    RETURN jsonb_build_object('final_approval', true, 'http', 200);
  END IF;

  -- Authorization via shared helper
  v_auth := public.user_can_act_on_workflow_step(_actor_id, v_step.id);
  IF NOT (v_auth->>'can_act')::boolean THEN
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
  IF _action_type = 'send_back' AND v_is_first THEN
    RETURN jsonb_build_object('error','Cannot send back from the first step','code','CANNOT_SEND_BACK','http',422);
  END IF;
  IF _action_type = 'escalate' AND v_is_last THEN
    RETURN jsonb_build_object('error','Cannot escalate from the last step','code','CANNOT_ESCALATE','http',422);
  END IF;

  v_new_step_id := v_step.id;
  v_new_app_status := NULL;
  v_new_instance_status := NULL;

  IF _action_type IN ('approve','escalate') THEN
    SELECT id INTO v_next_step FROM public.approval_steps
     WHERE workflow_id = v_instance.workflow_id AND step_order > v_step.step_order
     ORDER BY step_order ASC LIMIT 1;
    IF FOUND THEN
      v_new_step_id := v_next_step.id;
      v_new_app_status := 'in_progress';
      UPDATE public.workflow_instances SET current_step_id = v_next_step.id, updated_at = v_now WHERE id = v_instance.id;
    END IF;
  ELSIF _action_type = 'send_back' THEN
    SELECT id INTO v_prev_step FROM public.approval_steps
     WHERE workflow_id = v_instance.workflow_id AND step_order < v_step.step_order
     ORDER BY step_order DESC LIMIT 1;
    IF FOUND THEN
      v_new_step_id := v_prev_step.id;
      v_new_app_status := 'in_progress';
      UPDATE public.workflow_instances SET current_step_id = v_prev_step.id, updated_at = v_now WHERE id = v_instance.id;
    END IF;
  ELSIF _action_type = 'reject' THEN
    v_new_app_status := 'rejected';
    v_new_instance_status := 'rejected';
    UPDATE public.workflow_instances SET status='rejected', completed_at=v_now, updated_at=v_now WHERE id=v_instance.id;
  ELSIF _action_type = 'request_resubmission' THEN
    v_new_app_status := 'resubmission_requested';
    v_new_instance_status := 'paused';
    UPDATE public.workflow_instances SET status='paused', updated_at=v_now WHERE id=v_instance.id;
  END IF;

  INSERT INTO public.approval_actions (
    application_id, step_id, workflow_instance_id, actor_id,
    action, action_type, comments, responded_at
  ) VALUES (
    _application_id, v_step.id, v_instance.id, _actor_id,
    _action_type, _action_type, NULLIF(trim(_comments),''), v_now
  );

  UPDATE public.applications
     SET current_step_id = v_new_step_id,
         status = COALESCE(v_new_app_status, status),
         updated_at = v_now
   WHERE id = _application_id;

  PERFORM public.create_audit_log(
    _actor_id, 'application_workflow_' || _action_type, 'application', _application_id::text, NULL,
    jsonb_build_object('step_id', v_step.id, 'instance_id', v_instance.id,
      'new_step_id', v_new_step_id, 'new_app_status', COALESCE(v_new_app_status, v_app.status),
      'new_instance_status', v_new_instance_status, 'comments', NULLIF(trim(_comments),''),
      'auth', v_auth),
    NULL
  );

  IF _action_type = 'reject' THEN
    PERFORM public.create_notification(v_app.applicant_id,
      'Application Rejected: ' || v_app.application_number,
      'Your application has been rejected. Remarks: ' || COALESCE(NULLIF(trim(_comments),''),'(none)'),
      'error', 'application', _application_id::text);
  ELSIF _action_type = 'request_resubmission' THEN
    PERFORM public.create_notification(v_app.applicant_id,
      'Resubmission Requested: ' || v_app.application_number,
      'Your application requires revisions. Remarks: ' || COALESCE(NULLIF(trim(_comments),''),'(none)'),
      'warning', 'application', _application_id::text);
  END IF;

  RETURN jsonb_build_object('success', true, 'http', 200,
    'application_id', _application_id, 'instance_id', v_instance.id,
    'new_step_id', v_new_step_id, 'new_app_status', COALESCE(v_new_app_status, v_app.status),
    'new_instance_status', v_new_instance_status);
END;
$function$;

-- 4) Update perform_final_workflow_approval to use the helper
CREATE OR REPLACE FUNCTION public.perform_final_workflow_approval(_application_id uuid, _instance_id uuid, _step_id uuid, _comments text, _actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app record; v_instance record; v_step record;
  v_steps_total int; v_current_idx int;
  v_auth jsonb;
  v_allowed_actions text[];
  v_now timestamptz := now();
  v_app_data jsonb; v_license record; v_licensee_id uuid; v_entity_name text;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;
  IF _comments IS NULL OR length(trim(_comments)) = 0 THEN
    RETURN jsonb_build_object('error','Remarks are mandatory for approval','code','REMARKS_REQUIRED','http',422);
  END IF;

  SELECT id, applicant_id, application_number, status, license_type,
         regulator_id, workflow_id, data, approved_at
    INTO v_app FROM public.applications WHERE id=_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.status = 'approved' THEN
    SELECT id, license_number INTO v_license FROM public.licenses WHERE application_id=_application_id LIMIT 1;
    IF v_license.id IS NULL THEN
      RETURN jsonb_build_object('error','Application is approved but no license record exists',
        'code','APPROVED_WITHOUT_LICENSE','http',409,'application_id',_application_id);
    END IF;
    SELECT id INTO v_licensee_id FROM public.licensees WHERE license_id=v_license.id LIMIT 1;
    IF v_licensee_id IS NULL THEN
      RETURN jsonb_build_object('error','Application is approved with a license but no licensee record exists',
        'code','APPROVED_WITHOUT_LICENSEE','http',409,'application_id',_application_id,
        'license_id',v_license.id,'license_number',v_license.license_number);
    END IF;
    RETURN jsonb_build_object('success',true,'http',200,'already_processed',true,
      'application_id',_application_id,'license_id',v_license.id,
      'license_number',v_license.license_number,'licensee_id',v_licensee_id,
      'applicant_id',v_app.applicant_id);
  END IF;

  IF v_app.status NOT IN ('submitted','in_progress') THEN
    RETURN jsonb_build_object('error',format('Cannot approve application in ''%s'' status', v_app.status),
                              'code','INVALID_STATUS','http',409);
  END IF;

  SELECT id, workflow_id, current_step_id, status INTO v_instance
    FROM public.workflow_instances
   WHERE entity_id=_application_id AND entity_type='application' AND status='active'
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','No active workflow instance','code','NO_ACTIVE_INSTANCE','http',409);
  END IF;
  IF _instance_id IS NOT NULL AND _instance_id<>v_instance.id THEN
    RETURN jsonb_build_object('error','Stale workflow instance','code','STALE_INSTANCE','http',409);
  END IF;
  IF _step_id IS NOT NULL AND _step_id<>v_instance.current_step_id THEN
    RETURN jsonb_build_object('error','Stale step','code','STALE_STEP','http',409);
  END IF;

  SELECT id, step_order, approver_role, approver_role_id, allowed_actions
    INTO v_step FROM public.approval_steps WHERE id=v_instance.current_step_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Current step not found','code','STEP_NOT_FOUND','http',409);
  END IF;

  SELECT count(*),
         (SELECT count(*) FROM public.approval_steps s2
          WHERE s2.workflow_id=v_instance.workflow_id AND s2.step_order<v_step.step_order)
    INTO v_steps_total, v_current_idx
    FROM public.approval_steps WHERE workflow_id=v_instance.workflow_id;

  IF v_current_idx <> v_steps_total - 1 THEN
    RETURN jsonb_build_object('error','Final approval requires last workflow step','code','NOT_LAST_STEP','http',422);
  END IF;

  v_auth := public.user_can_act_on_workflow_step(_actor_id, v_step.id);
  IF NOT (v_auth->>'can_act')::boolean THEN
    RETURN jsonb_build_object('error',
      format('Only %s can act on this step', COALESCE(v_auth->>'required_role_name', v_step.approver_role::text)),
      'code','WRONG_APPROVER','http',403,
      'diagnostic', v_auth);
  END IF;

  v_allowed_actions := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step.allowed_actions, '[]'::jsonb)));
  IF NOT ('approve' = ANY(v_allowed_actions)) THEN
    RETURN jsonb_build_object('error','Approve is not allowed on this step','code','ACTION_NOT_ALLOWED','http',422);
  END IF;

  v_app_data := COALESCE(v_app.data, '{}'::jsonb);
  UPDATE public.applications SET status='approved', approved_at=v_now, updated_at=v_now WHERE id=_application_id;
  UPDATE public.workflow_instances SET status='completed', completed_at=v_now, updated_at=v_now WHERE id=v_instance.id;

  INSERT INTO public.licenses (application_id, holder_id, license_type, regulator_id,
    sector_id, sub_sector_id, category_id)
  VALUES (_application_id, v_app.applicant_id, v_app.license_type, v_app.regulator_id,
    NULLIF(v_app_data->>'sector_id','')::uuid,
    NULLIF(v_app_data->>'sub_sector_id','')::uuid,
    NULLIF(v_app_data->>'category_id','')::uuid)
  ON CONFLICT (application_id) WHERE application_id IS NOT NULL DO NOTHING
  RETURNING id, license_number INTO v_license;
  IF v_license.id IS NULL THEN
    SELECT id, license_number INTO v_license FROM public.licenses WHERE application_id=_application_id LIMIT 1;
  END IF;

  v_entity_name := COALESCE(NULLIF(v_app_data->>'entity_name',''),
                            NULLIF(v_app_data->>'applicant_name',''), v_app.license_type);
  INSERT INTO public.licensees (name, license_id, sector_id, sub_sector_id, category_id, status)
  VALUES (v_entity_name, v_license.id,
    NULLIF(v_app_data->>'sector_id','')::uuid,
    NULLIF(v_app_data->>'sub_sector_id','')::uuid,
    NULLIF(v_app_data->>'category_id','')::uuid, 'active')
  ON CONFLICT (license_id) WHERE license_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_licensee_id;
  IF v_licensee_id IS NULL THEN
    SELECT id INTO v_licensee_id FROM public.licensees WHERE license_id=v_license.id LIMIT 1;
  END IF;

  INSERT INTO public.approval_actions (application_id, step_id, workflow_instance_id, actor_id,
    action, action_type, comments, responded_at)
  VALUES (_application_id, v_step.id, v_instance.id, _actor_id,
    'approve_final', 'approve', NULLIF(trim(_comments),''), v_now)
  ON CONFLICT (application_id) WHERE action='approve_final' DO NOTHING;

  PERFORM public.create_audit_log(_actor_id, 'application_final_approved', 'application',
    _application_id::text, NULL,
    jsonb_build_object('license_id',v_license.id,'license_number',v_license.license_number,
                       'licensee_id',v_licensee_id, 'auth', v_auth), NULL);

  PERFORM public.create_notification(v_app.applicant_id,
    'Application Approved: ' || v_app.application_number,
    'Your application has been approved. License Number: ' || v_license.license_number,
    'success', 'application', _application_id::text);

  RETURN jsonb_build_object('success',true,'http',200,
    'application_id',_application_id, 'license_id',v_license.id,
    'license_number',v_license.license_number, 'licensee_id',v_licensee_id,
    'applicant_id',v_app.applicant_id);
END;
$function$;

-- 5) Diagnostic RPC for the WorkflowPanel / admin
CREATE OR REPLACE FUNCTION public.workflow_diagnostic_for_application(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_inst record;
  v_steps jsonb;
  v_can jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED');
  END IF;

  SELECT id, application_number, status, workflow_id, current_step_id, license_type, regulator_id
    INTO v_app FROM public.applications WHERE id = _application_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','NOT_FOUND');
  END IF;

  SELECT id, workflow_id, current_step_id, status
    INTO v_inst FROM public.workflow_instances
   WHERE entity_id = _application_id AND entity_type='application'
   ORDER BY created_at DESC LIMIT 1;

  SELECT jsonb_agg(jsonb_build_object(
    'step_id', s.id, 'step_order', s.step_order, 'name', s.name,
    'approver_role_id', s.approver_role_id, 'role_name', r.name,
    'role_system_role', r.system_role,
    'legacy_approver_role', s.approver_role,
    'allowed_actions', s.allowed_actions,
    'is_current', (s.id = v_inst.current_step_id)
  ) ORDER BY s.step_order) INTO v_steps
  FROM public.approval_steps s
  LEFT JOIN public.roles r ON r.id = s.approver_role_id
  WHERE s.workflow_id = COALESCE(v_inst.workflow_id, v_app.workflow_id);

  IF v_inst.current_step_id IS NOT NULL THEN
    v_can := public.user_can_act_on_workflow_step(v_uid, v_inst.current_step_id);
  END IF;

  RETURN jsonb_build_object(
    'application', to_jsonb(v_app),
    'instance', to_jsonb(v_inst),
    'steps', COALESCE(v_steps, '[]'::jsonb),
    'can_act', v_can
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.workflow_diagnostic_for_application(uuid) TO authenticated;

-- 6) Re-route in-flight applications with no reviewer actions to best matching workflow
DO $$
DECLARE
  v_app record;
  v_match record;
  v_first uuid;
  v_inst_id uuid;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);
  FOR v_app IN
    SELECT a.id, a.license_type, a.regulator_id, a.data, a.workflow_id
      FROM public.applications a
     WHERE a.status IN ('submitted','in_progress')
       AND NOT EXISTS (
         SELECT 1 FROM public.approval_actions aa
          WHERE aa.application_id = a.id
            AND aa.action NOT IN ('submitted','resubmitted')
       )
  LOOP
    SELECT r.workflow_id, r.first_step_id INTO v_match
      FROM public._resolve_application_workflow(
        v_app.license_type,
        public._resolve_effective_regulator(v_app.regulator_id,
          NULLIF(v_app.data->>'sector_id','')::uuid,
          NULLIF(v_app.data->>'category_id','')::uuid),
        NULLIF(v_app.data->>'sector_id','')::uuid,
        NULLIF(v_app.data->>'category_id','')::uuid) r;

    IF v_match.workflow_id IS NULL OR v_match.workflow_id = v_app.workflow_id THEN
      CONTINUE;
    END IF;

    -- Cancel old active instances
    UPDATE public.workflow_instances
       SET status='cancelled', completed_at=now(), updated_at=now()
     WHERE entity_id=v_app.id AND entity_type='application' AND status IN ('active','paused');

    INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, status)
    VALUES (v_match.workflow_id, 'application', v_app.id, v_match.first_step_id, 'active')
    RETURNING id INTO v_inst_id;

    UPDATE public.applications
       SET workflow_id = v_match.workflow_id,
           current_step_id = v_match.first_step_id,
           status = 'submitted',
           updated_at = now()
     WHERE id = v_app.id;
  END LOOP;
END $$;
