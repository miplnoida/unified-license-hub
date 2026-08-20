-- =========================================================
-- A1 PRUDENTIAL / SUPERVISORY GOVERNED OPERATIONS
-- =========================================================

-- 1. Audit helper -----------------------------------------
CREATE OR REPLACE FUNCTION public.prudential_audit_event(
  _action text, _entity_type text, _entity_id uuid,
  _before jsonb DEFAULT NULL, _after jsonb DEFAULT NULL,
  _context jsonb DEFAULT '{}'::jsonb, _justification text DEFAULT NULL,
  _compliance_action public.compliance_audit_action DEFAULT 'WORKFLOW_TRANSITION')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE _uid uuid := auth.uid();
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid, _action, _entity_type, _entity_id,
    jsonb_strip_nulls(COALESCE(_context,'{}'::jsonb) || jsonb_build_object('domain','prudential','before',_before,'after',_after,'justification',_justification)));
  INSERT INTO public.compliance_audit_logs (user_id, action_type, object_type, object_id, before_value, after_value, justification, metadata)
  VALUES (_uid, _compliance_action, _entity_type, _entity_id::text, _before, _after, _justification,
    jsonb_strip_nulls(COALESCE(_context,'{}'::jsonb) || jsonb_build_object('action',_action,'domain','prudential')));
END; $fn$;

-- 2. Scope helper -----------------------------------------
CREATE OR REPLACE FUNCTION public.prudential_enforce(_action text, _entity_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_sector uuid;
BEGIN
  IF _entity_id IS NOT NULL THEN
    SELECT sector_id INTO v_sector FROM public.licensees WHERE id = _entity_id;
  END IF;
  PERFORM public.enforce_scoped_permission('prudential_supervision', _action, _entity_id, v_sector, NULL);
END; $fn$;

CREATE OR REPLACE FUNCTION public.prudential_require_rationale(_text text, _min int DEFAULT 10, _label text DEFAULT 'rationale')
RETURNS void LANGUAGE plpgsql IMMUTABLE AS $fn$
BEGIN
  IF _text IS NULL OR length(btrim(_text)) < _min THEN
    RAISE EXCEPTION 'a % of at least % characters is required', _label, _min USING ERRCODE = '22023';
  END IF;
END; $fn$;

-- 3. Canonical linkage ------------------------------------
ALTER TABLE public.prudential_assessments
  ADD COLUMN IF NOT EXISTS return_filing_id uuid REFERENCES public.return_filings(id),
  ADD COLUMN IF NOT EXISTS return_filing_version_id uuid REFERENCES public.return_filing_versions(id),
  ADD COLUMN IF NOT EXISTS reporting_period_id uuid REFERENCES public.reporting_periods(id);

ALTER TABLE public.prudential_stress_events
  ADD COLUMN IF NOT EXISTS return_filing_id uuid REFERENCES public.return_filings(id),
  ADD COLUMN IF NOT EXISTS return_filing_version_id uuid REFERENCES public.return_filing_versions(id);

ALTER TABLE public.prudential_data_feed_logs
  ADD COLUMN IF NOT EXISTS related_filing_id uuid REFERENCES public.return_filings(id);

ALTER TABLE public.return_threshold_breaches
  ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.licensees(id),
  ADD COLUMN IF NOT EXISTS return_filing_id uuid REFERENCES public.return_filings(id),
  ADD COLUMN IF NOT EXISTS return_filing_version_id uuid REFERENCES public.return_filing_versions(id),
  ADD COLUMN IF NOT EXISTS reporting_period_id uuid REFERENCES public.reporting_periods(id),
  ADD COLUMN IF NOT EXISTS regulatory_metric_id uuid;

UPDATE public.prudential_assessments a
SET return_filing_id = f.id,
    reporting_period_id = f.reporting_period_id,
    return_filing_version_id = f.accepted_version_id
FROM public.return_filings f
WHERE a.return_filing_id IS NULL AND a.return_id IS NOT NULL AND f.legacy_return_filed_id = a.return_id;

UPDATE public.prudential_stress_events e
SET return_filing_id = f.id, return_filing_version_id = f.accepted_version_id
FROM public.return_filings f
WHERE e.return_filing_id IS NULL AND e.return_id IS NOT NULL AND f.legacy_return_filed_id = e.return_id;

UPDATE public.prudential_data_feed_logs l
SET related_filing_id = f.id
FROM public.return_filings f
WHERE l.related_filing_id IS NULL AND l.related_return_id IS NOT NULL AND f.legacy_return_filed_id = l.related_return_id;

UPDATE public.return_threshold_breaches b
SET return_filing_id = f.id,
    return_filing_version_id = f.accepted_version_id,
    reporting_period_id = f.reporting_period_id,
    entity_id = f.entity_id
FROM public.return_filings f
WHERE b.return_filing_id IS NULL AND b.return_id IS NOT NULL AND f.legacy_return_filed_id = b.return_id;

CREATE INDEX IF NOT EXISTS idx_rtb_filing ON public.return_threshold_breaches(return_filing_id);
CREATE INDEX IF NOT EXISTS idx_rtb_entity ON public.return_threshold_breaches(entity_id);
CREATE INDEX IF NOT EXISTS idx_passess_filing ON public.prudential_assessments(return_filing_id);

-- 4. Assessments ------------------------------------------
CREATE OR REPLACE FUNCTION public.prudential_assessment_create(
  _entity_id uuid, _period_start date, _period_end date,
  _return_filing_id uuid DEFAULT NULL, _return_filing_version_id uuid DEFAULT NULL,
  _ratings jsonb DEFAULT '{}'::jsonb, _rationale text DEFAULT NULL,
  _signal_snapshot jsonb DEFAULT '{}'::jsonb, _auto_suggested_rating text DEFAULT NULL)
RETURNS public.prudential_assessments LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_row public.prudential_assessments; v_period uuid; v_legacy uuid;
BEGIN
  PERFORM public.prudential_enforce('record_camels_assessment', _entity_id);
  IF _entity_id IS NULL OR _period_start IS NULL OR _period_end IS NULL THEN
    RAISE EXCEPTION 'entity and assessment period are required' USING ERRCODE='22023';
  END IF;
  IF _return_filing_id IS NOT NULL THEN
    SELECT reporting_period_id, legacy_return_filed_id INTO v_period, v_legacy
    FROM public.return_filings WHERE id = _return_filing_id;
  END IF;
  INSERT INTO public.prudential_assessments(
    entity_id, return_id, return_filing_id, return_filing_version_id, reporting_period_id,
    period_start, period_end, ratings, rationale, signal_snapshot, auto_suggested_rating, status, created_by)
  VALUES (_entity_id, v_legacy, _return_filing_id, _return_filing_version_id, v_period,
    _period_start, _period_end, COALESCE(_ratings,'{}'::jsonb), _rationale,
    COALESCE(_signal_snapshot,'{}'::jsonb), _auto_suggested_rating, 'draft', auth.uid())
  RETURNING * INTO v_row;
  PERFORM public.prudential_audit_event('prudential_assessment_created','prudential_assessment',v_row.id,
    NULL, to_jsonb(v_row), jsonb_build_object('entity_id',_entity_id,'return_filing_id',_return_filing_id), _rationale, 'CREATE');
  RETURN v_row;
END; $fn$;

CREATE OR REPLACE FUNCTION public.prudential_assessment_save_draft(_assessment_id uuid, _patch jsonb)
RETURNS public.prudential_assessments LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_before public.prudential_assessments; v_after public.prudential_assessments; v_clean jsonb;
BEGIN
  SELECT * INTO v_before FROM public.prudential_assessments WHERE id = _assessment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'assessment % not found', _assessment_id USING ERRCODE='P0002'; END IF;
  PERFORM public.prudential_enforce('record_camels_assessment', v_before.entity_id);
  IF v_before.status NOT IN ('draft','returned_for_revision') THEN
    RAISE EXCEPTION 'assessment % is not editable in status %', _assessment_id, v_before.status USING ERRCODE='55000';
  END IF;
  v_clean := COALESCE(_patch,'{}'::jsonb) - 'id' - 'status' - 'entity_id' - 'created_by'
    - 'approved_by' - 'approved_at' - 'reviewed_by' - 'reviewed_at' - 'submitted_at' - 'closed_at' - 'created_at' - 'updated_at';
  v_clean := jsonb_strip_nulls(jsonb_build_object(
    'overall_rating', v_clean->>'overall_rating',
    'ratings', v_clean->'ratings',
    'rationale', v_clean->>'rationale',
    'evidence_refs', v_clean->'evidence_refs',
    'conclusion', v_clean->>'conclusion',
    'recommended_response', v_clean->>'recommended_response',
    'override_reason', v_clean->>'override_reason',
    'auto_suggested_rating', v_clean->>'auto_suggested_rating',
    'signal_snapshot', v_clean->'signal_snapshot',
    'period_start', v_clean->>'period_start',
    'period_end', v_clean->>'period_end',
    'return_filing_id', v_clean->>'return_filing_id',
    'return_filing_version_id', v_clean->>'return_filing_version_id'));
  IF (v_clean ? 'overall_rating')
     AND v_before.auto_suggested_rating IS NOT NULL
     AND (v_clean->>'overall_rating') IS DISTINCT FROM v_before.auto_suggested_rating THEN
    PERFORM public.prudential_require_rationale(COALESCE(v_clean->>'override_reason', v_before.override_reason), 10, 'override justification');
  END IF;
  UPDATE public.prudential_assessments a
  SET overall_rating = COALESCE(v_clean->>'overall_rating', a.overall_rating),
      ratings = COALESCE(v_clean->'ratings', a.ratings),
      rationale = COALESCE(v_clean->>'rationale', a.rationale),
      evidence_refs = COALESCE(v_clean->'evidence_refs', a.evidence_refs),
      conclusion = COALESCE(v_clean->>'conclusion', a.conclusion),
      recommended_response = COALESCE(v_clean->>'recommended_response', a.recommended_response),
      override_reason = COALESCE(v_clean->>'override_reason', a.override_reason),
      auto_suggested_rating = COALESCE(v_clean->>'auto_suggested_rating', a.auto_suggested_rating),
      signal_snapshot = COALESCE(v_clean->'signal_snapshot', a.signal_snapshot),
      period_start = COALESCE((v_clean->>'period_start')::date, a.period_start),
      period_end = COALESCE((v_clean->>'period_end')::date, a.period_end),
      return_filing_id = COALESCE((v_clean->>'return_filing_id')::uuid, a.return_filing_id),
      return_filing_version_id = COALESCE((v_clean->>'return_filing_version_id')::uuid, a.return_filing_version_id),
      updated_at = now()
  WHERE a.id = _assessment_id
  RETURNING * INTO v_after;
  PERFORM public.prudential_audit_event('prudential_assessment_draft_saved','prudential_assessment',_assessment_id,
    to_jsonb(v_before), to_jsonb(v_after), jsonb_build_object('entity_id',v_before.entity_id), v_after.rationale, 'UPDATE');
  RETURN v_after;
END; $fn$;

CREATE OR REPLACE FUNCTION public.prudential_assessment_transition(
  _assessment_id uuid, _to_status text, _reason text DEFAULT NULL)
RETURNS public.prudential_assessments LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_before public.prudential_assessments; v_after public.prudential_assessments; v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_before FROM public.prudential_assessments WHERE id = _assessment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'assessment % not found', _assessment_id USING ERRCODE='P0002'; END IF;
  IF _to_status NOT IN ('submitted','reviewed','returned_for_revision','approved','closed') THEN
    RAISE EXCEPTION 'unsupported assessment transition target %', _to_status USING ERRCODE='22023';
  END IF;

  IF _to_status = 'submitted' THEN
    PERFORM public.prudential_enforce('record_camels_assessment', v_before.entity_id);
    IF v_before.status NOT IN ('draft','returned_for_revision') THEN
      RAISE EXCEPTION 'cannot submit assessment in status %', v_before.status USING ERRCODE='55000'; END IF;
  ELSE
    PERFORM public.prudential_enforce('workflow_action', v_before.entity_id);
    IF _to_status IN ('reviewed','returned_for_revision') AND v_before.status <> 'submitted' THEN
      RAISE EXCEPTION 'assessment must be submitted before review (current %)', v_before.status USING ERRCODE='55000'; END IF;
    IF _to_status = 'approved' AND v_before.status NOT IN ('submitted','reviewed') THEN
      RAISE EXCEPTION 'assessment must be submitted or reviewed before approval (current %)', v_before.status USING ERRCODE='55000'; END IF;
    IF _to_status = 'closed' AND v_before.status <> 'approved' THEN
      RAISE EXCEPTION 'only approved assessments can be closed (current %)', v_before.status USING ERRCODE='55000'; END IF;
    IF _to_status = 'approved' AND v_before.created_by IS NOT NULL AND v_before.created_by = v_uid THEN
      RAISE EXCEPTION 'the assessment author cannot approve their own assessment' USING ERRCODE='42501'; END IF;
  END IF;

  IF _to_status IN ('returned_for_revision','approved','closed') THEN
    PERFORM public.prudential_require_rationale(_reason, 10, 'decision rationale');
  END IF;

  UPDATE public.prudential_assessments a
  SET status = _to_status,
      submitted_at = CASE WHEN _to_status='submitted' THEN now() ELSE a.submitted_at END,
      reviewed_at = CASE WHEN _to_status IN ('reviewed','returned_for_revision') THEN now() ELSE a.reviewed_at END,
      reviewed_by = CASE WHEN _to_status IN ('reviewed','returned_for_revision') THEN v_uid ELSE a.reviewed_by END,
      approved_at = CASE WHEN _to_status='approved' THEN now() ELSE a.approved_at END,
      approved_by = CASE WHEN _to_status='approved' THEN v_uid ELSE a.approved_by END,
      closed_at = CASE WHEN _to_status='closed' THEN now() ELSE a.closed_at END,
      review_notes = COALESCE(_reason, a.review_notes),
      updated_at = now()
  WHERE a.id = _assessment_id
  RETURNING * INTO v_after;

  PERFORM public.prudential_audit_event('prudential_assessment_'||_to_status,'prudential_assessment',_assessment_id,
    to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('entity_id',v_before.entity_id,'from_status',v_before.status,'to_status',_to_status),
    _reason,
    CASE WHEN _to_status='approved' THEN 'APPROVE'::public.compliance_audit_action
         WHEN _to_status='returned_for_revision' THEN 'REJECT'::public.compliance_audit_action
         ELSE 'WORKFLOW_TRANSITION'::public.compliance_audit_action END);
  RETURN v_after;
END; $fn$;

CREATE OR REPLACE FUNCTION public.prudential_component_rating_save(
  _assessment_id uuid, _component_code text, _rating text,
  _narrative text DEFAULT NULL, _component_id uuid DEFAULT NULL,
  _evidence jsonb DEFAULT '[]'::jsonb, _auto_suggested_rating text DEFAULT NULL,
  _suggestion_source jsonb DEFAULT NULL, _override_justification text DEFAULT NULL)
RETURNS public.prudential_assessment_component_ratings LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_a public.prudential_assessments; v_before public.prudential_assessment_component_ratings; v_after public.prudential_assessment_component_ratings;
BEGIN
  SELECT * INTO v_a FROM public.prudential_assessments WHERE id = _assessment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'assessment % not found', _assessment_id USING ERRCODE='P0002'; END IF;
  PERFORM public.prudential_enforce('record_camels_assessment', v_a.entity_id);
  IF v_a.status NOT IN ('draft','returned_for_revision','submitted') THEN
    RAISE EXCEPTION 'component ratings cannot change once the assessment is %', v_a.status USING ERRCODE='55000';
  END IF;
  IF _rating IS NOT NULL THEN
    PERFORM public.prudential_require_rationale(_narrative, 10, 'component narrative');
  END IF;
  IF _auto_suggested_rating IS NOT NULL AND _rating IS NOT NULL AND _rating <> _auto_suggested_rating THEN
    PERFORM public.prudential_require_rationale(_override_justification, 10, 'override justification');
  END IF;

  SELECT * INTO v_before FROM public.prudential_assessment_component_ratings
   WHERE assessment_id = _assessment_id AND component_code = _component_code;

  IF v_before.id IS NULL THEN
    INSERT INTO public.prudential_assessment_component_ratings(
      assessment_id, component_id, component_code, rating, narrative, evidence,
      auto_suggested_rating, suggestion_source, override_justification, created_by, updated_by)
    VALUES (_assessment_id, _component_id, _component_code, _rating, _narrative, COALESCE(_evidence,'[]'::jsonb),
      _auto_suggested_rating, _suggestion_source, _override_justification, auth.uid(), auth.uid())
    RETURNING * INTO v_after;
  ELSE
    UPDATE public.prudential_assessment_component_ratings r
    SET component_id = COALESCE(_component_id, r.component_id),
        rating = _rating,
        narrative = COALESCE(_narrative, r.narrative),
        evidence = COALESCE(_evidence, r.evidence),
        auto_suggested_rating = COALESCE(_auto_suggested_rating, r.auto_suggested_rating),
        suggestion_source = COALESCE(_suggestion_source, r.suggestion_source),
        override_justification = COALESCE(_override_justification, r.override_justification),
        updated_by = auth.uid(), updated_at = now()
    WHERE r.id = v_before.id
    RETURNING * INTO v_after;
  END IF;

  PERFORM public.prudential_audit_event('prudential_component_rating_saved','prudential_assessment',_assessment_id,
    to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('entity_id',v_a.entity_id,'component_code',_component_code), COALESCE(_override_justification,_narrative), 'UPDATE');
  RETURN v_after;
END; $fn$;

-- 5. Supervisory actions ----------------------------------
CREATE OR REPLACE FUNCTION public.prudential_action_issue(
  _entity_id uuid, _action_type text, _title text, _description text DEFAULT NULL,
  _severity text DEFAULT 'medium', _due_date date DEFAULT NULL, _assigned_to uuid DEFAULT NULL,
  _source_type text DEFAULT 'manual', _source_id uuid DEFAULT NULL,
  _evidence_required boolean DEFAULT false, _entity_contact text DEFAULT NULL,
  _response_due_at timestamptz DEFAULT NULL, _breach_after_days integer DEFAULT NULL,
  _entity_owner_user_id uuid DEFAULT NULL)
RETURNS public.prudential_actions LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_row public.prudential_actions;
BEGIN
  PERFORM public.prudential_enforce('initiate_supervisory_action', _entity_id);
  IF _entity_id IS NULL OR _action_type IS NULL OR _title IS NULL THEN
    RAISE EXCEPTION 'entity, action type and title are required' USING ERRCODE='22023';
  END IF;
  PERFORM public.prudential_require_rationale(_description, 10, 'action description');
  INSERT INTO public.prudential_actions(
    entity_id, action_type, title, description, severity, due_date, assigned_to,
    source_type, source_id, evidence_required, entity_contact, response_due_at,
    breach_after_days, entity_owner_user_id, status, created_by)
  VALUES (_entity_id, _action_type, _title, _description, COALESCE(_severity,'medium'), _due_date, _assigned_to,
    COALESCE(_source_type,'manual'), _source_id, COALESCE(_evidence_required,false), _entity_contact, _response_due_at,
    _breach_after_days, _entity_owner_user_id, 'open', auth.uid())
  RETURNING * INTO v_row;
  PERFORM public.prudential_audit_event('prudential_action_issued','prudential_action',v_row.id,
    NULL, to_jsonb(v_row), jsonb_build_object('entity_id',_entity_id,'source_type',_source_type,'source_id',_source_id), _description, 'CREATE');
  RETURN v_row;
END; $fn$;

CREATE OR REPLACE FUNCTION public.prudential_action_update(
  _action_id uuid, _patch jsonb DEFAULT '{}'::jsonb, _reason text DEFAULT NULL)
RETURNS public.prudential_actions LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_before public.prudential_actions; v_after public.prudential_actions;
        v_to text; v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_before FROM public.prudential_actions WHERE id = _action_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'supervisory action % not found', _action_id USING ERRCODE='P0002'; END IF;
  v_to := NULLIF(_patch->>'status','');

  IF v_to IS NULL THEN
    PERFORM public.prudential_enforce('edit', v_before.entity_id);
  ELSIF v_to IN ('completed','waived','cancelled') THEN
    PERFORM public.prudential_enforce('manage_remediation', v_before.entity_id);
  ELSE
    PERFORM public.prudential_enforce('workflow_action', v_before.entity_id);
  END IF;

  IF v_before.status IN ('completed','waived','cancelled') THEN
    RAISE EXCEPTION 'supervisory action % is already closed (%)', _action_id, v_before.status USING ERRCODE='55000';
  END IF;
  IF v_to IS NOT NULL AND v_to NOT IN ('open','in_progress','awaiting_evidence','awaiting_review','completed','overdue','breached','waived','cancelled') THEN
    RAISE EXCEPTION 'unsupported supervisory action status %', v_to USING ERRCODE='22023';
  END IF;
  IF v_to IN ('completed','waived','cancelled') THEN
    PERFORM public.prudential_require_rationale(_reason, 10, 'closure rationale');
  END IF;

  UPDATE public.prudential_actions a
  SET status = COALESCE(v_to, a.status),
      title = COALESCE(_patch->>'title', a.title),
      description = COALESCE(_patch->>'description', a.description),
      severity = COALESCE(_patch->>'severity', a.severity),
      due_date = COALESCE((_patch->>'due_date')::date, a.due_date),
      assigned_to = COALESCE((_patch->>'assigned_to')::uuid, a.assigned_to),
      entity_contact = COALESCE(_patch->>'entity_contact', a.entity_contact),
      response_due_at = COALESCE((_patch->>'response_due_at')::timestamptz, a.response_due_at),
      progress_percent = COALESCE((_patch->>'progress_percent')::int, a.progress_percent),
      review_status = COALESCE(_patch->>'review_status', a.review_status),
      review_notes = COALESCE(_patch->>'review_notes', a.review_notes),
      reviewed_by = CASE WHEN _patch ? 'review_status' THEN v_uid ELSE a.reviewed_by END,
      reviewed_at = CASE WHEN _patch ? 'review_status' THEN now() ELSE a.reviewed_at END,
      completion_notes = CASE WHEN v_to='completed' THEN _reason ELSE a.completion_notes END,
      waiver_reason = CASE WHEN v_to='waived' THEN _reason ELSE a.waiver_reason END,
      cancellation_reason = CASE WHEN v_to='cancelled' THEN _reason ELSE a.cancellation_reason END,
      closed_at = CASE WHEN v_to IN ('completed','waived','cancelled') THEN now() ELSE a.closed_at END,
      closed_by = CASE WHEN v_to IN ('completed','waived','cancelled') THEN v_uid ELSE a.closed_by END,
      updated_at = now()
  WHERE a.id = _action_id
  RETURNING * INTO v_after;

  PERFORM public.prudential_audit_event(
    COALESCE('prudential_action_'||v_to,'prudential_action_updated'),'prudential_action',_action_id,
    to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('entity_id',v_before.entity_id,'from_status',v_before.status,'to_status',v_after.status),
    _reason, 'UPDATE');
  RETURN v_after;
END; $fn$;

-- 6. Escalations ------------------------------------------
CREATE OR REPLACE FUNCTION public.prudential_escalation_raise(
  _entity_id uuid, _escalation_type text, _reason text,
  _related_type text DEFAULT 'entity', _related_id uuid DEFAULT NULL,
  _priority text DEFAULT 'medium', _evidence jsonb DEFAULT '{}'::jsonb)
RETURNS public.prudential_escalations LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_row public.prudential_escalations;
BEGIN
  PERFORM public.prudential_enforce('initiate_supervisory_action', _entity_id);
  PERFORM public.prudential_require_rationale(_reason, 10, 'escalation reason');
  INSERT INTO public.prudential_escalations(entity_id, escalation_type, reason, related_type, related_id, priority, evidence, status, created_by)
  VALUES (_entity_id, _escalation_type, _reason, COALESCE(_related_type,'entity'), _related_id,
          COALESCE(_priority,'medium'), COALESCE(_evidence,'{}'::jsonb), 'open', auth.uid())
  RETURNING * INTO v_row;
  PERFORM public.prudential_audit_event('prudential_escalation_raised','prudential_escalation',v_row.id,
    NULL, to_jsonb(v_row), jsonb_build_object('entity_id',_entity_id,'related_type',_related_type,'related_id',_related_id), _reason, 'CREATE');
  RETURN v_row;
END; $fn$;

CREATE OR REPLACE FUNCTION public.prudential_escalation_decide(
  _escalation_id uuid, _status text, _decision text DEFAULT NULL,
  _outcome text DEFAULT NULL, _priority text DEFAULT NULL)
RETURNS public.prudential_escalations LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_before public.prudential_escalations; v_after public.prudential_escalations;
BEGIN
  SELECT * INTO v_before FROM public.prudential_escalations WHERE id = _escalation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'escalation % not found', _escalation_id USING ERRCODE='P0002'; END IF;
  PERFORM public.prudential_enforce('workflow_action', v_before.entity_id);
  IF _status NOT IN ('open','under_review','resolved','withdrawn') THEN
    RAISE EXCEPTION 'unsupported escalation status %', _status USING ERRCODE='22023'; END IF;
  IF v_before.status IN ('resolved','withdrawn') THEN
    RAISE EXCEPTION 'escalation % is already closed (%)', _escalation_id, v_before.status USING ERRCODE='55000'; END IF;
  IF _status IN ('resolved','withdrawn') THEN
    PERFORM public.prudential_require_rationale(COALESCE(_decision, _outcome), 10, 'escalation decision');
  END IF;
  UPDATE public.prudential_escalations e
  SET status = _status,
      decision = COALESCE(_decision, e.decision),
      outcome = COALESCE(_outcome, e.outcome),
      priority = COALESCE(_priority, e.priority),
      decision_by = CASE WHEN _status IN ('resolved','withdrawn') THEN auth.uid() ELSE e.decision_by END,
      decided_at = CASE WHEN _status IN ('resolved','withdrawn') THEN now() ELSE e.decided_at END,
      updated_at = now()
  WHERE e.id = _escalation_id
  RETURNING * INTO v_after;
  PERFORM public.prudential_audit_event('prudential_escalation_'||_status,'prudential_escalation',_escalation_id,
    to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('entity_id',v_before.entity_id,'from_status',v_before.status,'to_status',_status),
    COALESCE(_decision,_outcome), 'WORKFLOW_TRANSITION');
  RETURN v_after;
END; $fn$;

-- 7. Supervisory plans & plan actions ---------------------
CREATE OR REPLACE FUNCTION public.supervisory_plan_action_create(
  _plan_id uuid, _title text, _description text DEFAULT NULL,
  _owner_role text DEFAULT NULL, _due_date date DEFAULT NULL, _source text DEFAULT 'manual')
RETURNS public.supervisory_plan_actions LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_entity uuid; v_row public.supervisory_plan_actions;
BEGIN
  SELECT entity_id INTO v_entity FROM public.supervisory_plans WHERE id = _plan_id;
  IF v_entity IS NULL THEN RAISE EXCEPTION 'supervisory plan % not found', _plan_id USING ERRCODE='P0002'; END IF;
  PERFORM public.prudential_enforce('edit', v_entity);
  IF _title IS NULL OR btrim(_title) = '' THEN RAISE EXCEPTION 'activity title is required' USING ERRCODE='22023'; END IF;
  INSERT INTO public.supervisory_plan_actions(plan_id, title, description, owner_role, due_date, status, source)
  VALUES (_plan_id, _title, _description, _owner_role, _due_date, 'planned', COALESCE(_source,'manual'))
  RETURNING * INTO v_row;
  PERFORM public.prudential_audit_event('supervisory_plan_action_created','supervisory_plan_action',v_row.id,
    NULL, to_jsonb(v_row), jsonb_build_object('plan_id',_plan_id,'entity_id',v_entity), _description, 'CREATE');
  RETURN v_row;
END; $fn$;

CREATE OR REPLACE FUNCTION public.supervisory_plan_action_transition(
  _action_id uuid, _to_status text, _reason text DEFAULT NULL,
  _owner_role text DEFAULT NULL, _due_date date DEFAULT NULL)
RETURNS public.supervisory_plan_actions LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_before public.supervisory_plan_actions; v_after public.supervisory_plan_actions; v_entity uuid; v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_before FROM public.supervisory_plan_actions WHERE id = _action_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan activity % not found', _action_id USING ERRCODE='P0002'; END IF;
  SELECT entity_id INTO v_entity FROM public.supervisory_plans WHERE id = v_before.plan_id;
  IF _to_status IN ('completed','cancelled') THEN
    PERFORM public.prudential_enforce('manage_remediation', v_entity);
  ELSE
    PERFORM public.prudential_enforce('edit', v_entity);
  END IF;
  IF _to_status NOT IN ('planned','in_progress','completed','cancelled','rescheduled','reassigned') THEN
    RAISE EXCEPTION 'unsupported plan activity status %', _to_status USING ERRCODE='22023'; END IF;
  IF v_before.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION 'plan activity % is already %', _action_id, v_before.status USING ERRCODE='55000'; END IF;
  IF _to_status IN ('completed','cancelled','rescheduled','reassigned') THEN
    PERFORM public.prudential_require_rationale(_reason, 5, 'reason');
  END IF;

  UPDATE public.supervisory_plan_actions s
  SET status = CASE WHEN _to_status IN ('rescheduled','reassigned') THEN s.status ELSE _to_status END,
      owner_role = CASE WHEN _to_status='reassigned' THEN COALESCE(_owner_role, s.owner_role) ELSE s.owner_role END,
      reassigned_from = CASE WHEN _to_status='reassigned' THEN s.owner_role ELSE s.reassigned_from END,
      reassigned_at = CASE WHEN _to_status='reassigned' THEN now() ELSE s.reassigned_at END,
      reassigned_by = CASE WHEN _to_status='reassigned' THEN v_uid ELSE s.reassigned_by END,
      previous_due_date = CASE WHEN _to_status='rescheduled' THEN s.due_date ELSE s.previous_due_date END,
      due_date = CASE WHEN _to_status='rescheduled' THEN COALESCE(_due_date, s.due_date) ELSE s.due_date END,
      extension_reason = CASE WHEN _to_status='rescheduled' THEN _reason ELSE s.extension_reason END,
      description = CASE WHEN _to_status='completed' THEN COALESCE(s.description,'') || CASE WHEN _reason IS NULL THEN '' ELSE E'\n[outcome] ' || _reason END ELSE s.description END,
      completed_at = CASE WHEN _to_status='completed' THEN now() ELSE s.completed_at END,
      completed_by = CASE WHEN _to_status='completed' THEN v_uid ELSE s.completed_by END,
      updated_at = now()
  WHERE s.id = _action_id
  RETURNING * INTO v_after;

  PERFORM public.prudential_audit_event('supervisory_plan_action_'||_to_status,'supervisory_plan_action',_action_id,
    to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('plan_id',v_before.plan_id,'entity_id',v_entity,'from_status',v_before.status,'to_status',_to_status),
    _reason, 'WORKFLOW_TRANSITION');
  RETURN v_after;
END; $fn$;

CREATE OR REPLACE FUNCTION public.supervisory_plan_create(
  _entity_id uuid, _license_id uuid DEFAULT NULL, _risk_rating_id uuid DEFAULT NULL,
  _created_from text DEFAULT 'manual', _notes text DEFAULT NULL)
RETURNS public.supervisory_plans LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_row public.supervisory_plans;
BEGIN
  PERFORM public.prudential_enforce('edit', _entity_id);
  INSERT INTO public.supervisory_plans(entity_id, license_id, risk_rating_id, created_from, notes, status, approval_status, created_by)
  VALUES (_entity_id, _license_id, _risk_rating_id, COALESCE(_created_from,'manual'), _notes, 'draft', 'draft', auth.uid())
  RETURNING * INTO v_row;
  PERFORM public.prudential_audit_event('supervisory_plan_created','supervisory_plan',v_row.id,
    NULL, to_jsonb(v_row), jsonb_build_object('entity_id',_entity_id), _notes, 'CREATE');
  RETURN v_row;
END; $fn$;

CREATE OR REPLACE FUNCTION public.supervisory_plan_decision(
  _plan_id uuid, _decision text, _reason text DEFAULT NULL)
RETURNS public.supervisory_plans LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_before public.supervisory_plans; v_after public.supervisory_plans; v_uid uuid := auth.uid();
BEGIN
  SELECT * INTO v_before FROM public.supervisory_plans WHERE id = _plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'supervisory plan % not found', _plan_id USING ERRCODE='P0002'; END IF;
  IF _decision NOT IN ('submit','approve','reject') THEN
    RAISE EXCEPTION 'unsupported plan decision %', _decision USING ERRCODE='22023'; END IF;

  IF _decision = 'submit' THEN
    PERFORM public.prudential_enforce('edit', v_before.entity_id);
    IF COALESCE(v_before.approval_status,'draft') NOT IN ('draft','rejected') THEN
      RAISE EXCEPTION 'plan already submitted (%)', v_before.approval_status USING ERRCODE='55000'; END IF;
  ELSE
    PERFORM public.prudential_enforce('workflow_action', v_before.entity_id);
    IF COALESCE(v_before.approval_status,'draft') <> 'pending_review' THEN
      RAISE EXCEPTION 'plan is not awaiting review (%)', v_before.approval_status USING ERRCODE='55000'; END IF;
    IF v_before.submitted_for_review_by IS NOT NULL AND v_before.submitted_for_review_by = v_uid THEN
      RAISE EXCEPTION 'the officer who submitted the plan cannot approve it' USING ERRCODE='42501'; END IF;
    PERFORM public.prudential_require_rationale(_reason, 10, 'decision rationale');
  END IF;

  UPDATE public.supervisory_plans p
  SET approval_status = CASE _decision WHEN 'submit' THEN 'pending_review' WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
      status = CASE _decision WHEN 'approve' THEN 'active' ELSE p.status END,
      submitted_for_review_at = CASE WHEN _decision='submit' THEN now() ELSE p.submitted_for_review_at END,
      submitted_for_review_by = CASE WHEN _decision='submit' THEN v_uid ELSE p.submitted_for_review_by END,
      approved_at = CASE WHEN _decision='approve' THEN now() ELSE p.approved_at END,
      approved_by = CASE WHEN _decision='approve' THEN v_uid ELSE p.approved_by END,
      notes = COALESCE(_reason, p.notes),
      updated_at = now()
  WHERE p.id = _plan_id
  RETURNING * INTO v_after;

  PERFORM public.prudential_audit_event('supervisory_plan_'||_decision,'supervisory_plan',_plan_id,
    to_jsonb(v_before), to_jsonb(v_after), jsonb_build_object('entity_id',v_before.entity_id), _reason,
    CASE _decision WHEN 'approve' THEN 'APPROVE'::public.compliance_audit_action
                   WHEN 'reject' THEN 'REJECT'::public.compliance_audit_action
                   ELSE 'WORKFLOW_TRANSITION'::public.compliance_audit_action END);
  RETURN v_after;
END; $fn$;

-- 8. Configuration ----------------------------------------
CREATE OR REPLACE FUNCTION public.prudential_threshold_save(_payload jsonb, _threshold_id uuid DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS public.prudential_thresholds LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_before public.prudential_thresholds; v_after public.prudential_thresholds;
BEGIN
  PERFORM public.enforce_permission('prudential_supervision','manage_config');
  IF _threshold_id IS NOT NULL THEN
    SELECT * INTO v_before FROM public.prudential_thresholds WHERE id = _threshold_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'threshold % not found', _threshold_id USING ERRCODE='P0002'; END IF;
    UPDATE public.prudential_thresholds t
    SET return_config_id = COALESCE((_payload->>'return_config_id')::uuid, t.return_config_id),
        metric_key = COALESCE(_payload->>'metric_key', t.metric_key),
        label = COALESCE(_payload->>'label', t.label),
        comparator = COALESCE(_payload->>'comparator', t.comparator),
        warn_value = COALESCE((_payload->>'warn_value')::numeric, t.warn_value),
        breach_value = COALESCE((_payload->>'breach_value')::numeric, t.breach_value),
        upper_value = COALESCE((_payload->>'upper_value')::numeric, t.upper_value),
        unit = COALESCE(_payload->>'unit', t.unit),
        is_active = COALESCE((_payload->>'is_active')::boolean, t.is_active),
        effective_from = COALESCE((_payload->>'effective_from')::date, t.effective_from),
        effective_to = COALESCE((_payload->>'effective_to')::date, t.effective_to),
        sector_id = COALESCE((_payload->>'sector_id')::uuid, t.sector_id),
        return_type_id = COALESCE((_payload->>'return_type_id')::uuid, t.return_type_id),
        taxonomy_code = COALESCE(_payload->>'taxonomy_code', t.taxonomy_code),
        updated_at = now()
    WHERE t.id = _threshold_id RETURNING * INTO v_after;
  ELSE
    INSERT INTO public.prudential_thresholds(return_config_id, metric_key, label, comparator, warn_value, breach_value,
      upper_value, unit, is_active, effective_from, effective_to, sector_id, return_type_id, taxonomy_code)
    VALUES ((_payload->>'return_config_id')::uuid, _payload->>'metric_key', _payload->>'label',
      _payload->>'comparator', (_payload->>'warn_value')::numeric, (_payload->>'breach_value')::numeric,
      (_payload->>'upper_value')::numeric, _payload->>'unit', COALESCE((_payload->>'is_active')::boolean, true),
      (_payload->>'effective_from')::date, (_payload->>'effective_to')::date, (_payload->>'sector_id')::uuid,
      (_payload->>'return_type_id')::uuid, _payload->>'taxonomy_code')
    RETURNING * INTO v_after;
  END IF;
  PERFORM public.prudential_audit_event('prudential_threshold_saved','prudential_threshold',v_after.id,
    to_jsonb(v_before), to_jsonb(v_after), jsonb_build_object('config','threshold'), _reason,
    CASE WHEN _threshold_id IS NULL THEN 'CREATE'::public.compliance_audit_action ELSE 'UPDATE'::public.compliance_audit_action END);
  RETURN v_after;
END; $fn$;

CREATE OR REPLACE FUNCTION public.prudential_threshold_delete(_threshold_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_before public.prudential_thresholds;
BEGIN
  PERFORM public.enforce_permission('prudential_supervision','manage_config');
  PERFORM public.prudential_require_rationale(_reason, 5, 'reason');
  SELECT * INTO v_before FROM public.prudential_thresholds WHERE id = _threshold_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'threshold % not found', _threshold_id USING ERRCODE='P0002'; END IF;
  DELETE FROM public.prudential_thresholds WHERE id = _threshold_id;
  PERFORM public.prudential_audit_event('prudential_threshold_deleted','prudential_threshold',_threshold_id,
    to_jsonb(v_before), NULL, '{}'::jsonb, _reason, 'DELETE');
END; $fn$;

CREATE OR REPLACE FUNCTION public.prudential_ratio_save(_payload jsonb, _ratio_id uuid DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS public.prudential_ratios LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_before public.prudential_ratios; v_after public.prudential_ratios;
BEGIN
  PERFORM public.enforce_permission('prudential_supervision','manage_config');
  IF _ratio_id IS NOT NULL THEN
    SELECT * INTO v_before FROM public.prudential_ratios WHERE id = _ratio_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ratio % not found', _ratio_id USING ERRCODE='P0002'; END IF;
    UPDATE public.prudential_ratios r
    SET return_config_id = COALESCE((_payload->>'return_config_id')::uuid, r.return_config_id),
        ratio_key = COALESCE(_payload->>'ratio_key', r.ratio_key),
        label = COALESCE(_payload->>'label', r.label),
        formula = COALESCE(_payload->>'formula', r.formula),
        display_format = COALESCE(_payload->>'display_format', r.display_format),
        metric_key = COALESCE(_payload->>'metric_key', r.metric_key),
        category = COALESCE(_payload->>'category', r.category),
        recommendation_template = COALESCE(_payload->>'recommendation_template', r.recommendation_template),
        taxonomy_code = COALESCE(_payload->>'taxonomy_code', r.taxonomy_code),
        is_active = COALESCE((_payload->>'is_active')::boolean, r.is_active),
        updated_at = now()
    WHERE r.id = _ratio_id RETURNING * INTO v_after;
  ELSE
    INSERT INTO public.prudential_ratios(return_config_id, ratio_key, label, formula, display_format, metric_key,
      category, recommendation_template, taxonomy_code, is_active)
    VALUES ((_payload->>'return_config_id')::uuid, _payload->>'ratio_key', _payload->>'label', _payload->>'formula',
      _payload->>'display_format', _payload->>'metric_key', _payload->>'category', _payload->>'recommendation_template',
      _payload->>'taxonomy_code', COALESCE((_payload->>'is_active')::boolean, true))
    RETURNING * INTO v_after;
  END IF;
  PERFORM public.prudential_audit_event('prudential_ratio_saved','prudential_ratio',v_after.id,
    to_jsonb(v_before), to_jsonb(v_after), jsonb_build_object('config','ratio'), _reason,
    CASE WHEN _ratio_id IS NULL THEN 'CREATE'::public.compliance_audit_action ELSE 'UPDATE'::public.compliance_audit_action END);
  RETURN v_after;
END; $fn$;

CREATE OR REPLACE FUNCTION public.prudential_ratio_delete(_ratio_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_before public.prudential_ratios;
BEGIN
  PERFORM public.enforce_permission('prudential_supervision','manage_config');
  PERFORM public.prudential_require_rationale(_reason, 5, 'reason');
  SELECT * INTO v_before FROM public.prudential_ratios WHERE id = _ratio_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ratio % not found', _ratio_id USING ERRCODE='P0002'; END IF;
  DELETE FROM public.prudential_ratios WHERE id = _ratio_id;
  PERFORM public.prudential_audit_event('prudential_ratio_deleted','prudential_ratio',_ratio_id,
    to_jsonb(v_before), NULL, '{}'::jsonb, _reason, 'DELETE');
END; $fn$;

CREATE OR REPLACE FUNCTION public.prudential_taxonomy_save(_payload jsonb, _taxonomy_id uuid DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS public.prudential_risk_taxonomy LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_before public.prudential_risk_taxonomy; v_after public.prudential_risk_taxonomy;
BEGIN
  PERFORM public.enforce_permission('prudential_supervision','manage_config');
  IF _taxonomy_id IS NOT NULL THEN
    SELECT * INTO v_before FROM public.prudential_risk_taxonomy WHERE id = _taxonomy_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'taxonomy node % not found', _taxonomy_id USING ERRCODE='P0002'; END IF;
    UPDATE public.prudential_risk_taxonomy t
    SET code = COALESCE(_payload->>'code', t.code),
        label = COALESCE(_payload->>'label', t.label),
        description = COALESCE(_payload->>'description', t.description),
        parent_id = CASE WHEN _payload ? 'parent_id' THEN (_payload->>'parent_id')::uuid ELSE t.parent_id END,
        sort_order = COALESCE((_payload->>'sort_order')::int, t.sort_order),
        is_active = COALESCE((_payload->>'is_active')::boolean, t.is_active),
        updated_at = now()
    WHERE t.id = _taxonomy_id RETURNING * INTO v_after;
  ELSE
    INSERT INTO public.prudential_risk_taxonomy(code, label, description, parent_id, sort_order, is_active)
    VALUES (_payload->>'code', _payload->>'label', _payload->>'description', (_payload->>'parent_id')::uuid,
      COALESCE((_payload->>'sort_order')::int, 0), COALESCE((_payload->>'is_active')::boolean, true))
    RETURNING * INTO v_after;
  END IF;
  PERFORM public.prudential_audit_event('prudential_taxonomy_saved','prudential_risk_taxonomy',v_after.id,
    to_jsonb(v_before), to_jsonb(v_after), jsonb_build_object('config','risk_taxonomy'), _reason,
    CASE WHEN _taxonomy_id IS NULL THEN 'CREATE'::public.compliance_audit_action ELSE 'UPDATE'::public.compliance_audit_action END);
  RETURN v_after;
END; $fn$;

CREATE OR REPLACE FUNCTION public.prudential_stress_indicator_save(_payload jsonb, _indicator_id uuid DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS public.prudential_stress_indicators LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_before public.prudential_stress_indicators; v_after public.prudential_stress_indicators;
BEGIN
  PERFORM public.enforce_permission('prudential_supervision','manage_config');
  IF _indicator_id IS NOT NULL THEN
    SELECT * INTO v_before FROM public.prudential_stress_indicators WHERE id = _indicator_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'stress indicator % not found', _indicator_id USING ERRCODE='P0002'; END IF;
    UPDATE public.prudential_stress_indicators s
    SET metric_key = COALESCE(_payload->>'metric_key', s.metric_key),
        label = COALESCE(_payload->>'label', s.label),
        taxonomy_code = COALESCE(_payload->>'taxonomy_code', s.taxonomy_code),
        threshold_value = COALESCE((_payload->>'threshold_value')::numeric, s.threshold_value),
        direction = COALESCE(_payload->>'direction', s.direction),
        severity = COALESCE(_payload->>'severity', s.severity),
        sector_id = CASE WHEN _payload ? 'sector_id' THEN (_payload->>'sector_id')::uuid ELSE s.sector_id END,
        sub_sector_id = CASE WHEN _payload ? 'sub_sector_id' THEN (_payload->>'sub_sector_id')::uuid ELSE s.sub_sector_id END,
        notify_roles = COALESCE(_payload->'notify_roles', s.notify_roles),
        escalate = COALESCE((_payload->>'escalate')::boolean, s.escalate),
        is_active = COALESCE((_payload->>'is_active')::boolean, s.is_active),
        updated_at = now()
    WHERE s.id = _indicator_id RETURNING * INTO v_after;
  ELSE
    INSERT INTO public.prudential_stress_indicators(metric_key, label, taxonomy_code, threshold_value, direction,
      severity, sector_id, sub_sector_id, notify_roles, escalate, is_active, created_by)
    VALUES (_payload->>'metric_key', _payload->>'label', _payload->>'taxonomy_code',
      (_payload->>'threshold_value')::numeric, _payload->>'direction', _payload->>'severity',
      (_payload->>'sector_id')::uuid, (_payload->>'sub_sector_id')::uuid,
      COALESCE(_payload->'notify_roles','[]'::jsonb), COALESCE((_payload->>'escalate')::boolean,false),
      COALESCE((_payload->>'is_active')::boolean,true), auth.uid())
    RETURNING * INTO v_after;
  END IF;
  PERFORM public.prudential_audit_event('prudential_stress_indicator_saved','prudential_stress_indicator',v_after.id,
    to_jsonb(v_before), to_jsonb(v_after), jsonb_build_object('config','stress_indicator'), _reason,
    CASE WHEN _indicator_id IS NULL THEN 'CREATE'::public.compliance_audit_action ELSE 'UPDATE'::public.compliance_audit_action END);
  RETURN v_after;
END; $fn$;

CREATE OR REPLACE FUNCTION public.prudential_stress_indicator_delete(_indicator_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_before public.prudential_stress_indicators;
BEGIN
  PERFORM public.enforce_permission('prudential_supervision','manage_config');
  PERFORM public.prudential_require_rationale(_reason, 5, 'reason');
  SELECT * INTO v_before FROM public.prudential_stress_indicators WHERE id = _indicator_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'stress indicator % not found', _indicator_id USING ERRCODE='P0002'; END IF;
  DELETE FROM public.prudential_stress_indicators WHERE id = _indicator_id;
  PERFORM public.prudential_audit_event('prudential_stress_indicator_deleted','prudential_stress_indicator',_indicator_id,
    to_jsonb(v_before), NULL, '{}'::jsonb, _reason, 'DELETE');
END; $fn$;

-- 9. Operational ------------------------------------------
CREATE OR REPLACE FUNCTION public.prudential_stress_event_acknowledge(_event_id uuid)
RETURNS public.prudential_stress_events LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_before public.prudential_stress_events; v_after public.prudential_stress_events;
BEGIN
  SELECT * INTO v_before FROM public.prudential_stress_events WHERE id = _event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'stress event % not found', _event_id USING ERRCODE='P0002'; END IF;
  PERFORM public.prudential_enforce('view', v_before.entity_id);
  UPDATE public.prudential_stress_events e SET notified = true WHERE e.id = _event_id RETURNING * INTO v_after;
  PERFORM public.prudential_audit_event('prudential_stress_event_acknowledged','prudential_stress_event',_event_id,
    to_jsonb(v_before), to_jsonb(v_after), jsonb_build_object('entity_id',v_before.entity_id), NULL, 'UPDATE');
  RETURN v_after;
END; $fn$;

CREATE OR REPLACE FUNCTION public.prudential_feed_log_record(
  _source text, _feed_type text, _status text, _row_count integer DEFAULT NULL,
  _error text DEFAULT NULL, _related_filing_id uuid DEFAULT NULL,
  _completed_at timestamptz DEFAULT NULL, _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS public.prudential_data_feed_logs LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_row public.prudential_data_feed_logs;
BEGIN
  PERFORM public.enforce_permission('prudential_supervision','view');
  IF _status NOT IN ('started','success','failed','retried') THEN
    RAISE EXCEPTION 'unsupported feed status %', _status USING ERRCODE='22023'; END IF;
  INSERT INTO public.prudential_data_feed_logs(source, feed_type, status, row_count, error,
    related_filing_id, completed_at, triggered_by, metadata)
  VALUES (_source, _feed_type, _status, _row_count, _error, _related_filing_id, _completed_at, auth.uid(),
    COALESCE(_metadata,'{}'::jsonb))
  RETURNING * INTO v_row;
  RETURN v_row;
END; $fn$;

-- 10. Breach disposition ----------------------------------
CREATE OR REPLACE FUNCTION public.prudential_breach_acknowledge(_breach_id uuid, _note text)
RETURNS public.return_threshold_breaches LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_before public.return_threshold_breaches; v_after public.return_threshold_breaches;
BEGIN
  SELECT * INTO v_before FROM public.return_threshold_breaches WHERE id = _breach_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'breach % not found', _breach_id USING ERRCODE='P0002'; END IF;
  PERFORM public.prudential_enforce('review_returns', v_before.entity_id);
  PERFORM public.prudential_require_rationale(_note, 10, 'acknowledgement note');
  IF v_before.acknowledged_at IS NOT NULL THEN
    RAISE EXCEPTION 'breach % is already acknowledged', _breach_id USING ERRCODE='55000'; END IF;
  UPDATE public.return_threshold_breaches b
  SET acknowledged_at = now(), acknowledged_by = auth.uid(), acknowledgement_note = _note
  WHERE b.id = _breach_id RETURNING * INTO v_after;
  PERFORM public.prudential_audit_event('return_breach_acknowledged','return_threshold_breach',_breach_id,
    to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('entity_id',v_before.entity_id,'return_filing_id',v_before.return_filing_id,
                       'reporting_period_id',v_before.reporting_period_id,'metric_key',v_before.metric_key),
    _note, 'WORKFLOW_TRANSITION');
  RETURN v_after;
END; $fn$;

CREATE OR REPLACE FUNCTION public.prudential_breach_link_enforcement(_breach_id uuid, _enforcement_id uuid, _reason text DEFAULT NULL)
RETURNS public.return_threshold_breaches LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_before public.return_threshold_breaches; v_after public.return_threshold_breaches;
BEGIN
  SELECT * INTO v_before FROM public.return_threshold_breaches WHERE id = _breach_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'breach % not found', _breach_id USING ERRCODE='P0002'; END IF;
  PERFORM public.prudential_enforce('initiate_supervisory_action', v_before.entity_id);
  IF v_before.escalated_enforcement_id IS NOT NULL THEN
    RAISE EXCEPTION 'breach % is already escalated to enforcement', _breach_id USING ERRCODE='55000'; END IF;
  UPDATE public.return_threshold_breaches b
  SET escalated_enforcement_id = _enforcement_id, escalated_at = now(), escalated_by = auth.uid()
  WHERE b.id = _breach_id RETURNING * INTO v_after;
  PERFORM public.prudential_audit_event('return_breach_escalated','return_threshold_breach',_breach_id,
    to_jsonb(v_before), to_jsonb(v_after),
    jsonb_build_object('entity_id',v_before.entity_id,'enforcement_id',_enforcement_id,
                       'return_filing_id',v_before.return_filing_id), _reason, 'WORKFLOW_TRANSITION');
  RETURN v_after;
END; $fn$;

-- 11. Grants ----------------------------------------------
DO $grants$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
        'prudential_audit_event','prudential_enforce','prudential_require_rationale',
        'prudential_assessment_create','prudential_assessment_save_draft','prudential_assessment_transition',
        'prudential_component_rating_save','prudential_action_issue','prudential_action_update',
        'prudential_escalation_raise','prudential_escalation_decide',
        'supervisory_plan_action_create','supervisory_plan_action_transition',
        'supervisory_plan_create','supervisory_plan_decision',
        'prudential_threshold_save','prudential_threshold_delete','prudential_ratio_save','prudential_ratio_delete',
        'prudential_taxonomy_save','prudential_stress_indicator_save','prudential_stress_indicator_delete',
        'prudential_stress_event_acknowledge','prudential_feed_log_record',
        'prudential_breach_acknowledge','prudential_breach_link_enforcement')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $grants$;