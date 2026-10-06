CREATE OR REPLACE FUNCTION public.supervisory_assessment_approve(_assessment_id uuid, _rationale text, _effective_date date DEFAULT NULL::date, _next_review_date date DEFAULT NULL::date, _publish boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _a public.supervisory_assessment; _r public.supervisory_assessment_review_round;
        _run public.supervisory_assessment_calculation_run; _ovr public.supervisory_assessment_calculation_override;
        _blk jsonb; _bad text; _d uuid; _final text; _src text; _computed text; _pubres jsonb := NULL;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.approve','supervisory_spine.approve']);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id FOR UPDATE;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);
  IF _a.status NOT IN ('submitted','reviewed') THEN
    RAISE EXCEPTION 'transition_not_permitted: % cannot be approved', _a.status USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a decision rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  -- AML-CLOSE-07: the risk-of-record is effective from the moment it is published; scheduled
  -- (future) activation and backdated effect are not supported, so any other date is refused.
  IF _effective_date IS NOT NULL AND _effective_date > current_date THEN
    RAISE EXCEPTION 'effective_date_refused: future-dated risk-of-record is not supported (scheduled activation does not exist)' USING ERRCODE = '22023';
  END IF;
  IF _effective_date IS NOT NULL AND _effective_date < current_date THEN
    RAISE EXCEPTION 'effective_date_refused: backdated risk-of-record is not supported; publish a new governed assessment instead' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _r FROM public.supervisory_assessment_review_round
   WHERE assessment_id = _assessment_id AND outcome = 'PENDING' ORDER BY round_seq DESC LIMIT 1;
  IF _r.id IS NULL THEN
    RAISE EXCEPTION 'not_found: no open review round — the assessment must be submitted for review'
      USING ERRCODE = '22023';
  END IF;

  -- maker/checker: no technical administrator bypass
  IF _a.created_by = _uid OR _a.submitted_by = _uid OR _r.submitted_by = _uid THEN
    RAISE EXCEPTION 'not_authorized: the officer who prepared or submitted the assessment cannot approve it'
      USING ERRCODE = '42501';
  END IF;

  _blk := public.supervisory_assessment_review_blockers_internal(_assessment_id);
  SELECT string_agg(b->>'code', ', ') INTO _bad FROM jsonb_array_elements(_blk) b
   WHERE (b->>'blocking')::boolean AND b->>'stage' IN ('APPROVE','BOTH');
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'not_ready: approval refused (%)', _bad USING ERRCODE = '22023';
  END IF;

  -- the bound run is read, never recalculated
  IF _r.calculation_run_id IS NOT NULL THEN
    SELECT * INTO _run FROM public.supervisory_assessment_calculation_run WHERE id = _r.calculation_run_id;
    IF _run.id IS NULL THEN RAISE EXCEPTION 'not_found: submitted calculation run' USING ERRCODE = '22023'; END IF;
    IF _run.result_hash IS DISTINCT FROM _r.calculation_result_hash THEN
      RAISE EXCEPTION 'integrity: the submitted calculation run no longer matches the review record'
        USING ERRCODE = '22023';
    END IF;
    _computed := COALESCE(_run.residual_rating, _run.recommended_rating);
    _src := 'COMPUTED';
  ELSE
    _computed := _a.residual_rating;
    _src := 'LEGACY_OFFICER_RATING';
  END IF;
  _final := _computed;

  SELECT * INTO _ovr FROM public.supervisory_assessment_calculation_override
   WHERE assessment_id = _assessment_id AND status = 'APPROVED'
     AND (_r.calculation_run_id IS NULL OR run_id = _r.calculation_run_id)
   ORDER BY decided_at DESC NULLS LAST LIMIT 1;
  IF _ovr.id IS NOT NULL THEN
    IF _ovr.decided_by IS NULL OR _ovr.decided_by = _ovr.proposed_by THEN
      RAISE EXCEPTION 'not_authorized: a self-approved rating override cannot become the approved result'
        USING ERRCODE = '42501';
    END IF;
    IF _r.calculation_run_id IS NOT NULL AND _ovr.run_id IS DISTINCT FROM _r.calculation_run_id THEN
      RAISE EXCEPTION 'integrity: the approved override does not refer to the submitted calculation run'
        USING ERRCODE = '22023';
    END IF;
    _final := _ovr.proposed_rating;
    _src := 'APPROVED_OVERRIDE';
  END IF;

  PERFORM set_config('app.supervisory_review_writer','governed', true);
  INSERT INTO public.supervisory_assessment_approval_decision(
    assessment_id, review_round_id, round_seq, decision, methodology_id, methodology_version,
    programme_id, programme_version, question_plan_version, question_plan_snapshot,
    evidence_fact_state, calculation_basis, calculation_run_id, calculation_run_seq,
    calculation_inputs_hash, calculation_result_hash, computed_rating, override_id, override_rating,
    final_rating, final_rating_source, rationale, effective_date, decided_by, review_history)
  VALUES (_assessment_id, _r.id, _r.round_seq, 'APPROVED', _a.methodology_id, _a.methodology_version,
    _a.assessment_programme_id, _a.assessment_programme_version,
    COALESCE(_run.question_plan_version, _a.assessment_programme_version),
    jsonb_build_object(
      'plan_rows', (SELECT count(*) FROM public.supervisory_assessment_question_plan WHERE assessment_id=_assessment_id),
      'included', (SELECT count(*) FROM public.supervisory_assessment_question_plan
                    WHERE assessment_id=_assessment_id AND plan_state IN ('INCLUDED','REQUIRED'))),
    jsonb_build_object(
      'evidence', (SELECT count(*) FROM public.supervisory_assessment_evidence_basis WHERE assessment_id=_assessment_id),
      'facts', (SELECT count(*) FROM public.supervisory_assessment_fact WHERE assessment_id=_assessment_id),
      'responses', (SELECT count(*) FROM public.supervisory_assessment_question_response WHERE assessment_id=_assessment_id)),
    COALESCE(_r.calculation_basis,'LEGACY_NO_POLICY'), _r.calculation_run_id, _r.calculation_run_seq,
    _r.calculation_inputs_hash, _r.calculation_result_hash, _computed, _ovr.id, _ovr.proposed_rating,
    _final, _src, btrim(_rationale), COALESCE(_effective_date, current_date), _uid,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('round_seq', x.round_seq, 'outcome', x.outcome,
                 'submitted_by', x.submitted_by, 'outcome_reason', x.outcome_reason) ORDER BY x.round_seq)
                FROM public.supervisory_assessment_review_round x WHERE x.assessment_id=_assessment_id),'[]'::jsonb))
  RETURNING id INTO _d;

  UPDATE public.supervisory_assessment_review_round
     SET outcome='APPROVED', outcome_by=_uid, outcome_at=now(), outcome_reason=btrim(_rationale)
   WHERE id = _r.id;

  UPDATE public.supervisory_assessment
     SET status='approved', approved_by=_uid, approved_at=now(),
         reviewed_by=COALESCE(reviewed_by,_uid), reviewed_at=COALESCE(reviewed_at, now()),
         residual_rating=_final, approved_rating=_final, approved_rating_source=_src,
         approval_decision_id=_d,
         assessment_date=COALESCE(assessment_date, COALESCE(_effective_date, current_date)),
         next_review_date=COALESCE(_next_review_date, next_review_date), updated_at=now()
   WHERE id = _assessment_id;

  -- AML-CLOSE-07: risk-of-record succession (is_current / superseded) happens only at publication.
  PERFORM set_config('app.supervisory_review_writer','', true);

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, from_status, to_status, rationale, detail, actor_id)
  VALUES (_assessment_id,'APPROVAL', _a.status,'approved', btrim(_rationale),
          jsonb_build_object('decision_id',_d,'final_rating',_final,'final_rating_source',_src,
                             'calculation_run_id',_r.calculation_run_id), _uid);
  PERFORM public.log_compliance_audit('APPROVE','supervisory_assessment', _assessment_id,
    jsonb_build_object('status',_a.status), jsonb_build_object('status','approved','rating',_final),
    'Assessment ' || _a.reference || ' approved');

  IF COALESCE(_publish, true) THEN
    _pubres := public.supervisory_assessment_publish_internal(_assessment_id, _d, _uid,
      'Risk-of-record published on approval of ' || _a.reference);
  END IF;

  RETURN jsonb_build_object('assessment_id',_assessment_id,'decision_id',_d,'to_status','approved',
    'computed_rating',_computed,'override_rating',_ovr.proposed_rating,
    'final_rating',_final,'final_rating_source',_src,'publication',_pubres);
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_publish_internal(_assessment_id uuid, _decision_id uuid, _uid uuid, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _a public.supervisory_assessment; _d public.supervisory_assessment_approval_decision;
        _prev public.entity_risk_state; _pub uuid; _mv uuid; _existing uuid; _newer record;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  SELECT * INTO _d FROM public.supervisory_assessment_approval_decision WHERE id = _decision_id;
  IF _a.id IS NULL OR _d.id IS NULL OR _d.decision <> 'APPROVED' OR _d.assessment_id <> _a.id THEN
    RAISE EXCEPTION 'not_permitted: only an approved assessment decision can publish a risk-of-record'
      USING ERRCODE = '42501';
  END IF;
  IF _a.status <> 'approved' OR _a.approval_decision_id IS DISTINCT FROM _d.id THEN
    RAISE EXCEPTION 'not_permitted: the approval decision is not the current approval of this assessment'
      USING ERRCODE = '42501';
  END IF;
  IF _d.final_rating IS NULL OR _d.final_rating_source NOT IN ('COMPUTED','APPROVED_OVERRIDE','LEGACY_OFFICER_RATING') THEN
    RAISE EXCEPTION 'integrity: the approval decision has no valid final rating' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_super_admin(_uid)
     AND (_uid = _a.created_by OR _uid = _a.owner_id OR _uid = _a.submitted_by) THEN
    RAISE EXCEPTION 'not_authorized: the officer who prepared, owns or submitted the assessment cannot publish it'
      USING ERRCODE = '42501';
  END IF;
  IF _d.effective_date > current_date THEN
    RAISE EXCEPTION 'effective_date_refused: the approval is not yet effective; scheduled activation is not supported'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(_a.entity_id::text || ':' || _a.domain_code));
  SELECT id INTO _existing FROM public.supervisory_assessment_risk_publication
   WHERE approval_decision_id = _decision_id;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('publication_id', _existing, 'already_published', true);
  END IF;

  SELECT * INTO _prev FROM public.entity_risk_state
   WHERE entity_id = _a.entity_id AND domain_code = _a.domain_code FOR UPDATE;

  SELECT p.id, d.decided_at INTO _newer
    FROM public.supervisory_assessment_risk_publication p
    JOIN public.supervisory_assessment_approval_decision d ON d.id = p.approval_decision_id
   WHERE p.entity_id = _a.entity_id AND p.domain_code = _a.domain_code
     AND d.decided_at > _d.decided_at
   LIMIT 1;
  IF _newer.id IS NOT NULL THEN
    RAISE EXCEPTION 'stale_publication: a later approved assessment is already the official risk-of-record'
      USING ERRCODE = '55000';
  END IF;

  PERFORM set_config('app.supervisory_risk_state_writer','assessment_transition', true);
  INSERT INTO public.entity_risk_state(entity_id, domain_code, residual_rating, inherent_rating,
    control_rating, driving_assessment_id, effective_from, last_review_date, next_review_date, updated_by)
  VALUES (_a.entity_id, _a.domain_code, _d.final_rating, _a.inherent_rating, _a.control_rating,
    _assessment_id, now(), current_date, _a.next_review_date, _uid)
  ON CONFLICT (entity_id, domain_code) DO UPDATE
    SET residual_rating = EXCLUDED.residual_rating,
        inherent_rating = EXCLUDED.inherent_rating,
        control_rating = EXCLUDED.control_rating,
        driving_assessment_id = EXCLUDED.driving_assessment_id,
        effective_from = EXCLUDED.effective_from,
        last_review_date = EXCLUDED.last_review_date,
        next_review_date = EXCLUDED.next_review_date,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
  PERFORM set_config('app.supervisory_risk_state_writer','', true);

  INSERT INTO public.entity_risk_state_movement(entity_id, domain_code, previous_assessment_id,
    new_assessment_id, previous_rating, new_rating, previous_inherent, new_inherent,
    previous_control, new_control, trend, reason, trigger_kind, approved_by, approved_at)
  VALUES (_a.entity_id, _a.domain_code, _prev.driving_assessment_id, _assessment_id,
    _prev.residual_rating, _d.final_rating, _prev.inherent_rating, _a.inherent_rating,
    _prev.control_rating, _a.control_rating,
    CASE WHEN _prev.residual_rating IS NULL THEN 'NEW'
         WHEN upper(_prev.residual_rating) = upper(_d.final_rating) THEN 'STABLE' ELSE 'CHANGED' END,
    btrim(_reason), 'ASSESSMENT_APPROVAL', _uid, now())
  RETURNING id INTO _mv;

  PERFORM set_config('app.supervisory_review_writer','governed', true);
  INSERT INTO public.supervisory_assessment_risk_publication(
    approval_decision_id, assessment_id, entity_id, domain_code, previous_assessment_id,
    previous_rating, published_rating, effective_from, movement_id, reason, published_by)
  VALUES (_decision_id, _assessment_id, _a.entity_id, _a.domain_code, _prev.driving_assessment_id,
    _prev.residual_rating, _d.final_rating, current_date, _mv, btrim(_reason), _uid)
  RETURNING id INTO _pub;

  UPDATE public.supervisory_assessment
     SET is_current = false,
         status = CASE WHEN status IN ('approved','closed') THEN 'superseded' ELSE status END,
         updated_at = now()
   WHERE entity_id = _a.entity_id AND domain_code = _a.domain_code AND id <> _assessment_id AND is_current;
  UPDATE public.supervisory_assessment
     SET risk_publication_id = _pub, risk_published_at = now(), is_current = true, updated_at = now()
   WHERE id = _assessment_id;
  PERFORM set_config('app.supervisory_review_writer','', true);

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, from_status, to_status, rationale, detail, actor_id)
  VALUES (_assessment_id,'RISK_PUBLICATION', _a.status, _a.status, btrim(_reason),
          jsonb_build_object('publication_id', _pub, 'movement_id', _mv,
                             'previous_rating', _prev.residual_rating, 'new_rating', _d.final_rating), _uid);
  PERFORM public.log_compliance_audit('APPROVE','entity_risk_state', _a.entity_id,
    jsonb_build_object('residual_rating', _prev.residual_rating),
    jsonb_build_object('residual_rating', _d.final_rating),
    'AML/CFT risk-of-record published from assessment ' || _a.reference);

  RETURN jsonb_build_object('publication_id', _pub, 'movement_id', _mv,
    'previous_rating', _prev.residual_rating, 'published_rating', _d.final_rating,
    'already_published', false);
END $function$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_publish_internal(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.supervisory_entity_risk_as_of(_entity_id uuid, _domain_code text, _at timestamptz)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _p public.supervisory_assessment_risk_publication;
        _next public.supervisory_assessment_risk_publication; _s public.entity_risk_state;
BEGIN
  IF _uid IS NULL OR NOT (public.is_super_admin(_uid) OR public.has_any_permission(_uid,
      ARRAY['supervisory_spine.view','prudential_supervision.view','market_conduct.view','aml_supervision.view'])) THEN
    RAISE EXCEPTION 'not_authorized: supervisory risk history' USING ERRCODE = '42501';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);
  IF _at IS NULL THEN RAISE EXCEPTION 'an as-of timestamp is required' USING ERRCODE = '22023'; END IF;

  SELECT * INTO _p FROM public.supervisory_assessment_risk_publication
   WHERE entity_id = _entity_id AND domain_code = _domain_code AND published_at <= _at
   ORDER BY published_at DESC, id DESC LIMIT 1;
  IF _p.id IS NOT NULL THEN
    RETURN jsonb_build_object('as_of', _at, 'provenance', 'GOVERNED_PUBLICATION',
      'rating', _p.published_rating, 'assessment_id', _p.assessment_id,
      'assessment_reference', (SELECT reference FROM public.supervisory_assessment WHERE id = _p.assessment_id),
      'publication_id', _p.id, 'approval_decision_id', _p.approval_decision_id,
      'published_at', _p.published_at, 'effective_from', _p.effective_from, 'published_by', _p.published_by);
  END IF;

  SELECT * INTO _next FROM public.supervisory_assessment_risk_publication
   WHERE entity_id = _entity_id AND domain_code = _domain_code AND published_at > _at
   ORDER BY published_at, id LIMIT 1;
  IF _next.id IS NOT NULL THEN
    IF _next.previous_rating IS NULL THEN
      RETURN jsonb_build_object('as_of', _at, 'provenance', 'NONE', 'rating', NULL);
    END IF;
    RETURN jsonb_build_object('as_of', _at, 'provenance', 'LEGACY_RISK_STATE',
      'rating', _next.previous_rating, 'assessment_id', _next.previous_assessment_id,
      'assessment_reference', (SELECT reference FROM public.supervisory_assessment WHERE id = _next.previous_assessment_id),
      'note', 'Recorded before governed publication; exact effective time is not reconstructable.');
  END IF;

  SELECT * INTO _s FROM public.entity_risk_state WHERE entity_id = _entity_id AND domain_code = _domain_code;
  IF _s.id IS NOT NULL AND _s.effective_from <= _at THEN
    RETURN jsonb_build_object('as_of', _at, 'provenance', 'LEGACY_RISK_STATE',
      'rating', _s.residual_rating, 'assessment_id', _s.driving_assessment_id,
      'assessment_reference', (SELECT reference FROM public.supervisory_assessment WHERE id = _s.driving_assessment_id),
      'note', 'Recorded before governed publication; exact effective time is not reconstructable.');
  END IF;
  RETURN jsonb_build_object('as_of', _at, 'provenance', 'NONE', 'rating', NULL);
END $function$;
REVOKE ALL ON FUNCTION public.supervisory_entity_risk_as_of(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_entity_risk_as_of(uuid, text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.supervisory_entity_risk_history(_entity_id uuid, _domain_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT (public.is_super_admin(_uid) OR public.has_any_permission(_uid,
      ARRAY['supervisory_spine.view','prudential_supervision.view','market_conduct.view','aml_supervision.view'])) THEN
    RAISE EXCEPTION 'not_authorized: supervisory risk history' USING ERRCODE = '42501';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  RETURN jsonb_build_object(
    'current', (SELECT jsonb_build_object(
        'residual_rating', s.residual_rating, 'inherent_rating', s.inherent_rating,
        'control_rating', s.control_rating, 'driving_assessment_id', s.driving_assessment_id,
        'effective_from', s.effective_from, 'last_review_date', s.last_review_date,
        'next_review_date', s.next_review_date, 'updated_by', s.updated_by, 'updated_at', s.updated_at,
        'provenance', CASE WHEN EXISTS (SELECT 1 FROM public.supervisory_assessment_risk_publication px
                                         WHERE px.assessment_id = s.driving_assessment_id
                                           AND px.entity_id = s.entity_id AND px.domain_code = s.domain_code)
                           THEN 'GOVERNED_PUBLICATION' ELSE 'LEGACY_RISK_STATE' END,
        'publication', (SELECT jsonb_build_object('id', p.id, 'published_at', p.published_at,
            'published_by', p.published_by, 'reason', p.reason, 'approval_decision_id', p.approval_decision_id)
          FROM public.supervisory_assessment_risk_publication p
         WHERE p.assessment_id = s.driving_assessment_id ORDER BY p.published_at DESC LIMIT 1))
      FROM public.entity_risk_state s
     WHERE s.entity_id = _entity_id AND s.domain_code = _domain_code),
    'movements', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'previous_rating', m.previous_rating, 'new_rating', m.new_rating,
        'previous_assessment_id', m.previous_assessment_id, 'new_assessment_id', m.new_assessment_id,
        'trend', m.trend, 'reason', m.reason, 'trigger_kind', m.trigger_kind,
        'approved_by', m.approved_by, 'approved_at', m.approved_at, 'created_at', m.created_at,
        'publication', (SELECT jsonb_build_object('id', p.id, 'effective_from', p.effective_from,
             'published_by', p.published_by, 'published_at', p.published_at,
             'approval_decision_id', p.approval_decision_id)
           FROM public.supervisory_assessment_risk_publication p WHERE p.movement_id = m.id),
        'decision', (SELECT jsonb_build_object('id', d.id, 'final_rating', d.final_rating,
             'final_rating_source', d.final_rating_source, 'calculation_run_seq', d.calculation_run_seq,
             'methodology_version', d.methodology_version, 'programme_version', d.programme_version,
             'override_rating', d.override_rating, 'rationale', d.rationale, 'decided_by', d.decided_by)
           FROM public.supervisory_assessment_approval_decision d
            JOIN public.supervisory_assessment_risk_publication p2 ON p2.approval_decision_id = d.id
          WHERE p2.movement_id = m.id))
      ORDER BY m.created_at DESC)
      FROM public.entity_risk_state_movement m
     WHERE m.entity_id = _entity_id AND m.domain_code = _domain_code),'[]'::jsonb));
END $function$;

REVOKE ALL ON public.supervisory_assessment_risk_publication, public.entity_risk_state,
  public.entity_risk_state_movement, public.supervisory_assessment_approval_decision FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.supervisory_assessment_risk_publication,
  public.entity_risk_state, public.entity_risk_state_movement, public.supervisory_assessment_approval_decision FROM authenticated;
GRANT SELECT ON public.supervisory_assessment_risk_publication, public.entity_risk_state,
  public.entity_risk_state_movement, public.supervisory_assessment_approval_decision TO authenticated;

DROP POLICY IF EXISTS entity_risk_state_read ON public.entity_risk_state;
CREATE POLICY entity_risk_state_read ON public.entity_risk_state FOR SELECT TO authenticated
  USING ((is_super_admin(auth.uid()) OR has_any_permission(auth.uid(), ARRAY['supervisory_spine.view','prudential_supervision.view','market_conduct.run_conduct_analytics','aml_supervision.view']))
         AND supervisory_entity_scope_permits(auth.uid(), entity_id));
DROP POLICY IF EXISTS entity_risk_state_movement_read ON public.entity_risk_state_movement;
CREATE POLICY entity_risk_state_movement_read ON public.entity_risk_state_movement FOR SELECT TO authenticated
  USING ((is_super_admin(auth.uid()) OR has_any_permission(auth.uid(), ARRAY['supervisory_spine.view','prudential_supervision.view','aml_supervision.view','market_conduct.view','inspection_management.view']))
         AND supervisory_entity_scope_permits(auth.uid(), entity_id));
DROP POLICY IF EXISTS sarp_read ON public.supervisory_assessment_risk_publication;
CREATE POLICY sarp_read ON public.supervisory_assessment_risk_publication FOR SELECT TO authenticated
  USING ((is_super_admin(auth.uid()) OR has_any_permission(auth.uid(), ARRAY['supervisory_spine.view','prudential_supervision.view','market_conduct.view','aml_supervision.view']))
         AND supervisory_entity_scope_permits(auth.uid(), entity_id));