-- =====================================================================
-- PCOMP-R2A (2/3) — content validation engine, governed exception record,
-- and the server-authoritative evidence policy runtime.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.supervisory_policy_component_content_validate(
  _component_type text, _content jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE _c jsonb; _coll text; _items jsonb; _item jsonb; _errors text[] := ARRAY[]::text[];
        _i integer := 0; _f text; _label text; _allowed jsonb; _val jsonb; _arr jsonb; _e jsonb;
        _ct text; _norm jsonb;
BEGIN
  _ct := upper(btrim(COALESCE(_component_type,'')));
  _c  := public.supervisory_policy_component_content_contract(_ct);
  IF _c IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'errors',
      to_jsonb(ARRAY['unsupported_component_type: no content contract is registered for '
                     || COALESCE(_component_type,'(null)')]));
  END IF;

  _norm := _content;
  IF _ct = 'EVIDENCE_POLICY' THEN
    _norm := COALESCE(_content,'{}'::jsonb)
             || jsonb_build_object('rules', public.supervisory_evidence_policy_rules(_content));
  END IF;

  _coll  := _c->>'collection';
  _label := _c->>'item_label';
  _items := COALESCE(_norm->_coll, 'null'::jsonb);

  IF jsonb_typeof(_items) <> 'array' THEN
    _errors := _errors || format('%s must be provided as a list of %s entries', _coll, _label);
  ELSIF jsonb_array_length(_items) = 0 THEN
    _errors := _errors || format('at least one %s must be configured', _label);
  ELSE
    FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
      _i := _i + 1;
      IF jsonb_typeof(_item) <> 'object' THEN
        _errors := _errors || format('%s %s is not a valid entry', _label, _i);
        CONTINUE;
      END IF;

      FOR _f IN SELECT jsonb_array_elements_text(_c->'required_fields') LOOP
        _val := _item->_f;
        IF _val IS NULL OR _val = 'null'::jsonb
           OR (jsonb_typeof(_val) = 'string' AND btrim(_val #>> '{}') = '') THEN
          _errors := _errors || format('%s %s: %s is required', _label, _i, _f);
        END IF;
      END LOOP;

      IF _c ? 'enums' THEN
        FOR _f IN SELECT jsonb_object_keys(_c->'enums') LOOP
          _allowed := _c->'enums'->_f;
          IF _item ? _f AND jsonb_typeof(_item->_f) = 'string'
             AND NOT (_allowed @> to_jsonb(upper(btrim(_item->>_f)))) THEN
            _errors := _errors || format('%s %s: %s must be one of %s', _label, _i, _f,
                                         array_to_string(ARRAY(SELECT jsonb_array_elements_text(_allowed)), ', '));
          END IF;
        END LOOP;
      END IF;

      IF _c ? 'non_empty_arrays' THEN
        FOR _f IN SELECT jsonb_array_elements_text(_c->'non_empty_arrays') LOOP
          _arr := _item->_f;
          IF _arr IS NULL OR jsonb_typeof(_arr) <> 'array' OR jsonb_array_length(_arr) = 0 THEN
            _errors := _errors || format('%s %s: %s must contain at least one entry', _label, _i, _f);
          END IF;
        END LOOP;
      END IF;

      IF _c ? 'enum_arrays' THEN
        FOR _f IN SELECT jsonb_object_keys(_c->'enum_arrays') LOOP
          _allowed := _c->'enum_arrays'->_f;
          IF jsonb_typeof(COALESCE(_item->_f,'null'::jsonb)) = 'array' THEN
            FOR _e IN SELECT * FROM jsonb_array_elements(_item->_f) LOOP
              IF NOT (_allowed @> to_jsonb(upper(btrim(_e #>> '{}')))) THEN
                _errors := _errors || format('%s %s: %s value %s is not permitted', _label, _i, _f, _e #>> '{}');
              END IF;
            END LOOP;
          END IF;
        END LOOP;
      END IF;

      IF _c ? 'booleans' THEN
        FOR _f IN SELECT jsonb_array_elements_text(_c->'booleans') LOOP
          IF _item ? _f AND _item->_f <> 'null'::jsonb
             AND jsonb_typeof(_item->_f) <> 'boolean' THEN
            _errors := _errors || format('%s %s: %s must be yes or no', _label, _i, _f);
          END IF;
        END LOOP;
      END IF;

      IF _c ? 'positive_numbers' THEN
        FOR _f IN SELECT jsonb_array_elements_text(_c->'positive_numbers') LOOP
          IF _item ? _f AND _item->_f <> 'null'::jsonb THEN
            BEGIN
              IF (_item->>_f)::numeric <= 0 THEN
                _errors := _errors || format('%s %s: %s must be greater than zero', _label, _i, _f);
              END IF;
            EXCEPTION WHEN OTHERS THEN
              _errors := _errors || format('%s %s: %s must be a number', _label, _i, _f);
            END;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  IF _ct = 'EVIDENCE_POLICY' THEN
    _errors := _errors || public.supervisory_evidence_policy_content_errors(_content);
  END IF;

  RETURN jsonb_build_object(
    'valid', array_length(_errors,1) IS NULL,
    'contract', _c,
    'normalised', CASE WHEN _ct = 'EVIDENCE_POLICY' THEN _norm ELSE NULL::jsonb END,
    'item_count', CASE WHEN jsonb_typeof(_items) = 'array' THEN jsonb_array_length(_items) ELSE 0 END,
    'errors', to_jsonb(_errors));
END $$;

-- ------------------------------------------------- governed exceptions --
CREATE TABLE IF NOT EXISTS public.supervisory_assessment_evidence_exception (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id uuid NOT NULL REFERENCES public.supervisory_assessment(id) ON DELETE RESTRICT,
  policy_component_id uuid NOT NULL REFERENCES public.supervisory_policy_component(id) ON DELETE RESTRICT,
  policy_component_version text NOT NULL,
  rule_code text NOT NULL,
  scope_type text NOT NULL CHECK (scope_type IN ('ASSESSMENT','DIMENSION','QUESTION')),
  scope_reference text,
  methodology_question_id uuid REFERENCES public.supervisory_methodology_question(id) ON DELETE RESTRICT,
  methodology_dimension_id uuid REFERENCES public.supervisory_methodology_dimension(id) ON DELETE RESTRICT,
  deficiency jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale text NOT NULL,
  status text NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','APPROVED','REJECTED','WITHDRAWN')),
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_rationale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.supervisory_assessment_evidence_exception TO authenticated;
GRANT ALL ON public.supervisory_assessment_evidence_exception TO service_role;
ALTER TABLE public.supervisory_assessment_evidence_exception ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evidence exceptions readable with their assessment"
  ON public.supervisory_assessment_evidence_exception;
CREATE POLICY "evidence exceptions readable with their assessment"
  ON public.supervisory_assessment_evidence_exception FOR SELECT TO authenticated
  USING (public.supervisory_assessment_question_readable(auth.uid(), assessment_id));

CREATE UNIQUE INDEX IF NOT EXISTS supervisory_assessment_evidence_exception_open_uniq
  ON public.supervisory_assessment_evidence_exception
     (assessment_id, rule_code, scope_type, COALESCE(scope_reference,''),
      COALESCE(methodology_question_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(methodology_dimension_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status IN ('REQUESTED','APPROVED');

CREATE INDEX IF NOT EXISTS supervisory_assessment_evidence_exception_assessment_idx
  ON public.supervisory_assessment_evidence_exception (assessment_id, status);

CREATE OR REPLACE FUNCTION public.tg_supervisory_assessment_evidence_exception_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'immutable: evidence exceptions are append-only and cannot be deleted'
      USING ERRCODE = '42501';
  END IF;
  IF COALESCE(current_setting('supervisory.evidence_exception_writer', true),'') <> 'on' THEN
    RAISE EXCEPTION 'not_authorized: evidence exceptions may only be changed through the governed exception operations'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.status <> 'REQUESTED' THEN
    RAISE EXCEPTION 'immutable: this exception has already been decided' USING ERRCODE = '42501';
  END IF;
  IF NEW.assessment_id <> OLD.assessment_id OR NEW.rule_code <> OLD.rule_code
     OR NEW.scope_type <> OLD.scope_type OR NEW.rationale <> OLD.rationale
     OR NEW.policy_component_id <> OLD.policy_component_id
     OR NEW.requested_by <> OLD.requested_by THEN
    RAISE EXCEPTION 'immutable: the request record of an evidence exception cannot be rewritten'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS supervisory_assessment_evidence_exception_guard_trg
  ON public.supervisory_assessment_evidence_exception;
CREATE TRIGGER supervisory_assessment_evidence_exception_guard_trg
  BEFORE UPDATE OR DELETE ON public.supervisory_assessment_evidence_exception
  FOR EACH ROW EXECUTE FUNCTION public.tg_supervisory_assessment_evidence_exception_guard();

-- --------------------------------------------------------- the runtime --
CREATE OR REPLACE FUNCTION public.supervisory_assessment_evidence_policy_internal(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.supervisory_assessment; _snap public.supervisory_assessment_policy_snapshot;
        _bound jsonb; _cid uuid; _comp public.supervisory_policy_component;
        _rules jsonb; _r jsonb; _t record; _dec jsonb := '[]'::jsonb; _reasons jsonb;
        _ref date; _min int; _qual int; _stale int; _distinct int; _kinds text[];
        _perm text[]; _req text[]; _k text; _obs text; _resp text; _band text;
        _exc public.supervisory_assessment_evidence_exception; _decision text;
        _blocking int; _target_code text; _applies boolean;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;

  SELECT * INTO _snap FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id = _assessment_id;
  IF _snap.id IS NULL THEN
    RETURN jsonb_build_object('assessment_id', _assessment_id, 'status','NOT_GOVERNED',
      'reason_code','NO_POLICY_BASIS',
      'reason','This assessment has no policy basis snapshot, so no evidence policy governs it. The methodology''s own evidence requirements continue to apply.',
      'decisions','[]'::jsonb, 'blocking_count', 0, 'evaluated_at', now());
  END IF;

  SELECT x INTO _bound FROM jsonb_array_elements(_snap.components) x
   WHERE x->>'component_type' = 'EVIDENCE_POLICY';
  IF _bound IS NULL THEN
    RETURN jsonb_build_object('assessment_id', _assessment_id, 'status','NOT_GOVERNED',
      'reason_code','EVIDENCE_POLICY_NOT_BOUND',
      'reason','The policy profile governing this assessment binds no evidence policy, so only the methodology''s own evidence requirements apply.',
      'policy_profile_code', _snap.policy_profile_code,
      'policy_profile_version', _snap.policy_profile_version,
      'decisions','[]'::jsonb, 'blocking_count', 0, 'evaluated_at', now());
  END IF;

  _cid := NULLIF(_bound->>'component_id','')::uuid;
  SELECT * INTO _comp FROM public.supervisory_policy_component WHERE id = _cid;
  IF _comp.id IS NULL THEN
    RETURN jsonb_build_object('assessment_id', _assessment_id, 'status','UNAVAILABLE',
      'reason_code','PINNED_POLICY_MISSING',
      'reason','The exact evidence policy version recorded in this assessment''s policy basis can no longer be read.',
      'decisions','[]'::jsonb, 'blocking_count', 0, 'evaluated_at', now());
  END IF;

  _rules := public.supervisory_evidence_policy_rules(_comp.content);
  _ref   := COALESCE(_a.period_end, current_date);

  FOR _r IN SELECT * FROM jsonb_array_elements(_rules) LOOP
    _min  := GREATEST(COALESCE((_r->>'minimum_items')::int, 1), 1);
    _perm := ARRAY(SELECT jsonb_array_elements_text(_r->'permitted_source_kinds'));
    _req  := ARRAY(SELECT jsonb_array_elements_text(_r->'required_source_kinds'));

    FOR _t IN
      WITH scoped AS (
        SELECT q.id AS question_id, q.question_code, d.id AS dimension_id, d.dimension_code
          FROM public.supervisory_methodology_question q
          JOIN public.supervisory_methodology_dimension d ON d.id = q.methodology_dimension_id
         WHERE q.methodology_id = _a.methodology_id AND q.active AND d.active
           AND (NOT EXISTS (SELECT 1 FROM public.supervisory_assessment_question_plan pp
                             WHERE pp.assessment_id = _assessment_id)
                OR COALESCE(public.supervisory_assessment_question_plan_state(_assessment_id, q.id),'')
                   LIKE 'INCLUDED%')
      )
      SELECT * FROM (
        SELECT NULL::uuid AS question_id, NULL::text AS question_code,
               NULL::uuid AS dimension_id, NULL::text AS dimension_code
         WHERE (_r->>'scope_type') = 'ASSESSMENT'
        UNION ALL
        SELECT NULL::uuid, NULL::text, s.dimension_id, s.dimension_code
          FROM (SELECT DISTINCT dimension_id, dimension_code FROM scoped) s
         WHERE (_r->>'scope_type') = 'DIMENSION'
           AND (COALESCE(_r->>'scope_reference','') = '' OR s.dimension_code = _r->>'scope_reference')
        UNION ALL
        SELECT s.question_id, s.question_code, s.dimension_id, s.dimension_code
          FROM scoped s
         WHERE (_r->>'scope_type') = 'QUESTION'
           AND (COALESCE(_r->>'scope_reference','') = '' OR s.question_code = _r->>'scope_reference')
      ) t ORDER BY t.dimension_code NULLS FIRST, t.question_code NULLS FIRST
    LOOP
      _reasons := '[]'::jsonb;
      _exc := NULL;
      _target_code := COALESCE(_t.question_code, _t.dimension_code, 'ASSESSMENT');
      _obs := NULL; _resp := NULL; _band := NULL; _applies := true;

      IF _t.question_id IS NOT NULL THEN
        SELECT upper(btrim(COALESCE(response,''))), COALESCE(observation,'')
          INTO _resp, _obs
          FROM public.supervisory_assessment_question_response
         WHERE assessment_id = _assessment_id AND methodology_question_id = _t.question_id;
      ELSIF _t.dimension_id IS NOT NULL THEN
        SELECT upper(btrim(COALESCE(residual_rating,''))) INTO _band
          FROM public.supervisory_assessment_dimension
         WHERE assessment_id = _assessment_id AND methodology_dimension_id = _t.dimension_id;
      END IF;

      IF jsonb_array_length(_r->'applies_to_responses') > 0 THEN
        _applies := (_r->'applies_to_responses') @> to_jsonb(COALESCE(NULLIF(_resp,''), NULLIF(_band,''), ''));
      END IF;
      IF _resp = 'NOT_APPLICABLE' THEN _applies := false; END IF;

      SELECT count(*) FILTER (
               WHERE (cardinality(_perm) = 0 OR e.evidence_type = ANY (_perm))
                 AND ((_r->>'maximum_age_days') IS NULL
                      OR COALESCE(e.as_of_date, e.period_end, e.retrieved_at::date, e.created_at::date)
                         >= (_ref - ((_r->>'maximum_age_days')::int)))),
             count(*) FILTER (
               WHERE (cardinality(_perm) = 0 OR e.evidence_type = ANY (_perm))
                 AND (_r->>'maximum_age_days') IS NOT NULL
                 AND COALESCE(e.as_of_date, e.period_end, e.retrieved_at::date, e.created_at::date)
                     < (_ref - ((_r->>'maximum_age_days')::int))),
             count(DISTINCT COALESCE(e.source_object_id::text,
                                     upper(btrim(COALESCE(e.source_reference, e.id::text))))) FILTER (
               WHERE (cardinality(_perm) = 0 OR e.evidence_type = ANY (_perm))),
             array_remove(array_agg(DISTINCT e.evidence_type), NULL)
        INTO _qual, _stale, _distinct, _kinds
        FROM public.supervisory_assessment_evidence_basis e
       WHERE e.assessment_id = _assessment_id
         AND (
           (_t.question_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM public.supervisory_assessment_question_evidence qe
              WHERE qe.evidence_id = e.id AND qe.methodology_question_id = _t.question_id))
           OR (_t.dimension_id IS NOT NULL AND _t.question_id IS NULL AND (
             EXISTS (SELECT 1 FROM public.supervisory_assessment_dimension_evidence de
                      WHERE de.evidence_id = e.id AND de.methodology_dimension_id = _t.dimension_id)
             OR EXISTS (SELECT 1 FROM public.supervisory_assessment_question_evidence qe
                          JOIN public.supervisory_methodology_question q ON q.id = qe.methodology_question_id
                         WHERE qe.evidence_id = e.id AND q.methodology_dimension_id = _t.dimension_id)))
           OR (_t.question_id IS NULL AND _t.dimension_id IS NULL)
         );

      _qual := COALESCE(_qual,0); _stale := COALESCE(_stale,0); _distinct := COALESCE(_distinct,0);

      IF (_r->>'evidence_requirement') <> 'REQUIRED' OR NOT _applies THEN
        _decision := 'NOT_REQUIRED';
      ELSE
        IF _qual < _min THEN
          _reasons := _reasons || jsonb_build_object('code','MINIMUM_EVIDENCE_NOT_MET',
            'message', format('%s of %s qualifying item(s) of evidence are on file.', _qual, _min));
        END IF;
        IF _stale > 0 AND _qual < _min THEN
          _reasons := _reasons || jsonb_build_object('code','EVIDENCE_OUT_OF_POLICY_AGE',
            'message', format('%s item(s) of evidence are older than the %s day(s) the policy allows.',
                              _stale, _r->>'maximum_age_days'));
        END IF;
        FOREACH _k IN ARRAY _req LOOP
          IF NOT (COALESCE(_kinds, ARRAY[]::text[]) @> ARRAY[_k]) THEN
            _reasons := _reasons || jsonb_build_object('code','REQUIRED_SOURCE_KIND_MISSING',
              'message', format('The policy requires evidence of kind %s, which is not on file.', _k));
          END IF;
        END LOOP;
        IF COALESCE((_r->>'independent_sources_required')::int,0) > _distinct THEN
          _reasons := _reasons || jsonb_build_object('code','INDEPENDENT_CORROBORATION_MISSING',
            'message', format('%s independent source(s) are required; %s distinct source(s) are cited.',
                              _r->>'independent_sources_required', _distinct));
        END IF;
        IF COALESCE((_r->>'rationale_required')::boolean,false)
           AND _t.question_id IS NOT NULL AND length(btrim(COALESCE(_obs,''))) < 10 THEN
          _reasons := _reasons || jsonb_build_object('code','EVIDENCE_RATIONALE_MISSING',
            'message','The policy requires a written explanation of how the evidence supports the answer.');
        END IF;

        IF jsonb_array_length(_reasons) = 0 THEN
          _decision := 'SATISFIED';
        ELSE
          SELECT * INTO _exc FROM public.supervisory_assessment_evidence_exception
           WHERE assessment_id = _assessment_id AND rule_code = _r->>'rule_code'
             AND scope_type = _r->>'scope_type'
             AND COALESCE(methodology_question_id, '00000000-0000-0000-0000-000000000000'::uuid)
                 = COALESCE(_t.question_id, '00000000-0000-0000-0000-000000000000'::uuid)
             AND COALESCE(methodology_dimension_id, '00000000-0000-0000-0000-000000000000'::uuid)
                 = COALESCE(_t.dimension_id, '00000000-0000-0000-0000-000000000000'::uuid)
             AND status IN ('REQUESTED','APPROVED')
           ORDER BY requested_at DESC LIMIT 1;

          IF _exc.id IS NOT NULL AND _exc.status = 'APPROVED' THEN
            _decision := 'EXCEPTION_APPROVED';
          ELSIF COALESCE((_r->>'exception_allowed')::boolean,false) THEN
            _decision := 'EXCEPTION_REQUIRED';
          ELSE
            _decision := 'UNSATISFIED';
          END IF;
        END IF;
      END IF;

      _dec := _dec || jsonb_build_object(
        'rule_code', _r->>'rule_code',
        'rule_label', _r->>'label',
        'scope_type', _r->>'scope_type',
        'scope_reference', _r->>'scope_reference',
        'target_code', _target_code,
        'question_id', _t.question_id, 'question_code', _t.question_code,
        'dimension_id', _t.dimension_id, 'dimension_code', _t.dimension_code,
        'decision', _decision,
        'blocking', _decision IN ('UNSATISFIED','EXCEPTION_REQUIRED'),
        'required_items', CASE WHEN (_r->>'evidence_requirement') = 'REQUIRED' THEN _min ELSE 0 END,
        'qualifying_items', _qual,
        'stale_items', _stale,
        'distinct_sources', _distinct,
        'permitted_source_kinds', _r->'permitted_source_kinds',
        'required_source_kinds', _r->'required_source_kinds',
        'maximum_age_days', _r->'maximum_age_days',
        'exception_allowed', COALESCE((_r->>'exception_allowed')::boolean,false),
        'exception_id', _exc.id, 'exception_status', _exc.status,
        'reasons', _reasons);
    END LOOP;
  END LOOP;

  SELECT count(*) INTO _blocking FROM jsonb_array_elements(_dec) x WHERE (x->>'blocking')::boolean;

  RETURN jsonb_build_object(
    'assessment_id', _assessment_id,
    'status','EVALUATED',
    'reason_code','EVALUATED',
    'reason','Evidence sufficiency was decided by the exact evidence policy version recorded in this assessment''s policy basis.',
    'policy_profile_code', _snap.policy_profile_code,
    'policy_profile_version', _snap.policy_profile_version,
    'policy_component_id', _comp.id,
    'policy_component_code', _comp.code,
    'policy_component_version', _comp.component_version,
    'policy_component_status_now', _comp.status,
    'policy_content_hash', _bound->>'content_hash',
    'reference_date', _ref,
    'rule_count', jsonb_array_length(_rules),
    'decision_count', jsonb_array_length(_dec),
    'satisfied_count', (SELECT count(*) FROM jsonb_array_elements(_dec) x WHERE x->>'decision' = 'SATISFIED'),
    'exception_approved_count', (SELECT count(*) FROM jsonb_array_elements(_dec) x
                                  WHERE x->>'decision' = 'EXCEPTION_APPROVED'),
    'blocking_count', _blocking,
    'decisions', _dec,
    'evaluated_at', now());
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_evidence_policy_internal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_evidence_policy_internal(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_evidence_policy(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.supervisory_assessment_question_readable(auth.uid(), _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: assessment outside your supervisory authority' USING ERRCODE = '42501';
  END IF;
  RETURN public.supervisory_assessment_evidence_policy_internal(_assessment_id);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_evidence_policy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_evidence_policy(uuid) TO authenticated;