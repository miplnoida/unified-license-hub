
-- Promote return_for_correction + request_more_info to first-class workflow transitions.
-- Each now sets its own application status + records its own action_type in approval_actions.
-- submit_application is taught to resume from the new statuses (existing routing logic
-- already preserves current_step_id on pause, so the previous reviewer is restored).

CREATE OR REPLACE FUNCTION public.perform_workflow_transition(
  _application_id uuid, _instance_id uuid, _step_id uuid,
  _action_type text, _comments text, _actor_id uuid
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
    'approve','reject','request_resubmission',
    'return_for_correction','request_more_info'
  ) AND (_comments IS NULL OR length(trim(_comments)) = 0) THEN
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

  v_auth := public.user_can_act_on_workflow_step(_actor_id, v_step.id);
  v_role_match := COALESCE((v_auth->>'can_act')::boolean, false);
  v_is_internal := COALESCE((v_auth->>'is_internal')::boolean, false);

  -- Reject is allowed for any internal regulator-level user when the step permits it.
  -- All other actions require strict role match.
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

  IF _action_type = 'approve' AND v_is_last THEN
    RETURN jsonb_build_object('final_approval', true, 'http', 200);
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

  IF _action_type = 'approve' THEN
    SELECT id, name INTO v_next_step FROM public.approval_steps
     WHERE workflow_id = v_instance.workflow_id AND step_order > v_step.step_order
     ORDER BY step_order ASC LIMIT 1;
    IF FOUND THEN
      v_new_step_id := v_next_step.id;
      v_new_app_status := 'in_progress';
    END IF;
  ELSIF _action_type = 'reject' THEN
    v_new_app_status := 'rejected';
    v_new_instance_status := 'completed';
  ELSIF _action_type = 'send_back' THEN
    SELECT id, name INTO v_prev_step FROM public.approval_steps
     WHERE workflow_id = v_instance.workflow_id AND step_order < v_step.step_order
     ORDER BY step_order DESC LIMIT 1;
    IF FOUND THEN
      v_new_step_id := v_prev_step.id;
      v_new_app_status := 'in_progress';
    END IF;
  ELSIF _action_type = 'escalate' THEN
    SELECT id, name INTO v_next_step FROM public.approval_steps
     WHERE workflow_id = v_instance.workflow_id AND step_order > v_step.step_order
     ORDER BY step_order ASC LIMIT 1;
    IF FOUND THEN
      v_new_step_id := v_next_step.id;
      v_new_app_status := 'in_progress';
    END IF;
  ELSIF _action_type = 'request_resubmission' THEN
    v_new_app_status := 'resubmission_required';
    v_new_instance_status := 'paused';
  ELSIF _action_type = 'return_for_correction' THEN
    -- First-class action: distinct status; pause (do not end) workflow.
    -- current_step_id is preserved so on resubmission we resume at the same
    -- reviewer who issued the return.
    v_new_app_status := 'returned_for_correction';
    v_new_instance_status := 'paused';
  ELSIF _action_type = 'request_more_info' THEN
    v_new_app_status := 'info_requested';
    v_new_instance_status := 'paused';
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
    'http', 200
  );
END;
$function$;

-- submit_application: teach it to resume from the two new statuses.
-- Routing back to the original reviewer is automatic: when the RPC paused
-- the instance it left current_step_id pointing at the reviewer's step.
CREATE OR REPLACE FUNCTION public.submit_application(_application_id uuid, _ack_text text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_now timestamptz := now();
  v_is_resub boolean;
  v_payment_count int;
  v_sector_id uuid;
  v_category_id uuid;
  v_workflow_id uuid;
  v_first_step_id uuid;
  v_existing_instance record;
  v_new_instance_id uuid;
  v_action_label text;
  v_audit_action text;
  v_app_status_target text;
  v_effective_regulator uuid;
  v_is_post_license boolean;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;

  SELECT id, applicant_id, application_number, status, license_type,
         regulator_id, data
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.applicant_id <> v_uid THEN
    RETURN jsonb_build_object('error','You do not own this application','code','FORBIDDEN','http',403);
  END IF;

  -- Treat the two new applicant-facing statuses as resubmittable, alongside
  -- the legacy ones.
  v_is_resub := v_app.status IN (
    'resubmission_requested','resubmission_required',
    'returned_for_correction','info_requested',
    'query_raised'
  );
  IF v_app.status NOT IN ('draft', 'in_progress') AND NOT v_is_resub THEN
    RETURN jsonb_build_object(
      'error', format('Application is in ''%s'' status — cannot submit', v_app.status),
      'code','INVALID_STATUS','http',409
    );
  END IF;

  SELECT count(*) INTO v_payment_count
    FROM public.payments
   WHERE application_id = _application_id
     AND status IN ('completed','success','paid');
  IF v_payment_count = 0 THEN
    RETURN jsonb_build_object(
      'error','No completed payment found — please complete payment first',
      'code','PAYMENT_REQUIRED','http',402
    );
  END IF;

  v_sector_id := NULLIF(v_app.data->>'sector_id','')::uuid;
  v_category_id := NULLIF(v_app.data->>'category_id','')::uuid;
  v_is_post_license := COALESCE(NULLIF(v_app.data->>'service_id','') IS NOT NULL, false)
                       OR (v_app.data->>'type') = 'post_license';

  v_effective_regulator := public._resolve_effective_regulator(
    v_app.regulator_id, v_sector_id, v_category_id
  );

  SELECT id, workflow_id, current_step_id, status
    INTO v_existing_instance
    FROM public.workflow_instances
   WHERE entity_id = _application_id
     AND entity_type = 'application'
     AND status IN ('active','paused')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    -- Resume the paused instance at the same step the reviewer was on when
    -- they requested the change. current_step_id was left untouched by the
    -- RPC for return_for_correction / request_more_info / request_resubmission.
    v_workflow_id := v_existing_instance.workflow_id;
    v_first_step_id := v_existing_instance.current_step_id;
    IF v_existing_instance.status = 'paused' THEN
      UPDATE public.workflow_instances
         SET status = 'active', updated_at = v_now
       WHERE id = v_existing_instance.id;
    END IF;
  ELSE
    SELECT r.workflow_id, r.first_step_id INTO v_workflow_id, v_first_step_id
      FROM public._resolve_application_workflow(
             v_app.license_type, v_effective_regulator, v_sector_id, v_category_id,
             v_is_post_license) r;

    IF v_workflow_id IS NOT NULL THEN
      INSERT INTO public.workflow_instances (
        workflow_id, entity_type, entity_id, current_step_id, status
      ) VALUES (
        v_workflow_id, 'application', _application_id, v_first_step_id, 'active'
      )
      RETURNING id INTO v_new_instance_id;
    END IF;
  END IF;

  v_app_status_target := 'submitted';

  UPDATE public.applications
     SET status = v_app_status_target,
         submitted_at = COALESCE(submitted_at, v_now),
         workflow_id = COALESCE(workflow_id, v_workflow_id),
         -- On resubmit, force current_step_id to follow the (resumed) instance.
         current_step_id = v_first_step_id,
         regulator_id = COALESCE(v_effective_regulator, regulator_id),
         ack_by = CASE WHEN _ack_text IS NOT NULL THEN v_uid ELSE ack_by END,
         ack_at = CASE WHEN _ack_text IS NOT NULL THEN v_now ELSE ack_at END,
         ack_text = CASE WHEN _ack_text IS NOT NULL
                         THEN substring(_ack_text from 1 for 4000)
                         ELSE ack_text END,
         updated_at = v_now
   WHERE id = _application_id;

  UPDATE public.form_responses
     SET status = 'submitted', submitted_at = v_now
   WHERE entity_id = _application_id
     AND entity_type = 'application';

  v_action_label := CASE WHEN v_is_resub THEN 'resubmitted' ELSE 'submitted' END;
  v_audit_action := CASE WHEN v_is_resub THEN 'resubmitted' ELSE 'submitted' END;

  INSERT INTO public.audit_logs (
    table_name, record_id, action, user_id, new_values
  ) VALUES (
    'applications', _application_id, v_audit_action, v_uid,
    jsonb_build_object(
      'application_number', v_app.application_number,
      'status', v_app_status_target,
      'workflow_id', v_workflow_id,
      'first_step_id', v_first_step_id,
      'is_resubmission', v_is_resub,
      'previous_status', v_app.status,
      'resumed', v_is_resub
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'application_id', _application_id,
    'application_number', v_app.application_number,
    'status', v_app_status_target,
    'workflow_id', v_workflow_id,
    'first_step_id', v_first_step_id,
    'is_resubmission', v_is_resub,
    'resumed', v_is_resub,
    'workflow_attached', v_workflow_id IS NOT NULL,
    'previous_status', v_app.status
  );
END;
$function$;
