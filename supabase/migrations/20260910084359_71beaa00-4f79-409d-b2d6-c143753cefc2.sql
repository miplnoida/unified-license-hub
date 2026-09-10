CREATE OR REPLACE FUNCTION public.supervisory_outcome_may_prepare(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT public.is_super_admin(_uid)
      OR public.has_permission(_uid,'aml_supervision','create')
      OR public.has_permission(_uid,'aml_supervision','review')
      OR public.has_permission(_uid,'supervisory_spine','create')
      OR public.has_permission(_uid,'supervisory_spine','review');
$fn$;

REVOKE ALL ON FUNCTION public.supervisory_outcome_may_prepare(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_outcome_may_prepare(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.supervisory_outcome_view(
  _entity_id uuid, _domain_code text DEFAULT 'AML_CFT')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _d text := upper(COALESCE(_domain_code,'AML_CFT'));
  _actions jsonb := '[]'::jsonb; _evals jsonb := '[]'::jsonb;
  _may_prepare boolean; _may_review boolean; _rec record; _a jsonb; _e jsonb;
  _followups jsonb := '[]'::jsonb; _cview jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_super_admin(_uid) OR public.has_any_permission(_uid,
      ARRAY['aml_supervision.view','supervisory_spine.view'])) THEN
    RAISE EXCEPTION 'not_authorized: supervisory view authority is required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);

  _may_prepare := public.supervisory_outcome_may_prepare(_uid);
  _may_review := public.is_super_admin(_uid)
    OR public.has_permission(_uid,'aml_supervision','approve')
    OR public.has_permission(_uid,'supervisory_spine','approve');

  FOR _rec IN
    SELECT id FROM public.supervisory_consequence_decision
     WHERE entity_id = _entity_id AND domain_code = _d
     ORDER BY decided_at DESC
  LOOP
    _a := public.supervisory_outcome_action_internal(_rec.id);
    IF _a IS NOT NULL THEN _actions := _actions || jsonb_build_array(_a); END IF;
  END LOOP;

  FOR _rec IN
    SELECT * FROM public.supervisory_outcome_evaluation
     WHERE entity_id = _entity_id AND domain_code = _d
     ORDER BY prepared_at DESC
  LOOP
    _e := jsonb_build_object(
      'id', _rec.id, 'consequence_decision_id', _rec.consequence_decision_id,
      'action_type', _rec.action_type, 'target_kind', _rec.target_kind, 'target_id', _rec.target_id,
      'target_reference', _rec.target_reference, 'action_objective', _rec.action_objective,
      'action_status', _rec.action_status, 'action_completed_at', _rec.action_completed_at,
      'conclusion', _rec.conclusion, 'rationale', _rec.rationale,
      'limitations', _rec.limitations, 'recommended_next_step', _rec.recommended_next_step,
      'review_status', _rec.review_status, 'review_note', _rec.review_note,
      'version', _rec.version, 'supersedes_id', _rec.supersedes_id, 'superseded_by_id', _rec.superseded_by_id,
      'legacy_lineage', _rec.legacy_lineage, 'source_kind', _rec.source_kind,
      'publication_id', _rec.publication_id, 'assessment_id', _rec.assessment_id,
      'source_rating', _rec.source_rating, 'rating_provenance', _rec.rating_provenance,
      'prepared_by', _rec.prepared_by, 'prepared_at', _rec.prepared_at,
      'reviewed_by', _rec.reviewed_by, 'reviewed_at', _rec.reviewed_at,
      'followups', _rec.followups, 'lineage', _rec.lineage,
      'evidence', public.supervisory_outcome_evidence_internal(_uid,
        (SELECT COALESCE(array_agg((x->>'evidence_id')::uuid), '{}'::uuid[])
           FROM jsonb_array_elements(COALESCE(_rec.evidence,'[]'::jsonb)) x)),
      'evidence_snapshot_present', _rec.evidence_snapshot IS NOT NULL,
      'may_review', _may_review AND _rec.review_status = 'SUBMITTED' AND _rec.prepared_by IS DISTINCT FROM _uid,
      'self_review_blocked', _rec.review_status = 'SUBMITTED' AND _rec.prepared_by = _uid,
      'follow_up_available', _rec.review_status = 'APPROVED' AND _rec.superseded_by_id IS NULL
        AND _rec.conclusion IN ('PARTIALLY_EFFECTIVE','INEFFECTIVE','INCONCLUSIVE'));
    _evals := _evals || jsonb_build_array(_e);
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.supervisory_outcome_evaluation
              WHERE entity_id = _entity_id AND domain_code = _d
                AND review_status = 'APPROVED' AND superseded_by_id IS NULL
                AND conclusion IN ('PARTIALLY_EFFECTIVE','INEFFECTIVE','INCONCLUSIVE')) THEN
    _cview := public.supervisory_consequence_view(_entity_id, _d, NULL);
    _followups := COALESCE(_cview->'actions', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'entity_id', _entity_id, 'domain_code', _d,
    'conclusions', jsonb_build_array('NOT_ASSESSED','EFFECTIVE','PARTIALLY_EFFECTIVE','INEFFECTIVE','INCONCLUSIVE'),
    'actions', _actions, 'evaluations', _evals,
    'follow_up_actions', _followups,
    'viewer', jsonb_build_object('user_id', _uid, 'may_prepare', _may_prepare, 'may_review', _may_review),
    'notes', jsonb_build_array(
      'Completion is not effectiveness. A closed supervisory action is never treated as an effective one.',
      'The entity risk-of-record is never changed by an outcome evaluation.',
      'Any follow-up action must be chosen and justified by a supervisor; nothing is created automatically.'));
END $fn$;

CREATE OR REPLACE FUNCTION public.supervisory_outcome_evaluate(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _dec uuid := NULLIF(_payload->>'consequence_decision_id','')::uuid;
  _conclusion text := upper(COALESCE(NULLIF(_payload->>'conclusion',''),''));
  _rationale text := btrim(COALESCE(_payload->>'rationale',''));
  _amends uuid := NULLIF(_payload->>'amends_id','')::uuid;
  _ids uuid[];
  _a jsonb; _d public.supervisory_consequence_decision; _prev public.supervisory_outcome_evaluation;
  _existing public.supervisory_outcome_evaluation;
  _key text; _id uuid; _reg uuid; _sector uuid; _ver integer := 1; _conf boolean;
  _bad integer; _restricted integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF _dec IS NULL THEN
    RAISE EXCEPTION 'consequence_decision_id is required' USING ERRCODE = '22023';
  END IF;
  IF _conclusion NOT IN ('NOT_ASSESSED','EFFECTIVE','PARTIALLY_EFFECTIVE','INEFFECTIVE','INCONCLUSIVE') THEN
    RAISE EXCEPTION 'unsupported_conclusion: % is not a governed effectiveness conclusion', _conclusion USING ERRCODE = '22023';
  END IF;
  IF length(_rationale) < 20 THEN
    RAISE EXCEPTION 'rationale_required: a written supervisory judgment of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _d FROM public.supervisory_consequence_decision WHERE id = _dec FOR UPDATE;
  IF _d.id IS NULL THEN
    RAISE EXCEPTION 'not_found: consequence decision' USING ERRCODE = '22023';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _d.entity_id);
  IF NOT public.supervisory_outcome_may_prepare(_uid) THEN
    RAISE EXCEPTION 'not_authorized: supervisory authority is required to evaluate an outcome' USING ERRCODE = '42501';
  END IF;

  _a := public.supervisory_outcome_action_internal(_dec);
  IF NOT COALESCE((_a->>'evaluable')::boolean,false) THEN
    RAISE EXCEPTION 'not_evaluable: % (%)', _a->>'reason', _a->>'reason_code' USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(array_agg((x->>'evidence_id')::uuid), '{}'::uuid[]) INTO _ids
    FROM jsonb_array_elements(COALESCE(_payload->'evidence','[]'::jsonb)) x
   WHERE NULLIF(x->>'evidence_id','') IS NOT NULL;

  IF _conclusion <> 'NOT_ASSESSED' AND COALESCE(array_length(_ids,1),0) = 0 THEN
    RAISE EXCEPTION 'evidence_required: an effectiveness conclusion must cite governed evidence' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(array_length(_ids,1),0) > 0 THEN
    SELECT count(*) INTO _bad FROM unnest(_ids) i
     WHERE NOT EXISTS (
       SELECT 1 FROM public.supervisory_assessment_evidence_basis b
        WHERE b.id = i
          AND (b.entity_id IS NOT DISTINCT FROM _d.entity_id
               OR (_d.assessment_id IS NOT NULL AND b.assessment_id = _d.assessment_id)));
    IF _bad > 0 THEN
      RAISE EXCEPTION 'evidence_not_in_context: cited evidence must belong to this entity and assessment context' USING ERRCODE = '22023';
    END IF;
    _conf := public.is_super_admin(_uid) OR public.has_permission(_uid,'aml_supervision','view_confidential');
    IF NOT _conf THEN
      SELECT count(*) INTO _restricted FROM public.supervisory_assessment_evidence_basis b
       WHERE b.id = ANY (_ids) AND upper(COALESCE(b.confidentiality,'')) IN ('RESTRICTED','CONFIDENTIAL');
      IF _restricted > 0 THEN
        RAISE EXCEPTION 'evidence_restricted: you are not authorised to cite restricted supervisory evidence' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF _amends IS NOT NULL THEN
    SELECT * INTO _prev FROM public.supervisory_outcome_evaluation WHERE id = _amends FOR UPDATE;
    IF _prev.id IS NULL OR _prev.consequence_decision_id <> _dec THEN
      RAISE EXCEPTION 'not_found: the evaluation being amended does not belong to this action' USING ERRCODE = '22023';
    END IF;
    IF _prev.superseded_by_id IS NOT NULL THEN
      RAISE EXCEPTION 'state_not_eligible: that evaluation has already been superseded' USING ERRCODE = '55000';
    END IF;
    _ver := _prev.version + 1;
  END IF;

  _key := md5(concat_ws('|','AML11', _dec::text, _uid::text, _conclusion, _rationale,
    COALESCE(_amends::text,'-'), COALESCE(array_to_string(_ids,','),'-')));

  SELECT * INTO _existing FROM public.supervisory_outcome_evaluation WHERE idempotency_key = _key;
  IF _existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('evaluation_id', _existing.id, 'idempotent', true,
      'conclusion', _existing.conclusion, 'review_status', _existing.review_status);
  END IF;

  SELECT * INTO _existing FROM public.supervisory_outcome_evaluation
   WHERE consequence_decision_id = _dec AND review_status = 'SUBMITTED';
  IF _existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('evaluation_id', _existing.id, 'duplicate', true,
      'reason_code','EVALUATION_PENDING_REVIEW',
      'reason','An evaluation of this action is already awaiting review.',
      'conclusion', _existing.conclusion, 'review_status', _existing.review_status);
  END IF;
  IF _amends IS NULL THEN
    SELECT * INTO _existing FROM public.supervisory_outcome_evaluation
     WHERE consequence_decision_id = _dec AND review_status = 'APPROVED' AND superseded_by_id IS NULL;
    IF _existing.id IS NOT NULL THEN
      RETURN jsonb_build_object('evaluation_id', _existing.id, 'duplicate', true,
        'reason_code','EVALUATION_APPROVED_EXISTS',
        'reason','An approved evaluation of this action already exists. Amend it to record a new version.',
        'conclusion', _existing.conclusion, 'review_status', _existing.review_status);
    END IF;
  END IF;

  SELECT l.lead_regulator_id, l.sector_id INTO _reg, _sector FROM public.licensees l WHERE l.id = _d.entity_id;

  PERFORM set_config('app.supervisory_outcome_writer','governed', true);
  INSERT INTO public.supervisory_outcome_evaluation(
    entity_id, domain_code, regulator_id, sector_id, consequence_decision_id, action_type,
    target_kind, target_id, target_reference, action_objective, action_status, action_completed_at,
    source_kind, publication_id, risk_state_id, assessment_id, source_rating, rating_provenance,
    legacy_lineage, conclusion, rationale, limitations, recommended_next_step, evidence,
    review_status, version, supersedes_id, lineage, idempotency_key, prepared_by)
  VALUES (_d.entity_id, _d.domain_code, _reg, _sector, _dec, _d.action_type,
    _a->>'target_kind', (_a->>'target_id')::uuid, _a->>'target_reference',
    _a->>'action_objective', _a->>'action_status',
    NULLIF(_a->>'action_completed_at','')::timestamptz,
    _d.source_kind, _d.publication_id, _d.risk_state_id, _d.assessment_id,
    _d.source_rating, _d.rating_provenance, COALESCE((_a->>'legacy_lineage')::boolean,false),
    _conclusion, _rationale, NULLIF(btrim(COALESCE(_payload->>'limitations','')),''),
    NULLIF(btrim(COALESCE(_payload->>'recommended_next_step','')),''),
    COALESCE(_payload->'evidence','[]'::jsonb), 'SUBMITTED', _ver, _amends,
    (COALESCE(_d.lineage,'{}'::jsonb) || jsonb_build_object(
       'consequence_decision_id', _dec, 'action_status', _a->>'action_status',
       'action_completed_at', _a->>'action_completed_at')),
    _key, _uid)
  RETURNING id INTO _id;
  PERFORM set_config('app.supervisory_outcome_writer','', true);

  PERFORM public.log_compliance_audit('CREATE'::public.compliance_audit_action,
    'supervisory_outcome_evaluation', _id::text, NULL::jsonb,
    jsonb_build_object('entity_id', _d.entity_id, 'domain_code', _d.domain_code,
      'consequence_decision_id', _dec, 'conclusion', _conclusion, 'version', _ver,
      'target_kind', _a->>'target_kind', 'target_id', _a->>'target_id'),
    _rationale, NULL::text, NULL::inet, _d.lineage);

  RETURN jsonb_build_object('evaluation_id', _id, 'idempotent', false,
    'conclusion', _conclusion, 'review_status','SUBMITTED', 'version', _ver);
END $fn$;

REVOKE ALL ON FUNCTION public.supervisory_outcome_view(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_outcome_evaluate(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_outcome_view(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_outcome_evaluate(jsonb) TO authenticated, service_role;