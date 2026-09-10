-- AML-11 — GOVERNED EVALUATION OF SUPERVISORY ACTION OUTCOMES AND EFFECTIVENESS

CREATE TABLE IF NOT EXISTS public.supervisory_outcome_evaluation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL,
  domain_code text NOT NULL,
  regulator_id uuid,
  sector_id uuid,
  consequence_decision_id uuid NOT NULL REFERENCES public.supervisory_consequence_decision(id) ON DELETE RESTRICT,
  action_type text NOT NULL,
  target_kind text NOT NULL,
  target_id uuid NOT NULL,
  target_reference text,
  action_objective text NOT NULL,
  action_status text,
  action_completed_at timestamptz,
  source_kind text NOT NULL,
  publication_id uuid REFERENCES public.supervisory_assessment_risk_publication(id) ON DELETE RESTRICT,
  risk_state_id uuid REFERENCES public.entity_risk_state(id) ON DELETE RESTRICT,
  assessment_id uuid REFERENCES public.supervisory_assessment(id) ON DELETE RESTRICT,
  source_rating text,
  rating_provenance text NOT NULL,
  legacy_lineage boolean NOT NULL DEFAULT false,
  conclusion text NOT NULL,
  rationale text NOT NULL,
  limitations text,
  recommended_next_step text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_snapshot jsonb,
  review_status text NOT NULL DEFAULT 'SUBMITTED',
  review_note text,
  version integer NOT NULL DEFAULT 1,
  supersedes_id uuid REFERENCES public.supervisory_outcome_evaluation(id) ON DELETE RESTRICT,
  superseded_by_id uuid REFERENCES public.supervisory_outcome_evaluation(id) ON DELETE RESTRICT,
  followups jsonb NOT NULL DEFAULT '[]'::jsonb,
  lineage jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  prepared_by uuid,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT soe_conclusion CHECK (conclusion = ANY (ARRAY['NOT_ASSESSED','EFFECTIVE','PARTIALLY_EFFECTIVE','INEFFECTIVE','INCONCLUSIVE'])),
  CONSTRAINT soe_review_status CHECK (review_status = ANY (ARRAY['SUBMITTED','APPROVED','RETURNED'])),
  CONSTRAINT soe_rationale CHECK (length(btrim(rationale)) >= 20),
  CONSTRAINT soe_objective CHECK (length(btrim(action_objective)) > 0),
  CONSTRAINT soe_provenance CHECK (rating_provenance = ANY (ARRAY['COMPUTED','APPROVED_OVERRIDE','LEGACY_OFFICER_RATING','NOT_CALCULABLE','UNAVAILABLE'])),
  CONSTRAINT soe_domain CHECK (public.supervisory_domain_valid(domain_code))
);

CREATE UNIQUE INDEX IF NOT EXISTS soe_idempotency_uidx ON public.supervisory_outcome_evaluation(idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS soe_active_submitted_uidx
  ON public.supervisory_outcome_evaluation(consequence_decision_id) WHERE review_status = 'SUBMITTED';
CREATE UNIQUE INDEX IF NOT EXISTS soe_active_approved_uidx
  ON public.supervisory_outcome_evaluation(consequence_decision_id)
  WHERE review_status = 'APPROVED' AND superseded_by_id IS NULL;
CREATE INDEX IF NOT EXISTS soe_entity_idx ON public.supervisory_outcome_evaluation(entity_id, domain_code, prepared_at DESC);
CREATE INDEX IF NOT EXISTS soe_decision_idx ON public.supervisory_outcome_evaluation(consequence_decision_id);

GRANT SELECT ON public.supervisory_outcome_evaluation TO authenticated;
GRANT ALL ON public.supervisory_outcome_evaluation TO service_role;
ALTER TABLE public.supervisory_outcome_evaluation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS soe_read ON public.supervisory_outcome_evaluation;
CREATE POLICY soe_read ON public.supervisory_outcome_evaluation FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(),
  ARRAY['supervisory_spine.view','aml_supervision.view']));

/* ------------------------------------------------------------------ guards */
CREATE OR REPLACE FUNCTION public.supervisory_outcome_writer_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF current_setting('app.supervisory_outcome_writer', true) IS DISTINCT FROM 'governed' THEN
    RAISE EXCEPTION '% is written only by a governed supervisory outcome operation', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.supervisory_outcome_immutable_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'immutable: a supervisory outcome evaluation cannot be deleted' USING ERRCODE = '42501';
  END IF;
  IF NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.domain_code IS DISTINCT FROM OLD.domain_code
     OR NEW.consequence_decision_id IS DISTINCT FROM OLD.consequence_decision_id
     OR NEW.action_type IS DISTINCT FROM OLD.action_type
     OR NEW.target_kind IS DISTINCT FROM OLD.target_kind
     OR NEW.target_id IS DISTINCT FROM OLD.target_id
     OR NEW.action_objective IS DISTINCT FROM OLD.action_objective
     OR NEW.source_kind IS DISTINCT FROM OLD.source_kind
     OR NEW.publication_id IS DISTINCT FROM OLD.publication_id
     OR NEW.risk_state_id IS DISTINCT FROM OLD.risk_state_id
     OR NEW.assessment_id IS DISTINCT FROM OLD.assessment_id
     OR NEW.source_rating IS DISTINCT FROM OLD.source_rating
     OR NEW.rating_provenance IS DISTINCT FROM OLD.rating_provenance
     OR NEW.conclusion IS DISTINCT FROM OLD.conclusion
     OR NEW.rationale IS DISTINCT FROM OLD.rationale
     OR NEW.evidence IS DISTINCT FROM OLD.evidence
     OR NEW.prepared_by IS DISTINCT FROM OLD.prepared_by
     OR NEW.prepared_at IS DISTINCT FROM OLD.prepared_at
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.supersedes_id IS DISTINCT FROM OLD.supersedes_id
     OR NEW.lineage IS DISTINCT FROM OLD.lineage THEN
    RAISE EXCEPTION 'immutable: the source, conclusion, rationale, evidence, actor and lineage of an outcome evaluation cannot be altered - record a new version instead' USING ERRCODE = '42501';
  END IF;
  IF OLD.review_status = 'APPROVED'
     AND (NEW.review_status IS DISTINCT FROM OLD.review_status
          OR NEW.evidence_snapshot IS DISTINCT FROM OLD.evidence_snapshot
          OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
          OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at) THEN
    RAISE EXCEPTION 'immutable: an approved outcome evaluation is frozen - only supersession and governed follow-up linkage are permitted' USING ERRCODE = '42501';
  END IF;
  IF OLD.review_status = 'RETURNED' AND NEW.review_status <> 'RETURNED' THEN
    RAISE EXCEPTION 'immutable: a returned outcome evaluation is preserved as history - prepare a new version' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS soe_writer_guard ON public.supervisory_outcome_evaluation;
CREATE TRIGGER soe_writer_guard BEFORE INSERT OR UPDATE OR DELETE ON public.supervisory_outcome_evaluation
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_outcome_writer_guard();
DROP TRIGGER IF EXISTS soe_immutable_guard ON public.supervisory_outcome_evaluation;
CREATE TRIGGER soe_immutable_guard BEFORE UPDATE OR DELETE ON public.supervisory_outcome_evaluation
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_outcome_immutable_guard();

REVOKE ALL ON FUNCTION public.supervisory_outcome_writer_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_outcome_immutable_guard() FROM PUBLIC, anon, authenticated;

/* -------------------------------------------- eligibility (server-decided) */
CREATE OR REPLACE FUNCTION public.supervisory_outcome_action_internal(_decision_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
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
    WHEN 'SUPERVISORY_INTERVENTION' THEN
      _completed := _status = 'COMPLETED'; _cancelled := _status IN ('CANCELLED','REJECTED');
    WHEN 'EXAMINATION' THEN
      _completed := _status IN ('CLOSED','COMPLETED'); _cancelled := _status IN ('CANCELLED','WITHDRAWN');
    WHEN 'SUPERVISORY_FINDING' THEN
      _completed := _status = 'CLOSED'; _cancelled := _status IN ('WITHDRAWN','SUPERSEDED');
    WHEN 'REASSESSMENT_REQUIREMENT' THEN
      _completed := _status = 'FULFILLED'; _cancelled := _status = 'CANCELLED';
    WHEN 'ENFORCEMENT_ACTION' THEN
      _completed := _status IN ('CLOSED','COMPLETED'); _cancelled := _status IN ('CANCELLED','WITHDRAWN');
    ELSE
      _completed := false; _cancelled := false;
  END CASE;

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

  _completed_at := NULLIF(COALESCE(_tgt->>'closed_at', _tgt->>'completed_at', _tgt->>'updated_at'), '')::timestamptz;

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
END $fn$;

REVOKE ALL ON FUNCTION public.supervisory_outcome_action_internal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_outcome_action_internal(uuid) TO service_role;

/* ---------------------------------------------------------- evidence model */
CREATE OR REPLACE FUNCTION public.supervisory_outcome_evidence_internal(_uid uuid, _ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE _out jsonb := '[]'::jsonb; _r record; _conf boolean;
BEGIN
  IF _ids IS NULL OR array_length(_ids,1) IS NULL THEN RETURN _out; END IF;
  _conf := public.is_super_admin(_uid) OR public.has_permission(_uid,'aml_supervision','view_confidential');
  FOR _r IN SELECT * FROM public.supervisory_assessment_evidence_basis WHERE id = ANY (_ids) LOOP
    _out := _out || jsonb_build_array(jsonb_build_object(
      'evidence_id', _r.id, 'assessment_id', _r.assessment_id, 'entity_id', _r.entity_id,
      'evidence_type', _r.evidence_type,
      'restricted', upper(COALESCE(_r.confidentiality,'')) IN ('RESTRICTED','CONFIDENTIAL'),
      'title', CASE WHEN upper(COALESCE(_r.confidentiality,'')) IN ('RESTRICTED','CONFIDENTIAL') AND NOT _conf
                    THEN NULL ELSE _r.title END,
      'source_reference', CASE WHEN upper(COALESCE(_r.confidentiality,'')) IN ('RESTRICTED','CONFIDENTIAL') AND NOT _conf
                    THEN NULL ELSE _r.source_reference END,
      'as_of_date', _r.as_of_date, 'recorded_by', _r.recorded_by, 'origin', _r.origin));
  END LOOP;
  RETURN _out;
END $fn$;

REVOKE ALL ON FUNCTION public.supervisory_outcome_evidence_internal(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_outcome_evidence_internal(uuid, uuid[]) TO service_role;

/* ------------------------------------------------------------- read model */
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

  _may_prepare := public.is_super_admin(_uid)
    OR public.has_permission(_uid,'aml_supervision','review')
    OR public.has_permission(_uid,'supervisory_spine','review');
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

REVOKE ALL ON FUNCTION public.supervisory_outcome_view(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_outcome_view(uuid, text) TO authenticated, service_role;

/* ------------------------------------------------------ governed evaluation */
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
  IF NOT (public.is_super_admin(_uid)
          OR public.has_permission(_uid,'aml_supervision','review')
          OR public.has_permission(_uid,'supervisory_spine','review')) THEN
    RAISE EXCEPTION 'not_authorized: supervisory review authority is required to evaluate an outcome' USING ERRCODE = '42501';
  END IF;

  _a := public.supervisory_outcome_action_internal(_dec);
  IF NOT COALESCE((_a->>'evaluable')::boolean,false) THEN
    RAISE EXCEPTION 'not_evaluable: % (%)', _a->>'reason', _a->>'reason_code' USING ERRCODE = '55000';
  END IF;

  /* evidence: same context, viewable, never fabricated */
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
               OR b.assessment_id = COALESCE(_d.assessment_id, b.assessment_id))
          AND (_d.assessment_id IS NULL OR b.assessment_id = _d.assessment_id
               OR b.entity_id IS NOT DISTINCT FROM _d.entity_id));
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

  SELECT l.regulator_id, l.sector_id INTO _reg, _sector FROM public.licensees l WHERE l.id = _d.entity_id;

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

REVOKE ALL ON FUNCTION public.supervisory_outcome_evaluate(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_outcome_evaluate(jsonb) TO authenticated, service_role;

/* ---------------------------------------------------- maker-checker review */
CREATE OR REPLACE FUNCTION public.supervisory_outcome_review(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _id uuid := NULLIF(_payload->>'evaluation_id','')::uuid;
  _dec text := upper(COALESCE(NULLIF(_payload->>'decision',''),''));
  _note text := btrim(COALESCE(_payload->>'note',''));
  _e public.supervisory_outcome_evaluation; _snap jsonb; _ids uuid[];
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF _dec NOT IN ('APPROVE','RETURN') THEN
    RAISE EXCEPTION 'unsupported_decision: % is not a governed review decision', _dec USING ERRCODE = '22023';
  END IF;
  IF length(_note) < 20 THEN
    RAISE EXCEPTION 'rationale_required: a written review note of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _e FROM public.supervisory_outcome_evaluation WHERE id = _id FOR UPDATE;
  IF _e.id IS NULL THEN
    RAISE EXCEPTION 'not_found: outcome evaluation' USING ERRCODE = '22023';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _e.entity_id);
  IF NOT (public.is_super_admin(_uid)
          OR public.has_permission(_uid,'aml_supervision','approve')
          OR public.has_permission(_uid,'supervisory_spine','approve')) THEN
    RAISE EXCEPTION 'not_authorized: supervisory approval authority is required to review an outcome evaluation' USING ERRCODE = '42501';
  END IF;
  IF _e.prepared_by = _uid THEN
    RAISE EXCEPTION 'self_review_refused: the supervisor who prepared an outcome evaluation cannot review it' USING ERRCODE = '42501';
  END IF;
  IF _e.review_status <> 'SUBMITTED' THEN
    RAISE EXCEPTION 'state_not_eligible: this evaluation is already %', _e.review_status USING ERRCODE = '55000';
  END IF;

  SELECT COALESCE(array_agg((x->>'evidence_id')::uuid), '{}'::uuid[]) INTO _ids
    FROM jsonb_array_elements(COALESCE(_e.evidence,'[]'::jsonb)) x
   WHERE NULLIF(x->>'evidence_id','') IS NOT NULL;

  PERFORM set_config('app.supervisory_outcome_writer','governed', true);
  IF _dec = 'APPROVE' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(b) - 'note'), '[]'::jsonb) INTO _snap
      FROM public.supervisory_assessment_evidence_basis b WHERE b.id = ANY (_ids);
    UPDATE public.supervisory_outcome_evaluation
       SET review_status = 'APPROVED', reviewed_by = _uid, reviewed_at = now(),
           review_note = _note, evidence_snapshot = _snap
     WHERE id = _id;
    IF _e.supersedes_id IS NOT NULL THEN
      UPDATE public.supervisory_outcome_evaluation SET superseded_by_id = _id WHERE id = _e.supersedes_id;
    END IF;
  ELSE
    UPDATE public.supervisory_outcome_evaluation
       SET review_status = 'RETURNED', reviewed_by = _uid, reviewed_at = now(), review_note = _note
     WHERE id = _id;
  END IF;
  PERFORM set_config('app.supervisory_outcome_writer','', true);

  PERFORM public.log_compliance_audit(
    CASE WHEN _dec = 'APPROVE' THEN 'APPROVE'::public.compliance_audit_action
         ELSE 'REJECT'::public.compliance_audit_action END,
    'supervisory_outcome_evaluation', _id::text, to_jsonb(_e),
    jsonb_build_object('review_status', CASE WHEN _dec='APPROVE' THEN 'APPROVED' ELSE 'RETURNED' END,
      'reviewed_by', _uid, 'conclusion', _e.conclusion),
    _note, NULL::text, NULL::inet, _e.lineage);

  RETURN jsonb_build_object('evaluation_id', _id,
    'review_status', CASE WHEN _dec='APPROVE' THEN 'APPROVED' ELSE 'RETURNED' END,
    'reviewed_by', _uid, 'frozen', _dec = 'APPROVE');
END $fn$;

REVOKE ALL ON FUNCTION public.supervisory_outcome_review(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_outcome_review(jsonb) TO authenticated, service_role;

/* --------------------------------------------------- governed follow-up use */
CREATE OR REPLACE FUNCTION public.supervisory_outcome_followup(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _id uuid := NULLIF(_payload->>'evaluation_id','')::uuid;
  _e public.supervisory_outcome_evaluation; _res jsonb; _cons jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _e FROM public.supervisory_outcome_evaluation WHERE id = _id FOR UPDATE;
  IF _e.id IS NULL THEN
    RAISE EXCEPTION 'not_found: outcome evaluation' USING ERRCODE = '22023';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _e.entity_id);
  IF _e.review_status <> 'APPROVED' OR _e.superseded_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'state_not_eligible: only a current approved evaluation can support a follow-up' USING ERRCODE = '55000';
  END IF;
  IF _e.conclusion NOT IN ('PARTIALLY_EFFECTIVE','INEFFECTIVE','INCONCLUSIVE') THEN
    RAISE EXCEPTION 'state_not_eligible: an effective outcome does not support a follow-up consequence' USING ERRCODE = '55000';
  END IF;
  IF length(btrim(COALESCE(_payload->>'rationale',''))) < 20 THEN
    RAISE EXCEPTION 'rationale_required: the supervisor must justify the follow-up in writing' USING ERRCODE = '22023';
  END IF;

  /* the follow-up is created only by the canonical AML-08 governed operation */
  _cons := jsonb_strip_nulls((_payload - 'evaluation_id')
    || jsonb_build_object('entity_id', _e.entity_id, 'domain_code', _e.domain_code,
         'assessment_id', _e.assessment_id));
  _res := public.supervisory_consequence_record(_cons);

  PERFORM set_config('app.supervisory_outcome_writer','governed', true);
  UPDATE public.supervisory_outcome_evaluation
     SET followups = COALESCE(followups,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'decision_id', _res->>'decision_id', 'action_type', _res->>'action_type',
           'linkage_mode', _res->>'linkage_mode', 'target_kind', _res->>'target_kind',
           'target_id', _res->>'target_id', 'selected_by', _uid, 'selected_at', now(),
           'rationale', btrim(_payload->>'rationale'))
         )
   WHERE id = _id
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(followups,'[]'::jsonb)) f
                      WHERE f->>'decision_id' = _res->>'decision_id');
  PERFORM set_config('app.supervisory_outcome_writer','', true);

  RETURN _res || jsonb_build_object('evaluation_id', _id, 'automatic', false);
END $fn$;

REVOKE ALL ON FUNCTION public.supervisory_outcome_followup(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_outcome_followup(jsonb) TO authenticated, service_role;

/* ------------------------------------------- AML-10 factual outcome totals */
CREATE OR REPLACE FUNCTION public.supervisory_outcome_portfolio_totals_internal(_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _d text := upper(COALESCE(NULLIF(_payload->>'domain_code',''),'AML_CFT'));
  _reg uuid := NULLIF(_payload->>'regulator_id','')::uuid;
  _rec record; _a jsonb;
  _completed int := 0; _cancelled int := 0; _open int := 0; _pending int := 0;
  _eff int := 0; _part int := 0; _ineff int := 0; _incon int := 0; _notassessed int := 0;
  _legacy int := 0; _unevaluated int := 0; _await int := 0;
BEGIN
  FOR _rec IN
    SELECT c.id, c.entity_id, c.regulator_id FROM public.supervisory_consequence_decision c
     WHERE c.domain_code = _d AND c.status = 'RECORDED' AND c.target_id IS NOT NULL
       AND (_reg IS NULL OR c.regulator_id = _reg)
  LOOP
    IF NOT public.supervisory_monitoring_scope_admits(_uid, _d, _rec.entity_id, NULL, NULL) THEN
      CONTINUE;
    END IF;
    _a := public.supervisory_outcome_action_internal(_rec.id);
    IF _a IS NULL THEN CONTINUE; END IF;
    IF COALESCE((_a->>'legacy_lineage')::boolean,false) THEN _legacy := _legacy + 1; END IF;
    IF COALESCE((_a->>'action_cancelled')::boolean,false) THEN
      _cancelled := _cancelled + 1;
    ELSIF COALESCE((_a->>'action_completed')::boolean,false) THEN
      _completed := _completed + 1;
    ELSE
      _open := _open + 1;
    END IF;

    IF _a->'active_evaluation' IS NULL OR jsonb_typeof(_a->'active_evaluation') = 'null' THEN
      IF COALESCE((_a->>'action_completed')::boolean,false) THEN _pending := _pending + 1; END IF;
      _unevaluated := _unevaluated + 1;
    ELSIF (_a->'active_evaluation'->>'review_status') = 'SUBMITTED' THEN
      _await := _await + 1;
      IF COALESCE((_a->>'action_completed')::boolean,false) THEN _pending := _pending + 1; END IF;
    ELSE
      CASE _a->'active_evaluation'->>'conclusion'
        WHEN 'EFFECTIVE' THEN _eff := _eff + 1;
        WHEN 'PARTIALLY_EFFECTIVE' THEN _part := _part + 1;
        WHEN 'INEFFECTIVE' THEN _ineff := _ineff + 1;
        WHEN 'INCONCLUSIVE' THEN _incon := _incon + 1;
        ELSE _notassessed := _notassessed + 1;
      END CASE;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'source','supervisory_outcome_evaluation',
    'linked_actions_total', _completed + _open + _cancelled,
    'completed_actions_total', _completed,
    'open_actions_total', _open,
    'cancelled_actions_total', _cancelled,
    'evaluations_pending_total', _pending,
    'evaluations_awaiting_review_total', _await,
    'effective_total', _eff,
    'partially_effective_total', _part,
    'ineffective_total', _ineff,
    'inconclusive_total', _incon,
    'not_assessed_total', _notassessed,
    'unevaluated_actions_total', _unevaluated,
    'legacy_lineage_actions_total', _legacy,
    'evaluated_total', _eff + _part + _ineff + _incon + _notassessed,
    'note','Counts of records only. Completion is not effectiveness, and unevaluated or legacy actions are never counted as an outcome.');
END $fn$;

REVOKE ALL ON FUNCTION public.supervisory_outcome_portfolio_totals_internal(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_outcome_portfolio_totals_internal(jsonb) TO service_role;

/* ------------------------- portfolio wrappers now publish outcome totals */
CREATE OR REPLACE FUNCTION public.supervisory_portfolio_report(_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_super_admin(_uid) OR public.has_any_permission(_uid,
      ARRAY['aml_supervision.view','supervisory_spine.view'])) THEN
    RAISE EXCEPTION 'not_authorized: supervisory view authority is required' USING ERRCODE = '42501';
  END IF;
  RETURN public.supervisory_portfolio_internal(_payload)
    || jsonb_build_object('outcome_summary', public.supervisory_outcome_portfolio_totals_internal(_payload));
END $fn$;

CREATE OR REPLACE FUNCTION public.supervisory_portfolio_export(_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  _uid uuid := auth.uid();
  _r jsonb;
  _actor text;
  _rows jsonb := '[]'::jsonb;
  _row jsonb;
  _k text;
  _safe jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_super_admin(_uid) OR public.has_any_permission(_uid,
      ARRAY['aml_supervision.view','supervisory_spine.view'])) THEN
    RAISE EXCEPTION 'not_authorized: supervisory view authority is required' USING ERRCODE = '42501';
  END IF;

  _r := public.supervisory_portfolio_internal(_payload);

  SELECT COALESCE(p.full_name, u.email, _uid::text) INTO _actor
    FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE u.id = _uid;

  FOR _row IN SELECT r FROM jsonb_array_elements(COALESCE(_r->'entities','[]'::jsonb)) r LOOP
    _safe := _row;
    FOR _k IN SELECT jsonb_object_keys(_row) LOOP
      IF jsonb_typeof(_row->_k) = 'string' THEN
        _safe := jsonb_set(_safe, ARRAY[_k],
                   to_jsonb(public.supervisory_export_text_safe(_row->>_k)));
      END IF;
    END LOOP;
    _rows := _rows || jsonb_build_array(_safe);
  END LOOP;

  RETURN jsonb_build_object(
    'report_title','AML/CFT portfolio risk and management report',
    'domain_code', _r->>'domain_code',
    'regulator_id', _r->'summary'->>'regulator_id',
    'generated_by', COALESCE(_actor, _uid::text),
    'generated_by_id', _uid,
    'generated_at', _r->>'generated_at',
    'as_of', _r->>'as_of',
    'filters', _r->'filters',
    'summary', _r->'summary',
    'risk_distribution', _r->'risk_distribution',
    'review_distribution', _r->'review_distribution',
    'trends', _r->'trends',
    'outcome_summary', public.supervisory_outcome_portfolio_totals_internal(_payload),
    'entities', _rows,
    'row_count', _r->'row_count',
    'truncated', _r->'truncated',
    'csv_injection_neutralised', true,
    'notes', _r->'notes');
END $fn$;

REVOKE ALL ON FUNCTION public.supervisory_portfolio_report(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_portfolio_export(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_portfolio_report(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supervisory_portfolio_export(jsonb) TO authenticated, service_role;

COMMENT ON TABLE public.supervisory_outcome_evaluation IS
  'AML-11 append-only governed evaluation of whether a completed AML/CFT supervisory action achieved its recorded objective. Completion is never treated as effectiveness; the entity risk-of-record is never changed; approval freezes the conclusion, rationale and evidence and corrections are new versions.';
COMMENT ON FUNCTION public.supervisory_outcome_view(uuid, text) IS
  'AML-11 server-authoritative outcome and effectiveness read model: eligibility, conclusions, evidence, maker-checker state, decision history and available governed follow-ups.';