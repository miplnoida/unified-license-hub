-- ============================================================================
-- Trusted RPCs for application lifecycle transitions
-- All set app.workflow_mutation_context = 'trusted' so the
-- prevent_direct_application_workflow_mutation trigger lets them through.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper: resolve the workflow that should handle a given application.
-- Mirrors the precedence used by verify-and-submit's edge function.
-- Returns workflow_id, first_step_id (NULLs if no match).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._resolve_application_workflow(
  _license_type text,
  _regulator_id uuid,
  _sector_id uuid,
  _category_id uuid
) RETURNS TABLE(workflow_id uuid, first_step_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wf_id uuid;
  v_step_id uuid;
  v_lt text := lower(coalesce(_license_type, ''));
BEGIN
  -- Tier 1: license_type + regulator + (category or sector) exact
  IF _regulator_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows
     WHERE license_type = _license_type
       AND entity_type = 'application'
       AND is_active = true
       AND regulator_id = _regulator_id
       AND ((_category_id IS NOT NULL AND category_id = _category_id)
            OR (_sector_id IS NOT NULL AND sector_id = _sector_id))
     ORDER BY (category_id IS NOT NULL AND category_id = _category_id) DESC,
              (sector_id IS NOT NULL AND sector_id = _sector_id) DESC
     LIMIT 1;
  END IF;

  -- Tier 2: license_type + regulator
  IF v_wf_id IS NULL AND _regulator_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows
     WHERE license_type = _license_type
       AND entity_type = 'application'
       AND is_active = true
       AND regulator_id = _regulator_id
     LIMIT 1;
  END IF;

  -- Tier 3: license_type exact
  IF v_wf_id IS NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows
     WHERE license_type = _license_type
       AND entity_type = 'application'
       AND is_active = true
     LIMIT 1;
  END IF;

  -- Tier 4: explicit prefix fallback
  IF v_wf_id IS NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows
     WHERE entity_type = 'application'
       AND is_active = true
       AND license_type <> ''
       AND (v_lt = lower(license_type)
            OR v_lt LIKE lower(license_type) || ' %'
            OR v_lt LIKE lower(license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(license_type) || '-%')
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_step_id FROM public.approval_steps
   WHERE workflow_id = v_wf_id
   ORDER BY step_order ASC
   LIMIT 1;

  workflow_id := v_wf_id;
  first_step_id := v_step_id;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- submit_application: applicant submit + applicant resubmit (single entry).
-- Validates ownership, payment completion, attaches/resumes workflow,
-- writes audit + approval_action + notification.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_application(
  _application_id uuid,
  _ack_text text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Payment must exist & be completed (defense-in-depth: edge function also checks).
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

  -- Look for an existing workflow instance (active OR paused).
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
    -- Resolve a workflow only when no instance exists.
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

  -- Decide target application status.
  --   - If a workflow is attached -> 'in_progress'
  --   - Otherwise -> 'submitted'
  v_app_status_target := CASE WHEN v_workflow_id IS NOT NULL THEN 'in_progress' ELSE 'submitted' END;

  -- Update application. submitted_at is only set on the FIRST submission
  -- (i.e. when transitioning out of draft). Resubmissions keep original.
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

  -- Mark form_responses as submitted
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

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (
    v_uid, v_audit_action, 'application', _application_id::text,
    jsonb_build_object(
      'status', v_app_status_target,
      'workflow_attached', v_workflow_id IS NOT NULL,
      'resumed', v_existing_instance IS NOT NULL,
      'resubmission', v_is_resub
    )
  );

  -- Notify the applicant (confirmation) so they see it in the bell.
  INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
  VALUES (
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
$$;

REVOKE ALL ON FUNCTION public.submit_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_application(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- request_resubmission_for_application: reviewer/admin path
-- Pauses the active workflow instance and writes audit + notification.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_resubmission_for_application(
  _application_id uuid,
  _comments text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Pause the active workflow instance (if any)
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

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (
    v_uid, 'resubmission_requested', 'application', _application_id::text,
    jsonb_build_object('comments', _comments)
  );

  INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
  VALUES (
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
$$;

REVOKE ALL ON FUNCTION public.request_resubmission_for_application(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_resubmission_for_application(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- reject_application_action: reviewer/admin reject outside the workflow path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_application_action(
  _application_id uuid,
  _comments text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    RETURN jsonb_build_object('error','Remarks are required for rejection','code','REMARKS_REQUIRED','http',422);
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

  IF NOT (v_actor_roles && ARRAY['super_admin','admin','supervisor','licensing_officer']::text[]) THEN
    RETURN jsonb_build_object('error','Only reviewers can reject applications','code','FORBIDDEN','http',403);
  END IF;

  SELECT id, applicant_id, application_number, status
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.status NOT IN ('submitted','in_progress','resubmission_requested','query_raised') THEN
    RETURN jsonb_build_object(
      'error', format('Cannot reject while status is ''%s''', v_app.status),
      'code','INVALID_STATUS','http',409
    );
  END IF;

  UPDATE public.applications
     SET status = 'rejected', rejected_at = v_now, updated_at = v_now
   WHERE id = _application_id;

  UPDATE public.workflow_instances
     SET status = 'rejected', completed_at = v_now, updated_at = v_now
   WHERE entity_id = _application_id
     AND entity_type = 'application'
     AND status IN ('active','paused');

  INSERT INTO public.approval_actions (
    application_id, actor_id, action, action_type, comments, responded_at
  ) VALUES (
    _application_id, v_uid, 'rejected', 'reject', NULLIF(trim(_comments),''), v_now
  );

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (
    v_uid, 'application_rejected', 'application', _application_id::text,
    jsonb_build_object('comments', _comments)
  );

  INSERT INTO public.notifications (user_id, title, message, type, entity_type, entity_id)
  VALUES (
    v_app.applicant_id,
    'Application Rejected: ' || v_app.application_number,
    'Your application has been rejected. Remarks: ' || _comments,
    'error', 'application', _application_id::text
  );

  RETURN jsonb_build_object(
    'success', true, 'http', 200,
    'application_id', _application_id,
    'status', 'rejected'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_application_action(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_application_action(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- reset_application_for_provisioning: admin-only — used to retry license
-- generation when an application is approved but provisioning failed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_application_for_provisioning(
  _application_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app record;
  v_now timestamptz := now();
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;

  IF NOT (public.has_role(v_uid, 'super_admin'::app_role) OR public.has_role(v_uid, 'admin'::app_role)) THEN
    RETURN jsonb_build_object('error','Admin only','code','FORBIDDEN','http',403);
  END IF;

  SELECT id, status INTO v_app FROM public.applications WHERE id = _application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  IF v_app.status <> 'approved' THEN
    RETURN jsonb_build_object('error','Only approved applications can be reset','code','INVALID_STATUS','http',409);
  END IF;

  UPDATE public.applications
     SET status = 'in_progress', approved_at = NULL, updated_at = v_now
   WHERE id = _application_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (v_uid, 'application_reset_for_provisioning', 'application',
          _application_id::text, jsonb_build_object('previous_status','approved'));

  RETURN jsonb_build_object('success', true, 'http', 200, 'application_id', _application_id);
END;
$$;

REVOKE ALL ON FUNCTION public.reset_application_for_provisioning(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_application_for_provisioning(uuid) TO authenticated;