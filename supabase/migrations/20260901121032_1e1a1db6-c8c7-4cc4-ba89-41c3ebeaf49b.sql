-- 1) Reconciliation routine: pinned requirements <- submitted form responses
CREATE OR REPLACE FUNCTION public.application_reconcile_form_requirements(_application_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_updated int := 0;
BEGIN
  IF _application_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH matched AS (
    SELECT r.id AS requirement_id,
           fr.id AS response_id
      FROM public.application_form_requirements r
      JOIN LATERAL (
        SELECT f.id
          FROM public.form_responses f
         WHERE f.entity_type = 'application'
           AND f.entity_id = r.application_id
           AND f.template_id = r.template_id
           AND (r.form_version_id IS NULL OR f.version_id = r.form_version_id)
           AND lower(COALESCE(f.status,'')) IN ('submitted','complete','completed','approved')
         ORDER BY f.submitted_at DESC NULLS LAST, f.updated_at DESC NULLS LAST
         LIMIT 1
      ) fr ON true
     WHERE r.application_id = _application_id
       AND (r.response_id IS DISTINCT FROM fr.id
            OR lower(COALESCE(r.status,'pending'))
                 NOT IN ('complete','completed','submitted','approved','waived'))
  ), upd AS (
    UPDATE public.application_form_requirements r
       SET response_id = m.response_id,
           status = 'SUBMITTED',
           updated_at = now()
      FROM matched m
     WHERE r.id = m.requirement_id
    RETURNING r.id
  )
  SELECT count(*) INTO v_updated FROM upd;

  RETURN v_updated;
END $function$;

REVOKE ALL ON FUNCTION public.application_reconcile_form_requirements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.application_reconcile_form_requirements(uuid) TO authenticated, service_role;

-- 2) Workflow gate trusts the live workflow instance
CREATE OR REPLACE FUNCTION public.application_licensing_readiness(_application_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_app record;
  v_is_initial boolean;
  v_dims jsonb := '[]'::jsonb;
  v_overall text := 'PASS';
  v_dim jsonb;
  v_req_total int; v_req_open int;
  v_paid numeric;
  v_conditions int;
  v_wf jsonb;
  v_gate text;
  v_blockers jsonb;
  v_live record;
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

  -- (2) Workflow authority: a live instance with steps is authoritative,
  --     configuration re-resolution is the fallback when none exists.
  SELECT wi.id AS instance_id, wi.workflow_id, w.name AS workflow_name
    INTO v_live
    FROM public.workflow_instances wi
    JOIN public.approval_workflows w ON w.id = wi.workflow_id
   WHERE wi.entity_id = _application_id
     AND lower(COALESCE(wi.status,'')) IN ('active','in_progress','pending')
     AND EXISTS (SELECT 1 FROM public.approval_steps s WHERE s.workflow_id = w.id)
   ORDER BY wi.created_at DESC NULLS LAST
   LIMIT 1;

  IF v_live.instance_id IS NOT NULL THEN
    v_dims := v_dims || jsonb_build_object('gate','workflow','state','PASS',
      'detail', jsonb_build_object(
        'state','LIVE_INSTANCE',
        'workflow_id', v_live.workflow_id,
        'workflow_name', v_live.workflow_name,
        'instance_id', v_live.instance_id));
  ELSE
    v_wf := public.application_workflow_resolve(_application_id);
    v_dims := v_dims || jsonb_build_object('gate','workflow',
      'state', CASE WHEN v_wf->>'state' = 'RESOLVED' THEN 'PASS' ELSE 'BUSINESS_CONFIGURATION_REQUIRED' END,
      'detail', v_wf);
  END IF;

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

  -- (4) Fees
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
END $function$;

-- 3) One-off backfill for already-submitted applications with stale requirements
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT afr.application_id
      FROM public.application_form_requirements afr
     WHERE afr.response_id IS NULL
       AND lower(COALESCE(afr.status,'pending'))
             NOT IN ('complete','completed','submitted','approved','waived')
  LOOP
    PERFORM public.application_reconcile_form_requirements(r.application_id);
  END LOOP;
END $$;