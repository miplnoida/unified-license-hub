-- =====================================================================
-- F4-B PART 2: decision gates (F4-03/04/05/13)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fp_positive_outcomes()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT ARRAY['approved','fit','fit_and_proper','cleared','pass']::text[]
$$;

-- ---------------------------------------------------------------------
-- GAP-F4-03: Fit & Proper readiness resolved through the canonical entity.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.application_fp_readiness(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_entity uuid;
  v_applicability text;
  v_links int := 0;
  v_outstanding jsonb := '[]'::jsonb;
  r record;
BEGIN
  SELECT l.id INTO v_entity
    FROM public.applications a
    JOIN public.licensees l ON l.id = a.entity_id
   WHERE a.id = _application_id;

  v_applicability := public.licensing_gate_applicability(_application_id, 'fit_and_proper');

  -- 1. Explicit application <-> F&P assessment links are authoritative.
  SELECT count(*) INTO v_links
    FROM public.application_fp_links fl
   WHERE fl.application_id = _application_id AND COALESCE(fl.is_required, true);

  IF v_links > 0 THEN
    FOR r IN
      SELECT fl.assessment_id, fa.individual_id, fa.status AS assessment_status,
             d.outcome, d.is_current
        FROM public.application_fp_links fl
        JOIN public.fp_assessments fa ON fa.id = fl.assessment_id
        LEFT JOIN LATERAL (
          SELECT outcome, is_current FROM public.fp_determinations
           WHERE assessment_id = fl.assessment_id AND is_current = true
           ORDER BY determined_at DESC NULLS LAST LIMIT 1
        ) d ON true
       WHERE fl.application_id = _application_id
         AND COALESCE(fl.is_required, true)
         AND (d.outcome IS NULL OR NOT (lower(d.outcome) = ANY (public.fp_positive_outcomes())))
    LOOP
      v_outstanding := v_outstanding || jsonb_build_object(
        'kind','fit_and_proper',
        'assessment_id', r.assessment_id,
        'individual_id', r.individual_id,
        'assessment_status', r.assessment_status,
        'latest_outcome', COALESCE(r.outcome,'none'));
    END LOOP;

    RETURN jsonb_build_object(
      'gate','fit_and_proper',
      'state', CASE WHEN jsonb_array_length(v_outstanding) = 0 THEN 'PASS' ELSE 'REQUIRED_AND_INCOMPLETE' END,
      'basis','explicit_application_fp_links',
      'entity_id', v_entity,
      'required_count', v_links,
      'outstanding', v_outstanding);
  END IF;

  -- 2. No explicit links: fall back to current controlled functions at the
  --    canonical entity (applications.entity_id -> licensees.id).
  IF v_entity IS NOT NULL THEN
    FOR r IN
      SELECT ir.individual_id, ir.role_type, ir.role_title, d.outcome
        FROM public.fp_individual_roles ir
        LEFT JOIN LATERAL (
          SELECT outcome FROM public.fp_determinations
           WHERE individual_id = ir.individual_id AND is_current = true
           ORDER BY determined_at DESC NULLS LAST LIMIT 1
        ) d ON true
       WHERE ir.licensee_id = v_entity
         AND ir.is_current = true
         AND (d.outcome IS NULL OR NOT (lower(d.outcome) = ANY (public.fp_positive_outcomes())))
    LOOP
      v_outstanding := v_outstanding || jsonb_build_object(
        'kind','fit_and_proper',
        'individual_id', r.individual_id,
        'role_type', r.role_type,
        'role_title', r.role_title,
        'latest_outcome', COALESCE(r.outcome,'none'));
    END LOOP;

    IF jsonb_array_length(v_outstanding) > 0 THEN
      RETURN jsonb_build_object('gate','fit_and_proper','state','REQUIRED_AND_INCOMPLETE',
        'basis','canonical_entity_controlled_functions','entity_id', v_entity,
        'outstanding', v_outstanding);
    END IF;

    IF EXISTS (SELECT 1 FROM public.fp_individual_roles ir
                WHERE ir.licensee_id = v_entity AND ir.is_current = true) THEN
      RETURN jsonb_build_object('gate','fit_and_proper','state','PASS',
        'basis','canonical_entity_controlled_functions','entity_id', v_entity,
        'outstanding','[]'::jsonb);
    END IF;
  END IF;

  -- 3. Nothing linked and nothing registered: only an explicit regulator
  --    configuration may decide. Absent configuration is never a silent pass.
  IF v_applicability = 'NOT_APPLICABLE' THEN
    RETURN jsonb_build_object('gate','fit_and_proper','state','NOT_APPLICABLE',
      'basis','licensing_gate_configs','entity_id', v_entity);
  ELSIF v_applicability = 'REQUIRED' THEN
    RETURN jsonb_build_object('gate','fit_and_proper','state','REQUIRED_AND_INCOMPLETE',
      'basis','licensing_gate_configs','entity_id', v_entity,
      'outstanding', jsonb_build_array(jsonb_build_object(
        'kind','fit_and_proper','reason','No fit & proper assessment is linked to this application')));
  END IF;

  RETURN jsonb_build_object('gate','fit_and_proper','state','BUSINESS_CONFIGURATION_REQUIRED',
    'basis','licensing_gate_configs','entity_id', v_entity,
    'reason','Regulator has not declared whether fit & proper applies to this licence type');
END $$;

-- ---------------------------------------------------------------------
-- GAP-F4-04/05/13: single server-authoritative licensing readiness resolver
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.application_licensing_readiness(_application_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_app record;
  v_is_initial boolean;
  v_dims jsonb := '[]'::jsonb;
  v_overall text := 'PASS';
  v_dim jsonb;
  v_app_state text;
  v_req_total int; v_req_open int;
  v_paid numeric; v_due numeric;
  v_conditions int;
  v_wf jsonb;
  v_gate text;
  v_blockers jsonb;
BEGIN
  SELECT a.* INTO v_app FROM public.applications a WHERE a.id = _application_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state','NOT_FOUND','application_id',_application_id);
  END IF;

  v_is_initial := public.application_is_initial_licence(_application_id);

  -- (1) F3 registration handoff (initial licence only; never F5 renewals/variations)
  IF v_is_initial THEN
    IF EXISTS (
      SELECT 1 FROM public.registration_licensing_handoffs h
       JOIN public.registrations r ON r.id = h.registration_id
      WHERE h.application_id = _application_id AND lower(r.status) = 'approved'
    ) THEN
      v_dim := jsonb_build_object('gate','registration_handoff','state','PASS');
    ELSE
      v_dim := jsonb_build_object('gate','registration_handoff','state','REQUIRED_AND_INCOMPLETE',
        'reason','No approved F3 registration handoff is bound to this application');
    END IF;
  ELSE
    v_dim := jsonb_build_object('gate','registration_handoff','state','NOT_APPLICABLE',
      'reason','Post-licensing service request (F5 scope)');
  END IF;
  v_dims := v_dims || v_dim;

  -- (2) Workflow configuration authority
  v_wf := public.application_workflow_resolve(_application_id);
  v_dims := v_dims || jsonb_build_object('gate','workflow',
    'state', CASE WHEN v_wf->>'state' = 'RESOLVED' THEN 'PASS' ELSE 'BUSINESS_CONFIGURATION_REQUIRED' END,
    'detail', v_wf);

  -- (3) Forms / documents requirements
  SELECT count(*), count(*) FILTER (
           WHERE lower(COALESCE(status,'pending')) NOT IN ('complete','completed','submitted','approved','waived'))
    INTO v_req_total, v_req_open
    FROM public.application_form_requirements
   WHERE application_id = _application_id AND COALESCE(is_required, true);

  IF v_req_total > 0 THEN
    v_dims := v_dims || jsonb_build_object('gate','forms_documents',
      'state', CASE WHEN v_req_open = 0 THEN 'PASS' ELSE 'REQUIRED_AND_INCOMPLETE' END,
      'required_count', v_req_total, 'outstanding_count', v_req_open);
  ELSE
    v_gate := public.licensing_gate_applicability(_application_id, 'forms_documents');
    v_dims := v_dims || jsonb_build_object('gate','forms_documents',
      'state', CASE v_gate WHEN 'NOT_APPLICABLE' THEN 'NOT_APPLICABLE'
                           WHEN 'REQUIRED' THEN 'REQUIRED_AND_INCOMPLETE'
                           ELSE 'BUSINESS_CONFIGURATION_REQUIRED' END,
      'required_count', 0,
      'reason','No form/document requirements are bound to this application');
  END IF;

  -- (4) Fees (uses the existing fee assessment / payment estate as evidence)
  SELECT COALESCE(sum(amount) FILTER (
           WHERE lower(COALESCE(status,'')) IN ('success','succeeded','paid','completed','verified')
             AND lower(COALESCE(verification_status,'verified')) IN ('verified','approved','not_required')), 0)
    INTO v_paid FROM public.payments WHERE application_id = _application_id;

  v_gate := public.licensing_gate_applicability(_application_id, 'fees');
  IF v_gate = 'NOT_APPLICABLE' THEN
    v_dims := v_dims || jsonb_build_object('gate','fees','state','NOT_APPLICABLE');
  ELSIF v_paid > 0 THEN
    v_dims := v_dims || jsonb_build_object('gate','fees','state','PASS','verified_amount', v_paid);
  ELSIF v_gate = 'REQUIRED' THEN
    v_dims := v_dims || jsonb_build_object('gate','fees','state','REQUIRED_AND_INCOMPLETE',
      'reason','No verified application payment exists');
  ELSE
    v_dims := v_dims || jsonb_build_object('gate','fees','state','BUSINESS_CONFIGURATION_REQUIRED',
      'reason','Regulator has not declared whether a fee is payable for this licence type');
  END IF;

  -- (5) Fit & Proper
  v_dims := v_dims || public.application_fp_readiness(_application_id);

  -- (6) Licence conditions (prerequisite only where explicitly configured)
  v_gate := public.licensing_gate_applicability(_application_id, 'conditions');
  SELECT count(*) INTO v_conditions FROM public.license_conditions WHERE application_id = _application_id;
  IF v_gate = 'REQUIRED' THEN
    v_dims := v_dims || jsonb_build_object('gate','conditions',
      'state', CASE WHEN v_conditions > 0 THEN 'PASS' ELSE 'REQUIRED_AND_INCOMPLETE' END,
      'condition_count', v_conditions);
  ELSE
    v_dims := v_dims || jsonb_build_object('gate','conditions','state','NOT_APPLICABLE',
      'condition_count', v_conditions,
      'reason','Conditions are an output of the decision unless configured as a prerequisite');
  END IF;

  -- (7) Coordination blockers and existing decision gates
  v_blockers := public.check_decision_gates(_application_id, NULL);
  v_dims := v_dims || jsonb_build_object('gate','coordination',
    'state', CASE WHEN jsonb_array_length(COALESCE(v_blockers,'[]'::jsonb)) = 0
                  THEN 'PASS' ELSE 'REQUIRED_AND_INCOMPLETE' END,
    'blockers', COALESCE(v_blockers,'[]'::jsonb));

  -- Overall = worst state (fail closed)
  SELECT CASE
    WHEN bool_or(d->>'state' = 'REQUIRED_AND_INCOMPLETE') THEN 'REQUIRED_AND_INCOMPLETE'
    WHEN bool_or(d->>'state' = 'BUSINESS_CONFIGURATION_REQUIRED') THEN 'BUSINESS_CONFIGURATION_REQUIRED'
    ELSE 'PASS' END
    INTO v_overall
    FROM jsonb_array_elements(v_dims) d;

  RETURN jsonb_build_object(
    'application_id', _application_id,
    'is_initial_licence', v_is_initial,
    'state', v_overall,
    'can_decide', v_overall = 'PASS',
    'gates', v_dims,
    'evaluated_at', now());
END $$;

REVOKE ALL ON FUNCTION public.application_licensing_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.application_licensing_readiness(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.application_fp_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.application_fp_readiness(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- GAP-F4-03: repair check_decision_gates identity resolution
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_decision_gates(_application_id uuid, _license_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  blockers jsonb := '[]'::jsonb;
  r record;
  app_row applications%ROWTYPE;
  lic_row licenses%ROWTYPE;
  target_licensee uuid;
BEGIN
  IF _application_id IS NOT NULL THEN
    SELECT * INTO app_row FROM applications WHERE id = _application_id;
    -- Canonical entity identity (F2): applications.entity_id -> licensees.id.
    -- Never applicant_id, which is a user account id.
    SELECT l.id INTO target_licensee FROM licensees l WHERE l.id = app_row.entity_id;
  END IF;

  IF _license_id IS NOT NULL THEN
    SELECT * INTO lic_row FROM licenses WHERE id = _license_id;
    IF target_licensee IS NULL THEN
      SELECT l.id INTO target_licensee FROM licensees l WHERE l.id = lic_row.holder_id;
    END IF;
  END IF;

  FOR r IN
    SELECT cf.id, cf.flag_type, cf.title, cf.case_id
    FROM coordination_flags cf
    WHERE cf.status = 'open'
      AND cf.flag_type IN ('blocker','concurrent_review')
      AND (
        (_application_id IS NOT NULL AND cf.linked_application_id = _application_id)
        OR (_license_id IS NOT NULL AND cf.linked_license_id = _license_id)
      )
  LOOP
    blockers := blockers || jsonb_build_object(
      'kind','coordination_flag','flag_id',r.id,'flag_type',r.flag_type,
      'case_id',r.case_id,'title',r.title);
  END LOOP;

  FOR r IN
    SELECT ce.id, ce.tier, ce.status, ce.case_id
    FROM coordination_escalations ce
    JOIN coordination_flags cf ON cf.case_id = ce.case_id
    WHERE ce.status IN ('open','in_review')
      AND (
        (_application_id IS NOT NULL AND cf.linked_application_id = _application_id)
        OR (_license_id IS NOT NULL AND cf.linked_license_id = _license_id)
      )
  LOOP
    blockers := blockers || jsonb_build_object(
      'kind','coordination_escalation','escalation_id',r.id,'tier',r.tier,
      'status',r.status,'case_id',r.case_id);
  END LOOP;

  -- Fit & Proper on the canonical entity's current controlled functions.
  IF target_licensee IS NOT NULL THEN
    FOR r IN
      SELECT ir.individual_id, ir.role_type, ir.role_title, d.outcome AS latest_outcome
      FROM fp_individual_roles ir
      LEFT JOIN LATERAL (
        SELECT outcome FROM fp_determinations
        WHERE individual_id = ir.individual_id AND is_current = true
        ORDER BY determined_at DESC NULLS LAST LIMIT 1
      ) d ON true
      WHERE ir.licensee_id = target_licensee
        AND ir.is_current = true
        AND (ir.role_type IS NULL OR ir.role_type IN (
          'director','ceo','cfo','coo','chairperson','shareholder',
          'controller','key_person','md','executive_director','compliance_officer'
        ))
        AND (d.outcome IS NULL OR NOT (lower(d.outcome) = ANY (public.fp_positive_outcomes())))
    LOOP
      blockers := blockers || jsonb_build_object(
        'kind','fit_and_proper','individual_id',r.individual_id,'role_type',r.role_type,
        'role_title',r.role_title,'latest_outcome',COALESCE(r.latest_outcome,'none'));
    END LOOP;
  END IF;

  RETURN blockers;
END;
$function$;

-- ---------------------------------------------------------------------
-- Wire the resolver into the single final-approval path (fail closed)
-- ---------------------------------------------------------------------
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
    v_provision := public.provision_application_entity(_application_id);
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

  UPDATE public.applications SET status='approved', approved_at=v_now, updated_at=v_now WHERE id=_application_id;
  UPDATE public.workflow_instances SET status='completed', completed_at=v_now, updated_at=v_now WHERE id=v_instance.id;

  v_provision := public.provision_application_entity(_application_id);
  v_license_id    := NULLIF(v_provision->>'license_id','')::uuid;
  v_license_number := v_provision->>'license_number';
  v_licensee_id   := NULLIF(v_provision->>'licensee_id','')::uuid;

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