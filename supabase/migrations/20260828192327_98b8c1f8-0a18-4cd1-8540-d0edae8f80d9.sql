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
  v_sub_sector_id uuid;
  v_service_id uuid;
  v_category_id uuid;
  v_license_id uuid;
  v_workflow_id uuid;
  v_first_step_id uuid;
  v_existing_instance record;
  v_new_instance_id uuid;
  v_action_label text;
  v_audit_action text;
  v_app_status_target text;
  v_effective_regulator uuid;
  v_is_post_license boolean;
  v_ctx record;
  v_authority text;
  v_canonical jsonb;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401);
  END IF;

  SELECT id, applicant_id, entity_id, application_number, status, license_type,
         regulator_id, data
    INTO v_app
    FROM public.applications
   WHERE id = _application_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  -- GAP-F5-02: submission authority is an entity capability, not row ownership.
  IF v_app.applicant_id = v_uid THEN
    v_authority := 'applicant';
  ELSIF v_app.entity_id IS NOT NULL
        AND public.entity_membership_capability(v_uid, v_app.entity_id, 'submit') THEN
    v_authority := 'entity_delegate';
  ELSE
    RETURN jsonb_build_object(
      'error','You are not authorised to submit this filing for this entity',
      'code','FORBIDDEN','http',403);
  END IF;

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
  v_sub_sector_id := NULLIF(v_app.data->>'sub_sector_id','')::uuid;
  v_service_id := NULLIF(v_app.data->>'service_id','')::uuid;
  v_category_id := NULLIF(v_app.data->>'category_id','')::uuid;
  v_license_id := NULLIF(v_app.data->>'license_id','')::uuid;
  v_is_post_license := v_service_id IS NOT NULL OR (v_app.data->>'type') = 'post_license';

  -- GAP-F5-01 / GAP-F5-15: re-derive taxonomy from the licence at submission
  -- and refuse any incompatible or ineligible binding.
  IF v_is_post_license THEN
    IF v_license_id IS NULL THEN
      RETURN jsonb_build_object(
        'error','This post-licence filing is not bound to a licence','code','LICENSE_REQUIRED','http',409);
    END IF;

    SELECT * INTO v_ctx
      FROM public.resolve_post_license_intake_context(v_license_id, v_service_id);
    IF v_ctx.entity_id IS NULL THEN
      RETURN jsonb_build_object(
        'error','The licence for this filing could not be found','code','LICENSE_NOT_FOUND','http',409);
    END IF;

    IF v_service_id IS NOT NULL
       AND NOT public.service_license_compatible(v_service_id, v_license_id) THEN
      RETURN jsonb_build_object(
        'error','The selected service is not available for the scope of this licence',
        'code','SERVICE_LICENSE_INCOMPATIBLE','http',409);
    END IF;

    IF NOT public.can_act_on_specific_license(v_license_id, v_ctx.entity_id, NULL, NULL, NULL) THEN
      RETURN jsonb_build_object(
        'error','This service is unavailable because the related licence is not currently approved, issued and in good standing.',
        'code','LICENSE_ENTITLEMENT_REQUIRED','http',409);
    END IF;

    v_sector_id := v_ctx.sector_id;
    v_sub_sector_id := v_ctx.sub_sector_id;
    v_category_id := v_ctx.category_id;

    v_canonical := jsonb_build_object(
      'licensee_id', v_ctx.entity_id,
      'sector_id', v_ctx.sector_id,
      'sub_sector_id', v_ctx.sub_sector_id,
      'category_id', v_ctx.category_id
    );

    UPDATE public.applications
       SET data = COALESCE(data,'{}'::jsonb) || v_canonical,
           entity_id = COALESCE(entity_id, v_ctx.entity_id),
           updated_at = v_now
     WHERE id = _application_id;
  END IF;

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
             v_app.license_type, v_effective_regulator, v_sector_id, v_category_id,
             v_is_post_license, v_service_id, v_sub_sector_id) r;

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
    entity_type, entity_id, action, user_id, new_value, metadata
  ) VALUES (
    'application',
    _application_id::text,
    'application.' || v_audit_action,
    v_uid,
    jsonb_build_object('status', v_app_status_target),
    jsonb_build_object(
      'source', 'submit_application_rpc',
      'application_id', _application_id,
      'application_number', v_app.application_number,
      'workflow_id', v_workflow_id,
      'first_step_id', v_first_step_id,
      'is_resubmission', v_is_resub,
      'previous_status', v_app.status,
      'resumed', v_is_resub,
      'submission_authority', v_authority,
      'submitted_by', v_uid,
      'applicant_id', v_app.applicant_id
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
    'submission_authority', v_authority,
    'previous_status', v_app.status
  );
END;
$function$;