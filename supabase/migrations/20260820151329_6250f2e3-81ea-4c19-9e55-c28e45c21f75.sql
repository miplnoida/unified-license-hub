-- A1 F&P cluster — adjustments required by actual UI callers.
-- 1. Conditional determinations: the canonical rule layer
--    (fp_check_determination_finalize) does NOT require conditions to exist at
--    determination time; the UI records the decision and then prompts the
--    officer to add conditions through the governed fp_condition_create path.
--    The RPC must not invent a stricter rule than the canonical one.
-- 2. 'needs_review' is a real disposition the screening UI offers (send back
--    for further review) — it records a reason but does NOT resolve the
--    finding, so resolved_at/resolved_by stay null.
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
  IF _assess.status NOT IN ('submitted','awaiting_committee') THEN
    RAISE EXCEPTION 'This assessment is currently "%" — a determination can only be recorded once it reaches Submitted or Awaiting Committee.',
      _assess.status USING ERRCODE='22023';
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
    'fp.determination.' || _outcome,'fp_determination',_row.id, NULL,
    jsonb_build_object('outcome',_outcome,'regulator_id',_lens,'supersedes_id',_prior.id,
                       'is_committee_override',COALESCE(_is_committee_override,false),
                       'conditions_created',_created_conditions),
    jsonb_build_object('individual_id',_individual_id,'assessment_id',_assessment_id,
                       'determination_id',_row.id,'regulator_id',_lens),
    CASE WHEN _is_committee_override THEN btrim(_override_reason) ELSE btrim(_rationale) END,
    CASE WHEN _is_committee_override THEN 'OVERRIDE' ELSE 'APPROVE' END::compliance_audit_action);

  RETURN to_jsonb(_row) || jsonb_build_object('conditions_created',_created_conditions);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_finding_disposition(
  _finding_id uuid,
  _resolution_status text,
  _reason text,
  _raw_payload jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _prev record; _row record; _false boolean; _resolves boolean;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_screening','record_adverse_findings');
  IF _resolution_status NOT IN ('true_positive','false_positive','confirmed','cleared','dismissed','needs_review') THEN
    RAISE EXCEPTION 'invalid finding disposition %', _resolution_status USING ERRCODE='22023';
  END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO _prev FROM public.fp_findings WHERE id = _finding_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'finding not found' USING ERRCODE='22023'; END IF;
  IF _prev.resolved_at IS NOT NULL AND _prev.resolution_status = _resolution_status THEN
    RAISE EXCEPTION 'finding is already dispositioned as %', _prev.resolution_status USING ERRCODE='22023';
  END IF;

  _resolves := _resolution_status <> 'needs_review';
  _false := _resolution_status IN ('false_positive','cleared');

  UPDATE public.fp_findings
     SET resolution_status = _resolution_status,
         resolution_reason = btrim(_reason),
         is_false_positive = CASE WHEN _resolves THEN _false ELSE is_false_positive END,
         review_note = btrim(_reason),
         reviewed_by = _uid, reviewed_at = now(),
         resolved_by = CASE WHEN _resolves THEN _uid ELSE NULL END,
         resolved_at = CASE WHEN _resolves THEN now() ELSE NULL END,
         raw_payload = COALESCE(_raw_payload, raw_payload)
   WHERE id = _finding_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    CASE WHEN _resolves THEN 'fp.finding.resolved' ELSE 'fp.finding.sent_for_review' END,
    'fp_finding',_finding_id,
    jsonb_build_object('resolution_status',_prev.resolution_status,
                       'is_false_positive',_prev.is_false_positive),
    jsonb_build_object('resolution_status',_resolution_status,'is_false_positive',_row.is_false_positive),
    jsonb_build_object('individual_id',_prev.individual_id,'assessment_id',_prev.assessment_id,
                       'finding_id',_finding_id,'severity',_prev.severity),
    btrim(_reason),
    CASE WHEN _false THEN 'OVERRIDE' WHEN _resolves THEN 'APPROVE' ELSE 'WORKFLOW_TRANSITION' END::compliance_audit_action);
  RETURN to_jsonb(_row);
END; $fn$;

-- False-positive override toggle: a materially different transition from a
-- formal disposition — it flips the engine's verdict on an OPEN finding (and
-- can restore it) without resolving the finding.
CREATE OR REPLACE FUNCTION public.fp_finding_set_false_positive(
  _finding_id uuid, _is_false_positive boolean, _justification text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _uid uuid := auth.uid(); _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_screening','record_adverse_findings');
  SELECT * INTO _prev FROM public.fp_findings WHERE id = _finding_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'finding not found' USING ERRCODE='22023'; END IF;
  IF _prev.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'this finding is already resolved — reopen it before changing the false-positive flag'
      USING ERRCODE='22023';
  END IF;
  IF _is_false_positive AND (_justification IS NULL OR length(btrim(_justification)) < 10) THEN
    RAISE EXCEPTION 'a false-positive override requires a written justification (min 10 characters)'
      USING ERRCODE='22023';
  END IF;

  UPDATE public.fp_findings
     SET is_false_positive = _is_false_positive,
         reviewed_by = _uid, reviewed_at = now()
   WHERE id = _finding_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    CASE WHEN _is_false_positive THEN 'fp.finding.false_positive' ELSE 'fp.finding.restored' END,
    'fp_finding',_finding_id,
    jsonb_build_object('is_false_positive',_prev.is_false_positive),
    jsonb_build_object('is_false_positive',_is_false_positive),
    jsonb_build_object('individual_id',_prev.individual_id,'assessment_id',_prev.assessment_id,
                       'finding_id',_finding_id,'severity',_prev.severity),
    NULLIF(btrim(COALESCE(_justification,'')),''),
    CASE WHEN _is_false_positive THEN 'OVERRIDE' ELSE 'UPDATE' END::compliance_audit_action);
  RETURN to_jsonb(_row);
END; $fn$;

-- Committee definition itself is decision authority (quorum + threshold), so
-- creating/retuning one is governed, not ordinary configuration.
CREATE OR REPLACE FUNCTION public.fp_committee_create(
  _name text,
  _quorum integer,
  _approval_threshold_pct numeric,
  _description text DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_committee','create');
  IF COALESCE(btrim(_name),'') = '' THEN
    RAISE EXCEPTION 'committee name is required' USING ERRCODE='22023';
  END IF;
  IF _quorum IS NULL OR _quorum < 1 THEN
    RAISE EXCEPTION 'quorum must be at least 1' USING ERRCODE='22023';
  END IF;
  IF _approval_threshold_pct IS NULL OR _approval_threshold_pct <= 0 OR _approval_threshold_pct > 100 THEN
    RAISE EXCEPTION 'approval threshold must be between 1 and 100 percent' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.fp_committees (name, description, regulator_id, quorum, approval_threshold_pct, is_active)
  VALUES (btrim(_name), NULLIF(btrim(COALESCE(_description,'')),''), _regulator_id,
          _quorum, _approval_threshold_pct, true)
  RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.committee.created','fp_committee',_row.id, NULL,
    jsonb_build_object('name',_row.name,'quorum',_quorum,'approval_threshold_pct',_approval_threshold_pct,
                       'regulator_id',_regulator_id),
    jsonb_build_object('committee_id',_row.id),NULL,'CREATE');
  RETURN to_jsonb(_row);
END; $fn$;

CREATE OR REPLACE FUNCTION public.fp_committee_update(
  _committee_id uuid,
  _name text DEFAULT NULL,
  _quorum integer DEFAULT NULL,
  _approval_threshold_pct numeric DEFAULT NULL,
  _description text DEFAULT NULL,
  _is_active boolean DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL,
  _clear_regulator boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_committee','edit');
  SELECT * INTO _prev FROM public.fp_committees WHERE id = _committee_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'committee not found' USING ERRCODE='22023'; END IF;
  IF _quorum IS NOT NULL AND _quorum < 1 THEN
    RAISE EXCEPTION 'quorum must be at least 1' USING ERRCODE='22023';
  END IF;
  IF _approval_threshold_pct IS NOT NULL
     AND (_approval_threshold_pct <= 0 OR _approval_threshold_pct > 100) THEN
    RAISE EXCEPTION 'approval threshold must be between 1 and 100 percent' USING ERRCODE='22023';
  END IF;

  UPDATE public.fp_committees
     SET name = COALESCE(NULLIF(btrim(COALESCE(_name,'')),''), name),
         description = COALESCE(NULLIF(btrim(COALESCE(_description,'')),''), description),
         quorum = COALESCE(_quorum, quorum),
         approval_threshold_pct = COALESCE(_approval_threshold_pct, approval_threshold_pct),
         is_active = COALESCE(_is_active, is_active),
         regulator_id = CASE WHEN _clear_regulator THEN NULL
                             ELSE COALESCE(_regulator_id, regulator_id) END
   WHERE id = _committee_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.committee.updated','fp_committee',_committee_id,
    jsonb_build_object('name',_prev.name,'quorum',_prev.quorum,
                       'approval_threshold_pct',_prev.approval_threshold_pct,
                       'is_active',_prev.is_active,'regulator_id',_prev.regulator_id),
    jsonb_build_object('name',_row.name,'quorum',_row.quorum,
                       'approval_threshold_pct',_row.approval_threshold_pct,
                       'is_active',_row.is_active,'regulator_id',_row.regulator_id),
    jsonb_build_object('committee_id',_committee_id),NULL,'UPDATE');
  RETURN to_jsonb(_row);
END; $fn$;

-- Deactivating/reactivating a member preserves their cast votes, which the
-- destructive remove path deliberately refuses to do.
CREATE OR REPLACE FUNCTION public.fp_committee_member_set_active(
  _member_id uuid, _is_active boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE _prev record; _row record;
BEGIN
  PERFORM public.enforce_permission('fit_and_proper_committee','edit');
  SELECT * INTO _prev FROM public.fp_committee_members WHERE id = _member_id FOR UPDATE;
  IF _prev IS NULL THEN RAISE EXCEPTION 'committee member not found' USING ERRCODE='22023'; END IF;

  UPDATE public.fp_committee_members SET is_active = _is_active
   WHERE id = _member_id RETURNING * INTO _row;

  PERFORM public.fp_audit_event(
    'fp.committee.member_active_changed','fp_committee',_prev.committee_id,
    jsonb_build_object('member_id',_member_id,'is_active',_prev.is_active),
    jsonb_build_object('member_id',_member_id,'is_active',_is_active),
    jsonb_build_object('committee_id',_prev.committee_id),NULL,'UPDATE');
  RETURN to_jsonb(_row);
END; $fn$;

DO $grants$
DECLARE _fn text;
BEGIN
  FOR _fn IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'fp_determination_record','fp_finding_disposition','fp_finding_set_false_positive',
         'fp_committee_create','fp_committee_update','fp_committee_member_set_active')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', _fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', _fn);
  END LOOP;
END $grants$;