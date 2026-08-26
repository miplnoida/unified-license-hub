
-- ---------- shared guard ----------
CREATE OR REPLACE FUNCTION public.mc03_guard(_complaint_id uuid, _action text)
RETURNS public.complaints LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN public.mc02_complaint_guard(_complaint_id, _action);
END; $$;

-- ---------- investigation gate ----------
CREATE OR REPLACE FUNCTION public.complaint_investigation_gate(_complaint_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.complaints; a public.complaint_jurisdiction_assessments;
        v_blockers text[] := '{}'; v_scope text;
BEGIN
  SELECT * INTO c FROM public.complaints WHERE id = _complaint_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Complaint not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO a FROM public.complaint_jurisdiction_assessments WHERE complaint_id = _complaint_id;

  IF a.id IS NULL OR a.status <> 'DECIDED' THEN
    v_blockers := v_blockers || 'Jurisdiction assessment is not yet decided';
  ELSIF a.decision_outcome NOT IN ('ACCEPTED','PARTIALLY_ACCEPTED') THEN
    v_blockers := v_blockers || 'Jurisdiction outcome does not place this complaint within our role';
  END IF;

  IF coalesce(c.triage_confirmation_status,'') NOT IN ('CONFIRMED','OVERRIDDEN') THEN
    v_blockers := v_blockers || 'Supervisory triage has not been confirmed';
  END IF;

  v_scope := CASE WHEN a.decision_outcome = 'PARTIALLY_ACCEPTED' THEN 'PARTIAL' 
                  WHEN a.decision_outcome = 'ACCEPTED' THEN 'FULL' ELSE NULL END;

  RETURN jsonb_build_object(
    'ok', array_length(v_blockers,1) IS NULL,
    'blockers', to_jsonb(v_blockers),
    'jurisdiction_status', a.status,
    'jurisdiction_outcome', a.decision_outcome,
    'triage_confirmation_status', c.triage_confirmation_status,
    'investigation_scope', v_scope
  );
END; $$;

CREATE OR REPLACE FUNCTION public.mc03_require_gate(_complaint_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE g jsonb;
BEGIN
  g := public.complaint_investigation_gate(_complaint_id);
  IF NOT (g->>'ok')::boolean THEN
    RAISE EXCEPTION 'Complaint investigation cannot proceed: %',
      array_to_string(ARRAY(SELECT jsonb_array_elements_text(g->'blockers')), '; ') USING ERRCODE='22023';
  END IF;
  RETURN g;
END; $$;

-- ---------- open investigation (delegates to canonical status operation) ----------
CREATE OR REPLACE FUNCTION public.complaint_investigation_open(_complaint_id uuid, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); c public.complaints; g jsonb; p public.complaint_investigation_plans;
        v_lead uuid;
BEGIN
  c := public.mc03_guard(_complaint_id, 'investigate');
  g := public.mc03_require_gate(_complaint_id);
  IF c.status NOT IN ('submitted','under_investigation') THEN
    RAISE EXCEPTION 'This complaint is not in a state where an investigation can be opened' USING ERRCODE='22023';
  END IF;

  v_lead := coalesce(nullif(_payload->>'lead_investigator_id','')::uuid, c.investigator_id, v_uid);

  UPDATE public.complaints
     SET status = 'under_investigation',
         investigator_id = COALESCE(investigator_id, v_lead),
         acknowledged_at = COALESCE(acknowledged_at, now()),
         updated_at = now()
   WHERE id = _complaint_id;

  SELECT * INTO p FROM public.complaint_investigation_plans
   WHERE complaint_id = _complaint_id AND is_current;
  IF p.id IS NULL THEN
    INSERT INTO public.complaint_investigation_plans
      (complaint_id, regulator_id, version, status, is_current, jurisdiction_scope,
       objective, lead_investigator_id, created_by)
    VALUES (_complaint_id, c.regulator_id, 1, 'DRAFT', true, g->>'investigation_scope',
            nullif(btrim(coalesce(_payload->>'objective','')),''), v_lead, v_uid)
    RETURNING * INTO p;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (v_uid, 'complaint.investigation.opened', 'complaint', _complaint_id,
          jsonb_build_object('plan_id', p.id, 'scope', g->>'investigation_scope', 'lead_investigator_id', v_lead));

  RETURN jsonb_build_object('complaint_id', _complaint_id, 'plan_id', p.id,
                            'plan_version', p.version, 'investigation_scope', g->>'investigation_scope');
END; $$;

-- ---------- plan save ----------
CREATE OR REPLACE FUNCTION public.complaint_investigation_plan_save(
  _complaint_id uuid, _payload jsonb, _expected_row_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); c public.complaints; p public.complaint_investigation_plans;
BEGIN
  c := public.mc03_guard(_complaint_id, 'investigate');
  PERFORM public.mc03_require_gate(_complaint_id);
  SELECT * INTO p FROM public.complaint_investigation_plans
   WHERE complaint_id = _complaint_id AND is_current FOR UPDATE;
  IF p.id IS NULL THEN
    RAISE EXCEPTION 'Open the investigation before recording a plan' USING ERRCODE='22023';
  END IF;
  IF _expected_row_version IS NOT NULL AND _expected_row_version <> p.row_version THEN
    RAISE EXCEPTION 'This plan has changed since you loaded it; reload and try again' USING ERRCODE='40001';
  END IF;
  IF p.status = 'APPROVED' THEN
    RAISE EXCEPTION 'An approved plan cannot be edited; create a revision instead' USING ERRCODE='22023';
  END IF;

  UPDATE public.complaint_investigation_plans SET
    objective            = COALESCE(nullif(btrim(coalesce(_payload->>'objective','')),''), objective),
    in_scope_summary     = COALESCE(_payload->>'in_scope_summary', in_scope_summary),
    out_of_scope_summary = COALESCE(_payload->>'out_of_scope_summary', out_of_scope_summary),
    approach             = COALESCE(_payload->>'approach', approach),
    evidence_required    = COALESCE(_payload->>'evidence_required', evidence_required),
    information_sources  = COALESCE(_payload->>'information_sources', information_sources),
    parties_to_contact   = COALESCE(_payload->>'parties_to_contact', parties_to_contact),
    milestones           = COALESCE(_payload->'milestones', milestones),
    planned_completion_date = COALESCE(nullif(_payload->>'planned_completion_date','')::date, planned_completion_date),
    dependencies         = COALESCE(_payload->>'dependencies', dependencies),
    risks_constraints    = COALESCE(_payload->>'risks_constraints', risks_constraints),
    lead_investigator_id = COALESCE(nullif(_payload->>'lead_investigator_id','')::uuid, lead_investigator_id),
    review_officer_id    = COALESCE(nullif(_payload->>'review_officer_id','')::uuid, review_officer_id),
    policy_reference     = COALESCE(_payload->>'policy_reference', policy_reference),
    row_version = row_version + 1,
    updated_at = now()
  WHERE id = p.id RETURNING * INTO p;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (v_uid,'complaint.investigation.plan_saved','complaint',_complaint_id,
          jsonb_build_object('plan_id',p.id,'version',p.version,'row_version',p.row_version));
  RETURN to_jsonb(p);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_investigation_plan_submit(_plan_id uuid, _expected_row_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); p public.complaint_investigation_plans;
BEGIN
  SELECT * INTO p FROM public.complaint_investigation_plans WHERE id=_plan_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Plan not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(p.complaint_id,'investigate');
  IF _expected_row_version IS NOT NULL AND _expected_row_version <> p.row_version THEN
    RAISE EXCEPTION 'This plan has changed since you loaded it; reload and try again' USING ERRCODE='40001'; END IF;
  IF p.status <> 'DRAFT' THEN RAISE EXCEPTION 'Only a draft plan can be submitted' USING ERRCODE='22023'; END IF;
  IF coalesce(length(btrim(coalesce(p.objective,''))),0) = 0 THEN
    RAISE EXCEPTION 'Record the investigation objective before submitting the plan' USING ERRCODE='22023'; END IF;
  UPDATE public.complaint_investigation_plans
     SET status='SUBMITTED', submitted_at=now(), submitted_by=v_uid, row_version=row_version+1, updated_at=now()
   WHERE id=_plan_id RETURNING * INTO p;
  INSERT INTO public.audit_logs (user_id,action,entity_type,entity_id,new_value)
  VALUES (v_uid,'complaint.investigation.plan_submitted','complaint',p.complaint_id,
          jsonb_build_object('plan_id',p.id,'version',p.version));
  RETURN to_jsonb(p);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_investigation_plan_approve(
  _plan_id uuid, _note text DEFAULT NULL, _expected_row_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); p public.complaint_investigation_plans;
BEGIN
  SELECT * INTO p FROM public.complaint_investigation_plans WHERE id=_plan_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Plan not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(p.complaint_id,'investigate');
  IF NOT (public.is_super_admin(v_uid) OR public.has_complaint_perm(v_uid,'approve')
          OR public.has_complaint_perm(v_uid,'override_triage')) THEN
    RAISE EXCEPTION 'not_authorized: approving an investigation plan requires review authority' USING ERRCODE='42501';
  END IF;
  IF _expected_row_version IS NOT NULL AND _expected_row_version <> p.row_version THEN
    RAISE EXCEPTION 'This plan has changed since you loaded it; reload and try again' USING ERRCODE='40001'; END IF;
  IF p.status <> 'SUBMITTED' THEN RAISE EXCEPTION 'Only a submitted plan can be approved' USING ERRCODE='22023'; END IF;
  IF p.submitted_by = v_uid AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'The officer who submitted the plan cannot approve it' USING ERRCODE='42501'; END IF;
  UPDATE public.complaint_investigation_plans
     SET status='APPROVED', approved_at=now(), approved_by=v_uid,
         review_note = _note, row_version=row_version+1, updated_at=now()
   WHERE id=_plan_id RETURNING * INTO p;
  INSERT INTO public.audit_logs (user_id,action,entity_type,entity_id,new_value)
  VALUES (v_uid,'complaint.investigation.plan_approved','complaint',p.complaint_id,
          jsonb_build_object('plan_id',p.id,'version',p.version,'note',_note));
  RETURN to_jsonb(p);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_investigation_plan_revise(_complaint_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); c public.complaints;
        old_p public.complaint_investigation_plans; new_p public.complaint_investigation_plans;
BEGIN
  c := public.mc03_guard(_complaint_id,'investigate');
  IF coalesce(length(btrim(coalesce(_reason,''))),0) < 10 THEN
    RAISE EXCEPTION 'Explain why the plan is being revised (at least 10 characters)' USING ERRCODE='22023'; END IF;
  SELECT * INTO old_p FROM public.complaint_investigation_plans
   WHERE complaint_id=_complaint_id AND is_current FOR UPDATE;
  IF old_p.id IS NULL THEN RAISE EXCEPTION 'There is no current plan to revise' USING ERRCODE='22023'; END IF;

  UPDATE public.complaint_investigation_plans
     SET is_current=false, status='SUPERSEDED', updated_at=now() WHERE id=old_p.id;

  INSERT INTO public.complaint_investigation_plans
    (complaint_id, regulator_id, version, status, is_current, objective, jurisdiction_scope,
     in_scope_summary, out_of_scope_summary, approach, evidence_required, information_sources,
     parties_to_contact, milestones, planned_completion_date, dependencies, risks_constraints,
     lead_investigator_id, review_officer_id, policy_reference, revision_reason, created_by)
  VALUES (old_p.complaint_id, old_p.regulator_id, old_p.version + 1, 'DRAFT', true, old_p.objective,
     old_p.jurisdiction_scope, old_p.in_scope_summary, old_p.out_of_scope_summary, old_p.approach,
     old_p.evidence_required, old_p.information_sources, old_p.parties_to_contact, old_p.milestones,
     old_p.planned_completion_date, old_p.dependencies, old_p.risks_constraints,
     old_p.lead_investigator_id, old_p.review_officer_id, old_p.policy_reference, btrim(_reason), v_uid)
  RETURNING * INTO new_p;

  UPDATE public.complaint_investigation_plans SET superseded_by_id=new_p.id WHERE id=old_p.id;

  INSERT INTO public.audit_logs (user_id,action,entity_type,entity_id,old_value,new_value)
  VALUES (v_uid,'complaint.investigation.plan_revised','complaint',_complaint_id,
          jsonb_build_object('plan_id',old_p.id,'version',old_p.version),
          jsonb_build_object('plan_id',new_p.id,'version',new_p.version,'reason',btrim(_reason)));
  RETURN to_jsonb(new_p);
END; $$;

-- ---------- allegations ----------
CREATE OR REPLACE FUNCTION public.complaint_allegation_create(_complaint_id uuid, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); c public.complaints; a public.complaint_allegations; v_no integer;
BEGIN
  c := public.mc03_guard(_complaint_id,'investigate');
  PERFORM public.mc03_require_gate(_complaint_id);
  IF coalesce(length(btrim(coalesce(_payload->>'title',''))),0) = 0 THEN
    RAISE EXCEPTION 'Give the allegation a short title' USING ERRCODE='22023'; END IF;
  SELECT coalesce(max(allegation_number),0)+1 INTO v_no FROM public.complaint_allegations WHERE complaint_id=_complaint_id;

  INSERT INTO public.complaint_allegations
    (complaint_id, regulator_id, allegation_number, respondent_id, product_service,
     issue_category_id, issue_category_label, title, statement, incident_from, incident_to,
     financial_amount, currency, affected_party, source, jurisdiction_scope, jurisdiction_rationale, created_by, updated_by)
  VALUES (_complaint_id, c.regulator_id, v_no,
     nullif(_payload->>'respondent_id','')::uuid, _payload->>'product_service',
     nullif(_payload->>'issue_category_id','')::uuid, _payload->>'issue_category_label',
     btrim(_payload->>'title'), _payload->>'statement',
     nullif(_payload->>'incident_from','')::date, nullif(_payload->>'incident_to','')::date,
     nullif(_payload->>'financial_amount','')::numeric, _payload->>'currency',
     _payload->>'affected_party', coalesce(_payload->>'source','COMPLAINT'),
     coalesce(nullif(upper(btrim(coalesce(_payload->>'jurisdiction_scope',''))),''),'IN_SCOPE'),
     _payload->>'jurisdiction_rationale', v_uid, v_uid)
  RETURNING * INTO a;

  INSERT INTO public.complaint_allegation_history (allegation_id, complaint_id, event_type, to_state, actor_id)
  VALUES (a.id, _complaint_id, 'CREATED', to_jsonb(a), v_uid);
  INSERT INTO public.audit_logs (user_id,action,entity_type,entity_id,new_value)
  VALUES (v_uid,'complaint.allegation.created','complaint',_complaint_id,
          jsonb_build_object('allegation_id',a.id,'allegation_number',a.allegation_number));
  RETURN to_jsonb(a);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_allegation_update(
  _allegation_id uuid, _payload jsonb, _expected_row_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); a public.complaint_allegations; before_a jsonb;
BEGIN
  SELECT * INTO a FROM public.complaint_allegations WHERE id=_allegation_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Allegation not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(a.complaint_id,'investigate');
  IF _expected_row_version IS NOT NULL AND _expected_row_version <> a.row_version THEN
    RAISE EXCEPTION 'This allegation has changed since you loaded it; reload and try again' USING ERRCODE='40001'; END IF;
  IF a.assessment_outcome IS NOT NULL AND a.investigation_status = 'ASSESSED' THEN
    RAISE EXCEPTION 'This allegation has been determined; reopen it before amending the details' USING ERRCODE='22023'; END IF;
  before_a := to_jsonb(a);

  UPDATE public.complaint_allegations SET
    respondent_id = COALESCE(nullif(_payload->>'respondent_id','')::uuid, respondent_id),
    product_service = COALESCE(_payload->>'product_service', product_service),
    issue_category_id = COALESCE(nullif(_payload->>'issue_category_id','')::uuid, issue_category_id),
    issue_category_label = COALESCE(_payload->>'issue_category_label', issue_category_label),
    title = COALESCE(nullif(btrim(coalesce(_payload->>'title','')),''), title),
    statement = COALESCE(_payload->>'statement', statement),
    incident_from = COALESCE(nullif(_payload->>'incident_from','')::date, incident_from),
    incident_to = COALESCE(nullif(_payload->>'incident_to','')::date, incident_to),
    financial_amount = COALESCE(nullif(_payload->>'financial_amount','')::numeric, financial_amount),
    currency = COALESCE(_payload->>'currency', currency),
    affected_party = COALESCE(_payload->>'affected_party', affected_party),
    jurisdiction_scope = COALESCE(nullif(upper(btrim(coalesce(_payload->>'jurisdiction_scope',''))),''), jurisdiction_scope),
    jurisdiction_rationale = COALESCE(_payload->>'jurisdiction_rationale', jurisdiction_rationale),
    officer_analysis = COALESCE(_payload->>'officer_analysis', officer_analysis),
    row_version = row_version + 1, updated_by = v_uid, updated_at = now()
  WHERE id=_allegation_id RETURNING * INTO a;

  INSERT INTO public.complaint_allegation_history (allegation_id, complaint_id, event_type, from_state, to_state, actor_id)
  VALUES (a.id, a.complaint_id, 'UPDATED', before_a, to_jsonb(a), v_uid);
  RETURN to_jsonb(a);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_allegation_set_status(
  _allegation_id uuid, _status text, _note text DEFAULT NULL, _expected_row_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); a public.complaint_allegations; v_new text := upper(btrim(coalesce(_status,'')));
BEGIN
  SELECT * INTO a FROM public.complaint_allegations WHERE id=_allegation_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Allegation not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(a.complaint_id,'investigate');
  IF _expected_row_version IS NOT NULL AND _expected_row_version <> a.row_version THEN
    RAISE EXCEPTION 'This allegation has changed since you loaded it; reload and try again' USING ERRCODE='40001'; END IF;
  IF v_new NOT IN ('EVIDENCE_GATHERING','ASSESSMENT_IN_PROGRESS') THEN
    RAISE EXCEPTION 'That is not a valid investigation stage for an allegation' USING ERRCODE='22023'; END IF;
  IF a.jurisdiction_scope = 'OUT_OF_SCOPE' THEN
    RAISE EXCEPTION 'This allegation sits outside our role and cannot be investigated' USING ERRCODE='22023'; END IF;
  IF a.investigation_status = 'ASSESSED' THEN
    RAISE EXCEPTION 'This allegation has been determined; reopen it first' USING ERRCODE='22023'; END IF;
  IF v_new = 'ASSESSMENT_IN_PROGRESS' AND a.investigation_status = 'UNASSESSED' THEN
    RAISE EXCEPTION 'Gather evidence before starting the assessment' USING ERRCODE='22023'; END IF;

  UPDATE public.complaint_allegations
     SET investigation_status = v_new, row_version = row_version+1, updated_by=v_uid, updated_at=now()
   WHERE id=_allegation_id RETURNING * INTO a;
  INSERT INTO public.complaint_allegation_history (allegation_id, complaint_id, event_type, to_state, rationale, actor_id)
  VALUES (a.id, a.complaint_id, 'STATUS_CHANGED', jsonb_build_object('investigation_status',v_new), _note, v_uid);
  RETURN to_jsonb(a);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_allegation_record_outcome(
  _allegation_id uuid, _outcome text, _rationale text, _analysis text DEFAULT NULL,
  _expected_row_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); a public.complaint_allegations; before_a jsonb;
        v_out text := upper(btrim(coalesce(_outcome,'')));
BEGIN
  SELECT * INTO a FROM public.complaint_allegations WHERE id=_allegation_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Allegation not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(a.complaint_id,'investigate');
  IF _expected_row_version IS NOT NULL AND _expected_row_version <> a.row_version THEN
    RAISE EXCEPTION 'This allegation has changed since you loaded it; reload and try again' USING ERRCODE='40001'; END IF;
  IF v_out NOT IN ('SUBSTANTIATED','PARTIALLY_SUBSTANTIATED','NOT_SUBSTANTIATED','UNABLE_TO_DETERMINE') THEN
    RAISE EXCEPTION 'That is not a valid allegation assessment outcome' USING ERRCODE='22023'; END IF;
  IF a.jurisdiction_scope = 'OUT_OF_SCOPE' THEN
    RAISE EXCEPTION 'This allegation sits outside our role and cannot be assessed' USING ERRCODE='22023'; END IF;
  IF a.investigation_status = 'ASSESSED' THEN
    RAISE EXCEPTION 'This allegation has already been determined; reopen it first' USING ERRCODE='22023'; END IF;
  IF coalesce(length(btrim(coalesce(_rationale,''))),0) < 10 THEN
    RAISE EXCEPTION 'Record the reasoning for this assessment (at least 10 characters)' USING ERRCODE='22023'; END IF;
  before_a := to_jsonb(a);

  UPDATE public.complaint_allegations
     SET assessment_outcome=v_out, assessment_rationale=btrim(_rationale),
         officer_analysis=COALESCE(_analysis, officer_analysis),
         investigation_status='ASSESSED', assessed_by=v_uid, assessed_at=now(),
         row_version=row_version+1, updated_by=v_uid, updated_at=now()
   WHERE id=_allegation_id RETURNING * INTO a;

  INSERT INTO public.complaint_allegation_history (allegation_id, complaint_id, event_type, from_state, to_state, rationale, actor_id)
  VALUES (a.id, a.complaint_id, 'OUTCOME_RECORDED', before_a, to_jsonb(a), btrim(_rationale), v_uid);
  INSERT INTO public.audit_logs (user_id,action,entity_type,entity_id,new_value)
  VALUES (v_uid,'complaint.allegation.outcome_recorded','complaint',a.complaint_id,
          jsonb_build_object('allegation_id',a.id,'outcome',v_out));
  RETURN to_jsonb(a);
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_allegation_reopen(
  _allegation_id uuid, _reason text, _expected_row_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); a public.complaint_allegations; before_a jsonb;
BEGIN
  SELECT * INTO a FROM public.complaint_allegations WHERE id=_allegation_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Allegation not found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(a.complaint_id,'investigate');
  IF _expected_row_version IS NOT NULL AND _expected_row_version <> a.row_version THEN
    RAISE EXCEPTION 'This allegation has changed since you loaded it; reload and try again' USING ERRCODE='40001'; END IF;
  IF a.investigation_status <> 'ASSESSED' THEN
    RAISE EXCEPTION 'Only a determined allegation can be reopened' USING ERRCODE='22023'; END IF;
  IF coalesce(length(btrim(coalesce(_reason,''))),0) < 10 THEN
    RAISE EXCEPTION 'Explain why the allegation is being reopened (at least 10 characters)' USING ERRCODE='22023'; END IF;
  before_a := to_jsonb(a);
  UPDATE public.complaint_allegations
     SET investigation_status='REOPENED', row_version=row_version+1, updated_by=v_uid, updated_at=now()
   WHERE id=_allegation_id RETURNING * INTO a;
  INSERT INTO public.complaint_allegation_history (allegation_id, complaint_id, event_type, from_state, to_state, rationale, actor_id)
  VALUES (a.id, a.complaint_id, 'REOPENED', before_a, to_jsonb(a), btrim(_reason), v_uid);
  RETURN to_jsonb(a);
END; $$;
