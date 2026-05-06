
-- Helper: resolve the effective regulator for an application based on
-- (current regulator_id, sector_id, category_id). Categories inherit
-- their regulator from the parent sector.
CREATE OR REPLACE FUNCTION public._resolve_effective_regulator(
  _regulator_id uuid,
  _sector_id uuid,
  _category_id uuid
) RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sector_reg uuid;
  v_cat_sector uuid;
BEGIN
  -- Prefer category -> sector -> regulator
  IF _category_id IS NOT NULL THEN
    SELECT c.sector_id INTO v_cat_sector FROM public.categories c WHERE c.id = _category_id;
    IF v_cat_sector IS NOT NULL THEN
      SELECT s.regulator_id INTO v_sector_reg FROM public.sectors s WHERE s.id = v_cat_sector;
      IF v_sector_reg IS NOT NULL THEN RETURN v_sector_reg; END IF;
    END IF;
  END IF;

  IF _sector_id IS NOT NULL THEN
    SELECT s.regulator_id INTO v_sector_reg FROM public.sectors s WHERE s.id = _sector_id;
    IF v_sector_reg IS NOT NULL THEN RETURN v_sector_reg; END IF;
  END IF;

  RETURN _regulator_id;
END;
$$;

-- Replace workflow resolver to use the effective regulator
CREATE OR REPLACE FUNCTION public._resolve_application_workflow(
  _license_type text,
  _regulator_id uuid,
  _sector_id uuid,
  _category_id uuid
) RETURNS TABLE(workflow_id uuid, first_step_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wf_id uuid;
  v_step_id uuid;
  v_eff_reg uuid;
  v_lt text := lower(coalesce(_license_type, ''));
BEGIN
  v_eff_reg := public._resolve_effective_regulator(_regulator_id, _sector_id, _category_id);

  -- 1. effective regulator + category
  IF v_eff_reg IS NOT NULL AND _category_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows
     WHERE license_type = _license_type AND entity_type = 'application'
       AND is_active = true AND regulator_id = v_eff_reg AND category_id = _category_id
     LIMIT 1;
  END IF;

  -- 2. effective regulator + sector
  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL AND _sector_id IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows
     WHERE license_type = _license_type AND entity_type = 'application'
       AND is_active = true AND regulator_id = v_eff_reg AND sector_id = _sector_id
     LIMIT 1;
  END IF;

  -- 3. effective regulator only
  IF v_wf_id IS NULL AND v_eff_reg IS NOT NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows
     WHERE license_type = _license_type AND entity_type = 'application'
       AND is_active = true AND regulator_id = v_eff_reg
     ORDER BY (category_id IS NULL), (sector_id IS NULL)
     LIMIT 1;
  END IF;

  -- 4. fallback: original regulator (if different from effective)
  IF v_wf_id IS NULL AND _regulator_id IS NOT NULL AND _regulator_id IS DISTINCT FROM v_eff_reg THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows
     WHERE license_type = _license_type AND entity_type = 'application'
       AND is_active = true AND regulator_id = _regulator_id
     LIMIT 1;
  END IF;

  -- 5. license_type only
  IF v_wf_id IS NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows
     WHERE license_type = _license_type AND entity_type = 'application' AND is_active = true
     LIMIT 1;
  END IF;

  -- 6. prefix-tolerant license_type
  IF v_wf_id IS NULL THEN
    SELECT id INTO v_wf_id FROM public.approval_workflows aw
     WHERE aw.entity_type = 'application' AND aw.is_active = true AND aw.license_type <> ''
       AND (v_lt = lower(aw.license_type)
            OR v_lt LIKE lower(aw.license_type) || ' %'
            OR v_lt LIKE lower(aw.license_type) || '\_%' ESCAPE '\'
            OR v_lt LIKE lower(aw.license_type) || '-%')
     LIMIT 1;
  END IF;

  IF v_wf_id IS NULL THEN RETURN; END IF;

  SELECT s.id INTO v_step_id FROM public.approval_steps s
   WHERE s.workflow_id = v_wf_id ORDER BY s.step_order ASC LIMIT 1;

  workflow_id := v_wf_id;
  first_step_id := v_step_id;
  RETURN NEXT;
END;
$$;

-- Update submit_application to set regulator_id to effective sector regulator
CREATE OR REPLACE FUNCTION public.submit_application(_application_id uuid, _ack_text text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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

  -- Resolve effective regulator from sector/category
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
             v_app.license_type, v_effective_regulator, v_sector_id, v_category_id) r;

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
      'resubmission', v_is_resub,
      'effective_regulator_id', v_effective_regulator
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
    'effective_regulator_id', v_effective_regulator,
    'message', CASE
      WHEN v_is_resub AND v_workflow_id IS NOT NULL THEN 'Application resubmitted and workflow resumed'
      WHEN v_is_resub THEN 'Application resubmitted successfully'
      WHEN v_workflow_id IS NOT NULL THEN 'Application submitted and routed to approval workflow'
      ELSE 'Application submitted successfully'
    END
  );
END;
$function$;
