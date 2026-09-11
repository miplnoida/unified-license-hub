-- =====================================================================
-- PCOMP-R2A (3/3) — exception operations, readiness and submission
-- integration, compatibility delegation, capability truth.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.supervisory_assessment_evidence_exception_request(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _aid uuid; _rule text; _scope text; _qid uuid; _did uuid;
        _rationale text; _eval jsonb; _d jsonb; _id uuid;
        _snap public.supervisory_assessment_policy_snapshot; _bound jsonb;
BEGIN
  _aid       := NULLIF(_payload->>'assessment_id','')::uuid;
  _rule      := upper(btrim(COALESCE(_payload->>'rule_code','')));
  _scope     := upper(btrim(COALESCE(_payload->>'scope_type','')));
  _qid       := NULLIF(_payload->>'question_id','')::uuid;
  _did       := NULLIF(_payload->>'dimension_id','')::uuid;
  _rationale := btrim(COALESCE(_payload->>'rationale',''));

  IF _aid IS NULL OR _rule = '' OR _scope = '' THEN
    RAISE EXCEPTION 'invalid_request: the assessment, the policy rule and its scope are all required'
      USING ERRCODE = '22023';
  END IF;
  IF length(_rationale) < 20 THEN
    RAISE EXCEPTION 'invalid_request: a written justification of at least 20 characters is required'
      USING ERRCODE = '22023';
  END IF;

  _uid := public.supervisory_assessment_execution_require_edit(_aid);

  SELECT * INTO _snap FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id = _aid;
  IF _snap.id IS NULL THEN
    RAISE EXCEPTION 'invalid_request: this assessment has no policy basis, so there is no evidence policy to except from'
      USING ERRCODE = '22023';
  END IF;
  SELECT x INTO _bound FROM jsonb_array_elements(_snap.components) x
   WHERE x->>'component_type' = 'EVIDENCE_POLICY';
  IF _bound IS NULL THEN
    RAISE EXCEPTION 'invalid_request: no evidence policy governs this assessment' USING ERRCODE = '22023';
  END IF;

  _eval := public.supervisory_assessment_evidence_policy_internal(_aid);
  SELECT x INTO _d FROM jsonb_array_elements(_eval->'decisions') x
   WHERE x->>'rule_code' = _rule AND x->>'scope_type' = _scope
     AND COALESCE(x->>'question_id','') = COALESCE(_qid::text,'')
     AND COALESCE(x->>'dimension_id','') = COALESCE(_did::text,'');
  IF _d IS NULL THEN
    RAISE EXCEPTION 'invalid_request: that policy rule does not apply to the scope requested' USING ERRCODE = '22023';
  END IF;
  IF (_d->>'decision') <> 'EXCEPTION_REQUIRED' THEN
    RAISE EXCEPTION 'invalid_request: an exception is not available here (the platform records this rule as %)',
      _d->>'decision' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.supervisory_assessment_evidence_exception(
    assessment_id, policy_component_id, policy_component_version, rule_code, scope_type,
    scope_reference, methodology_question_id, methodology_dimension_id, deficiency, rationale,
    requested_by)
  VALUES (_aid, (_bound->>'component_id')::uuid, COALESCE(_bound->>'component_version',''),
          _rule, _scope, NULLIF(_d->>'scope_reference',''), _qid, _did, _d, _rationale, _uid)
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
  VALUES (_aid, 'EVIDENCE_POLICY_EXCEPTION_REQUESTED', _rationale,
    jsonb_build_object('exception_id', _id, 'rule_code', _rule, 'scope_type', _scope,
                       'target_code', _d->>'target_code', 'deficiency', _d), _uid);

  RETURN jsonb_build_object('exception_id', _id, 'status','REQUESTED');
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_evidence_exception_request(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_evidence_exception_request(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_evidence_exception_decide(
  _exception_id uuid, _decision text, _rationale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _e public.supervisory_assessment_evidence_exception;
        _a public.supervisory_assessment; _actions text[]; _to text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;
  _to := upper(btrim(COALESCE(_decision,'')));
  IF _to NOT IN ('APPROVED','REJECTED','WITHDRAWN') THEN
    RAISE EXCEPTION 'invalid_request: the decision must be approved, rejected or withdrawn' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 20 THEN
    RAISE EXCEPTION 'invalid_request: a written reason of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _e FROM public.supervisory_assessment_evidence_exception WHERE id = _exception_id;
  IF _e.id IS NULL THEN RAISE EXCEPTION 'not_found: evidence exception' USING ERRCODE = '22023'; END IF;
  IF _e.status <> 'REQUESTED' THEN
    RAISE EXCEPTION 'invalid_state: this exception has already been decided' USING ERRCODE = '55000'; END IF;

  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _e.assessment_id;

  IF _to = 'WITHDRAWN' THEN
    IF _e.requested_by <> _uid THEN
      RAISE EXCEPTION 'not_authorized: only the officer who requested the exception may withdraw it'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    _actions := public.supervisory_domain_actions(_a.domain_code, 'approve');
    IF NOT public.is_super_admin(_uid) AND NOT public.has_any_permission(_uid, _actions) THEN
      RAISE EXCEPTION 'not_authorized: % required to decide an evidence policy exception',
        array_to_string(_actions,' or ') USING ERRCODE = '42501';
    END IF;
    PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);
    IF _e.requested_by = _uid THEN
      RAISE EXCEPTION 'not_authorized: an evidence policy exception cannot be decided by the officer who requested it'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM set_config('supervisory.evidence_exception_writer','on', true);
  UPDATE public.supervisory_assessment_evidence_exception
     SET status = _to, decided_by = _uid, decided_at = now(), decision_rationale = btrim(_rationale)
   WHERE id = _exception_id;
  PERFORM set_config('supervisory.evidence_exception_writer','', true);

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
  VALUES (_e.assessment_id, 'EVIDENCE_POLICY_EXCEPTION_' || _to, btrim(_rationale),
    jsonb_build_object('exception_id', _exception_id, 'rule_code', _e.rule_code,
                       'scope_type', _e.scope_type, 'scope_reference', _e.scope_reference,
                       'requested_by', _e.requested_by), _uid);

  RETURN jsonb_build_object('exception_id', _exception_id, 'status', _to);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_evidence_exception_decide(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_evidence_exception_decide(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_evidence_exceptions(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _out jsonb;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.supervisory_assessment_question_readable(auth.uid(), _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: assessment outside your supervisory authority' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', e.id, 'rule_code', e.rule_code, 'scope_type', e.scope_type,
           'scope_reference', e.scope_reference,
           'question_id', e.methodology_question_id, 'question_code', q.question_code,
           'dimension_id', e.methodology_dimension_id, 'dimension_code', d.dimension_code,
           'status', e.status, 'rationale', e.rationale, 'deficiency', e.deficiency,
           'policy_component_version', e.policy_component_version,
           'requested_by', e.requested_by, 'requested_at', e.requested_at,
           'decided_by', e.decided_by, 'decided_at', e.decided_at,
           'decision_rationale', e.decision_rationale) ORDER BY e.requested_at DESC), '[]'::jsonb)
    INTO _out
    FROM public.supervisory_assessment_evidence_exception e
    LEFT JOIN public.supervisory_methodology_question q ON q.id = e.methodology_question_id
    LEFT JOIN public.supervisory_methodology_dimension d ON d.id = e.methodology_dimension_id
   WHERE e.assessment_id = _assessment_id;
  RETURN _out;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_evidence_exceptions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_evidence_exceptions(uuid) TO authenticated;

-- ------------------------------------------------------- readiness ------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_readiness_internal(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _a public.supervisory_assessment; _gaps jsonb; _facts jsonb;
        _plan_rows int; _checks jsonb := '[]'::jsonb; _blocking int := 0;
        _unanswered jsonb; _obs jsonb; _ev jsonb; _dim_total int; _dim_done int;
        _dq int; _ovr int; _pol jsonb; _pol_items jsonb; _pol_blocking int;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;

  _gaps := public.supervisory_assessment_question_gaps_internal(_assessment_id);
  _facts := public.supervisory_assessment_fact_gaps_internal(_assessment_id);
  SELECT count(*) INTO _plan_rows FROM public.supervisory_assessment_question_plan
   WHERE assessment_id = _assessment_id;

  SELECT COALESCE(jsonb_agg(g), '[]'::jsonb) INTO _unanswered
    FROM jsonb_array_elements(_gaps) g WHERE g->>'reason' = 'unanswered';
  SELECT COALESCE(jsonb_agg(g), '[]'::jsonb) INTO _obs
    FROM jsonb_array_elements(_gaps) g WHERE g->>'reason' IN ('observation_missing','na_rationale_missing');
  SELECT COALESCE(jsonb_agg(g), '[]'::jsonb) INTO _ev
    FROM jsonb_array_elements(_gaps) g WHERE g->>'reason' = 'evidence_missing';

  SELECT count(*), count(*) FILTER (WHERE residual_rating IS NOT NULL OR score IS NOT NULL)
    INTO _dim_total, _dim_done
    FROM public.supervisory_assessment_dimension
   WHERE assessment_id = _assessment_id AND COALESCE(is_applicable, true);

  SELECT count(*) FILTER (WHERE source_reference IS NULL AND source_object_id IS NULL),
         count(*) FILTER (WHERE officer_overridden)
    INTO _dq, _ovr
    FROM public.supervisory_assessment_fact WHERE assessment_id = _assessment_id;

  _pol := public.supervisory_assessment_evidence_policy_internal(_assessment_id);
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO _pol_items
    FROM jsonb_array_elements(_pol->'decisions') x WHERE (x->>'blocking')::boolean;
  _pol_blocking := public.jsonb_array_len_safe(_pol_items);

  _checks := jsonb_build_array(
    jsonb_build_object('key','METHODOLOGY_BINDING',
      'label','Methodology version attached',
      'status', CASE WHEN _a.methodology_id IS NOT NULL THEN 'OK' ELSE 'ATTENTION' END,
      'blocking', false, 'count', 0,
      'detail', CASE WHEN _a.methodology_id IS NOT NULL THEN 'Bound to the exact methodology version used at creation.'
                     ELSE 'No methodology version is attached to this assessment.' END,
      'items','[]'::jsonb),
    jsonb_build_object('key','QUESTION_PLAN',
      'label','Governed question plan',
      'status', CASE WHEN _plan_rows > 0 THEN 'OK' ELSE 'ATTENTION' END,
      'blocking', false, 'count', _plan_rows,
      'detail', CASE WHEN _plan_rows > 0
                     THEN format('%s question(s) resolved in the governed plan.', _plan_rows)
                     ELSE 'No governed question plan is resolved; all mandatory methodology questions apply.' END,
      'items','[]'::jsonb),
    jsonb_build_object('key','QUESTION_ANSWERS','label','Questions answered',
      'status', CASE WHEN public.jsonb_array_len_safe(_unanswered) = 0 THEN 'OK' ELSE 'BLOCKING' END,
      'blocking', public.jsonb_array_len_safe(_unanswered) > 0,
      'count', public.jsonb_array_len_safe(_unanswered),
      'detail','Every mandatory question in scope must carry a supervisory answer.',
      'items', _unanswered),
    jsonb_build_object('key','OBSERVATIONS','label','Observations and not-applicable reasons',
      'status', CASE WHEN public.jsonb_array_len_safe(_obs) = 0 THEN 'OK' ELSE 'BLOCKING' END,
      'blocking', public.jsonb_array_len_safe(_obs) > 0,
      'count', public.jsonb_array_len_safe(_obs),
      'detail','A written observation or not-applicable reason is required where the methodology says so.',
      'items', _obs),
    jsonb_build_object('key','EVIDENCE','label','Governed evidence basis',
      'status', CASE WHEN public.jsonb_array_len_safe(_ev) = 0 THEN 'OK' ELSE 'BLOCKING' END,
      'blocking', public.jsonb_array_len_safe(_ev) > 0,
      'count', public.jsonb_array_len_safe(_ev),
      'detail','Questions the methodology marks as evidence-based must cite governed evidence.',
      'items', _ev),
    jsonb_build_object('key','EVIDENCE_POLICY','label','Evidence policy of the governing profile',
      'status', CASE WHEN (_pol->>'status') <> 'EVALUATED' THEN 'UNKNOWN'
                     WHEN _pol_blocking = 0 THEN 'OK' ELSE 'BLOCKING' END,
      'blocking', _pol_blocking > 0,
      'count', _pol_blocking,
      'detail', CASE WHEN (_pol->>'status') <> 'EVALUATED' THEN _pol->>'reason'
                     ELSE format('Evidence policy %s %s decided %s requirement(s) for this assessment.',
                                 COALESCE(_pol->>'policy_component_code','(policy)'),
                                 COALESCE(_pol->>'policy_component_version',''),
                                 COALESCE(_pol->>'decision_count','0')) END,
      'items', _pol_items),
    jsonb_build_object('key','REQUIRED_FACTS','label','Required structured facts',
      'status', CASE WHEN public.jsonb_array_len_safe(_facts) = 0 THEN 'OK' ELSE 'BLOCKING' END,
      'blocking', public.jsonb_array_len_safe(_facts) > 0,
      'count', public.jsonb_array_len_safe(_facts),
      'detail','Facts the methodology requires for questions in scope must be recorded with provenance.',
      'items', _facts),
    jsonb_build_object('key','DIMENSION_RATINGS','label','Dimension ratings recorded',
      'status', CASE WHEN _dim_total = 0 THEN 'UNKNOWN'
                     WHEN _dim_done >= _dim_total THEN 'OK' ELSE 'ATTENTION' END,
      'blocking', false, 'count', GREATEST(_dim_total - _dim_done, 0),
      'detail', format('%s of %s applicable dimension(s) rated.', _dim_done, _dim_total),
      'items','[]'::jsonb),
    jsonb_build_object('key','DATA_QUALITY','label','Fact provenance and officer changes',
      'status', CASE WHEN _dq > 0 THEN 'ATTENTION' ELSE 'OK' END,
      'blocking', false, 'count', _dq,
      'detail', format('%s recorded fact(s) without a source reference; %s officer change(s) on prefilled values.', _dq, _ovr),
      'items','[]'::jsonb)
  );

  SELECT count(*) INTO _blocking FROM jsonb_array_elements(_checks) c
   WHERE (c->>'blocking')::boolean;

  RETURN jsonb_build_object(
    'assessment_id', _assessment_id,
    'status', _a.status,
    'methodology_id', _a.methodology_id,
    'plan_mode', CASE WHEN _plan_rows > 0 THEN 'GOVERNED_PLAN' ELSE 'LEGACY_ALL_MANDATORY' END,
    'checks', _checks,
    'blocking_check_count', _blocking,
    'outstanding_question_count', public.jsonb_array_len_safe(_gaps),
    'outstanding_fact_count', public.jsonb_array_len_safe(_facts),
    'evidence_policy', _pol - 'decisions',
    'evidence_policy_status', _pol->>'status',
    'evidence_policy_blocking_count', _pol_blocking,
    'can_submit', _blocking = 0,
    'submission_gate', CASE WHEN _blocking = 0 THEN 'READY' ELSE 'BLOCKED' END,
    'evaluated_at', now());
END $$;

-- ---------------------------------------------------- submission gate ---
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_completeness_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _gaps jsonb; _n integer; _detail text; _facts jsonb; _fn integer; _pol jsonb;
BEGIN
  IF NEW.status = 'submitted' AND COALESCE(OLD.status,'') <> 'submitted' THEN
    _gaps := public.supervisory_assessment_question_gaps_internal(NEW.id);
    _n := public.jsonb_array_len_safe(_gaps);
    IF _n > 0 THEN
      SELECT string_agg(format('%s %s (%s)', g->>'dimension_code', g->>'question_code', g->>'reason'), '; ')
        INTO _detail
        FROM jsonb_array_elements(_gaps) g;
      RAISE EXCEPTION 'mandatory_questions_incomplete: % mandatory supervisory question(s) are outstanding — %', _n, _detail
        USING ERRCODE = '22023';
    END IF;
    _facts := public.supervisory_assessment_fact_gaps_internal(NEW.id);
    _fn := public.jsonb_array_len_safe(_facts);
    IF _fn > 0 THEN
      SELECT string_agg(format('%s (%s)', f->>'fact_code', f->>'reason'), '; ') INTO _detail
        FROM jsonb_array_elements(_facts) f;
      RAISE EXCEPTION 'required_facts_incomplete: % required fact(s) are outstanding — %', _fn, _detail
        USING ERRCODE = '22023';
    END IF;

    _pol := public.supervisory_assessment_evidence_policy_internal(NEW.id);
    IF (_pol->>'status') = 'EVALUATED' AND COALESCE((_pol->>'blocking_count')::int,0) > 0 THEN
      SELECT string_agg(format('%s %s (%s)', x->>'rule_code', x->>'target_code',
               COALESCE((SELECT string_agg(r->>'code', ', ') FROM jsonb_array_elements(x->'reasons') r),
                        x->>'decision')), '; ')
        INTO _detail
        FROM jsonb_array_elements(_pol->'decisions') x WHERE (x->>'blocking')::boolean;
      RAISE EXCEPTION 'evidence_policy_unsatisfied: % evidence policy requirement(s) are outstanding — %',
        (_pol->>'blocking_count')::int, _detail USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- ------------------------------------------------- compatibility --------
CREATE OR REPLACE FUNCTION public.supervisory_evidence_policy_compatibility(
  _profile_id uuid, _component_id uuid, _methodology_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $function$
DECLARE _content jsonb; _rules jsonb; _r jsonb; _f jsonb := '[]'::jsonb;
        _scopes jsonb; _kinds jsonb; _txt text; _ok boolean;
BEGIN
  SELECT content INTO _content FROM public.supervisory_policy_component WHERE id = _component_id;
  _rules  := public.supervisory_evidence_policy_rules(_content);
  _scopes := public.supervisory_policy_vocabulary('EVIDENCE_SCOPE');
  _kinds  := public.supervisory_policy_vocabulary('EVIDENCE_KIND');

  IF _methodology_id IS NULL THEN
    _f := _f || jsonb_build_object('code','EVIDENCE_POLICY_WITHOUT_METHODOLOGY','severity','ERROR',
      'component_type','EVIDENCE_POLICY',
      'message','Evidence policy may only qualify a bound methodology; the methodology remains the single source of questions and dimensions.');
  END IF;

  FOR _r IN SELECT * FROM jsonb_array_elements(_rules) LOOP
    IF NOT (_scopes @> to_jsonb(COALESCE(_r->>'scope_type',''))) THEN
      _f := _f || jsonb_build_object('code','EVIDENCE_SCOPE_UNKNOWN','severity','ERROR',
        'component_type','EVIDENCE_POLICY',
        'message','Evidence scope '||COALESCE(NULLIF(_r->>'scope_type',''),'(blank)')||' is not a canonical evidence scope.');
    END IF;

    FOR _txt IN SELECT jsonb_array_elements_text(
                  COALESCE(_r->'permitted_source_kinds','[]'::jsonb)
                  || COALESCE(_r->'required_source_kinds','[]'::jsonb)) LOOP
      IF NOT (_kinds @> to_jsonb(_txt)) THEN
        _f := _f || jsonb_build_object('code','EVIDENCE_KIND_UNKNOWN','severity','ERROR',
          'component_type','EVIDENCE_POLICY',
          'message','Evidence kind '||_txt||' is not in the canonical evidence basis vocabulary.');
      END IF;
    END LOOP;

    IF COALESCE(_r->>'scope_reference','') <> '' AND _methodology_id IS NOT NULL THEN
      IF (_r->>'scope_type') = 'QUESTION' THEN
        SELECT EXISTS (SELECT 1 FROM public.supervisory_methodology_question q
                        WHERE q.methodology_id = _methodology_id
                          AND upper(q.question_code) = _r->>'scope_reference') INTO _ok;
      ELSIF (_r->>'scope_type') = 'DIMENSION' THEN
        SELECT EXISTS (SELECT 1 FROM public.supervisory_methodology_dimension d
                        WHERE d.methodology_id = _methodology_id
                          AND upper(d.dimension_code) = _r->>'scope_reference') INTO _ok;
      ELSE
        _ok := false;
      END IF;
      IF NOT _ok THEN
        _f := _f || jsonb_build_object('code','EVIDENCE_SCOPE_REFERENCE_UNKNOWN','severity','ERROR',
          'component_type','EVIDENCE_POLICY',
          'message','Evidence rule '||(_r->>'rule_code')||' names '||(_r->>'scope_reference')||
            ', which is not a '||lower(COALESCE(_r->>'scope_type','scope'))||' of the bound methodology.');
      END IF;
    END IF;

    IF jsonb_array_length(COALESCE(_r->'required_source_kinds','[]'::jsonb)) > 0
       AND (_r->>'evidence_requirement') <> 'REQUIRED' THEN
      _f := _f || jsonb_build_object('code','EVIDENCE_REQUIREMENT_INCONSISTENT','severity','ERROR',
        'component_type','EVIDENCE_POLICY',
        'message','Evidence rule '||(_r->>'rule_code')||' names required kinds of evidence but does not require evidence.');
    END IF;
  END LOOP;

  RETURN _f;
END $function$;
REVOKE ALL ON FUNCTION public.supervisory_evidence_policy_compatibility(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_evidence_policy_compatibility(uuid, uuid, uuid) TO authenticated, service_role;

DO $do$
DECLARE _def text; _new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'supervisory_policy_profile_compatibility';
  IF _def IS NULL THEN
    RAISE EXCEPTION 'supervisory_policy_profile_compatibility is missing';
  END IF;
  IF position('supervisory_evidence_policy_compatibility' in _def) > 0 THEN
    RETURN;
  END IF;
  _new := regexp_replace(_def,
    'ELSIF _row\.component_type = ''EVIDENCE_POLICY'' THEN.*?(?=ELSIF _row\.component_type = ''JUDGEMENT_POLICY'' THEN)',
    'ELSIF _row.component_type = ''EVIDENCE_POLICY'' THEN' || E'\n' ||
    '      _f := _f || public.supervisory_evidence_policy_compatibility(_profile_id, _row.id, _meth_id);'
    || E'\n\n    ');
  IF position('supervisory_evidence_policy_compatibility' in _new) = 0 THEN
    RAISE EXCEPTION 'could not delegate the evidence policy compatibility branch';
  END IF;
  EXECUTE _new;
END $do$;

-- ------------------------------------------------- capability truth -----
UPDATE public.supervisory_policy_component_type
   SET is_runtime_consumed = true,
       is_certified = true,
       capability_note = 'Evaluated by the platform for every assessment that pins an evidence policy in its immutable policy basis; the decision drives the canonical readiness contract and the submission gate.'
 WHERE component_type = 'EVIDENCE_POLICY';