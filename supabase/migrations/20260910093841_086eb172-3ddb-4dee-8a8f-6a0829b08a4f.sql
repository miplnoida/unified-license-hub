CREATE OR REPLACE FUNCTION public.supervisory_outcome_action_internal(_decision_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _d public.supervisory_consequence_decision;
  _tgt jsonb; _status text; _completed boolean := false; _cancelled boolean := false;
  _completed_at timestamptz; _objective text; _legacy boolean;
  _eligible boolean := true; _code text := 'OK'; _detail text := 'This action may be evaluated.';
  _row jsonb;
BEGIN
  SELECT * INTO _d FROM public.supervisory_consequence_decision WHERE id = _decision_id;
  IF _d.id IS NULL THEN RETURN NULL; END IF;

  _tgt := public.supervisory_consequence_target_internal(_d.target_kind, _d.target_id);
  _status := upper(COALESCE(_tgt->>'status',''));

  CASE _d.target_kind
    WHEN 'SUPERVISORY_PLAN' THEN
      _completed := _status = 'COMPLETED'; _cancelled := _status = 'CANCELLED';
      SELECT COALESCE(x.completed_at, x.updated_at) INTO _completed_at
        FROM public.supervisory_plan x WHERE x.id = _d.target_id;
    WHEN 'SUPERVISORY_INTERVENTION' THEN
      _completed := _status = 'COMPLETED'; _cancelled := _status IN ('CANCELLED','REJECTED');
      SELECT COALESCE(x.completed_at, x.updated_at) INTO _completed_at
        FROM public.supervisory_intervention x WHERE x.id = _d.target_id;
    WHEN 'EXAMINATION' THEN
      _completed := _status IN ('CLOSED','COMPLETED'); _cancelled := _status IN ('CANCELLED','WITHDRAWN');
      SELECT COALESCE(x.closed_at, x.updated_at) INTO _completed_at
        FROM public.examinations x WHERE x.id = _d.target_id;
    WHEN 'SUPERVISORY_FINDING' THEN
      _completed := _status = 'CLOSED'; _cancelled := _status IN ('WITHDRAWN','SUPERSEDED');
      SELECT COALESCE(x.closed_at, x.updated_at) INTO _completed_at
        FROM public.supervisory_finding x WHERE x.id = _d.target_id;
    WHEN 'REASSESSMENT_REQUIREMENT' THEN
      _completed := _status = 'FULFILLED'; _cancelled := _status = 'CANCELLED';
      SELECT COALESCE(x.fulfilled_at, x.updated_at) INTO _completed_at
        FROM public.supervisory_reassessment_requirement x WHERE x.id = _d.target_id;
    WHEN 'ENFORCEMENT_ACTION' THEN
      _completed := _status IN ('CLOSED','COMPLETED'); _cancelled := _status IN ('CANCELLED','WITHDRAWN');
      SELECT COALESCE(x.closed_at, x.updated_at) INTO _completed_at
        FROM public.enforcement_actions x WHERE x.id = _d.target_id;
    ELSE
      _completed := false; _cancelled := false;
  END CASE;

  IF NOT _completed THEN _completed_at := NULL; END IF;

  _objective := NULLIF(btrim(COALESCE(_d.supervisory_objective, _tgt->>'title', '')), '');
  _legacy := (_d.source_kind <> 'PUBLICATION') OR _d.publication_id IS NULL;

  IF _d.target_id IS NULL OR _d.linkage_mode = 'RECORD_ONLY' THEN
    _eligible := false; _code := 'NO_TARGET_ACTION';
    _detail := 'This decision recorded supervisory judgment only. There is no supervisory action to evaluate.';
  ELSIF _tgt IS NULL THEN
    _eligible := false; _code := 'TARGET_NOT_FOUND';
    _detail := 'The linked supervisory action is not available.';
  ELSIF _d.status <> 'RECORDED' THEN
    _eligible := false; _code := 'CONSEQUENCE_' || _d.status;
    _detail := 'The consequence linkage was ' || lower(_d.status) || '. It is recorded separately and is not evaluated for effectiveness.';
  ELSIF _cancelled THEN
    _eligible := false; _code := 'ACTION_CANCELLED';
    _detail := 'The supervisory action was cancelled or withdrawn. It is identified separately and is not assessed for effectiveness.';
  ELSIF NOT _completed THEN
    _eligible := false; _code := 'ACTION_NOT_COMPLETE';
    _detail := 'The supervisory action is still open. Completion is required before effectiveness can be concluded, and closure alone never proves effectiveness.';
  ELSIF _objective IS NULL THEN
    _eligible := false; _code := 'OBJECTIVE_MISSING';
    _detail := 'The action records no supervisory objective, so effectiveness cannot be measured against anything.';
  END IF;

  SELECT to_jsonb(e) INTO _row FROM public.supervisory_outcome_evaluation e
   WHERE e.consequence_decision_id = _decision_id
     AND e.review_status IN ('SUBMITTED','APPROVED') AND e.superseded_by_id IS NULL
   ORDER BY CASE e.review_status WHEN 'SUBMITTED' THEN 0 ELSE 1 END, e.version DESC LIMIT 1;

  RETURN jsonb_build_object(
    'decision_id', _d.id, 'entity_id', _d.entity_id, 'domain_code', _d.domain_code,
    'action_type', _d.action_type, 'linkage_mode', _d.linkage_mode,
    'consequence_status', _d.status,
    'target_kind', _d.target_kind, 'target_id', _d.target_id,
    'target_reference', COALESCE(_d.target_reference, _tgt->>'reference'),
    'target', _tgt,
    'action_status', NULLIF(_status,''),
    'action_completed', _completed, 'action_cancelled', _cancelled,
    'action_completed_at', _completed_at,
    'action_objective', _objective,
    'source_kind', _d.source_kind, 'publication_id', _d.publication_id,
    'risk_state_id', _d.risk_state_id, 'assessment_id', _d.assessment_id,
    'source_rating', _d.source_rating, 'rating_provenance', _d.rating_provenance,
    'legacy_lineage', _legacy,
    'evaluable', _eligible, 'reason_code', _code, 'reason', _detail,
    'active_evaluation', _row,
    'lineage', _d.lineage);
END $function$;

REVOKE EXECUTE ON FUNCTION public.supervisory_outcome_action_internal(uuid) FROM PUBLIC, anon, authenticated;