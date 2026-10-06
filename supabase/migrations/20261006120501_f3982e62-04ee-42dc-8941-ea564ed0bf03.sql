ALTER TABLE public.supervisory_assessment ALTER COLUMN is_current SET DEFAULT false;
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
   WHERE entity_id = _a.entity_id AND domain_code = _a.domain_code AND id <> _assessment_id AND is_current
     AND status IN ('approved','closed');
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