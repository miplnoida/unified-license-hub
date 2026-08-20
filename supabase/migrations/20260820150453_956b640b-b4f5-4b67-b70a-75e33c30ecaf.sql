-- ============================================================
-- A1 — Fit & Proper governed-decision closure
-- Every material F&P transition moves behind a domain-specific,
-- permission-checked operation emitting ONE authoritative audit event.
-- Existing F&P triggers remain the canonical business-rule layer.
-- ============================================================

ALTER TABLE public.fp_conditions DROP CONSTRAINT IF EXISTS fp_conditions_status_check;
ALTER TABLE public.fp_conditions ADD CONSTRAINT fp_conditions_status_check
  CHECK (status = ANY (ARRAY['open','satisfied','waived','overdue','breached']));

CREATE OR REPLACE FUNCTION public.fp_audit_event(
  _action text,
  _entity_type text,
  _entity_id uuid,
  _before jsonb DEFAULT NULL,
  _after jsonb DEFAULT NULL,
  _context jsonb DEFAULT '{}'::jsonb,
  _justification text DEFAULT NULL,
  _compliance_action compliance_audit_action DEFAULT 'WORKFLOW_TRANSITION'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid();
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (_uid, _action, _entity_type, _entity_id,
          jsonb_strip_nulls(
            COALESCE(_context,'{}'::jsonb)
            || jsonb_build_object('before',_before,'after',_after,'justification',_justification)));

  INSERT INTO public.compliance_audit_logs (
    user_id, action_type, object_type, object_id, before_value, after_value, justification, metadata)
  VALUES (_uid, _compliance_action, _entity_type, _entity_id::text, _before, _after, _justification,
          jsonb_strip_nulls(COALESCE(_context,'{}'::jsonb) || jsonb_build_object('action',_action)));
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.fp_audit_event(text,text,uuid,jsonb,jsonb,jsonb,text,compliance_audit_action) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 1. ASSESSMENT LIFECYCLE
-- ============================================================

CREATE OR REPLACE FUNCTION public.fp_assessment_initiate(
  _individual_id uuid,
  _assessment_type text,
  _declaration_data jsonb DEFAULT '{}'::jsonb,
  _role_id uuid DEFAULT NULL,
  _licensee_id uuid DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_initiation','initiate_assessment');
  IF _assessment_type IS NULL OR btrim(_assessment_type) = '' THEN
    RAISE EXCEPTION 'assessment type is required' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fp_individuals WHERE id = _individual_id) THEN
    RAISE EXCEPTION 'individual not found' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.fp_assessments
     WHERE individual_id = _individual_id
       AND assessment_type = _assessment_type
       AND status NOT IN ('determined','closed','withdrawn')
  ) THEN
    RAISE EXCEPTION 'an open % assessment already exists for this individual', _assessment_type
      USING ERRCODE='22023';
  END IF;

  INSERT INTO public.fp_assessments (
    individual_id, assessment_type, status, declaration_data,
    created_by, role_id, licensee_id, regulator_id)
  VALUES (
    _individual_id, _assessment_type, 'draft', COALESCE(_declaration_data,'{}'::jsonb),
    _uid, _role_id, _licensee_id, _regulator_id)
  RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.assessment.initiated','fp_assessment',_row.id, NULL,
    jsonb_build_object('assessment_type',_assessment_type,'status','draft',
                       'role_id',_role_id,'licensee_id',_licensee_id),
    jsonb_build_object('individual_id',_individual_id,'assessment_id',_row.id),
    NULL, 'CREATE');
  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_assessment_set_status(
  _assessment_id uuid, _status text, _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper','workflow_action');
  IF _status NOT IN ('draft','submitted','screening','awaiting_committee','determined','closed','withdrawn') THEN
    RAISE EXCEPTION 'invalid assessment status %', _status USING ERRCODE='22023';
  END IF;
  SELECT * INTO _prev FROM public.fp_assessments WHERE id = _assessment_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'assessment not found' USING ERRCODE='22023'; END IF;
  IF _prev.status = _status THEN
    RAISE EXCEPTION 'assessment is already %', _status USING ERRCODE='22023';
  END IF;

  UPDATE public.fp_assessments
     SET status = _status,
         closed_at = CASE WHEN _status IN ('closed','withdrawn') THEN now() ELSE closed_at END
   WHERE id = _assessment_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.assessment.status_changed','fp_assessment',_assessment_id,
    jsonb_build_object('status',_prev.status),
    jsonb_build_object('status',_status),
    jsonb_build_object('individual_id',_prev.individual_id,'assessment_id',_assessment_id),
    NULLIF(btrim(COALESCE(_note,'')),''));
  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_assessment_assign_committee(
  _assessment_id uuid, _committee_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_committee','edit');
  SELECT * INTO _prev FROM public.fp_assessments WHERE id = _assessment_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'assessment not found' USING ERRCODE='22023'; END IF;
  IF _prev.status IN ('determined','closed','withdrawn') THEN
    RAISE EXCEPTION 'assessment is % and can no longer be routed to a committee', _prev.status
      USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fp_committees WHERE id = _committee_id AND is_active) THEN
    RAISE EXCEPTION 'committee not found or inactive' USING ERRCODE='22023';
  END IF;

  UPDATE public.fp_assessments
     SET committee_id = _committee_id, status = 'awaiting_committee'
   WHERE id = _assessment_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.assessment.committee_assigned','fp_assessment',_assessment_id,
    jsonb_build_object('committee_id',_prev.committee_id,'status',_prev.status),
    jsonb_build_object('committee_id',_committee_id,'status','awaiting_committee'),
    jsonb_build_object('individual_id',_prev.individual_id,'assessment_id',_assessment_id,
                       'committee_id',_committee_id));
  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_assessment_save_pq(
  _assessment_id uuid,
  _declaration_data jsonb,
  _submit boolean DEFAULT false,
  _form_response_id uuid DEFAULT NULL,
  _amendment_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper','submit');
  SELECT * INTO _prev FROM public.fp_assessments WHERE id = _assessment_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'assessment not found' USING ERRCODE='22023'; END IF;
  IF _prev.status IN ('determined','closed','withdrawn') THEN
    RAISE EXCEPTION 'assessment is % — the questionnaire is closed', _prev.status USING ERRCODE='22023';
  END IF;
  IF _submit AND (_declaration_data IS NULL OR _declaration_data = '{}'::jsonb)
     AND COALESCE(_form_response_id, _prev.form_response_id) IS NULL THEN
    RAISE EXCEPTION 'cannot submit an empty questionnaire' USING ERRCODE='22023';
  END IF;

  UPDATE public.fp_assessments
     SET declaration_data  = COALESCE(_declaration_data, declaration_data),
         form_response_id  = COALESCE(_form_response_id, form_response_id),
         pq_amendment_reason = COALESCE(NULLIF(btrim(COALESCE(_amendment_reason,'')),''), pq_amendment_reason),
         status       = CASE WHEN _submit THEN 'submitted' ELSE status END,
         submitted_at = CASE WHEN _submit THEN now() ELSE submitted_at END,
         submitted_by = CASE WHEN _submit THEN _uid ELSE submitted_by END
   WHERE id = _assessment_id RETURNING * INTO _row;

  IF _submit THEN
    PERFORM public.fp_audit_event(
      'fp.assessment.status_changed','fp_assessment',_assessment_id,
      jsonb_build_object('status',_prev.status),
      jsonb_build_object('status','submitted','form_response_id',_row.form_response_id),
      jsonb_build_object('individual_id',_prev.individual_id,'assessment_id',_assessment_id,
                         'source','pq_submission'));
  ELSE
    PERFORM public.fp_audit_event(
      'fp.assessment.pq_saved','fp_assessment',_assessment_id, NULL,
      jsonb_build_object('form_response_id',_row.form_response_id),
      jsonb_build_object('individual_id',_prev.individual_id,'assessment_id',_assessment_id),
      NULL, 'UPDATE');
  END IF;
  RETURN to_jsonb(_row);
END; $fn$;

-- ============================================================
-- 2. SCREENING FINDINGS
-- ============================================================

CREATE OR REPLACE FUNCTION public.fp_finding_disposition(
  _finding_id uuid,
  _resolution_status text,
  _reason text,
  _raw_payload jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _prev record; _row record; _false boolean;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_screening','record_adverse_findings');
  IF _resolution_status NOT IN ('true_positive','false_positive','confirmed','cleared','dismissed') THEN
    RAISE EXCEPTION 'invalid finding disposition %', _resolution_status USING ERRCODE='22023';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'disposition reason must be at least 10 characters' USING ERRCODE='22023';
  END IF;
  SELECT * INTO _prev FROM public.fp_findings WHERE id = _finding_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'finding not found' USING ERRCODE='22023'; END IF;
  IF _prev.resolved_at IS NOT NULL AND _prev.resolution_status = _resolution_status THEN
    RAISE EXCEPTION 'finding is already dispositioned as %', _prev.resolution_status USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fp_determinations
              WHERE assessment_id = _prev.assessment_id AND is_current) THEN
    RAISE EXCEPTION 'a current determination already exists for this assessment — findings can no longer be dispositioned'
      USING ERRCODE='22023';
  END IF;

  _false := _resolution_status IN ('false_positive','cleared');

  UPDATE public.fp_findings
     SET resolution_status = _resolution_status,
         resolution_reason = btrim(_reason),
         is_false_positive = _false,
         review_note = btrim(_reason),
         reviewed_by = _uid, reviewed_at = now(),
         resolved_by = _uid, resolved_at = now(),
         raw_payload = COALESCE(_raw_payload, raw_payload)
   WHERE id = _finding_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.finding.dispositioned','fp_finding',_finding_id,
    jsonb_build_object('resolution_status',_prev.resolution_status,
                       'is_false_positive',_prev.is_false_positive),
    jsonb_build_object('resolution_status',_resolution_status,'is_false_positive',_false),
    jsonb_build_object('individual_id',_prev.individual_id,'assessment_id',_prev.assessment_id,
                       'finding_id',_finding_id,'severity',_prev.severity),
    btrim(_reason),
    CASE WHEN _false THEN 'OVERRIDE' ELSE 'APPROVE' END::compliance_audit_action);
  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_finding_escalate(
  _finding_id uuid, _note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_screening','record_adverse_findings');
  IF _note IS NULL OR length(btrim(_note)) < 10 THEN
    RAISE EXCEPTION 'escalation note must be at least 10 characters' USING ERRCODE='22023';
  END IF;
  SELECT * INTO _prev FROM public.fp_findings WHERE id = _finding_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'finding not found' USING ERRCODE='22023'; END IF;
  IF _prev.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'a resolved finding cannot be escalated' USING ERRCODE='22023';
  END IF;

  UPDATE public.fp_findings
     SET review_note = 'ESCALATED: ' || btrim(_note),
         reviewed_by = _uid, reviewed_at = now(),
         resolution_status = 'needs_review',
         severity_basis = COALESCE(severity_basis,'{}'::jsonb) || jsonb_build_object(
           'escalated', true, 'escalated_at', now(), 'escalated_by', _uid, 'note', btrim(_note))
   WHERE id = _finding_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.finding.escalated','fp_finding',_finding_id,
    jsonb_build_object('resolution_status',_prev.resolution_status),
    jsonb_build_object('resolution_status','needs_review','escalated',true),
    jsonb_build_object('individual_id',_prev.individual_id,'assessment_id',_prev.assessment_id,
                       'finding_id',_finding_id,'severity',_prev.severity),
    btrim(_note));
  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_finding_assign(
  _finding_id uuid, _assignee uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_screening','edit');
  SELECT * INTO _prev FROM public.fp_findings WHERE id = _finding_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'finding not found' USING ERRCODE='22023'; END IF;
  IF _prev.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'a resolved finding cannot be reassigned' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _assignee) THEN
    RAISE EXCEPTION 'assignee not found' USING ERRCODE='22023';
  END IF;

  UPDATE public.fp_findings
     SET assigned_to = _assignee, resolution_status = 'under_review',
         reviewed_by = _uid, reviewed_at = now()
   WHERE id = _finding_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.finding.assigned','fp_finding',_finding_id,
    jsonb_build_object('assigned_to',_prev.assigned_to,'resolution_status',_prev.resolution_status),
    jsonb_build_object('assigned_to',_assignee,'resolution_status','under_review'),
    jsonb_build_object('individual_id',_prev.individual_id,'assessment_id',_prev.assessment_id,
                       'finding_id',_finding_id),
    NULL,'UPDATE');
  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_finding_save_note(
  _finding_id uuid, _note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_screening','edit');
  SELECT * INTO _prev FROM public.fp_findings WHERE id = _finding_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'finding not found' USING ERRCODE='22023'; END IF;
  IF _prev.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'a resolved finding can no longer be annotated' USING ERRCODE='22023';
  END IF;

  UPDATE public.fp_findings
     SET review_note = NULLIF(btrim(COALESCE(_note,'')),''),
         reviewed_by = _uid, reviewed_at = now()
   WHERE id = _finding_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.finding.note_saved','fp_finding',_finding_id, NULL, NULL,
    jsonb_build_object('individual_id',_prev.individual_id,'assessment_id',_prev.assessment_id,
                       'finding_id',_finding_id),
    NULL,'UPDATE');
  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_finding_set_evidence(
  _finding_id uuid,
  _evidence_urls jsonb DEFAULT NULL,
  _clear_legacy boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper','upload_documents');
  SELECT * INTO _prev FROM public.fp_findings WHERE id = _finding_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'finding not found' USING ERRCODE='22023'; END IF;
  IF _prev.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'evidence on a resolved finding is immutable' USING ERRCODE='22023';
  END IF;
  IF _evidence_urls IS NOT NULL AND jsonb_typeof(_evidence_urls) <> 'array' THEN
    RAISE EXCEPTION 'evidence_urls must be a JSON array' USING ERRCODE='22023';
  END IF;

  UPDATE public.fp_findings
     SET evidence_urls = COALESCE(_evidence_urls, evidence_urls),
         evidence_url  = CASE WHEN _clear_legacy THEN NULL ELSE evidence_url END
   WHERE id = _finding_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.finding.evidence_updated','fp_finding',_finding_id,
    jsonb_build_object('evidence_count',jsonb_array_length(COALESCE(_prev.evidence_urls,'[]'::jsonb))),
    jsonb_build_object('evidence_count',jsonb_array_length(COALESCE(_row.evidence_urls,'[]'::jsonb))),
    jsonb_build_object('individual_id',_prev.individual_id,'assessment_id',_prev.assessment_id,
                       'finding_id',_finding_id),
    NULL,'UPDATE');
  RETURN to_jsonb(_row);
END; $fn$;

-- ============================================================
-- 3. DETERMINATIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.fp_determination_record(
  _assessment_id uuid,
  _individual_id uuid,
  _outcome text,
  _rationale text,
  _regulator_id uuid DEFAULT NULL,
  _effective_from date DEFAULT NULL,
  _effective_to date DEFAULT NULL,
  _is_committee_override boolean DEFAULT false,
  _override_reason text DEFAULT NULL,
  _conditions jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _assess record; _prior record; _row record;
  _lens uuid; _cond jsonb; _created_conditions int := 0;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_determinations','approve');
  IF _is_committee_override THEN
    PERFORM public.enforce_permission('fit_and_proper','override_committee');
  END IF;

  IF _outcome NOT IN ('approved','conditional','rejected','deferred','withdrawn','fit','not_fit') THEN
    RAISE EXCEPTION 'invalid determination outcome %', _outcome USING ERRCODE='22023';
  END IF;
  IF _rationale IS NULL OR length(btrim(_rationale)) < 10 THEN
    RAISE EXCEPTION 'determination rationale must be at least 10 characters' USING ERRCODE='22023';
  END IF;
  IF _is_committee_override AND (_override_reason IS NULL OR length(btrim(_override_reason)) < 20) THEN
    RAISE EXCEPTION 'committee override reason must be at least 20 characters' USING ERRCODE='22023';
  END IF;

  SELECT * INTO _assess FROM public.fp_assessments WHERE id = _assessment_id FOR UPDATE;
  IF _assess IS NULL THEN RAISE EXCEPTION 'assessment not found' USING ERRCODE='22023'; END IF;
  IF _assess.individual_id <> _individual_id THEN
    RAISE EXCEPTION 'assessment does not belong to this individual' USING ERRCODE='22023';
  END IF;
  IF _assess.status NOT IN ('submitted','screening','awaiting_committee') THEN
    RAISE EXCEPTION 'assessment is "%" — a determination can only be recorded from Submitted, Screening or Awaiting Committee',
      _assess.status USING ERRCODE='22023';
  END IF;
  IF _outcome = 'conditional'
     AND (_conditions IS NULL OR jsonb_typeof(_conditions) <> 'array' OR jsonb_array_length(_conditions) = 0)
     AND NOT EXISTS (SELECT 1 FROM public.fp_conditions c
                      JOIN public.fp_determinations d ON d.id = c.determination_id
                     WHERE d.assessment_id = _assessment_id) THEN
    RAISE EXCEPTION 'a conditional determination requires at least one condition' USING ERRCODE='22023';
  END IF;

  _lens := COALESCE(_assess.regulator_id, _regulator_id);

  SELECT * INTO _prior FROM public.fp_determinations
   WHERE individual_id = _individual_id AND is_current
     AND _lens IS NOT DISTINCT FROM regulator_id
   FOR UPDATE;

  IF _prior.id IS NOT NULL THEN
    UPDATE public.fp_determinations SET is_current = false WHERE id = _prior.id;
  END IF;

  INSERT INTO public.fp_determinations (
    assessment_id, individual_id, outcome, rationale, determined_by,
    supersedes_id, is_current, effective_from, effective_to, regulator_id,
    is_committee_override, override_reason)
  VALUES (
    _assessment_id, _individual_id, _outcome, btrim(_rationale), _uid,
    _prior.id, true, COALESCE(_effective_from, CURRENT_DATE), _effective_to, _lens,
    COALESCE(_is_committee_override,false),
    CASE WHEN _is_committee_override THEN btrim(_override_reason) ELSE NULL END)
  RETURNING * INTO _row;

  UPDATE public.fp_assessments
     SET status = 'determined', determined_at = now()
   WHERE id = _assessment_id;

  IF _conditions IS NOT NULL AND jsonb_typeof(_conditions) = 'array' THEN
    FOR _cond IN SELECT * FROM jsonb_array_elements(_conditions) LOOP
      IF COALESCE(btrim(_cond->>'description'),'') = '' THEN
        RAISE EXCEPTION 'each condition requires a description' USING ERRCODE='22023';
      END IF;
      INSERT INTO public.fp_conditions (
        determination_id, individual_id, category, description, due_date,
        monitoring_owner, evidence_type, status, created_by)
      VALUES (
        _row.id, _individual_id, COALESCE(NULLIF(btrim(COALESCE(_cond->>'category','')),''),'other'),
        btrim(_cond->>'description'), NULLIF(_cond->>'due_date','')::date,
        NULLIF(_cond->>'monitoring_owner','')::uuid, NULLIF(_cond->>'evidence_type',''),
        'open', _uid);
      _created_conditions := _created_conditions + 1;
    END LOOP;
  END IF;

  IF _prior.id IS NOT NULL THEN
    PERFORM public.fp_audit_event(
      'fp.determination.superseded','fp_determination',_prior.id,
      jsonb_build_object('is_current',true,'outcome',_prior.outcome),
      jsonb_build_object('is_current',false,'superseded_by',_row.id),
      jsonb_build_object('individual_id',_individual_id,'assessment_id',_assessment_id,
                         'regulator_id',_lens));
  END IF;

  PERFORM public.fp_audit_event(
    'fp.determination.recorded','fp_determination',_row.id, NULL,
    jsonb_build_object('outcome',_outcome,'regulator_id',_lens,'supersedes_id',_prior.id,
                       'is_committee_override',COALESCE(_is_committee_override,false),
                       'conditions_created',_created_conditions),
    jsonb_build_object('individual_id',_individual_id,'assessment_id',_assessment_id,
                       'determination_id',_row.id,'regulator_id',_lens),
    CASE WHEN _is_committee_override THEN btrim(_override_reason) ELSE btrim(_rationale) END,
    CASE WHEN _is_committee_override THEN 'OVERRIDE' ELSE 'APPROVE' END::compliance_audit_action);

  RETURN to_jsonb(_row) || jsonb_build_object('conditions_created',_created_conditions);
END; $fn$;

-- ============================================================
-- 4. CONDITIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.fp_condition_create(
  _determination_id uuid,
  _individual_id uuid,
  _category text,
  _description text,
  _due_date date DEFAULT NULL,
  _monitoring_owner uuid DEFAULT NULL,
  _evidence_type text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _det record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_conditions','create');
  IF _description IS NULL OR btrim(_description) = '' THEN
    RAISE EXCEPTION 'condition description is required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO _det FROM public.fp_determinations WHERE id = _determination_id;
  IF _det IS NULL THEN RAISE EXCEPTION 'determination not found' USING ERRCODE='22023'; END IF;
  IF _det.individual_id <> _individual_id THEN
    RAISE EXCEPTION 'determination does not belong to this individual' USING ERRCODE='22023';
  END IF;
  IF NOT _det.is_current THEN
    RAISE EXCEPTION 'conditions may only be attached to the current determination' USING ERRCODE='22023';
  END IF;
  IF _due_date IS NOT NULL AND _due_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'condition due date cannot be in the past' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.fp_conditions (
    determination_id, individual_id, category, description, due_date,
    monitoring_owner, evidence_type, status, created_by)
  VALUES (
    _determination_id, _individual_id, COALESCE(NULLIF(btrim(COALESCE(_category,'')),''),'other'),
    btrim(_description), _due_date, _monitoring_owner,
    NULLIF(btrim(COALESCE(_evidence_type,'')),''), 'open', _uid)
  RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.condition.created','fp_condition',_row.id, NULL,
    jsonb_build_object('category',_row.category,'due_date',_due_date,'status','open',
                       'evidence_type',_row.evidence_type),
    jsonb_build_object('individual_id',_individual_id,'determination_id',_determination_id,
                       'condition_id',_row.id),
    NULL,'CREATE');
  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_condition_set_status(
  _condition_id uuid, _status text, _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _prev record; _row record;
BEGIN
  IF _status NOT IN ('open','satisfied','waived','overdue','breached') THEN
    RAISE EXCEPTION 'invalid condition status %', _status USING ERRCODE='22023';
  END IF;

  IF _status IN ('satisfied','waived') THEN
    PERFORM public.enforce_permission('fit_and_proper_conditions','approve');
  ELSE
    PERFORM public.enforce_permission('fit_and_proper_conditions','edit');
  END IF;

  SELECT * INTO _prev FROM public.fp_conditions WHERE id = _condition_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'condition not found' USING ERRCODE='22023'; END IF;
  IF _prev.status = _status THEN
    RAISE EXCEPTION 'condition is already %', _status USING ERRCODE='22023';
  END IF;
  IF _prev.status IN ('satisfied','waived') AND _status <> 'open' THEN
    RAISE EXCEPTION 'a closed condition must be reopened before it can move to %', _status
      USING ERRCODE='22023';
  END IF;

  IF _status = 'satisfied' THEN
    IF _prev.evidence_type IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.fp_condition_evidence
       WHERE condition_id = _condition_id AND review_state = 'accepted') THEN
      RAISE EXCEPTION 'condition requires accepted evidence before it can be satisfied'
        USING ERRCODE='22023';
    END IF;
  ELSIF _status = 'waived' THEN
    IF _note IS NULL OR length(btrim(_note)) < 5 THEN
      RAISE EXCEPTION 'waiver reason must be at least 5 characters' USING ERRCODE='22023';
    END IF;
  ELSIF _status = 'breached' THEN
    IF _note IS NULL OR length(btrim(_note)) < 5 THEN
      RAISE EXCEPTION 'breach rationale must be at least 5 characters' USING ERRCODE='22023';
    END IF;
  ELSIF _status = 'open' AND _prev.status IN ('satisfied','waived') THEN
    IF _note IS NULL OR length(btrim(_note)) < 5 THEN
      RAISE EXCEPTION 'reopen reason must be at least 5 characters' USING ERRCODE='22023';
    END IF;
  END IF;

  UPDATE public.fp_conditions
     SET status = _status,
         satisfied_at = CASE WHEN _status IN ('satisfied','waived') THEN now()
                             WHEN _status = 'open' THEN NULL ELSE satisfied_at END,
         satisfied_by = CASE WHEN _status IN ('satisfied','waived') THEN _uid
                             WHEN _status = 'open' THEN NULL ELSE satisfied_by END,
         satisfaction_note = CASE WHEN _status = 'open' THEN NULL
                                  ELSE NULLIF(btrim(COALESCE(_note,'')),'') END,
         waiver_reason = CASE WHEN _status = 'waived' THEN btrim(_note)
                              WHEN _status = 'open' THEN NULL ELSE waiver_reason END
   WHERE id = _condition_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.condition.status_changed','fp_condition',_condition_id,
    jsonb_build_object('status',_prev.status),
    jsonb_build_object('status',_status),
    jsonb_build_object('individual_id',_prev.individual_id,
                       'determination_id',_prev.determination_id,'condition_id',_condition_id),
    NULLIF(btrim(COALESCE(_note,'')),''),
    CASE WHEN _status IN ('satisfied','waived') THEN 'APPROVE' ELSE 'WORKFLOW_TRANSITION' END::compliance_audit_action);
  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_condition_record_reminder(
  _condition_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_conditions','edit');
  SELECT * INTO _prev FROM public.fp_conditions WHERE id = _condition_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'condition not found' USING ERRCODE='22023'; END IF;
  IF _prev.status IN ('satisfied','waived') THEN
    RAISE EXCEPTION 'condition is % — no reminder is due', _prev.status USING ERRCODE='22023';
  END IF;

  INSERT INTO public.fp_monitoring_events (
    individual_id, determination_id, event_type, severity, summary, detail)
  VALUES (
    _prev.individual_id, _prev.determination_id, 'condition_due', 'low',
    'Condition due on ' || COALESCE(_prev.due_date::text,'(no date)') || ': ' || left(COALESCE(_prev.description,''),200),
    jsonb_build_object('condition_id',_condition_id,'due_date',_prev.due_date,'reminder',true,'manual',true));

  UPDATE public.fp_conditions SET reminder_sent_at = now()
   WHERE id = _condition_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.condition.reminder_sent','fp_condition',_condition_id, NULL,
    jsonb_build_object('reminder_sent_at',_row.reminder_sent_at),
    jsonb_build_object('individual_id',_prev.individual_id,'condition_id',_condition_id),
    NULL,'NOTIFICATION_SENT');
  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_condition_evidence_submit(
  _condition_id uuid,
  _file_path text,
  _file_name text,
  _file_size integer DEFAULT NULL,
  _description text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _cond record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper','upload_documents');
  IF COALESCE(btrim(_file_path),'') = '' OR COALESCE(btrim(_file_name),'') = '' THEN
    RAISE EXCEPTION 'evidence file path and name are required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO _cond FROM public.fp_conditions WHERE id = _condition_id;
  IF _cond IS NULL THEN RAISE EXCEPTION 'condition not found' USING ERRCODE='22023'; END IF;
  IF _cond.status IN ('satisfied','waived') THEN
    RAISE EXCEPTION 'condition is % — evidence can no longer be submitted', _cond.status USING ERRCODE='22023';
  END IF;

  INSERT INTO public.fp_condition_evidence (
    condition_id, individual_id, regulator_id, file_path, file_name, file_size,
    description, submitted_by, review_state)
  VALUES (
    _condition_id, _cond.individual_id,
    (SELECT regulator_id FROM public.fp_individuals WHERE id = _cond.individual_id),
    btrim(_file_path), btrim(_file_name), _file_size,
    NULLIF(btrim(COALESCE(_description,'')),''), _uid, 'pending')
  RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.condition.evidence_submitted','fp_condition',_condition_id, NULL,
    jsonb_build_object('evidence_id',_row.id,'file_name',_row.file_name,'review_state','pending'),
    jsonb_build_object('individual_id',_cond.individual_id,'condition_id',_condition_id),
    NULL,'CREATE');
  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_condition_evidence_review(
  _evidence_id uuid, _review_state text, _review_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_conditions','approve');
  IF _review_state NOT IN ('accepted','rejected') THEN
    RAISE EXCEPTION 'invalid evidence review state %', _review_state USING ERRCODE='22023';
  END IF;
  SELECT * INTO _prev FROM public.fp_condition_evidence WHERE id = _evidence_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'evidence not found' USING ERRCODE='22023'; END IF;
  IF COALESCE(_prev.review_state,'pending') <> 'pending' THEN
    RAISE EXCEPTION 'evidence has already been reviewed as %', _prev.review_state USING ERRCODE='22023';
  END IF;
  IF _prev.submitted_by = _uid THEN
    RAISE EXCEPTION 'evidence cannot be reviewed by the person who submitted it' USING ERRCODE='42501';
  END IF;
  IF _review_state = 'rejected' AND (_review_note IS NULL OR length(btrim(_review_note)) < 5) THEN
    RAISE EXCEPTION 'rejection note must be at least 5 characters' USING ERRCODE='22023';
  END IF;

  UPDATE public.fp_condition_evidence
     SET review_state = _review_state, reviewed_by = _uid, reviewed_at = now(),
         review_note = NULLIF(btrim(COALESCE(_review_note,'')),'')
   WHERE id = _evidence_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.condition.evidence_reviewed','fp_condition',_prev.condition_id,
    jsonb_build_object('review_state','pending'),
    jsonb_build_object('evidence_id',_evidence_id,'review_state',_review_state),
    jsonb_build_object('individual_id',_prev.individual_id,'condition_id',_prev.condition_id),
    NULLIF(btrim(COALESCE(_review_note,'')),''),
    CASE WHEN _review_state = 'accepted' THEN 'APPROVE' ELSE 'REJECT' END::compliance_audit_action);
  RETURN to_jsonb(_row);
END; $fn$;

-- ============================================================
-- 5. COMMITTEE AUTHORITY
-- ============================================================

CREATE OR REPLACE FUNCTION public.fp_committee_cast_vote(
  _assessment_id uuid, _vote text, _justification text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _assess record; _member record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_committee','cast_weighted_vote');
  IF _vote NOT IN ('approve','conditional','reject','abstain') THEN
    RAISE EXCEPTION 'invalid vote %', _vote USING ERRCODE='22023';
  END IF;
  SELECT * INTO _assess FROM public.fp_assessments WHERE id = _assessment_id;
  IF _assess IS NULL THEN RAISE EXCEPTION 'assessment not found' USING ERRCODE='22023'; END IF;
  IF _assess.committee_id IS NULL THEN
    RAISE EXCEPTION 'assessment is not routed to a committee' USING ERRCODE='22023';
  END IF;
  IF _assess.status <> 'awaiting_committee' THEN
    RAISE EXCEPTION 'assessment is "%" — voting is only open while Awaiting Committee', _assess.status
      USING ERRCODE='22023';
  END IF;

  SELECT * INTO _member FROM public.fp_committee_members
   WHERE committee_id = _assess.committee_id AND user_id = _uid AND is_active;
  IF _member IS NULL THEN
    RAISE EXCEPTION 'you are not an active member of this committee' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fp_committee_votes
              WHERE assessment_id = _assessment_id AND member_id = _member.id) THEN
    RAISE EXCEPTION 'you have already voted on this assessment' USING ERRCODE='22023';
  END IF;
  IF _vote IN ('reject','conditional') AND (_justification IS NULL OR length(btrim(_justification)) < 10) THEN
    RAISE EXCEPTION 'a justification of at least 10 characters is required for reject/conditional votes'
      USING ERRCODE='22023';
  END IF;

  INSERT INTO public.fp_committee_votes (
    assessment_id, committee_id, member_id, vote, justification, weight)
  VALUES (
    _assessment_id, _assess.committee_id, _member.id, _vote,
    NULLIF(btrim(COALESCE(_justification,'')),''), _member.vote_weight)
  RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.committee.vote_cast','fp_committee_vote',_row.id, NULL,
    jsonb_build_object('vote',_vote,'weight',_member.vote_weight),
    jsonb_build_object('individual_id',_assess.individual_id,'assessment_id',_assessment_id,
                       'committee_id',_assess.committee_id),
    NULLIF(btrim(COALESCE(_justification,'')),''),'APPROVE');
  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_committee_member_add(
  _committee_id uuid, _user_id uuid, _member_role text DEFAULT 'member', _vote_weight numeric DEFAULT 1
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_committee','edit');
  IF _vote_weight IS NULL OR _vote_weight <= 0 THEN
    RAISE EXCEPTION 'vote weight must be greater than zero' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fp_committees WHERE id = _committee_id) THEN
    RAISE EXCEPTION 'committee not found' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN
    RAISE EXCEPTION 'user not found' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fp_committee_members
              WHERE committee_id = _committee_id AND user_id = _user_id AND is_active) THEN
    RAISE EXCEPTION 'user is already an active member of this committee' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.fp_committee_members (committee_id, user_id, member_role, vote_weight, is_active)
  VALUES (_committee_id, _user_id, COALESCE(NULLIF(btrim(_member_role),''),'member'), _vote_weight, true)
  RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.committee.member_added','fp_committee',_committee_id, NULL,
    jsonb_build_object('member_id',_row.id,'user_id',_user_id,'member_role',_row.member_role,
                       'vote_weight',_vote_weight),
    jsonb_build_object('committee_id',_committee_id),NULL,'CREATE');
  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_committee_member_set_weight(
  _member_id uuid, _vote_weight numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_committee','edit');
  IF _vote_weight IS NULL OR _vote_weight <= 0 THEN
    RAISE EXCEPTION 'vote weight must be greater than zero' USING ERRCODE='22023';
  END IF;
  SELECT * INTO _prev FROM public.fp_committee_members WHERE id = _member_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'committee member not found' USING ERRCODE='22023'; END IF;

  UPDATE public.fp_committee_members SET vote_weight = _vote_weight
   WHERE id = _member_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.committee.member_weight_changed','fp_committee',_prev.committee_id,
    jsonb_build_object('member_id',_member_id,'vote_weight',_prev.vote_weight),
    jsonb_build_object('member_id',_member_id,'vote_weight',_vote_weight),
    jsonb_build_object('committee_id',_prev.committee_id),NULL,'UPDATE');
  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_committee_member_remove(
  _member_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _prev record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_committee','edit');
  SELECT * INTO _prev FROM public.fp_committee_members WHERE id = _member_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'committee member not found' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.fp_committee_votes WHERE member_id = _member_id) THEN
    RAISE EXCEPTION 'this member has cast votes and cannot be removed — deactivate them instead'
      USING ERRCODE='22023';
  END IF;

  DELETE FROM public.fp_committee_members WHERE id = _member_id;

  PERFORM public.fp_audit_event(
    'fp.committee.member_removed','fp_committee',_prev.committee_id,
    jsonb_build_object('member_id',_member_id,'user_id',_prev.user_id), NULL,
    jsonb_build_object('committee_id',_prev.committee_id),NULL,'DELETE');
  RETURN jsonb_build_object('ok',true,'member_id',_member_id);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_committee_set_casting_vote(
  _committee_id uuid, _member_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_committee','edit');
  SELECT * INTO _prev FROM public.fp_committees WHERE id = _committee_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'committee not found' USING ERRCODE='22023'; END IF;
  IF _member_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.fp_committee_members
        WHERE id = _member_id AND committee_id = _committee_id AND is_active) THEN
    RAISE EXCEPTION 'casting-vote holder must be an active member of this committee' USING ERRCODE='22023';
  END IF;

  UPDATE public.fp_committees SET casting_vote_member_id = _member_id
   WHERE id = _committee_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.committee.casting_vote_set','fp_committee',_committee_id,
    jsonb_build_object('casting_vote_member_id',_prev.casting_vote_member_id),
    jsonb_build_object('casting_vote_member_id',_member_id),
    jsonb_build_object('committee_id',_committee_id),NULL,'UPDATE');
  RETURN to_jsonb(_row);
END; $fn$;

-- ============================================================
-- 6. ONGOING MONITORING EVENTS
-- ============================================================

CREATE OR REPLACE FUNCTION public.fp_monitoring_event_raise(
  _individual_id uuid,
  _event_type text,
  _summary text,
  _severity text DEFAULT 'low',
  _determination_id uuid DEFAULT NULL,
  _detail jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_monitoring','create');
  IF COALESCE(btrim(_event_type),'') = '' OR COALESCE(btrim(_summary),'') = '' THEN
    RAISE EXCEPTION 'event type and summary are required' USING ERRCODE='22023';
  END IF;
  IF _severity NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION 'invalid severity %', _severity USING ERRCODE='22023';
  END IF;

  INSERT INTO public.fp_monitoring_events (
    individual_id, determination_id, event_type, severity, summary, detail)
  VALUES (_individual_id, _determination_id, btrim(_event_type), _severity, btrim(_summary), _detail)
  RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.monitoring.event_raised','fp_monitoring_event',_row.id, NULL,
    jsonb_build_object('event_type',_row.event_type,'severity',_severity),
    jsonb_build_object('individual_id',_individual_id,'determination_id',_determination_id),
    NULL,'CREATE');
  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_monitoring_event_acknowledge(
  _event_id uuid, _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_monitoring','edit');
  SELECT * INTO _prev FROM public.fp_monitoring_events WHERE id = _event_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'monitoring event not found' USING ERRCODE='22023'; END IF;
  IF _prev.acknowledged_at IS NOT NULL THEN
    RAISE EXCEPTION 'event has already been acknowledged' USING ERRCODE='22023';
  END IF;

  UPDATE public.fp_monitoring_events
     SET acknowledged_at = now(), acknowledged_by = _uid,
         acknowledgement_note = NULLIF(btrim(COALESCE(_note,'')),'')
   WHERE id = _event_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.monitoring.event_acknowledged','fp_monitoring_event',_event_id,
    jsonb_build_object('acknowledged',false), jsonb_build_object('acknowledged',true),
    jsonb_build_object('individual_id',_prev.individual_id),
    NULLIF(btrim(COALESCE(_note,'')),''),'UPDATE');
  RETURN to_jsonb(_row);
END; $fn$;

-- ============================================================
-- 7. EXECUTE GRANTS — signed-in staff only, never anon
-- ============================================================
DO $grants$
DECLARE _fn text;
BEGIN
  FOR _fn IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'fp_assessment_initiate','fp_assessment_set_status','fp_assessment_assign_committee',
         'fp_assessment_save_pq','fp_finding_disposition','fp_finding_escalate','fp_finding_assign',
         'fp_finding_save_note','fp_finding_set_evidence','fp_determination_record',
         'fp_condition_create','fp_condition_set_status','fp_condition_record_reminder',
         'fp_condition_evidence_submit','fp_condition_evidence_review','fp_committee_cast_vote',
         'fp_committee_member_add','fp_committee_member_set_weight','fp_committee_member_remove',
         'fp_committee_set_casting_vote','fp_monitoring_event_raise','fp_monitoring_event_acknowledge')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', _fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', _fn);
  END LOOP;
END $grants$;