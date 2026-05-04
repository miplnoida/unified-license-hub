
-- 1) Idempotent final-approval action insert.
-- Distinguish final approval from intermediate "approve" (forward) actions by
-- using action='approve_final' (action_type stays 'approve' for UI/back-compat).
-- A partial unique index then prevents duplicate final-approval rows on retries
-- without blocking intermediate approve/forward actions on earlier steps.

CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_actions_final_per_application
  ON public.approval_actions (application_id)
  WHERE action = 'approve_final';

-- 2) Rewrite perform_final_workflow_approval:
--    - already-approved branch returns conflict payloads when license/licensee missing.
--    - inserts final approval action with action='approve_final' and ON CONFLICT DO NOTHING.

CREATE OR REPLACE FUNCTION public.perform_final_workflow_approval(
  _application_id uuid,
  _instance_id uuid,
  _step_id uuid,
  _comments text,
  _actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app record;
  v_instance record;
  v_step record;
  v_steps_total int;
  v_current_idx int;
  v_actor_roles text[];
  v_is_super boolean;
  v_allowed_actions text[];
  v_now timestamptz := now();
  v_app_data jsonb;
  v_license record;
  v_licensee_id uuid;
  v_entity_name text;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;

  IF _comments IS NULL OR length(trim(_comments)) = 0 THEN
    RETURN jsonb_build_object('error','Remarks are mandatory for approval','code','REMARKS_REQUIRED','http',422);
  END IF;

  SELECT array_agg(DISTINCT r) INTO v_actor_roles FROM (
    SELECT role::text AS r FROM public.user_roles WHERE user_id = _actor_id
    UNION
    SELECT system_role AS r FROM public.user_dynamic_roles udr
      JOIN public.roles ro ON ro.id = udr.role_id
     WHERE udr.user_id = _actor_id AND ro.system_role IS NOT NULL
  ) sub;
  v_actor_roles := COALESCE(v_actor_roles, ARRAY[]::text[]);
  v_is_super := 'super_admin' = ANY(v_actor_roles);

  -- Lock application
  SELECT id, applicant_id, application_number, status, license_type,
         regulator_id, workflow_id, data, approved_at
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  -- Idempotency: already approved
  IF v_app.status = 'approved' THEN
    SELECT id, license_number INTO v_license
      FROM public.licenses WHERE application_id = _application_id LIMIT 1;

    IF v_license.id IS NULL THEN
      RETURN jsonb_build_object(
        'error','Application is approved but no license record exists',
        'code','APPROVED_WITHOUT_LICENSE','http',409,
        'application_id', _application_id
      );
    END IF;

    SELECT id INTO v_licensee_id
      FROM public.licensees WHERE license_id = v_license.id LIMIT 1;

    IF v_licensee_id IS NULL THEN
      RETURN jsonb_build_object(
        'error','Application is approved with a license but no licensee record exists',
        'code','APPROVED_WITHOUT_LICENSEE','http',409,
        'application_id', _application_id,
        'license_id', v_license.id,
        'license_number', v_license.license_number
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'http', 200,
      'already_processed', true,
      'application_id', _application_id,
      'license_id', v_license.id,
      'license_number', v_license.license_number,
      'licensee_id', v_licensee_id,
      'applicant_id', v_app.applicant_id
    );
  END IF;

  IF v_app.status NOT IN ('submitted','in_progress') THEN
    RETURN jsonb_build_object('error',format('Cannot approve application in ''%s'' status', v_app.status),
                              'code','INVALID_STATUS','http',409);
  END IF;

  -- Lock active workflow instance
  SELECT id, workflow_id, current_step_id, status
    INTO v_instance
    FROM public.workflow_instances
   WHERE entity_id = _application_id
     AND entity_type = 'application'
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
  IF _step_id IS NOT NULL AND _step_id <> v_instance.current_step_id THEN
    RETURN jsonb_build_object('error','Stale step','code','STALE_STEP','http',409);
  END IF;

  SELECT id, step_order, approver_role, allowed_actions
    INTO v_step FROM public.approval_steps WHERE id = v_instance.current_step_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Current step not found','code','STEP_NOT_FOUND','http',409);
  END IF;

  -- Verify last step
  SELECT count(*),
         (SELECT count(*) FROM public.approval_steps s2
          WHERE s2.workflow_id = v_instance.workflow_id AND s2.step_order < v_step.step_order)
    INTO v_steps_total, v_current_idx
    FROM public.approval_steps WHERE workflow_id = v_instance.workflow_id;

  IF v_current_idx <> v_steps_total - 1 THEN
    RETURN jsonb_build_object('error','Final approval requires last workflow step','code','NOT_LAST_STEP','http',422);
  END IF;

  -- Approver role check
  IF NOT v_is_super AND NOT (v_step.approver_role::text = ANY(v_actor_roles)) THEN
    RETURN jsonb_build_object('error',format('Only %s can act on this step', v_step.approver_role),
                              'code','WRONG_APPROVER','http',403);
  END IF;

  -- allowed_actions must include 'approve'
  v_allowed_actions := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step.allowed_actions, '[]'::jsonb)));
  IF NOT ('approve' = ANY(v_allowed_actions)) THEN
    RETURN jsonb_build_object('error','Approve is not allowed on this step','code','ACTION_NOT_ALLOWED','http',422);
  END IF;

  v_app_data := COALESCE(v_app.data, '{}'::jsonb);

  -- Update application → approved
  UPDATE public.applications
     SET status = 'approved', approved_at = v_now, updated_at = v_now
   WHERE id = _application_id;

  -- Complete workflow instance
  UPDATE public.workflow_instances
     SET status = 'completed', completed_at = v_now, updated_at = v_now
   WHERE id = v_instance.id;

  -- Idempotent license creation
  INSERT INTO public.licenses (
    application_id, holder_id, license_type, regulator_id,
    sector_id, sub_sector_id, category_id
  ) VALUES (
    _application_id, v_app.applicant_id, v_app.license_type, v_app.regulator_id,
    NULLIF(v_app_data->>'sector_id','')::uuid,
    NULLIF(v_app_data->>'sub_sector_id','')::uuid,
    NULLIF(v_app_data->>'category_id','')::uuid
  )
  ON CONFLICT (application_id) WHERE application_id IS NOT NULL DO NOTHING
  RETURNING id, license_number INTO v_license;

  IF v_license.id IS NULL THEN
    SELECT id, license_number INTO v_license
      FROM public.licenses WHERE application_id = _application_id LIMIT 1;
  END IF;

  -- Idempotent licensee creation
  v_entity_name := COALESCE(
    NULLIF(v_app_data->>'entity_name',''),
    NULLIF(v_app_data->>'applicant_name',''),
    v_app.license_type
  );

  INSERT INTO public.licensees (
    name, license_id, sector_id, sub_sector_id, category_id, status
  ) VALUES (
    v_entity_name, v_license.id,
    NULLIF(v_app_data->>'sector_id','')::uuid,
    NULLIF(v_app_data->>'sub_sector_id','')::uuid,
    NULLIF(v_app_data->>'category_id','')::uuid,
    'active'
  )
  ON CONFLICT (license_id) WHERE license_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_licensee_id;

  IF v_licensee_id IS NULL THEN
    SELECT id INTO v_licensee_id FROM public.licensees WHERE license_id = v_license.id LIMIT 1;
  END IF;

  -- Idempotent final-approval action insert.
  -- 'action' is set to 'approve_final' so the partial unique index
  -- (uq_approval_actions_final_per_application) prevents duplicates on retry.
  -- 'action_type' remains 'approve' for UI / downstream compatibility.
  INSERT INTO public.approval_actions (
    application_id, step_id, workflow_instance_id, actor_id,
    action, action_type, comments, responded_at
  ) VALUES (
    _application_id, v_step.id, v_instance.id, _actor_id,
    'approve_final', 'approve', NULLIF(trim(_comments),''), v_now
  )
  ON CONFLICT (application_id) WHERE action = 'approve_final' DO NOTHING;

  -- Audit (idempotent-friendly: extra audit row on retry is acceptable and useful)
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (
    _actor_id, 'application_final_approved', 'application', _application_id::text,
    jsonb_build_object(
      'license_id', v_license.id,
      'license_number', v_license.license_number,
      'licensee_id', v_licensee_id
    )
  );

  -- Applicant notification
  INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
  VALUES (
    v_app.applicant_id,
    'Application Approved: ' || v_app.application_number,
    'Your application has been approved. License Number: ' || v_license.license_number,
    'success', 'application', _application_id::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'http', 200,
    'application_id', _application_id,
    'license_id', v_license.id,
    'license_number', v_license.license_number,
    'licensee_id', v_licensee_id,
    'applicant_id', v_app.applicant_id
  );
END;
$function$;

-- 3) Slim down perform_workflow_transition's final-approval branch.
-- Detect "approve on last step" with the cheapest possible check and short-circuit
-- BEFORE running approver-role / allowed_actions / send_back / escalate checks.
-- All authoritative validation for final approval lives in
-- perform_final_workflow_approval. This removes duplicated validation.

CREATE OR REPLACE FUNCTION public.perform_workflow_transition(
  _application_id uuid,
  _instance_id uuid,
  _step_id uuid,
  _action_type text,
  _comments text,
  _actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app record;
  v_instance record;
  v_step record;
  v_actor_roles text[];
  v_is_super boolean;
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

  -- Lock application
  SELECT id, applicant_id, application_number, status, workflow_id
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.status NOT IN ('submitted','in_progress') THEN
    -- Special case: re-entry on an already-approved app for action=approve
    -- should still route through the final RPC so it can return its idempotent payload.
    IF _action_type = 'approve' AND v_app.status = 'approved' THEN
      RETURN jsonb_build_object('final_approval', true, 'http', 200);
    END IF;
    RETURN jsonb_build_object('error',format('Application is in ''%s'' status', v_app.status),
                              'code','INVALID_STATUS','http',409);
  END IF;

  -- Lock active workflow instance
  SELECT id, workflow_id, current_step_id, status
    INTO v_instance
    FROM public.workflow_instances
   WHERE entity_id = _application_id
     AND entity_type = 'application'
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
  IF _step_id IS NOT NULL AND _step_id <> v_instance.current_step_id THEN
    RETURN jsonb_build_object('error','Stale step','code','STALE_STEP','http',409);
  END IF;

  SELECT id, step_order, name, approver_role, allowed_actions
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

  -- Final approval is delegated. Short-circuit BEFORE additional validation
  -- so the final RPC is the single source of truth for approver/role/allowed_actions checks.
  IF _action_type = 'approve' AND v_is_last THEN
    RETURN jsonb_build_object('final_approval', true, 'http', 200);
  END IF;

  -- Resolve actor roles for non-final transitions
  SELECT array_agg(DISTINCT r) INTO v_actor_roles FROM (
    SELECT role::text AS r FROM public.user_roles WHERE user_id = _actor_id
    UNION
    SELECT system_role AS r FROM public.user_dynamic_roles udr
      JOIN public.roles ro ON ro.id = udr.role_id
     WHERE udr.user_id = _actor_id AND ro.system_role IS NOT NULL
  ) sub;
  v_actor_roles := COALESCE(v_actor_roles, ARRAY[]::text[]);
  v_is_super := 'super_admin' = ANY(v_actor_roles);

  IF NOT v_is_super AND NOT (v_step.approver_role::text = ANY(v_actor_roles)) THEN
    RETURN jsonb_build_object('error',format('Only %s can act on this step', v_step.approver_role),
                              'code','WRONG_APPROVER','http',403);
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
    UPDATE public.workflow_instances
       SET status = 'rejected', completed_at = v_now, updated_at = v_now
     WHERE id = v_instance.id;
  ELSIF _action_type = 'request_resubmission' THEN
    v_new_app_status := 'resubmission_requested';
    v_new_instance_status := 'paused';
    UPDATE public.workflow_instances
       SET status = 'paused', updated_at = v_now
     WHERE id = v_instance.id;
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

  RETURN jsonb_build_object(
    'success', true,
    'http', 200,
    'application_id', _application_id,
    'instance_id', v_instance.id,
    'new_step_id', v_new_step_id,
    'new_app_status', COALESCE(v_new_app_status, v_app.status),
    'new_instance_status', v_new_instance_status
  );
END;
$function$;
