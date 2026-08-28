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
  v_provision jsonb;
  v_license_id uuid; v_license_number text; v_licensee_id uuid;
  v_readiness jsonb;
  v_plan jsonb;
  v_is_f5 boolean := false;
  v_effect jsonb;
  v_effect_rows int;
BEGIN
  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  BEGIN
    _actor_id := public.workflow_resolve_actor(_actor_id);
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN jsonb_build_object('error', SQLERRM, 'code', SQLERRM,
                              'http', CASE WHEN SQLERRM = 'UNAUTHORIZED' THEN 401 ELSE 403 END);
  END;

  IF _actor_id IS NULL THEN
    RETURN jsonb_build_object('error','UNAUTHORIZED','code','UNAUTHORIZED','http',401);
  END IF;
  PERFORM set_config('app.workflow_actor_id', _actor_id::text, true);

  IF _comments IS NULL OR length(trim(_comments)) = 0 THEN
    RETURN jsonb_build_object('error','Remarks are mandatory for approval','code','REMARKS_REQUIRED','http',422);
  END IF;

  SELECT id, applicant_id, application_number, status, license_type,
         regulator_id, workflow_id, data, approved_at
    INTO v_app FROM public.applications WHERE id=_application_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Application not found','code','NOT_FOUND','http',404);
  END IF;

  -- Canonical F4 / F5 classification: licence + service binding only.
  v_plan := public.post_license_effect_plan(_application_id);
  v_is_f5 := COALESCE((v_plan->>'is_post_license')::boolean, false);

  IF v_app.status = 'approved' THEN
    IF v_is_f5 THEN
      v_effect := public.apply_post_license_effect(_application_id);
      RETURN jsonb_build_object('success',true,'http',200,'already_processed',true,
        'post_license', true,
        'application_id',_application_id,
        'applicant_id',v_app.applicant_id,
        'effect', v_effect,
        'effect_plan', v_plan);
    END IF;
    v_provision := public.provision_application_entity(_application_id);
    PERFORM public.assert_license_term_integrity(NULLIF(v_provision->>'license_id','')::uuid, _actor_id);
    RETURN jsonb_build_object('success',true,'http',200,'already_processed',true,
      'application_id',_application_id,
      'applicant_id',v_app.applicant_id,
      'provision', v_provision);
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
    PERFORM public.log_workflow_authz_denial(_actor_id, v_step.id, 'approve', COALESCE(v_auth->>'reason','WRONG_APPROVER'), v_auth);
    RETURN jsonb_build_object('error',
      format('Only %s can act on this step', COALESCE(v_auth->>'required_role_name', v_step.approver_role::text)),
      'code','WRONG_APPROVER','http',403,
      'diagnostic', v_auth);
  END IF;

  v_allowed_actions := ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_step.allowed_actions, '[]'::jsonb)));
  IF NOT ('approve' = ANY(v_allowed_actions)) THEN
    RETURN jsonb_build_object('error','Approve is not allowed on this step','code','ACTION_NOT_ALLOWED','http',422);
  END IF;

  -- ============ F4-B: server-authoritative licensing readiness ============
  v_readiness := public.application_licensing_readiness(_application_id);
  IF COALESCE(v_readiness->>'state','') <> 'PASS' THEN
    PERFORM public.create_audit_log(_actor_id, 'application_final_approval_blocked', 'application',
      _application_id::text, NULL, jsonb_build_object('readiness', v_readiness), NULL);
    RETURN jsonb_build_object(
      'error','Licensing prerequisites are not satisfied for this application',
      'code', CASE WHEN v_readiness->>'state' = 'BUSINESS_CONFIGURATION_REQUIRED'
                   THEN 'BUSINESS_CONFIGURATION_REQUIRED' ELSE 'LICENSING_READINESS_BLOCKED' END,
      'http',422,
      'readiness', v_readiness);
  END IF;

  -- ================== F5-B3: governed post-approval effect ==================
  IF v_is_f5 THEN
    -- F5-B3 fail-closed: a NEW post-licensing decision may only be approved when
    -- the canonical effect plan is READY. Every other state is refused with a
    -- governed, machine-readable blocked result (never a generic success).
    IF COALESCE(v_plan->>'state','') <> 'READY' THEN
      PERFORM public.create_audit_log(_actor_id, 'post_license.effect.blocked', 'application',
        _application_id::text, NULL, jsonb_build_object('effect_plan', v_plan), NULL);
      RETURN jsonb_build_object(
        'success', false,
        'blocked', true,
        'error','The governed post-licensing effect cannot be applied for this request',
        'code', COALESCE(v_plan->>'code','POST_LICENSE_EFFECT_BLOCKED'),
        'http',422,
        'application_id', _application_id,
        'plan_state', v_plan->>'state',
        'plan_code', v_plan->>'code',
        'blockers', COALESCE(v_plan->'blockers','[]'::jsonb),
        'effect_plan', v_plan,
        'readiness', v_readiness);
    END IF;

    UPDATE public.applications SET status='approved', approved_at=v_now, updated_at=v_now WHERE id=_application_id;
    UPDATE public.workflow_instances SET status='completed', completed_at=v_now, updated_at=v_now WHERE id=v_instance.id;

    -- Same transaction as the approval. Any failure aborts the whole decision.
    v_effect := public.apply_post_license_effect(_application_id);
    IF NOT COALESCE((v_effect->>'success')::boolean,false) THEN
      RAISE EXCEPTION 'POST_LICENSE_EFFECT_FAILED' USING ERRCODE='22023';
    END IF;

    SELECT count(*) INTO v_effect_rows FROM public.post_license_effects
     WHERE application_id = _application_id AND state = 'APPLIED';
    IF v_effect_rows <> 1 THEN
      RAISE EXCEPTION 'POST_LICENSE_EFFECT_LEDGER_INVALID' USING ERRCODE='22023';
    END IF;

    INSERT INTO public.approval_actions (application_id, step_id, workflow_instance_id, actor_id,
      action, action_type, comments, responded_at)
    VALUES (_application_id, v_step.id, v_instance.id, _actor_id,
      'approve_final', 'approve', NULLIF(trim(_comments),''), v_now)
    ON CONFLICT (application_id) WHERE action='approve_final' DO NOTHING;

    PERFORM public.create_audit_log(_actor_id, 'post_license.application_final_approved', 'application',
      _application_id::text, NULL,
      jsonb_build_object('effect', v_effect, 'effect_plan', v_plan,
                         'auth', v_auth, 'readiness', v_readiness), NULL);

    PERFORM public.create_notification(v_app.applicant_id,
      'Request Approved: ' || v_app.application_number,
      'Your post-licensing request has been approved and the regulatory record has been updated.',
      'success', 'application', _application_id::text);

    RETURN jsonb_build_object('success',true,'http',200,
      'post_license', true,
      'application_id',_application_id,
      'applicant_id',v_app.applicant_id,
      'effect', v_effect,
      'effect_plan', v_plan,
      'readiness', v_readiness);
  END IF;

  -- ===================== F4 initial licensing (frozen path) =================
  UPDATE public.applications SET status='approved', approved_at=v_now, updated_at=v_now WHERE id=_application_id;
  UPDATE public.workflow_instances SET status='completed', completed_at=v_now, updated_at=v_now WHERE id=v_instance.id;

  v_provision := public.provision_application_entity(_application_id);
  v_license_id    := NULLIF(v_provision->>'license_id','')::uuid;
  v_license_number := v_provision->>'license_number';
  v_licensee_id   := NULLIF(v_provision->>'licensee_id','')::uuid;

  -- ===== F4-B5 / DEF-F4-C-04: issuance is invalid without an opening term =====
  PERFORM public.assert_license_term_integrity(v_license_id, _actor_id);

  INSERT INTO public.approval_actions (application_id, step_id, workflow_instance_id, actor_id,
    action, action_type, comments, responded_at)
  VALUES (_application_id, v_step.id, v_instance.id, _actor_id,
    'approve_final', 'approve', NULLIF(trim(_comments),''), v_now)
  ON CONFLICT (application_id) WHERE action='approve_final' DO NOTHING;

  PERFORM public.create_audit_log(_actor_id, 'application_final_approved', 'application',
    _application_id::text, NULL,
    jsonb_build_object('license_id',v_license_id,'license_number',v_license_number,
                       'licensee_id',v_licensee_id, 'auth', v_auth,
                       'provision', v_provision, 'readiness', v_readiness), NULL);

  PERFORM public.create_notification(v_app.applicant_id,
    'Application Approved: ' || v_app.application_number,
    CASE WHEN v_license_number IS NOT NULL
         THEN 'Your application has been approved. License Number: ' || v_license_number
         ELSE 'Your application has been approved. Your license will be issued once payment is verified.' END,
    'success', 'application', _application_id::text);

  RETURN jsonb_build_object('success',true,'http',200,
    'application_id',_application_id,
    'license_id',v_license_id,
    'license_number',v_license_number,
    'licensee_id',v_licensee_id,
    'applicant_id',v_app.applicant_id,
    'readiness', v_readiness,
    'provision', v_provision);
END;
$function$;