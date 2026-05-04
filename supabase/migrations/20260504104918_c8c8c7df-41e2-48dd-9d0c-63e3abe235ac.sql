-- Refactor: route all audit/notification writes inside workflow RPCs
-- through the SECURITY DEFINER helpers create_audit_log / create_notification.

-- 1) submit_application
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

  v_is_resub := v_app.status IN ('resubmission_requested','query_raised');
  IF v_app.status <> 'draft' AND NOT v_is_resub THEN
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
             v_app.license_type, v_app.regulator_id, v_sector_id, v_category_id) r;

    IF v_workflow_id IS NOT NULL THEN
      INSERT INTO public.workflow_instances (
        workflow_id, entity_type, entity_id, current_step_id, status
      ) VALUES (
        v_workflow_id, 'application', _application_id, v_first_step_id, 'active'
      )
      RETURNING id INTO v_new_instance_id;
    END IF;
  END IF;

  v_app_status_target := CASE WHEN v_workflow_id IS NOT NULL THEN 'in_progress' ELSE 'submitted' END;

  UPDATE public.applications
     SET status = v_app_status_target,
         submitted_at = COALESCE(submitted_at, v_now),
         workflow_id = COALESCE(workflow_id, v_workflow_id),
         current_step_id = COALESCE(current_step_id, v_first_step_id),
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
  v_audit_action := CASE WHEN v_is_resub THEN 'application_resubmitted' ELSE 'application_submitted' END;

  INSERT INTO public.approval_actions (
    application_id, actor_id, action, action_type, comments, responded_at
  ) VALUES (
    _application_id, v_uid, v_action_label, v_action_label, NULL, v_now
  );

  PERFORM public.create_audit_log(
    v_uid, v_audit_action, 'application', _application_id::text, NULL,
    jsonb_build_object(
      'status', v_app_status_target,
      'workflow_attached', v_workflow_id IS NOT NULL,
      'resumed', v_existing_instance IS NOT NULL,
      'resubmission', v_is_resub
    ),
    NULL
  );

  PERFORM public.create_notification(
    v_uid,
    CASE WHEN v_is_resub
         THEN 'Application Resubmitted: ' || v_app.application_number
         ELSE 'Application Submitted: ' || v_app.application_number END,
    CASE WHEN v_is_resub
         THEN 'Your application has been resubmitted and is back under review.'
         ELSE 'Your application has been submitted and is now under review.' END,
    'success', 'application', _application_id::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'http', 200,
    'application_id', _application_id,
    'status', v_app_status_target,
    'workflow_attached', v_workflow_id IS NOT NULL,
    'workflow_id', v_workflow_id,
    'resumed', v_existing_instance IS NOT NULL,
    'resubmission', v_is_resub,
    'message', CASE
      WHEN v_is_resub AND v_workflow_id IS NOT NULL THEN 'Application resubmitted and workflow resumed'
      WHEN v_is_resub THEN 'Application resubmitted successfully'
      WHEN v_workflow_id IS NOT NULL THEN 'Application submitted and routed to approval workflow'
      ELSE 'Application submitted successfully'
    END
  );
END;
$function$;

-- 2) cancel_application
CREATE OR REPLACE FUNCTION public.cancel_application(_application_id uuid, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;

  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  SELECT id, applicant_id, status, application_number
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.applicant_id <> v_uid THEN
    RETURN jsonb_build_object('error','You cannot cancel this application','code','FORBIDDEN','http',403);
  END IF;

  IF v_app.status NOT IN ('draft','resubmission_requested','query_raised','submitted') THEN
    RETURN jsonb_build_object('error',format('Cannot cancel application in ''%s'' status', v_app.status),
                              'code','INVALID_STATUS','http',409);
  END IF;

  UPDATE public.applications
     SET status = 'cancelled', cancelled_at = v_now, updated_at = v_now
   WHERE id = _application_id;

  UPDATE public.workflow_instances
     SET status = 'cancelled', completed_at = v_now, updated_at = v_now
   WHERE entity_id = _application_id
     AND entity_type = 'application'
     AND status = 'active';

  INSERT INTO public.approval_actions (
    application_id, actor_id, action, action_type, comments, responded_at
  ) VALUES (
    _application_id, v_uid, 'cancelled', 'cancel',
    COALESCE(NULLIF(trim(_reason),''),'Application cancelled by applicant'), v_now
  );

  PERFORM public.create_audit_log(
    v_uid, 'application_cancelled', 'application', _application_id::text, NULL,
    jsonb_build_object('reason', _reason), NULL
  );

  RETURN jsonb_build_object('success', true, 'http', 200, 'application_id', _application_id);
END;
$function$;

-- 3) request_resubmission_for_application
CREATE OR REPLACE FUNCTION public.request_resubmission_for_application(_application_id uuid, _comments text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_now timestamptz := now();
  v_actor_roles text[];
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;
  IF _comments IS NULL OR length(trim(_comments)) = 0 THEN
    RETURN jsonb_build_object('error','Remarks are required','code','REMARKS_REQUIRED','http',422);
  END IF;

  SELECT array_agg(DISTINCT r) INTO v_actor_roles FROM (
    SELECT role::text AS r FROM public.user_roles WHERE user_id = v_uid
    UNION
    SELECT system_role AS r
      FROM public.user_dynamic_roles udr
      JOIN public.roles ro ON ro.id = udr.role_id
     WHERE udr.user_id = v_uid AND ro.system_role IS NOT NULL
  ) sub;
  v_actor_roles := COALESCE(v_actor_roles, ARRAY[]::text[]);

  IF NOT (v_actor_roles && ARRAY['super_admin','admin','supervisor','licensing_officer','analyst']::text[]) THEN
    RETURN jsonb_build_object('error','Only reviewers can request resubmission','code','FORBIDDEN','http',403);
  END IF;

  SELECT id, applicant_id, application_number, status
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.status NOT IN ('submitted','in_progress') THEN
    RETURN jsonb_build_object(
      'error', format('Cannot request resubmission while status is ''%s''', v_app.status),
      'code','INVALID_STATUS','http',409
    );
  END IF;

  UPDATE public.applications
     SET status = 'resubmission_requested', updated_at = v_now
   WHERE id = _application_id;

  UPDATE public.workflow_instances
     SET status = 'paused', updated_at = v_now
   WHERE entity_id = _application_id
     AND entity_type = 'application'
     AND status = 'active';

  INSERT INTO public.approval_actions (
    application_id, actor_id, action, action_type, comments, responded_at
  ) VALUES (
    _application_id, v_uid, 'resubmission_requested', 'request_resubmission',
    NULLIF(trim(_comments),''), v_now
  );

  PERFORM public.create_audit_log(
    v_uid, 'resubmission_requested', 'application', _application_id::text, NULL,
    jsonb_build_object('comments', _comments), NULL
  );

  PERFORM public.create_notification(
    v_app.applicant_id,
    'Resubmission Requested: ' || v_app.application_number,
    'Your application requires revisions. Remarks: ' || _comments,
    'warning', 'application', _application_id::text
  );

  RETURN jsonb_build_object(
    'success', true, 'http', 200,
    'application_id', _application_id,
    'status', 'resubmission_requested'
  );
END;
$function$;

-- 4) perform_final_workflow_approval
CREATE OR REPLACE FUNCTION public.perform_final_workflow_approval(_application_id uuid, _instance_id uuid, _step_id uuid, _comments text, _actor_id uuid)
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

  SELECT id, applicant_id, application_number, status, license_type,
         regulator_id, workflow_id, data, approved_at
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.status = 'approved' THEN
    SELECT id, license_number INTO v_license
      FROM public.licenses WHERE application_id = _application_id LIMIT 1;
    IF v_license.id IS NULL THEN
      RETURN jsonb_build_object('error','Application is approved but no license record exists',
        'code','APPROVED_WITHOUT_LICENSE','http',409,'application_id', _application_id);
    END IF;
    SELECT id INTO v_licensee_id FROM public.licensees WHERE license_id = v_license.id LIMIT 1;
    IF v_licensee_id IS NULL THEN
      RETURN jsonb_build_object('error','Application is approved with a license but no licensee record exists',
        'code','APPROVED_WITHOUT_LICENSEE','http',409,'application_id', _application_id,
        'license_id', v_license.id,'license_number', v_license.license_number);
    END IF;
    RETURN jsonb_build_object('success', true,'http', 200,'already_processed', true,
      'application_id', _application_id,'license_id', v_license.id,
      'license_number', v_license.license_number,'licensee_id', v_licensee_id,
      'applicant_id', v_app.applicant_id);
  END IF;

  IF v_app.status NOT IN ('submitted','in_progress') THEN
    RETURN jsonb_build_object('error',format('Cannot approve application in ''%s'' status', v_app.status),
                              'code','INVALID_STATUS','http',409);
  END IF;

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

  SELECT count(*),
         (SELECT count(*) FROM public.approval_steps s2
          WHERE s2.workflow_id = v_instance.workflow_id AND s2.step_order < v_step.step_order)
    INTO v_steps_total, v_current_idx
    FROM public.approval_steps WHERE workflow_id = v_instance.workflow_id;

  IF v_current_idx <> v_steps_total - 1 THEN
    RETURN jsonb_build_object('error','Final approval requires last workflow step','code','NOT_LAST_STEP','http',422);
  END IF;

  IF NOT v_is_super AND NOT (v_step.approver_role::text = ANY(v_actor_roles)) THEN
    RETURN jsonb_build_object('error',format('Only %s can act on this step', v_step.approver_role),
                              'code','WRONG_APPROVER','http',403);
  END IF;

  v_allowed_actions := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step.allowed_actions, '[]'::jsonb)));
  IF NOT ('approve' = ANY(v_allowed_actions)) THEN
    RETURN jsonb_build_object('error','Approve is not allowed on this step','code','ACTION_NOT_ALLOWED','http',422);
  END IF;

  v_app_data := COALESCE(v_app.data, '{}'::jsonb);

  UPDATE public.applications
     SET status = 'approved', approved_at = v_now, updated_at = v_now
   WHERE id = _application_id;

  UPDATE public.workflow_instances
     SET status = 'completed', completed_at = v_now, updated_at = v_now
   WHERE id = v_instance.id;

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

  INSERT INTO public.approval_actions (
    application_id, step_id, workflow_instance_id, actor_id,
    action, action_type, comments, responded_at
  ) VALUES (
    _application_id, v_step.id, v_instance.id, _actor_id,
    'approve_final', 'approve', NULLIF(trim(_comments),''), v_now
  )
  ON CONFLICT (application_id) WHERE action = 'approve_final' DO NOTHING;

  PERFORM public.create_audit_log(
    _actor_id, 'application_final_approved', 'application', _application_id::text, NULL,
    jsonb_build_object(
      'license_id', v_license.id,
      'license_number', v_license.license_number,
      'licensee_id', v_licensee_id
    ),
    NULL
  );

  PERFORM public.create_notification(
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

-- 5) perform_workflow_transition (no audit/notification inserts in current
-- body, but we keep it consistent and add a transition audit log via helper).
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

  SELECT id, applicant_id, application_number, status, workflow_id
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;
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

  IF _action_type = 'approve' AND v_is_last THEN
    RETURN jsonb_build_object('final_approval', true, 'http', 200);
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

  -- Audit log via helper
  PERFORM public.create_audit_log(
    _actor_id,
    'application_workflow_' || _action_type,
    'application',
    _application_id::text,
    NULL,
    jsonb_build_object(
      'step_id', v_step.id,
      'instance_id', v_instance.id,
      'new_step_id', v_new_step_id,
      'new_app_status', COALESCE(v_new_app_status, v_app.status),
      'new_instance_status', v_new_instance_status,
      'comments', NULLIF(trim(_comments),'')
    ),
    NULL
  );

  -- Applicant notifications for terminal/visible transitions
  IF _action_type = 'reject' THEN
    PERFORM public.create_notification(
      v_app.applicant_id,
      'Application Rejected: ' || v_app.application_number,
      'Your application has been rejected. Remarks: ' || COALESCE(NULLIF(trim(_comments),''),'(none)'),
      'error', 'application', _application_id::text
    );
  ELSIF _action_type = 'request_resubmission' THEN
    PERFORM public.create_notification(
      v_app.applicant_id,
      'Resubmission Requested: ' || v_app.application_number,
      'Your application requires revisions. Remarks: ' || COALESCE(NULLIF(trim(_comments),''),'(none)'),
      'warning', 'application', _application_id::text
    );
  END IF;

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