-- ============================================================
-- MC-04 governed operations
-- ============================================================

-- ---------- outcome gate ----------
CREATE OR REPLACE FUNCTION public.complaint_outcome_gate(_complaint_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.complaints; ja public.complaint_jurisdiction_assessments;
        r jsonb; v_route text; v_blockers text[] := '{}';
BEGIN
  PERFORM public.mc03_guard(_complaint_id,'view');
  SELECT * INTO c FROM public.complaints WHERE id=_complaint_id;
  SELECT * INTO ja FROM public.complaint_jurisdiction_assessments
   WHERE complaint_id=_complaint_id ORDER BY created_at DESC LIMIT 1;

  IF coalesce(ja.decision_outcome,'') IN ('REFERRED','OUT_OF_JURISDICTION','NOT_ACCEPTED') THEN
    RETURN jsonb_build_object('ok',true,'route','NO_INVESTIGATION',
      'route_label','Referred or outside jurisdiction — final outcome without investigation',
      'blockers','[]'::jsonb);
  END IF;

  r := public.complaint_investigation_readiness(_complaint_id);
  v_route := 'INVESTIGATED';
  IF r->>'readiness' <> 'READY_FOR_OUTCOME_REVIEW' THEN
    v_blockers := ARRAY(SELECT jsonb_array_elements_text(r->'blockers'));
  END IF;

  RETURN jsonb_build_object(
    'ok', array_length(v_blockers,1) IS NULL,
    'route', v_route,
    'route_label','Investigated case',
    'blockers', to_jsonb(v_blockers));
END; $$;

-- ---------- read model ----------
CREATE OR REPLACE FUNCTION public.complaint_outcome_get(_complaint_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.complaint_outcomes; v_alleg jsonb; v_hist jsonb;
BEGIN
  PERFORM public.mc03_guard(_complaint_id,'view');
  SELECT * INTO o FROM public.complaint_outcomes WHERE complaint_id=_complaint_id AND is_current;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'allegation_id',a.id,'allegation_number',a.allegation_number,'title',a.title,
           'jurisdiction_scope',a.jurisdiction_scope,'assessment_outcome',a.assessment_outcome,
           'assessment_rationale',a.assessment_rationale,'assessed_at',a.assessed_at
         ) ORDER BY a.allegation_number),'[]'::jsonb)
    INTO v_alleg FROM public.complaint_allegations a WHERE a.complaint_id=_complaint_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'version',h.version,'status',h.status,'overall_outcome',h.overall_outcome,
           'submitted_at',h.submitted_at,'created_at',h.created_at) ORDER BY h.version DESC),'[]'::jsonb)
    INTO v_hist FROM public.complaint_outcomes h WHERE h.complaint_id=_complaint_id;

  RETURN jsonb_build_object(
    'complaint_id',_complaint_id,
    'gate', public.complaint_outcome_gate(_complaint_id),
    'outcome', CASE WHEN o.id IS NULL THEN NULL ELSE to_jsonb(o) END,
    'allegations', v_alleg,
    'history', v_hist);
END; $$;

-- ---------- outcome save ----------
CREATE OR REPLACE FUNCTION public.complaint_outcome_save(
  _complaint_id uuid, _payload jsonb, _expected_row_version integer DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.complaints; o public.complaint_outcomes; g jsonb; v_id uuid; v_ver int;
BEGIN
  c := public.mc03_guard(_complaint_id,'edit');
  g := public.complaint_outcome_gate(_complaint_id);
  IF NOT (g->>'ok')::boolean THEN
    RAISE EXCEPTION 'outcome_review_not_open: %',
      array_to_string(ARRAY(SELECT jsonb_array_elements_text(g->'blockers')),'; ') USING ERRCODE='22023';
  END IF;

  SELECT * INTO o FROM public.complaint_outcomes WHERE complaint_id=_complaint_id AND is_current FOR UPDATE;

  IF o.id IS NULL THEN
    SELECT coalesce(max(version),0)+1 INTO v_ver FROM public.complaint_outcomes WHERE complaint_id=_complaint_id;
    INSERT INTO public.complaint_outcomes(
      complaint_id, regulator_id, version, status,
      overall_outcome, outcome_rationale, consumer_harm_summary, harm_level,
      redress_required, redress_rationale, communication_required, communication_basis,
      recommended_closure_route, reviewer_id, created_by, updated_by)
    VALUES (_complaint_id, c.regulator_id, v_ver, 'DRAFT',
      nullif(btrim(_payload->>'overall_outcome'),''),
      nullif(btrim(_payload->>'outcome_rationale'),''),
      nullif(btrim(_payload->>'consumer_harm_summary'),''),
      nullif(btrim(_payload->>'harm_level'),''),
      coalesce((_payload->>'redress_required')::boolean,false),
      nullif(btrim(_payload->>'redress_rationale'),''),
      coalesce((_payload->>'communication_required')::boolean,true),
      nullif(btrim(_payload->>'communication_basis'),''),
      nullif(btrim(_payload->>'recommended_closure_route'),''),
      nullif(_payload->>'reviewer_id','')::uuid,
      auth.uid(), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    IF o.status = 'SUBMITTED' THEN
      RAISE EXCEPTION 'outcome_already_recorded' USING ERRCODE='22023';
    END IF;
    IF _expected_row_version IS NOT NULL AND _expected_row_version <> o.row_version THEN
      RAISE EXCEPTION 'stale_state' USING ERRCODE='40001';
    END IF;
    UPDATE public.complaint_outcomes SET
      overall_outcome = nullif(btrim(_payload->>'overall_outcome'),''),
      outcome_rationale = nullif(btrim(_payload->>'outcome_rationale'),''),
      consumer_harm_summary = nullif(btrim(_payload->>'consumer_harm_summary'),''),
      harm_level = nullif(btrim(_payload->>'harm_level'),''),
      redress_required = coalesce((_payload->>'redress_required')::boolean,false),
      redress_rationale = nullif(btrim(_payload->>'redress_rationale'),''),
      communication_required = coalesce((_payload->>'communication_required')::boolean,true),
      communication_basis = nullif(btrim(_payload->>'communication_basis'),''),
      recommended_closure_route = nullif(btrim(_payload->>'recommended_closure_route'),''),
      reviewer_id = nullif(_payload->>'reviewer_id','')::uuid,
      row_version = o.row_version + 1, updated_by = auth.uid()
    WHERE id = o.id RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_value)
  VALUES (auth.uid(),'complaint.outcome.saved','complaint',_complaint_id,
          jsonb_build_object('outcome_id',v_id));
  RETURN v_id;
END; $$;

-- ---------- outcome submit ----------
CREATE OR REPLACE FUNCTION public.complaint_outcome_submit(
  _complaint_id uuid, _expected_row_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.complaint_outcomes; g jsonb; v_req int; v_snap jsonb; v_sync jsonb;
BEGIN
  PERFORM public.mc03_guard(_complaint_id,'edit');
  g := public.complaint_outcome_gate(_complaint_id);
  IF NOT (g->>'ok')::boolean THEN
    RAISE EXCEPTION 'outcome_review_not_open: %',
      array_to_string(ARRAY(SELECT jsonb_array_elements_text(g->'blockers')),'; ') USING ERRCODE='22023';
  END IF;

  SELECT * INTO o FROM public.complaint_outcomes WHERE complaint_id=_complaint_id AND is_current FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'outcome_not_recorded' USING ERRCODE='22023'; END IF;
  IF o.status='SUBMITTED' THEN RETURN jsonb_build_object('submitted',true,'unchanged',true); END IF;
  IF _expected_row_version IS NOT NULL AND _expected_row_version <> o.row_version THEN
    RAISE EXCEPTION 'stale_state' USING ERRCODE='40001';
  END IF;

  IF coalesce(btrim(o.overall_outcome),'')='' THEN
    RAISE EXCEPTION 'overall_outcome_required' USING ERRCODE='22023'; END IF;
  IF coalesce(length(btrim(o.outcome_rationale)),0) < 10 THEN
    RAISE EXCEPTION 'outcome_rationale_required' USING ERRCODE='22023'; END IF;
  IF coalesce(length(btrim(o.consumer_harm_summary)),0) < 10 THEN
    RAISE EXCEPTION 'consumer_harm_required' USING ERRCODE='22023'; END IF;

  IF o.redress_required THEN
    SELECT count(*) INTO v_req FROM public.complaint_redress
     WHERE complaint_id=_complaint_id AND is_required AND status <> 'CANCELLED';
    IF coalesce(v_req,0)=0 THEN
      RAISE EXCEPTION 'redress_items_required' USING ERRCODE='22023'; END IF;
  ELSE
    IF coalesce(length(btrim(o.redress_rationale)),0) < 10 THEN
      RAISE EXCEPTION 'no_redress_reason_required' USING ERRCODE='22023'; END IF;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'allegation_id',a.id,'allegation_number',a.allegation_number,'title',a.title,
           'jurisdiction_scope',a.jurisdiction_scope,'assessment_outcome',a.assessment_outcome,
           'assessment_rationale',a.assessment_rationale) ORDER BY a.allegation_number),'[]'::jsonb)
    INTO v_snap FROM public.complaint_allegations a WHERE a.complaint_id=_complaint_id;

  UPDATE public.complaint_outcomes
     SET status='SUBMITTED', submitted_by=auth.uid(), submitted_at=now(),
         allegation_outcome_snapshot=v_snap, row_version=o.row_version+1, updated_by=auth.uid()
   WHERE id=o.id;

  UPDATE public.complaint_redress SET outcome_id=o.id, updated_at=now()
   WHERE complaint_id=_complaint_id AND outcome_id IS NULL;

  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_value)
  VALUES (auth.uid(),'complaint.outcome.review_complete','complaint',_complaint_id,
          jsonb_build_object('outcome_id',o.id,'overall_outcome',o.overall_outcome,'route',g->>'route'));

  v_sync := public.mc_complaint_workflow_sync(_complaint_id,'complaint.outcome.review_complete');
  RETURN jsonb_build_object('submitted',true,'outcome_id',o.id,'workflow',v_sync);
END; $$;

-- ---------- redress ----------
CREATE OR REPLACE FUNCTION public.complaint_redress_save(_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cid uuid := nullif(_payload->>'complaint_id','')::uuid;
        v_id uuid := nullif(_payload->>'id','')::uuid;
        t public.complaint_redress_types; r public.complaint_redress;
        v_exp int := nullif(_payload->>'expected_row_version','')::int;
BEGIN
  IF v_cid IS NULL AND v_id IS NOT NULL THEN
    SELECT complaint_id INTO v_cid FROM public.complaint_redress WHERE id=v_id;
  END IF;
  IF v_cid IS NULL THEN RAISE EXCEPTION 'complaint_required' USING ERRCODE='22023'; END IF;
  PERFORM public.mc03_guard(v_cid,'edit');

  SELECT * INTO t FROM public.complaint_redress_types
   WHERE id = nullif(_payload->>'redress_type_id','')::uuid AND is_active;
  IF t.id IS NULL THEN RAISE EXCEPTION 'redress_type_required' USING ERRCODE='22023'; END IF;
  IF coalesce(btrim(_payload->>'affected_party_label'),'')='' THEN
    RAISE EXCEPTION 'affected_party_required' USING ERRCODE='22023'; END IF;
  IF coalesce(btrim(_payload->>'action_required'),'')='' THEN
    RAISE EXCEPTION 'action_required_required' USING ERRCODE='22023'; END IF;
  IF t.requires_amount AND coalesce((nullif(_payload->>'amount',''))::numeric,0) <= 0 THEN
    RAISE EXCEPTION 'amount_required' USING ERRCODE='22023'; END IF;
  IF t.requires_due_date AND nullif(_payload->>'due_date','') IS NULL THEN
    RAISE EXCEPTION 'due_date_required' USING ERRCODE='22023'; END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.complaint_redress(
      complaint_id, allegation_id, party_id, affected_party_label, redress_type_id,
      amount, currency, action_required, responsible_entity, responsible_licensee_id,
      due_date, is_required, rationale, created_by, updated_by,
      outcome_id)
    VALUES (v_cid,
      nullif(_payload->>'allegation_id','')::uuid,
      nullif(_payload->>'party_id','')::uuid,
      btrim(_payload->>'affected_party_label'), t.id,
      nullif(_payload->>'amount','')::numeric,
      coalesce(nullif(btrim(_payload->>'currency'),''), CASE WHEN t.requires_amount THEN 'JMD' ELSE NULL END),
      btrim(_payload->>'action_required'),
      nullif(btrim(_payload->>'responsible_entity'),''),
      nullif(_payload->>'responsible_licensee_id','')::uuid,
      nullif(_payload->>'due_date','')::date,
      coalesce((_payload->>'is_required')::boolean,true),
      nullif(btrim(_payload->>'rationale'),''),
      auth.uid(), auth.uid(),
      (SELECT id FROM public.complaint_outcomes WHERE complaint_id=v_cid AND is_current))
    RETURNING id INTO v_id;
  ELSE
    SELECT * INTO r FROM public.complaint_redress WHERE id=v_id FOR UPDATE;
    IF r.id IS NULL THEN RAISE EXCEPTION 'redress_not_found' USING ERRCODE='P0002'; END IF;
    IF r.status IN ('VERIFIED','CANCELLED') THEN
      RAISE EXCEPTION 'redress_locked' USING ERRCODE='22023'; END IF;
    IF v_exp IS NOT NULL AND v_exp <> r.row_version THEN
      RAISE EXCEPTION 'stale_state' USING ERRCODE='40001'; END IF;
    UPDATE public.complaint_redress SET
      allegation_id = nullif(_payload->>'allegation_id','')::uuid,
      party_id = nullif(_payload->>'party_id','')::uuid,
      affected_party_label = btrim(_payload->>'affected_party_label'),
      redress_type_id = t.id,
      amount = nullif(_payload->>'amount','')::numeric,
      currency = coalesce(nullif(btrim(_payload->>'currency'),''), currency),
      action_required = btrim(_payload->>'action_required'),
      responsible_entity = nullif(btrim(_payload->>'responsible_entity'),''),
      responsible_licensee_id = nullif(_payload->>'responsible_licensee_id','')::uuid,
      due_date = nullif(_payload->>'due_date','')::date,
      is_required = coalesce((_payload->>'is_required')::boolean, is_required),
      rationale = nullif(btrim(_payload->>'rationale'),''),
      status = coalesce(nullif(_payload->>'status',''), status),
      row_version = r.row_version+1, updated_by = auth.uid()
    WHERE id=v_id;
  END IF;

  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_value)
  VALUES (auth.uid(),'complaint.redress.saved','complaint',v_cid,jsonb_build_object('redress_id',v_id));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_redress_complete(
  _redress_id uuid, _note text, _evidence_file_id uuid DEFAULT NULL,
  _expected_row_version integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.complaint_redress; t public.complaint_redress_types;
BEGIN
  SELECT * INTO r FROM public.complaint_redress WHERE id=_redress_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'redress_not_found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(r.complaint_id,'edit');
  IF r.status IN ('VERIFIED','CANCELLED') THEN RAISE EXCEPTION 'redress_locked' USING ERRCODE='22023'; END IF;
  IF _expected_row_version IS NOT NULL AND _expected_row_version <> r.row_version THEN
    RAISE EXCEPTION 'stale_state' USING ERRCODE='40001'; END IF;
  SELECT * INTO t FROM public.complaint_redress_types WHERE id=r.redress_type_id;
  IF coalesce(t.requires_evidence,true) AND _evidence_file_id IS NULL
     AND coalesce(length(btrim(_note)),0) < 10 THEN
    RAISE EXCEPTION 'completion_evidence_required' USING ERRCODE='22023';
  END IF;

  UPDATE public.complaint_redress
     SET status='COMPLETED', completion_note=nullif(btrim(_note),''),
         completion_evidence_file_id=_evidence_file_id,
         completed_by=auth.uid(), completed_at=now(),
         row_version=r.row_version+1, updated_by=auth.uid()
   WHERE id=_redress_id;

  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_value)
  VALUES (auth.uid(),'complaint.redress.completed','complaint',r.complaint_id,
          jsonb_build_object('redress_id',_redress_id));
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_redress_verify(
  _redress_id uuid, _note text, _expected_row_version integer DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.complaint_redress;
BEGIN
  SELECT * INTO r FROM public.complaint_redress WHERE id=_redress_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'redress_not_found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(r.complaint_id,'edit');
  IF r.status <> 'COMPLETED' THEN RAISE EXCEPTION 'redress_not_completed' USING ERRCODE='22023'; END IF;
  IF coalesce(length(btrim(_note)),0) < 5 THEN
    RAISE EXCEPTION 'verification_note_required' USING ERRCODE='22023'; END IF;
  IF _expected_row_version IS NOT NULL AND _expected_row_version <> r.row_version THEN
    RAISE EXCEPTION 'stale_state' USING ERRCODE='40001'; END IF;

  UPDATE public.complaint_redress
     SET status='VERIFIED', verification_note=btrim(_note),
         verified_by=auth.uid(), verified_at=now(),
         row_version=r.row_version+1, updated_by=auth.uid()
   WHERE id=_redress_id;

  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_value)
  VALUES (auth.uid(),'complaint.redress.verified','complaint',r.complaint_id,
          jsonb_build_object('redress_id',_redress_id));
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_redress_cancel(_redress_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.complaint_redress;
BEGIN
  SELECT * INTO r FROM public.complaint_redress WHERE id=_redress_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'redress_not_found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(r.complaint_id,'edit');
  IF coalesce(length(btrim(_reason)),0) < 5 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE='22023'; END IF;
  UPDATE public.complaint_redress
     SET status='CANCELLED', cancelled_reason=btrim(_reason),
         row_version=r.row_version+1, updated_by=auth.uid()
   WHERE id=_redress_id;
  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_value)
  VALUES (auth.uid(),'complaint.redress.cancelled','complaint',r.complaint_id,
          jsonb_build_object('redress_id',_redress_id,'reason',btrim(_reason)));
END; $$;

-- ---------- QA requirement (risk / policy driven) ----------
CREATE OR REPLACE FUNCTION public.complaint_qa_requirement(_complaint_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.complaints; o public.complaint_outcomes; p public.complaint_qa_policies;
        v_total numeric; v_latest public.complaint_closure_reviews;
BEGIN
  PERFORM public.mc03_guard(_complaint_id,'view');
  SELECT * INTO c FROM public.complaints WHERE id=_complaint_id;
  SELECT * INTO o FROM public.complaint_outcomes WHERE complaint_id=_complaint_id AND is_current;
  SELECT coalesce(sum(amount),0) INTO v_total FROM public.complaint_redress
   WHERE complaint_id=_complaint_id AND status <> 'CANCELLED';

  SELECT * INTO p FROM public.complaint_qa_policies q
   WHERE q.is_active
     AND (q.regulator_id IS NULL OR q.regulator_id = c.regulator_id)
     AND (
       q.applies_when = '{}'::jsonb
       OR (
         (NOT q.applies_when ? 'severity_in'
            OR coalesce(c.severity,'') IN (SELECT jsonb_array_elements_text(q.applies_when->'severity_in')))
         AND (NOT q.applies_when ? 'vulnerability_indicator'
            OR coalesce(c.vulnerability_indicator,false) = (q.applies_when->>'vulnerability_indicator')::boolean)
         AND (NOT q.applies_when ? 'min_total_redress'
            OR v_total >= (q.applies_when->>'min_total_redress')::numeric)
         AND (NOT q.applies_when ? 'outcome_in'
            OR coalesce(o.overall_outcome,'') IN (SELECT jsonb_array_elements_text(q.applies_when->'outcome_in')))
       )
     )
   ORDER BY q.priority, q.created_at LIMIT 1;

  SELECT * INTO v_latest FROM public.complaint_closure_reviews
   WHERE complaint_id=_complaint_id AND stage='qa' AND decision IN ('qa_approved','qa_returned')
   ORDER BY decided_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'complaint_id',_complaint_id,
    'qa_required', coalesce(p.qa_required,false),
    'policy_code', p.code,
    'policy_label', p.label,
    'policy_basis', p.policy_basis,
    'reviewer_role', p.reviewer_role,
    'checklist', coalesce(p.checklist,'[]'::jsonb),
    'qa_policy_id', p.id,
    'total_redress', v_total,
    'latest_decision', v_latest.decision,
    'latest_decided_at', v_latest.decided_at,
    'qa_passed', coalesce(v_latest.decision,'') = 'qa_approved');
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_qa_submit_for_review(
  _complaint_id uuid, _reviewer_id uuid DEFAULT NULL, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o public.complaint_outcomes; q jsonb; v_id uuid;
BEGIN
  PERFORM public.mc03_guard(_complaint_id,'edit');
  SELECT * INTO o FROM public.complaint_outcomes WHERE complaint_id=_complaint_id AND is_current;
  IF o.id IS NULL OR o.status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'outcome_not_recorded' USING ERRCODE='22023'; END IF;
  q := public.complaint_qa_requirement(_complaint_id);
  IF NOT (q->>'qa_required')::boolean THEN
    RAISE EXCEPTION 'qa_not_required' USING ERRCODE='22023'; END IF;

  INSERT INTO public.complaint_closure_reviews(
    complaint_id, stage, decision, rationale, qa_required, qa_policy_id, qa_policy_basis,
    qa_checklist, reviewer_id, submitted_by, decided_by, outcome_id)
  VALUES (_complaint_id,'qa','qa_submitted', nullif(btrim(_note),''), true,
          nullif(q->>'qa_policy_id','')::uuid, q->>'policy_basis', q->'checklist',
          _reviewer_id, auth.uid(), auth.uid(), o.id)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_value)
  VALUES (auth.uid(),'complaint.qa.submitted','complaint',_complaint_id,
          jsonb_build_object('review_id',v_id,'reviewer_id',_reviewer_id));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_qa_record(
  _complaint_id uuid, _decision text, _findings text, _rationale text,
  _checklist jsonb DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.complaints; o public.complaint_outcomes; q jsonb; v_id uuid; v_sub uuid;
BEGIN
  c := public.mc03_guard(_complaint_id,'approve');
  IF _decision NOT IN ('qa_approved','qa_returned') THEN
    RAISE EXCEPTION 'invalid_decision' USING ERRCODE='22023'; END IF;
  IF coalesce(length(btrim(_rationale)),0) < 10 THEN
    RAISE EXCEPTION 'rationale_required' USING ERRCODE='22023'; END IF;

  SELECT * INTO o FROM public.complaint_outcomes WHERE complaint_id=_complaint_id AND is_current;
  IF o.id IS NULL OR o.status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'outcome_not_recorded' USING ERRCODE='22023'; END IF;

  q := public.complaint_qa_requirement(_complaint_id);
  IF NOT (q->>'qa_required')::boolean THEN
    RAISE EXCEPTION 'qa_not_required' USING ERRCODE='22023'; END IF;

  -- separation of duties: the officer who prepared the outcome cannot review it
  SELECT submitted_by INTO v_sub FROM public.complaint_closure_reviews
   WHERE complaint_id=_complaint_id AND stage='qa' AND decision='qa_submitted'
   ORDER BY decided_at DESC LIMIT 1;
  IF auth.uid() IN (o.submitted_by, o.created_by, c.investigator_id, v_sub) THEN
    RAISE EXCEPTION 'separation_of_duties: the case officer cannot review their own case'
      USING ERRCODE='42501';
  END IF;

  INSERT INTO public.complaint_closure_reviews(
    complaint_id, stage, decision, rationale, qa_findings, qa_required,
    qa_policy_id, qa_policy_basis, qa_checklist, reviewer_id, decided_by, outcome_id)
  VALUES (_complaint_id,'qa',_decision, btrim(_rationale), nullif(btrim(_findings),''), true,
          nullif(q->>'qa_policy_id','')::uuid, q->>'policy_basis',
          coalesce(_checklist, q->'checklist'), auth.uid(), auth.uid(), o.id)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_value)
  VALUES (auth.uid(),'complaint.qa.'||_decision,'complaint',_complaint_id,
          jsonb_build_object('review_id',v_id));
  RETURN v_id;
END; $$;

-- ---------- deterministic closure readiness (single source of truth) ----------
CREATE OR REPLACE FUNCTION public.complaint_closure_readiness(_complaint_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.complaints; o public.complaint_outcomes; q jsonb;
        v_b text[] := '{}'; v_n int; v_comm int;
BEGIN
  PERFORM public.mc03_guard(_complaint_id,'view');
  SELECT * INTO c FROM public.complaints WHERE id=_complaint_id;
  IF c.status IN ('closed','resolved') THEN
    RETURN jsonb_build_object('complaint_id',_complaint_id,'readiness','CLOSED','blockers','[]'::jsonb);
  END IF;

  SELECT * INTO o FROM public.complaint_outcomes WHERE complaint_id=_complaint_id AND is_current;
  IF o.id IS NULL OR o.status <> 'SUBMITTED' THEN
    v_b := v_b || ARRAY['The final outcome has not been recorded and completed'];
  END IF;

  SELECT count(*) INTO v_n FROM public.complaint_redress
   WHERE complaint_id=_complaint_id AND is_required AND status NOT IN ('VERIFIED','CANCELLED');
  IF coalesce(v_n,0) > 0 THEN
    v_b := v_b || ARRAY[v_n::text || ' required redress item(s) are not yet completed and verified'];
  END IF;

  SELECT count(*) INTO v_n FROM public.complaint_investigation_tasks
   WHERE complaint_id=_complaint_id AND is_mandatory
     AND coalesce(status,'') NOT IN ('COMPLETED','CANCELLED','completed','cancelled');
  IF coalesce(v_n,0) > 0 THEN
    v_b := v_b || ARRAY[v_n::text || ' mandatory work item(s) are still open']; END IF;

  SELECT count(*) INTO v_n FROM public.complaint_rfis
   WHERE complaint_id=_complaint_id AND status NOT IN ('closed','cancelled');
  IF coalesce(v_n,0) > 0 THEN
    v_b := v_b || ARRAY[v_n::text || ' information request(s) remain open']; END IF;

  SELECT count(*) INTO v_n FROM public.complaint_representations
   WHERE complaint_id=_complaint_id
     AND status NOT IN ('CLOSED','WITHDRAWN','ACCEPTED_FOR_CONSIDERATION');
  IF coalesce(v_n,0) > 0 THEN
    v_b := v_b || ARRAY[v_n::text || ' representation window(s) remain open']; END IF;

  IF o.id IS NOT NULL AND o.communication_required THEN
    SELECT count(*) INTO v_comm FROM public.complaint_correspondence
     WHERE complaint_id=_complaint_id AND coalesce(direction,'') IN ('outbound','OUTBOUND','out');
    IF coalesce(v_comm,0) = 0 THEN
      v_b := v_b || ARRAY['The outcome letter to the consumer has not been issued'];
    END IF;
  END IF;

  q := public.complaint_qa_requirement(_complaint_id);
  IF (q->>'qa_required')::boolean THEN
    IF coalesce(q->>'latest_decision','') = '' THEN
      v_b := v_b || ARRAY['A quality review is required and has not been completed'];
    ELSIF q->>'latest_decision' = 'qa_returned' THEN
      v_b := v_b || ARRAY['The quality review returned the case for correction'];
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'complaint_id',_complaint_id,
    'readiness', CASE WHEN array_length(v_b,1) IS NULL THEN 'READY_FOR_CLOSURE' ELSE 'NOT_READY' END,
    'blockers', to_jsonb(v_b),
    'qa', q,
    'outcome_recorded', o.status = 'SUBMITTED');
END; $$;

-- ---------- closure ----------
CREATE OR REPLACE FUNCTION public.complaint_close(
  _complaint_id uuid, _payload jsonb DEFAULT '{}'::jsonb,
  _expected_updated_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.complaints; o public.complaint_outcomes; g jsonb; q jsonb; v_id uuid; v_sync jsonb;
BEGIN
  c := public.mc03_guard(_complaint_id,'approve');
  IF _expected_updated_at IS NOT NULL AND c.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'complaint_stale' USING ERRCODE='40001'; END IF;
  IF c.status IN ('closed','resolved') THEN
    RETURN jsonb_build_object('closed',true,'unchanged',true); END IF;

  g := public.complaint_closure_readiness(_complaint_id);
  IF g->>'readiness' <> 'READY_FOR_CLOSURE' THEN
    RAISE EXCEPTION 'closure_blocked: %',
      array_to_string(ARRAY(SELECT jsonb_array_elements_text(g->'blockers')),'; ') USING ERRCODE='22023';
  END IF;

  SELECT * INTO o FROM public.complaint_outcomes WHERE complaint_id=_complaint_id AND is_current;
  q := g->'qa';

  -- maker/checker: where QA is required the preparing officer cannot close
  IF (q->>'qa_required')::boolean
     AND auth.uid() IN (o.submitted_by, o.created_by, c.investigator_id) THEN
    RAISE EXCEPTION 'separation_of_duties: the case officer cannot approve their own closure'
      USING ERRCODE='42501';
  END IF;

  INSERT INTO public.complaint_closure_reviews(
    complaint_id, stage, decision, resolution_summary, rationale, outcome_category,
    final_communication_ref, evidence_complete, qa_required, qa_policy_id, qa_policy_basis,
    reviewer_id, decided_by, outcome_id)
  VALUES (_complaint_id,'closure','closed',
          coalesce(nullif(btrim(_payload->>'resolution_summary'),''), o.outcome_rationale),
          coalesce(nullif(btrim(_payload->>'rationale'),''), o.outcome_rationale),
          o.overall_outcome,
          nullif(btrim(_payload->>'final_communication_ref'),''),
          true, (q->>'qa_required')::boolean,
          nullif(q->>'qa_policy_id','')::uuid, q->>'policy_basis',
          o.reviewer_id, auth.uid(), o.id)
  RETURNING id INTO v_id;

  UPDATE public.complaints
     SET status='closed', closed_at=now(), closed_by=auth.uid(),
         closure_category=o.overall_outcome,
         closure_reason=coalesce(nullif(btrim(_payload->>'rationale'),''), o.outcome_rationale),
         resolution=coalesce(resolution, o.outcome_rationale),
         resolved_at=coalesce(resolved_at, now()), updated_at=now()
   WHERE id=_complaint_id;

  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_value)
  VALUES (auth.uid(),'complaint.closure.completed','complaint',_complaint_id,
          jsonb_build_object('closure_review_id',v_id,'outcome',o.overall_outcome));

  v_sync := public.mc_complaint_workflow_sync(_complaint_id,'complaint.closure.completed');
  RETURN jsonb_build_object('closed',true,'closure_review_id',v_id,'workflow',v_sync);
END; $$;

-- ---------- reconsideration (post-closure child lifecycle) ----------
CREATE OR REPLACE FUNCTION public.complaint_reconsideration_request(
  _complaint_id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.complaints; v_id uuid; v_seq int;
BEGIN
  c := public.mc03_guard(_complaint_id,'edit');
  IF c.status NOT IN ('closed','resolved') THEN
    RAISE EXCEPTION 'complaint_not_closed' USING ERRCODE='22023'; END IF;
  IF coalesce(btrim(_payload->>'requester_name'),'')='' THEN
    RAISE EXCEPTION 'requester_required' USING ERRCODE='22023'; END IF;
  IF coalesce(length(btrim(_payload->>'grounds')),0) < 10 THEN
    RAISE EXCEPTION 'grounds_required' USING ERRCODE='22023'; END IF;

  SELECT count(*)+1 INTO v_seq FROM public.complaint_reconsiderations WHERE complaint_id=_complaint_id;

  INSERT INTO public.complaint_reconsiderations(
    complaint_id, reference, requester_type, requester_name, requester_party_id,
    requester_contact, grounds, status, original_outcome_id, original_closure_review_id, created_by)
  VALUES (_complaint_id, c.complaint_number || '-R' || v_seq,
    coalesce(nullif(btrim(_payload->>'requester_type'),''),'CONSUMER'),
    btrim(_payload->>'requester_name'),
    nullif(_payload->>'requester_party_id','')::uuid,
    nullif(btrim(_payload->>'requester_contact'),''),
    btrim(_payload->>'grounds'), 'ADMISSIBILITY_REVIEW',
    (SELECT id FROM public.complaint_outcomes WHERE complaint_id=_complaint_id AND is_current),
    (SELECT id FROM public.complaint_closure_reviews WHERE complaint_id=_complaint_id
       AND decision='closed' ORDER BY decided_at DESC LIMIT 1),
    auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_value)
  VALUES (auth.uid(),'complaint.reconsideration.requested','complaint',_complaint_id,
          jsonb_build_object('reconsideration_id',v_id));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_reconsideration_decide_admissibility(
  _reconsideration_id uuid, _decision text, _rationale text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.complaint_reconsiderations;
BEGIN
  SELECT * INTO r FROM public.complaint_reconsiderations WHERE id=_reconsideration_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'reconsideration_not_found' USING ERRCODE='P0002'; END IF;
  PERFORM public.mc03_guard(r.complaint_id,'approve');
  IF _decision NOT IN ('ADMISSIBLE','NOT_ADMISSIBLE') THEN
    RAISE EXCEPTION 'invalid_decision' USING ERRCODE='22023'; END IF;
  IF coalesce(length(btrim(_rationale)),0) < 10 THEN
    RAISE EXCEPTION 'rationale_required' USING ERRCODE='22023'; END IF;
  IF r.status NOT IN ('REQUESTED','ADMISSIBILITY_REVIEW') THEN
    RAISE EXCEPTION 'admissibility_already_decided' USING ERRCODE='22023'; END IF;

  UPDATE public.complaint_reconsiderations
     SET admissibility_decision=_decision, admissibility_rationale=btrim(_rationale),
         admissibility_by=auth.uid(), admissibility_at=now(),
         status = CASE WHEN _decision='ADMISSIBLE' THEN 'ACCEPTED' ELSE 'NOT_ADMISSIBLE' END,
         row_version=r.row_version+1
   WHERE id=_reconsideration_id;

  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_value)
  VALUES (auth.uid(),'complaint.reconsideration.admissibility','complaint',r.complaint_id,
          jsonb_build_object('reconsideration_id',_reconsideration_id,'decision',_decision));
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_reconsideration_assign_reviewer(
  _reconsideration_id uuid, _reviewer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.complaint_reconsiderations; c public.complaints;
BEGIN
  SELECT * INTO r FROM public.complaint_reconsiderations WHERE id=_reconsideration_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'reconsideration_not_found' USING ERRCODE='P0002'; END IF;
  c := public.mc03_guard(r.complaint_id,'assign');
  IF r.status NOT IN ('ACCEPTED','UNDER_REVIEW') THEN
    RAISE EXCEPTION 'not_admissible_yet' USING ERRCODE='22023'; END IF;
  IF _reviewer_id IS NULL THEN RAISE EXCEPTION 'reviewer_required' USING ERRCODE='22023'; END IF;
  IF _reviewer_id = c.investigator_id THEN
    RAISE EXCEPTION 'separation_of_duties: the reviewer must be independent of the original case officer'
      USING ERRCODE='42501'; END IF;

  UPDATE public.complaint_reconsiderations
     SET reviewer_id=_reviewer_id, reviewer_assigned_by=auth.uid(), reviewer_assigned_at=now(),
         status='UNDER_REVIEW', row_version=r.row_version+1
   WHERE id=_reconsideration_id;

  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_value)
  VALUES (auth.uid(),'complaint.reconsideration.reviewer_assigned','complaint',r.complaint_id,
          jsonb_build_object('reconsideration_id',_reconsideration_id,'reviewer_id',_reviewer_id));
END; $$;

CREATE OR REPLACE FUNCTION public.complaint_reconsideration_decide(
  _reconsideration_id uuid, _decision text, _rationale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.complaint_reconsiderations; c public.complaints; v_sync jsonb := NULL;
BEGIN
  SELECT * INTO r FROM public.complaint_reconsiderations WHERE id=_reconsideration_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'reconsideration_not_found' USING ERRCODE='P0002'; END IF;
  c := public.mc03_guard(r.complaint_id,'approve');
  IF _decision NOT IN ('UPHELD','VARIED','REOPENED') THEN
    RAISE EXCEPTION 'invalid_decision' USING ERRCODE='22023'; END IF;
  IF coalesce(length(btrim(_rationale)),0) < 10 THEN
    RAISE EXCEPTION 'rationale_required' USING ERRCODE='22023'; END IF;
  IF r.status <> 'UNDER_REVIEW' THEN
    RAISE EXCEPTION 'reviewer_not_assigned' USING ERRCODE='22023'; END IF;
  IF auth.uid() = c.investigator_id THEN
    RAISE EXCEPTION 'separation_of_duties: the original case officer cannot decide the review'
      USING ERRCODE='42501'; END IF;

  UPDATE public.complaint_reconsiderations
     SET decision=_decision, decision_rationale=btrim(_rationale),
         decided_by=auth.uid(), decided_at=now(), status='DECIDED',
         row_version=r.row_version+1
   WHERE id=_reconsideration_id;

  -- Reopening creates a NEW outcome cycle; the original outcome and closure
  -- record are preserved as history and never rewritten.
  IF _decision = 'REOPENED' THEN
    UPDATE public.complaint_outcomes SET is_current=false, status='SUPERSEDED', updated_at=now()
     WHERE complaint_id=r.complaint_id AND is_current;
    UPDATE public.complaints
       SET status='under_investigation', closed_at=NULL, closed_by=NULL,
           resolved_at=NULL, updated_at=now()
     WHERE id=r.complaint_id;
    v_sync := public.mc_complaint_workflow_sync(r.complaint_id,'complaint.reconsideration.reopened');
  END IF;

  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,new_value)
  VALUES (auth.uid(),'complaint.reconsideration.decided','complaint',r.complaint_id,
          jsonb_build_object('reconsideration_id',_reconsideration_id,'decision',_decision));

  RETURN jsonb_build_object('decided',true,'decision',_decision,'workflow',v_sync);
END; $$;

-- ---------- workflow event mapping extension ----------
CREATE OR REPLACE FUNCTION public.mc_complaint_workflow_sync(_complaint_id uuid, _event text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wf uuid := public.mc_complaint_workflow_definition();
  v_target_key text;
  v_step public.approval_steps;
  v_inst public.workflow_instances;
  v_cur public.approval_steps;
  v_ver uuid;
  v_allow_regression boolean := _event = 'complaint.reconsideration.reopened';
BEGIN
  IF v_wf IS NULL THEN RETURN jsonb_build_object('synced',false,'reason','no_published_workflow'); END IF;

  v_target_key := CASE _event
    WHEN 'complaint.created'                                   THEN 'mc_jurisdiction_assessment'
    WHEN 'complaint.jurisdiction.information_requested'         THEN 'mc_jurisdiction_assessment'
    WHEN 'complaint.jurisdiction.accepted'                      THEN 'mc_triage_review'
    WHEN 'complaint.jurisdiction.partially_accepted'            THEN 'mc_triage_review'
    WHEN 'complaint.jurisdiction.referred'                      THEN 'mc_referred_pending_outcome'
    WHEN 'complaint.jurisdiction.out_of_jurisdiction'           THEN 'mc_referred_pending_outcome'
    WHEN 'complaint.triage.confirmed'                           THEN 'mc_investigation_setup'
    WHEN 'complaint.investigation.plan_approved'                THEN 'mc_investigation_casework'
    WHEN 'complaint.investigation.ready_for_outcome_review'     THEN 'mc_outcome_review'
    WHEN 'complaint.outcome.review_complete'                    THEN 'mc_closure_qa'
    WHEN 'complaint.closure.completed'                          THEN 'mc_closed'
    WHEN 'complaint.reconsideration.reopened'                   THEN 'mc_investigation_casework'
    ELSE NULL END;
  IF v_target_key IS NULL THEN RETURN jsonb_build_object('synced',false,'reason','unmapped_event'); END IF;

  SELECT * INTO v_step FROM public.approval_steps WHERE workflow_id=v_wf AND step_key=v_target_key;
  IF v_step.id IS NULL THEN RETURN jsonb_build_object('synced',false,'reason','missing_step'); END IF;

  SELECT current_published_version_id INTO v_ver FROM public.approval_workflows WHERE id=v_wf;

  SELECT * INTO v_inst FROM public.workflow_instances
   WHERE workflow_id=v_wf AND entity_type='complaint' AND entity_id=_complaint_id
   ORDER BY started_at LIMIT 1 FOR UPDATE;

  IF v_inst.id IS NULL THEN
    INSERT INTO public.workflow_instances
      (workflow_id, entity_type, entity_id, current_step_id, current_step_key,
       status, workflow_version_id, assigned_role)
    VALUES (v_wf,'complaint',_complaint_id,v_step.id,v_step.step_key,'active',v_ver,v_step.approver_role::text)
    RETURNING * INTO v_inst;
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
    VALUES (auth.uid(),'complaint.workflow.instance_opened','complaint',_complaint_id,
            jsonb_build_object('workflow_id',v_wf,'instance_id',v_inst.id,'step',v_step.step_key,'event',_event));
    RETURN jsonb_build_object('synced',true,'created',true,'step',v_step.step_key);
  END IF;

  IF v_inst.current_step_key = v_target_key THEN
    RETURN jsonb_build_object('synced',true,'unchanged',true,'step',v_target_key);
  END IF;

  SELECT * INTO v_cur FROM public.approval_steps WHERE id=v_inst.current_step_id;

  IF NOT v_allow_regression THEN
    -- the outcome/closure route is also available to referred / out-of-jurisdiction cases
    IF v_cur.id IS NOT NULL AND v_cur.step_key='mc_referred_pending_outcome'
       AND v_target_key NOT IN ('mc_closure_qa','mc_closed') THEN
      RETURN jsonb_build_object('synced',false,'reason','referred_holding_phase');
    END IF;
    IF v_cur.id IS NOT NULL AND v_step.step_key <> 'mc_referred_pending_outcome'
       AND v_cur.step_key <> 'mc_referred_pending_outcome'
       AND v_step.step_order <= v_cur.step_order THEN
      RETURN jsonb_build_object('synced',false,'reason','no_backward_transition',
                                'current',v_cur.step_key,'requested',v_target_key);
    END IF;
  END IF;

  UPDATE public.workflow_instances
     SET current_step_id=v_step.id, current_step_key=v_step.step_key,
         assigned_role=v_step.approver_role::text,
         status = CASE WHEN v_step.is_terminal THEN 'completed' ELSE 'active' END,
         completed_at = CASE WHEN v_step.is_terminal THEN now() ELSE NULL END,
         due_at = CASE WHEN v_step.sla_hours IS NULL THEN NULL
                       ELSE now() + make_interval(hours => v_step.sla_hours) END,
         updated_at=now()
   WHERE id=v_inst.id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (auth.uid(),'complaint.workflow.advanced','complaint',_complaint_id,
          jsonb_build_object('step',v_cur.step_key),
          jsonb_build_object('step',v_step.step_key,'event',_event,'instance_id',v_inst.id));

  RETURN jsonb_build_object('synced',true,'from',v_cur.step_key,'to',v_step.step_key);
END; $$;

-- ---------- derived phase event: recognise MC-04 states ----------
CREATE OR REPLACE FUNCTION public.mc_complaint_derive_phase_event(_complaint_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.complaints; ja public.complaint_jurisdiction_assessments;
        v_plan text; v_ready text; v_outcome text;
BEGIN
  SELECT * INTO c FROM public.complaints WHERE id=_complaint_id;
  IF c.id IS NULL THEN RETURN NULL; END IF;

  IF c.status IN ('closed','resolved') THEN RETURN 'complaint.closure.completed'; END IF;

  SELECT status INTO v_outcome FROM public.complaint_outcomes
   WHERE complaint_id=_complaint_id AND is_current;
  IF v_outcome = 'SUBMITTED' THEN RETURN 'complaint.outcome.review_complete'; END IF;

  SELECT * INTO ja FROM public.complaint_jurisdiction_assessments
   WHERE complaint_id=_complaint_id ORDER BY created_at DESC LIMIT 1;
  SELECT status INTO v_plan FROM public.complaint_investigation_plans
   WHERE complaint_id=_complaint_id AND is_current;

  IF v_plan = 'APPROVED' THEN
    v_ready := public.complaint_investigation_readiness(_complaint_id)->>'readiness';
    IF v_ready = 'READY_FOR_OUTCOME_REVIEW' THEN
      RETURN 'complaint.investigation.ready_for_outcome_review';
    END IF;
    RETURN 'complaint.investigation.plan_approved';
  END IF;

  IF ja.decision_outcome IN ('REFERRED') THEN RETURN 'complaint.jurisdiction.referred'; END IF;
  IF ja.decision_outcome IN ('OUT_OF_JURISDICTION','NOT_ACCEPTED') THEN
    RETURN 'complaint.jurisdiction.out_of_jurisdiction'; END IF;

  IF coalesce(c.triage_confirmation_status,'') IN ('CONFIRMED','OVERRIDDEN') THEN
    RETURN 'complaint.triage.confirmed'; END IF;

  IF ja.decision_outcome = 'ACCEPTED' THEN RETURN 'complaint.jurisdiction.accepted'; END IF;
  IF ja.decision_outcome = 'PARTIALLY_ACCEPTED' THEN
    RETURN 'complaint.jurisdiction.partially_accepted'; END IF;

  RETURN 'complaint.created';
END; $$;

-- ---------- execute grants ----------
DO $$
DECLARE f text;
BEGIN
  FOR f IN SELECT unnest(ARRAY[
    'public.complaint_outcome_gate(uuid)',
    'public.complaint_outcome_get(uuid)',
    'public.complaint_outcome_save(uuid,jsonb,integer)',
    'public.complaint_outcome_submit(uuid,integer)',
    'public.complaint_redress_save(jsonb)',
    'public.complaint_redress_complete(uuid,text,uuid,integer)',
    'public.complaint_redress_verify(uuid,text,integer)',
    'public.complaint_redress_cancel(uuid,text)',
    'public.complaint_qa_requirement(uuid)',
    'public.complaint_qa_submit_for_review(uuid,uuid,text)',
    'public.complaint_qa_record(uuid,text,text,text,jsonb)',
    'public.complaint_closure_readiness(uuid)',
    'public.complaint_close(uuid,jsonb,timestamptz)',
    'public.complaint_reconsideration_request(uuid,jsonb)',
    'public.complaint_reconsideration_decide_admissibility(uuid,text,text)',
    'public.complaint_reconsideration_assign_reviewer(uuid,uuid)',
    'public.complaint_reconsideration_decide(uuid,text,text)'
  ]) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;
