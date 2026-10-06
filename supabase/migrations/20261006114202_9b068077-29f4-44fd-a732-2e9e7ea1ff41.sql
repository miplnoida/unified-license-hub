CREATE OR REPLACE FUNCTION public.supervisory_assessment_publication_eligibility_internal(_assessment_id uuid, _uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- AML-CLOSE-07A: the single publication eligibility authority, used by the lifecycle
-- action contract and by supervisory_assessment_publish_internal.
DECLARE _a public.supervisory_assessment; _d public.supervisory_assessment_approval_decision;
        _r public.supervisory_assessment_review_round; _code text; _sa boolean;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RETURN jsonb_build_object('reason_code','STATE_NOT_ELIGIBLE','permitted',false); END IF;
  SELECT * INTO _d FROM public.supervisory_assessment_approval_decision WHERE id = _a.approval_decision_id;
  SELECT * INTO _r FROM public.supervisory_assessment_review_round
   WHERE assessment_id = _assessment_id ORDER BY round_seq DESC LIMIT 1;
  _sa := _uid IS NOT NULL AND public.is_super_admin(_uid);
  _code := CASE
    WHEN EXISTS (SELECT 1 FROM public.supervisory_assessment_risk_publication p
                  WHERE p.assessment_id = _a.id AND p.approval_decision_id = _a.approval_decision_id) THEN 'ALREADY_PUBLISHED'
    WHEN _a.status <> 'approved' THEN 'STATE_NOT_ELIGIBLE'
    WHEN _d.id IS NULL OR _d.decision <> 'APPROVED' OR _d.assessment_id <> _a.id THEN 'NO_APPROVAL_DECISION'
    WHEN _d.final_rating IS NULL OR _d.final_rating_source NOT IN ('COMPUTED','APPROVED_OVERRIDE','LEGACY_OFFICER_RATING') THEN 'NO_FINAL_RATING'
    WHEN _uid IS NULL OR NOT public.has_any_permission(_uid, ARRAY['aml_supervision.approve','supervisory_spine.approve'])
         OR NOT public.supervisory_entity_scope_permits(_uid, _a.entity_id) THEN 'PERMISSION_MISSING'
    WHEN NOT _sa AND (_uid = _a.created_by OR _uid = _a.owner_id OR _uid = _a.submitted_by
                      OR _uid = _r.submitted_by) THEN 'MAKER_CHECKER'
    WHEN _d.effective_date > current_date THEN 'EFFECTIVE_DATE_REFUSED'
    WHEN EXISTS (SELECT 1 FROM public.supervisory_assessment_risk_publication p
                   JOIN public.supervisory_assessment_approval_decision d2 ON d2.id = p.approval_decision_id
                  WHERE p.entity_id = _a.entity_id AND p.domain_code = _a.domain_code
                    AND d2.decided_at > _d.decided_at) THEN 'STALE_PUBLICATION'
    ELSE 'OK' END;
  RETURN jsonb_build_object('reason_code', _code, 'permitted', _code = 'OK', 'decision_id', _d.id);
END $function$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_publication_eligibility_internal(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_publish_internal(_assessment_id uuid, _decision_id uuid, _uid uuid, _reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _a public.supervisory_assessment; _d public.supervisory_assessment_approval_decision;
        _prev public.entity_risk_state; _pub uuid; _mv uuid; _existing uuid; _el jsonb;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  SELECT * INTO _d FROM public.supervisory_assessment_approval_decision WHERE id = _decision_id;
  IF _a.id IS NULL OR _d.id IS NULL OR _d.decision <> 'APPROVED' OR _d.assessment_id <> _a.id THEN
    RAISE EXCEPTION 'not_permitted: only an approved assessment decision can publish a risk-of-record'
      USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(_a.entity_id::text || ':' || _a.domain_code));
  SELECT id INTO _existing FROM public.supervisory_assessment_risk_publication
   WHERE approval_decision_id = _decision_id;
  IF _existing IS NOT NULL THEN
    RETURN jsonb_build_object('publication_id', _existing, 'already_published', true);
  END IF;
  IF _a.approval_decision_id IS DISTINCT FROM _d.id THEN
    RAISE EXCEPTION 'not_permitted: the approval decision is not the current approval of this assessment'
      USING ERRCODE = '42501';
  END IF;
  _el := public.supervisory_assessment_publication_eligibility_internal(_assessment_id, _uid);
  CASE _el->>'reason_code'
    WHEN 'OK' THEN NULL;
    WHEN 'STATE_NOT_ELIGIBLE' THEN RAISE EXCEPTION 'not_permitted: only an approved assessment can publish a risk-of-record' USING ERRCODE = '42501';
    WHEN 'NO_APPROVAL_DECISION' THEN RAISE EXCEPTION 'not_permitted: the approval decision is not the current approval of this assessment' USING ERRCODE = '42501';
    WHEN 'NO_FINAL_RATING' THEN RAISE EXCEPTION 'integrity: the approval decision has no valid final rating' USING ERRCODE = '22023';
    WHEN 'PERMISSION_MISSING' THEN RAISE EXCEPTION 'not_authorized: publication authority or entity scope missing' USING ERRCODE = '42501';
    WHEN 'MAKER_CHECKER' THEN RAISE EXCEPTION 'not_authorized: the officer who prepared, owns or submitted the assessment cannot publish it' USING ERRCODE = '42501';
    WHEN 'EFFECTIVE_DATE_REFUSED' THEN RAISE EXCEPTION 'effective_date_refused: the approval is not yet effective; scheduled activation is not supported' USING ERRCODE = '22023';
    WHEN 'STALE_PUBLICATION' THEN RAISE EXCEPTION 'stale_publication: a later approved assessment is already the official risk-of-record' USING ERRCODE = '55000';
    ELSE RAISE EXCEPTION 'not_permitted: %', _el->>'reason_code' USING ERRCODE = '42501';
  END CASE;

  SELECT * INTO _prev FROM public.entity_risk_state
   WHERE entity_id = _a.entity_id AND domain_code = _a.domain_code FOR UPDATE;

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
         WHEN upper(_prev.residual_rating) = upper(_d.final_rating) THEN 'STABLE'
         WHEN public.sup_risk_ordinal(_d.final_rating) < public.sup_risk_ordinal(_prev.residual_rating) THEN 'IMPROVING'
         WHEN public.sup_risk_ordinal(_d.final_rating) > public.sup_risk_ordinal(_prev.residual_rating) THEN 'DETERIORATING'
         ELSE 'CHANGED' END,
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
         status = CASE WHEN status IN ('approved','closed')
                        AND (id = _prev.driving_assessment_id OR risk_publication_id IS NOT NULL)
                       THEN 'superseded' ELSE status END,
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

CREATE OR REPLACE FUNCTION public.supervisory_assessment_lifecycle_state(_assessment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _owner_ok boolean; _can_reassign boolean; _uid uuid := auth.uid(); _a public.supervisory_assessment; _r public.supervisory_assessment_review_round;
        _blk jsonb; _actions jsonb := '[]'::jsonb; _pub public.supervisory_assessment_risk_publication;
        _can_submit boolean; _can_review boolean; _can_approve boolean;
        _submit_blocked boolean; _approve_blocked boolean; _maker boolean;
        _editable boolean; _state text; _decision public.supervisory_assessment_approval_decision; _pe jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.supervisory_assessment_question_readable(_uid, _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: assessment outside your supervisory authority' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  SELECT * INTO _r FROM public.supervisory_assessment_review_round
   WHERE assessment_id = _assessment_id ORDER BY round_seq DESC LIMIT 1;
  SELECT * INTO _decision FROM public.supervisory_assessment_approval_decision
   WHERE assessment_id = _assessment_id ORDER BY decided_at DESC LIMIT 1;
  SELECT * INTO _pub FROM public.supervisory_assessment_risk_publication
   WHERE assessment_id = _assessment_id ORDER BY published_at DESC LIMIT 1;

  _pe := public.supervisory_assessment_publication_eligibility_internal(_assessment_id, _uid);
  _blk := public.supervisory_assessment_review_blockers_internal(_assessment_id);
  _submit_blocked := EXISTS (SELECT 1 FROM jsonb_array_elements(_blk) b
                              WHERE (b->>'blocking')::boolean AND b->>'stage' IN ('SUBMIT','BOTH'));
  _approve_blocked := EXISTS (SELECT 1 FROM jsonb_array_elements(_blk) b
                              WHERE (b->>'blocking')::boolean AND b->>'stage' IN ('APPROVE','BOTH'));

  _can_submit := public.has_any_permission(_uid, ARRAY['aml_supervision.submit','supervisory_spine.submit']);
  _can_review := public.has_any_permission(_uid, ARRAY['aml_supervision.review','supervisory_spine.review','aml_supervision.approve','supervisory_spine.approve']);
  -- regulatory approval authority is never inferred from technical administration
  _can_approve := public.has_any_permission(_uid, ARRAY['aml_supervision.approve','supervisory_spine.approve']);
  _owner_ok := (_a.owner_id = _uid OR public.is_super_admin(_uid));
  _can_reassign := public.supervisory_assessment_can_reassign(_uid, _a.domain_code);
  _maker := (_a.created_by = _uid OR _a.submitted_by = _uid OR COALESCE(_r.submitted_by, '00000000-0000-0000-0000-000000000000'::uuid) = _uid);

  _state := CASE
    WHEN _a.status = 'draft' AND COALESCE(_a.review_round_seq,0) = 0 THEN 'DRAFT'
    WHEN _a.status = 'draft' THEN 'DRAFT'
    WHEN _a.status = 'submitted' AND COALESCE(_a.review_round_seq,0) > 1 THEN 'RESUBMITTED'
    WHEN _a.status = 'submitted' THEN 'SUBMITTED_FOR_REVIEW'
    WHEN _a.status = 'reviewed' THEN 'UNDER_REVIEW'
    WHEN _a.status = 'returned_for_revision' THEN 'RETURNED_FOR_CHANGES'
    WHEN _a.status = 'approved' AND _pub.id IS NULL THEN 'APPROVED_NOT_PUBLISHED'
    WHEN _a.status = 'approved' THEN 'APPROVED'
    WHEN _a.status = 'closed' AND _decision.decision = 'REJECTED' THEN 'CLOSED_WITHOUT_APPROVAL'
    WHEN _a.status = 'closed' THEN 'CLOSED'
    WHEN _a.status = 'superseded' THEN 'SUPERSEDED'
    ELSE 'UNKNOWN' END;

  _editable := _a.status IN ('draft','returned_for_revision') AND _state <> 'UNKNOWN';

  _actions := jsonb_build_array(
    jsonb_build_object('action','SUBMIT_FOR_REVIEW',
      'label', CASE WHEN _a.status='returned_for_revision' THEN 'Resubmit for review' ELSE 'Submit for review' END,
      'required_permission','aml_supervision.submit',
      'permitted', (_a.status IN ('draft','returned_for_revision') AND _can_submit AND _owner_ok AND NOT _submit_blocked),
      'reason_code', CASE WHEN _a.status NOT IN ('draft','returned_for_revision') THEN 'STATE_NOT_ELIGIBLE'
                          WHEN NOT _can_submit THEN 'PERMISSION_MISSING'
                          WHEN NOT _owner_ok THEN 'NOT_CASE_OWNER'
                          WHEN _submit_blocked THEN 'BLOCKED' ELSE 'OK' END,
      'maker_checker_required', false),
    jsonb_build_object('action','RAISE_CHALLENGE','label','Raise a review challenge',
      'required_permission','aml_supervision.review',
      'permitted', (_a.status IN ('submitted','reviewed') AND _can_review),
      'reason_code', CASE WHEN _a.status NOT IN ('submitted','reviewed') THEN 'STATE_NOT_ELIGIBLE'
                          WHEN NOT _can_review THEN 'PERMISSION_MISSING' ELSE 'OK' END,
      'maker_checker_required', false),
    jsonb_build_object('action','RETURN_FOR_CHANGES','label','Return for correction',
      'required_permission','aml_supervision.review',
      'permitted', (_a.status IN ('submitted','reviewed') AND _can_review),
      'reason_code', CASE WHEN _a.status NOT IN ('submitted','reviewed') THEN 'STATE_NOT_ELIGIBLE'
                          WHEN NOT _can_review THEN 'PERMISSION_MISSING' ELSE 'OK' END,
      'maker_checker_required', false),
    jsonb_build_object('action','APPROVE','label','Approve the assessment',
      'required_permission','aml_supervision.approve',
      'permitted', (_a.status IN ('submitted','reviewed') AND _can_approve AND NOT _maker AND NOT _approve_blocked),
      'reason_code', CASE WHEN _a.status NOT IN ('submitted','reviewed') THEN 'STATE_NOT_ELIGIBLE'
                          WHEN NOT _can_approve THEN 'PERMISSION_MISSING'
                          WHEN _maker THEN 'MAKER_CHECKER'
                          WHEN _approve_blocked THEN 'BLOCKED' ELSE 'OK' END,
      'maker_checker_required', true),
    jsonb_build_object('action','REJECT','label','Close without approval',
      'required_permission','aml_supervision.approve',
      'permitted', (_a.status IN ('submitted','reviewed') AND _can_approve AND NOT _maker),
      'reason_code', CASE WHEN _a.status NOT IN ('submitted','reviewed') THEN 'STATE_NOT_ELIGIBLE'
                          WHEN NOT _can_approve THEN 'PERMISSION_MISSING'
                          WHEN _maker THEN 'MAKER_CHECKER' ELSE 'OK' END,
      'maker_checker_required', true),
    jsonb_build_object('action','PUBLISH_RISK_OF_RECORD','label','Publish risk-of-record',
      'required_permission','aml_supervision.approve',
      'permitted', (_pe->>'reason_code') = 'OK',
      'reason_code', _pe->>'reason_code',
      'maker_checker_required', true),
    jsonb_build_object('action','REASSIGN_OWNER','label','Reassign case owner',
      'required_permission','aml_supervision.approve',
      'permitted', (_a.status IN ('draft','returned_for_revision','submitted','reviewed') AND _can_reassign),
      'reason_code', CASE WHEN _a.status NOT IN ('draft','returned_for_revision','submitted','reviewed') THEN 'STATE_NOT_ELIGIBLE'
                          WHEN NOT _can_reassign THEN 'PERMISSION_MISSING' ELSE 'OK' END,
      'maker_checker_required', false),
    jsonb_build_object('action','ASSIGN_REVIEWER','label','Assign or reassign reviewer',
      'required_permission','aml_supervision.approve',
      'permitted', (_a.status IN ('submitted','reviewed') AND _can_reassign),
      'reason_code', CASE WHEN _a.status NOT IN ('submitted','reviewed') THEN 'STATE_NOT_ELIGIBLE'
                          WHEN NOT _can_reassign THEN 'PERMISSION_MISSING' ELSE 'OK' END,
      'maker_checker_required', false));

  RETURN jsonb_build_object(
    'assessment_id', _a.id, 'reference', _a.reference,
    'raw_status', _a.status, 'canonical_state', _state,
    'editing_allowed', _editable AND _owner_ok,
    'case_actor', _owner_ok,
    'assignment_flags', public.supervisory_assessment_assignment_flags_internal(_a.id),
    'calculation_allowed', _a.status IN ('draft','returned_for_revision'),
    'publication_allowed', (_pe->>'reason_code') = 'OK',
    'publication_reason_code', _pe->>'reason_code',
    'maker_checker_required', true,
    'viewer_is_preparer', _maker,
    'assigned_owner_id', _a.owner_id, 'assigned_team_id', _a.team_id,
    'assigned_reviewer_id', COALESCE(_r.reviewer_id, _a.reviewer_id),
    'current_round_seq', COALESCE(_a.review_round_seq, 0),
    'current_round_id', _r.id,
    'submitted_run_id', _a.submitted_run_id,
    'approval_decision_id', _decision.id,
    'approved_rating', _a.approved_rating,
    'approved_rating_source', _a.approved_rating_source,
    'risk_publication_id', _pub.id,
    'risk_published_at', _a.risk_published_at,
    'blockers', _blk,
    'actions', _actions);
END $function$;