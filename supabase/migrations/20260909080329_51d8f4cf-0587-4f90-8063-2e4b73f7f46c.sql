
-- ================= Question plan store =================
CREATE TABLE IF NOT EXISTS public.supervisory_assessment_question_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.supervisory_assessment(id),
  question_id uuid NOT NULL REFERENCES public.supervisory_methodology_question(id),
  question_code text NOT NULL,
  methodology_id uuid NOT NULL,
  methodology_version text,
  dimension_id uuid,
  dimension_code text,
  question_class text,
  plan_state text NOT NULL,
  reason_code text NOT NULL,
  reason_text text,
  programme_set_id uuid,
  programme_id uuid,
  programme_code text,
  programme_version text,
  rule_id uuid,
  rule_version integer,
  resolution_mode text NOT NULL DEFAULT 'STRUCTURED',
  evaluated_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluation_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_assessment_question_plan_state_chk CHECK (
    plan_state IN ('INCLUDED_CORE','INCLUDED_CONDITIONAL','INCLUDED_ENHANCED','NOT_TRIGGERED','OUT_OF_SCOPE')),
  CONSTRAINT supervisory_assessment_question_plan_uq UNIQUE (assessment_id, question_id)
);
CREATE INDEX IF NOT EXISTS supervisory_assessment_question_plan_a_idx
  ON public.supervisory_assessment_question_plan(assessment_id, plan_state);

GRANT SELECT ON public.supervisory_assessment_question_plan TO authenticated;
GRANT ALL ON public.supervisory_assessment_question_plan TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.supervisory_assessment_question_plan FROM authenticated;
ALTER TABLE public.supervisory_assessment_question_plan ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Scoped staff read the assessment question plan" ON public.supervisory_assessment_question_plan;
CREATE POLICY "Scoped staff read the assessment question plan"
  ON public.supervisory_assessment_question_plan FOR SELECT TO authenticated
  USING (public.supervisory_assessment_question_readable(auth.uid(), assessment_id));

CREATE TABLE IF NOT EXISTS public.supervisory_assessment_question_plan_override (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.supervisory_assessment(id),
  question_id uuid NOT NULL REFERENCES public.supervisory_methodology_question(id),
  from_state text NOT NULL,
  to_state text NOT NULL,
  reason text NOT NULL,
  actor_id uuid,
  status text NOT NULL DEFAULT 'APPLIED',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_assessment_question_plan_override_state_chk CHECK (
    to_state IN ('INCLUDED_CONDITIONAL','INCLUDED_ENHANCED','OUT_OF_SCOPE')),
  CONSTRAINT supervisory_assessment_question_plan_override_uq UNIQUE (assessment_id, question_id)
);
GRANT SELECT ON public.supervisory_assessment_question_plan_override TO authenticated;
GRANT ALL ON public.supervisory_assessment_question_plan_override TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.supervisory_assessment_question_plan_override FROM authenticated;
ALTER TABLE public.supervisory_assessment_question_plan_override ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Scoped staff read plan overrides" ON public.supervisory_assessment_question_plan_override;
CREATE POLICY "Scoped staff read plan overrides"
  ON public.supervisory_assessment_question_plan_override FOR SELECT TO authenticated
  USING (public.supervisory_assessment_question_readable(auth.uid(), assessment_id));

-- Immutability: the plan is a historical scope decision.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_plan_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF COALESCE(current_setting('app.plan_rebuild', true), '') = 'on' AND TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'plan_immutable: the assessment question plan is a historical scope decision and cannot be % once materialised', lower(TG_OP)
    USING ERRCODE = '42501';
END $$;

DROP TRIGGER IF EXISTS trg_supervisory_assessment_question_plan_immutable
  ON public.supervisory_assessment_question_plan;
CREATE TRIGGER trg_supervisory_assessment_question_plan_immutable
  BEFORE UPDATE OR DELETE ON public.supervisory_assessment_question_plan
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_assessment_question_plan_immutable();

DROP TRIGGER IF EXISTS trg_supervisory_assessment_question_plan_override_immutable
  ON public.supervisory_assessment_question_plan_override;
CREATE TRIGGER trg_supervisory_assessment_question_plan_override_immutable
  BEFORE UPDATE ON public.supervisory_assessment_question_plan_override
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_assessment_question_plan_immutable();

-- ================= Evaluation =================
CREATE OR REPLACE FUNCTION public.supervisory_question_rule_evaluate(_def jsonb, _ctx jsonb, _depth integer DEFAULT 0)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE _op text; _src text; _val text; _child jsonb; _r text;
        _has_unresolved boolean := false; _has_false boolean := false; _has_true boolean := false;
BEGIN
  IF _depth > 8 OR _def IS NULL OR jsonb_typeof(_def) <> 'object' THEN RETURN 'UNRESOLVED'; END IF;
  _op := upper(btrim(COALESCE(_def->>'op','')));

  IF _op IN ('ALL','ANY') THEN
    FOR _child IN SELECT * FROM jsonb_array_elements(COALESCE(_def->'rules','[]'::jsonb)) LOOP
      _r := public.supervisory_question_rule_evaluate(_child, _ctx, _depth + 1);
      IF _r = 'UNRESOLVED' THEN _has_unresolved := true;
      ELSIF _r = 'TRUE' THEN _has_true := true;
      ELSE _has_false := true; END IF;
    END LOOP;
    IF _op = 'ALL' THEN
      IF _has_false THEN RETURN 'FALSE'; END IF;
      IF _has_unresolved THEN RETURN 'UNRESOLVED'; END IF;
      RETURN 'TRUE';
    ELSE
      IF _has_true THEN RETURN 'TRUE'; END IF;
      IF _has_unresolved THEN RETURN 'UNRESOLVED'; END IF;
      RETURN 'FALSE';
    END IF;
  END IF;

  IF _op = 'NOT' THEN
    _r := public.supervisory_question_rule_evaluate(_def->'rule', _ctx, _depth + 1);
    RETURN CASE _r WHEN 'TRUE' THEN 'FALSE' WHEN 'FALSE' THEN 'TRUE' ELSE 'UNRESOLVED' END;
  END IF;

  IF _op = 'TRUE' THEN RETURN 'TRUE'; END IF;
  IF _op = 'FALSE' THEN RETURN 'FALSE'; END IF;

  _src := upper(btrim(COALESCE(_def->>'source','')));
  IF NOT (_ctx ? _src) THEN RETURN 'UNRESOLVED'; END IF;
  _val := _ctx->>_src;

  IF _op = 'EXISTS' THEN RETURN CASE WHEN _val IS NOT NULL THEN 'TRUE' ELSE 'FALSE' END; END IF;
  IF _op = 'NOT_EXISTS' THEN RETURN CASE WHEN _val IS NULL THEN 'TRUE' ELSE 'FALSE' END; END IF;

  -- A comparison against an input the platform has not recorded is never "false".
  IF _val IS NULL THEN RETURN 'UNRESOLVED'; END IF;

  IF _op = 'EQ' THEN RETURN CASE WHEN _val = _def->>'value' THEN 'TRUE' ELSE 'FALSE' END; END IF;
  IF _op = 'NEQ' THEN RETURN CASE WHEN _val <> _def->>'value' THEN 'TRUE' ELSE 'FALSE' END; END IF;
  IF _op = 'IN' THEN
    RETURN CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(_def->'values','[]'::jsonb)) v
                              WHERE v#>>'{}' = _val) THEN 'TRUE' ELSE 'FALSE' END; END IF;
  IF _op = 'NOT_IN' THEN
    RETURN CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(_def->'values','[]'::jsonb)) v
                              WHERE v#>>'{}' = _val) THEN 'FALSE' ELSE 'TRUE' END; END IF;
  RETURN 'UNRESOLVED';
END $$;
REVOKE ALL ON FUNCTION public.supervisory_question_rule_evaluate(jsonb,jsonb,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_question_rule_evaluate(jsonb,jsonb,integer) TO authenticated, service_role;

-- Minimum reproducible applicability context (no PII, no free-form entity dump)
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_plan_context(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.supervisory_assessment; _l public.licensees;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE='22023'; END IF;
  SELECT * INTO _l FROM public.licensees WHERE id = _a.entity_id;

  RETURN jsonb_build_object(
    'ASSESSMENT.PROGRAMME_CODE', _a.assessment_programme_code,
    'ASSESSMENT.ASSESSMENT_TYPE', _a.assessment_type,
    'ASSESSMENT.TRIGGER_TYPE', _a.trigger_type,
    'ENTITY.SECTOR_ID', COALESCE(_l.sector_id, _a.sector_id),
    'ENTITY.SUB_SECTOR_ID', _l.sub_sector_id,
    'ENTITY.CATEGORY_ID', _l.category_id,
    'ENTITY.ENTITY_STATUS', _l.status,
    'ENTITY.SYSTEMIC_IMPORTANCE', _l.systemic_importance,
    'ENTITY.LIFECYCLE_STAGE_ID', _l.lifecycle_stage_id);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_question_plan_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_question_plan_context(uuid) TO authenticated, service_role;

-- ================= Materialisation =================
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_plan_materialise_internal(
  _assessment_id uuid, _uid uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.supervisory_assessment; _p public.supervisory_assessment_programme;
        _set public.supervisory_assessment_programme_set; _ctx jsonb; _legacy boolean;
        _q record; _class text; _state text; _reason text; _text text; _mode text;
        _rule public.supervisory_methodology_question_rule; _eval text;
        _rule_id uuid; _rule_ver integer; _inputs jsonb; _bad text;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE='22023'; END IF;
  IF _a.methodology_id IS NULL THEN
    RAISE EXCEPTION 'APPLICABILITY_UNRESOLVED: the assessment carries no methodology version, so question scope cannot be resolved'
      USING ERRCODE='22023'; END IF;

  IF _a.assessment_programme_id IS NOT NULL THEN
    SELECT * INTO _p FROM public.supervisory_assessment_programme WHERE id = _a.assessment_programme_id;
    SELECT * INTO _set FROM public.supervisory_assessment_programme_set WHERE id = _p.programme_set_id;
  END IF;

  -- Programme dimension scope must be valid against this exact methodology version.
  IF _p.id IS NOT NULL THEN
    IF COALESCE(array_length(_p.included_dimension_codes,1),0) > 0
       AND COALESCE(array_length(_p.excluded_dimension_codes,1),0) > 0
       AND EXISTS (SELECT 1 FROM unnest(_p.included_dimension_codes) c
                    WHERE c = ANY (_p.excluded_dimension_codes)) THEN
      RAISE EXCEPTION 'PROGRAMME_DIMENSION_SCOPE_CONTRADICTORY: programme % both includes and excludes the same dimension', _p.programme_code
        USING ERRCODE='22023'; END IF;
    SELECT c INTO _bad FROM unnest(COALESCE(_p.included_dimension_codes,'{}') || COALESCE(_p.excluded_dimension_codes,'{}')) c
     WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_dimension d
                        WHERE d.methodology_id = _a.methodology_id AND d.dimension_code = c)
     LIMIT 1;
    IF _bad IS NOT NULL THEN
      RAISE EXCEPTION 'APPLICABILITY_UNRESOLVED: programme % refers to dimension % which does not exist in methodology version %', _p.programme_code, _bad, _a.methodology_version
        USING ERRCODE='22023'; END IF;
  END IF;

  _ctx := public.supervisory_assessment_question_plan_context(_assessment_id);

  -- A methodology that predates question classification keeps its existing
  -- operational behaviour, explicitly labelled. This is not new regulator policy.
  _legacy := NOT EXISTS (SELECT 1 FROM public.supervisory_methodology_question
                          WHERE methodology_id = _a.methodology_id AND active AND question_class IS NOT NULL);
  _mode := CASE WHEN _legacy THEN 'LEGACY_METHODOLOGY_COMPATIBILITY' ELSE 'STRUCTURED' END;

  FOR _q IN
    SELECT qq.*, d.dimension_code AS dim_code, d.id AS dim_id
      FROM public.supervisory_methodology_question qq
      JOIN public.supervisory_methodology_dimension d ON d.id = qq.methodology_dimension_id
     WHERE qq.methodology_id = _a.methodology_id AND qq.active AND d.active
     ORDER BY d.sort_order, qq.sort_order, qq.question_code
  LOOP
    _rule_id := NULL; _rule_ver := NULL; _inputs := '{}'::jsonb;

    IF _legacy THEN
      _state := 'INCLUDED_CORE'; _reason := 'LEGACY_COMPATIBILITY_INCLUDED';
      _text := 'Included under legacy methodology compatibility: this methodology version predates structured question classification, so its existing operational behaviour is preserved.';
    ELSE
      _class := upper(COALESCE(_q.question_class,'CORE'));
      _state := NULL;

      -- Step 2 — programme question-class scope
      IF _p.id IS NOT NULL AND COALESCE(array_length(_p.question_class_scope,1),0) > 0
         AND NOT (_class = ANY (_p.question_class_scope)) THEN
        _state := 'OUT_OF_SCOPE'; _reason := 'PROGRAMME_CLASS_EXCLUDED';
        _text := format('Programme %s does not assess %s questions.', _p.programme_code, _class);
        _inputs := jsonb_build_object('question_class',_class,'programme_class_scope',to_jsonb(_p.question_class_scope));
      END IF;

      -- Step 3 — programme dimension scope
      IF _state IS NULL AND _p.id IS NOT NULL THEN
        IF _q.dim_code = ANY (COALESCE(_p.excluded_dimension_codes,'{}')) THEN
          _state := 'OUT_OF_SCOPE'; _reason := 'PROGRAMME_DIMENSION_EXCLUDED';
          _text := format('Programme %s excludes dimension %s.', _p.programme_code, _q.dim_code);
          _inputs := jsonb_build_object('dimension_code',_q.dim_code,'excluded',to_jsonb(_p.excluded_dimension_codes));
        ELSIF COALESCE(array_length(_p.included_dimension_codes,1),0) > 0
              AND NOT (_q.dim_code = ANY (_p.included_dimension_codes)) THEN
          _state := 'OUT_OF_SCOPE'; _reason := 'PROGRAMME_DIMENSION_EXCLUDED';
          _text := format('Programme %s assesses only dimensions %s.', _p.programme_code,
                          array_to_string(_p.included_dimension_codes, ', '));
          _inputs := jsonb_build_object('dimension_code',_q.dim_code,'included',to_jsonb(_p.included_dimension_codes));
        END IF;
      END IF;

      -- Step 4 — structural applicability rule
      IF _state IS NULL THEN
        SELECT * INTO _rule FROM public.supervisory_methodology_question_rule
         WHERE question_id = _q.id AND rule_kind = 'APPLICABILITY' AND active LIMIT 1;
        IF _rule.id IS NOT NULL THEN
          _eval := public.supervisory_question_rule_evaluate(_rule.rule_definition, _ctx, 0);
          IF _eval = 'UNRESOLVED' THEN
            RAISE EXCEPTION 'APPLICABILITY_UNRESOLVED: question % — the structural applicability rule (%) cannot be evaluated because a required input is not recorded for this entity; record the missing context or correct the rule before assessing',
              _q.question_code, COALESCE(_rule.rule_summary,'structured rule') USING ERRCODE='22023';
          ELSIF _eval = 'FALSE' THEN
            _state := 'OUT_OF_SCOPE'; _reason := 'RULE_FALSE';
            _text := format('Structural applicability rule did not apply: %s.', COALESCE(_rule.rule_summary,'structured rule'));
            _rule_id := _rule.id; _rule_ver := _rule.rule_version;
            _inputs := jsonb_build_object('rule_id',_rule.id,'rule_version',_rule.rule_version,'result','FALSE');
          ELSE
            _rule_id := _rule.id; _rule_ver := _rule.rule_version;
          END IF;
        END IF;
      END IF;

      -- Step 5 — conditional trigger
      IF _state IS NULL AND _class = 'CONDITIONAL' THEN
        SELECT * INTO _rule FROM public.supervisory_methodology_question_rule
         WHERE question_id = _q.id AND rule_kind = 'TRIGGER' AND active LIMIT 1;
        IF _rule.id IS NULL THEN
          RAISE EXCEPTION 'APPLICABILITY_UNRESOLVED: conditional question % has no executable trigger rule; structured applicability must be authored in the Methodology Studio before this methodology can determine scope', _q.question_code
            USING ERRCODE='22023'; END IF;
        _eval := public.supervisory_question_rule_evaluate(_rule.rule_definition, _ctx, 0);
        IF _eval = 'UNRESOLVED' THEN
          RAISE EXCEPTION 'APPLICABILITY_UNRESOLVED: question % — the conditional trigger (%) cannot be evaluated because a required input is not recorded for this entity', _q.question_code, COALESCE(_rule.rule_summary,'structured rule')
            USING ERRCODE='22023'; END IF;
        _rule_id := _rule.id; _rule_ver := _rule.rule_version;
        _inputs := _inputs || jsonb_build_object('rule_id',_rule.id,'rule_version',_rule.rule_version,'result',_eval);
        IF _eval = 'TRUE' THEN
          _state := 'INCLUDED_CONDITIONAL'; _reason := 'CONDITIONAL_TRIGGER_TRUE';
          _text := format('Conditional trigger applied: %s.', COALESCE(_rule.rule_summary,'structured rule'));
        ELSE
          _state := 'NOT_TRIGGERED'; _reason := 'CONDITIONAL_TRIGGER_FALSE';
          _text := format('Conditional trigger did not apply: %s.', COALESCE(_rule.rule_summary,'structured rule'));
        END IF;
      END IF;

      -- Steps 6 and 7 — enhanced and core inclusion
      IF _state IS NULL THEN
        IF _class = 'ENHANCED' THEN
          _state := 'INCLUDED_ENHANCED'; _reason := 'ENHANCED_INCLUDED';
          _text := CASE WHEN _p.id IS NOT NULL
            THEN format('Enhanced question included because programme %s assesses enhanced questions.', _p.programme_code)
            ELSE 'Enhanced question included by applicability configuration.' END;
        ELSE
          _state := 'INCLUDED_CORE'; _reason := 'CORE_INCLUDED';
          _text := 'Core question included: all structural applicability conditions pass.';
        END IF;
      END IF;
    END IF;

    INSERT INTO public.supervisory_assessment_question_plan(
      assessment_id, question_id, question_code, methodology_id, methodology_version,
      dimension_id, dimension_code, question_class, plan_state, reason_code, reason_text,
      programme_set_id, programme_id, programme_code, programme_version,
      rule_id, rule_version, resolution_mode, evaluated_inputs, evaluation_hash)
    VALUES (_assessment_id, _q.id, _q.question_code, _a.methodology_id, _a.methodology_version,
      _q.dim_id, _q.dim_code, _q.question_class, _state, _reason, _text,
      _set.id, _p.id, _p.programme_code, _set.set_version,
      _rule_id, _rule_ver, _mode,
      jsonb_strip_nulls(_inputs || jsonb_build_object(
        'programme_code', _a.assessment_programme_code,
        'assessment_type', _a.assessment_type,
        'trigger_type', _a.trigger_type,
        'sector_id', _ctx->>'ENTITY.SECTOR_ID',
        'entity_status', _ctx->>'ENTITY.ENTITY_STATUS')),
      md5(_assessment_id::text || _q.id::text || _state || _reason || COALESCE(_rule_id::text,'')));
  END LOOP;

  RETURN public.supervisory_assessment_question_plan_summary(_assessment_id);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_question_plan_materialise_internal(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_question_plan_materialise_internal(uuid,uuid) TO service_role;

-- ================= Summary and effective state =================
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_plan_summary(_assessment_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH a AS (SELECT * FROM public.supervisory_assessment WHERE id = _assessment_id),
  eff AS (
    SELECT p.*, COALESCE(o.to_state, p.plan_state) AS effective_state
      FROM public.supervisory_assessment_question_plan p
      LEFT JOIN public.supervisory_assessment_question_plan_override o
        ON o.assessment_id = p.assessment_id AND o.question_id = p.question_id AND o.status = 'APPLIED'
     WHERE p.assessment_id = _assessment_id),
  ans AS (
    SELECT e.question_id, r.id AS response_id
      FROM eff e LEFT JOIN public.supervisory_assessment_question_response r
        ON r.assessment_id = _assessment_id AND r.methodology_question_id = e.question_id
     WHERE e.effective_state LIKE 'INCLUDED%')
  SELECT jsonb_build_object(
    'assessment_id', _assessment_id,
    'mode', CASE WHEN NOT EXISTS (SELECT 1 FROM eff) THEN 'LEGACY_UNMATERIALISED'
                 ELSE COALESCE((SELECT max(resolution_mode) FROM eff), 'STRUCTURED') END,
    'legacy_mode', COALESCE((SELECT bool_or(resolution_mode = 'LEGACY_METHODOLOGY_COMPATIBILITY') FROM eff), false),
    'methodology_total', (SELECT count(*) FROM public.supervisory_methodology_question q
                            JOIN public.supervisory_methodology_dimension d ON d.id = q.methodology_dimension_id
                            JOIN a ON a.methodology_id = q.methodology_id
                           WHERE q.active AND d.active),
    'planned_total', (SELECT count(*) FROM eff),
    'included_total', (SELECT count(*) FROM eff WHERE effective_state LIKE 'INCLUDED%'),
    'included_core', (SELECT count(*) FROM eff WHERE effective_state = 'INCLUDED_CORE'),
    'included_conditional', (SELECT count(*) FROM eff WHERE effective_state = 'INCLUDED_CONDITIONAL'),
    'included_enhanced', (SELECT count(*) FROM eff WHERE effective_state = 'INCLUDED_ENHANCED'),
    'not_triggered', (SELECT count(*) FROM eff WHERE effective_state = 'NOT_TRIGGERED'),
    'out_of_scope', (SELECT count(*) FROM eff WHERE effective_state = 'OUT_OF_SCOPE'),
    'answered', (SELECT count(*) FROM ans WHERE response_id IS NOT NULL),
    'unanswered_in_scope', (SELECT count(*) FROM ans WHERE response_id IS NULL));
$$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_question_plan_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_question_plan_summary(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_plan_state(
  _assessment_id uuid, _question_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(o.to_state, p.plan_state)
    FROM public.supervisory_assessment_question_plan p
    LEFT JOIN public.supervisory_assessment_question_plan_override o
      ON o.assessment_id = p.assessment_id AND o.question_id = p.question_id AND o.status = 'APPLIED'
   WHERE p.assessment_id = _assessment_id AND p.question_id = _question_id;
$$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_question_plan_state(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_question_plan_state(uuid,uuid) TO authenticated, service_role;

-- ================= Read model =================
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_plan(
  _assessment_id uuid, _search text DEFAULT NULL, _dimension_id uuid DEFAULT NULL,
  _question_class text DEFAULT NULL, _plan_state text DEFAULT NULL,
  _limit integer DEFAULT 500, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _rows jsonb; _total integer;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE='42501'; END IF;
  IF NOT public.supervisory_assessment_question_readable(_uid, _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: this assessment is not within your supervisory scope' USING ERRCODE='42501'; END IF;

  WITH eff AS (
    SELECT p.*, COALESCE(o.to_state, p.plan_state) AS effective_state, o.reason AS override_reason,
           q.prompt, q.allow_not_applicable, q.na_requires_rationale, q.requires_evidence,
           d.label AS dimension_label, r.response, r.id AS response_id
      FROM public.supervisory_assessment_question_plan p
      JOIN public.supervisory_methodology_question q ON q.id = p.question_id
      LEFT JOIN public.supervisory_methodology_dimension d ON d.id = p.dimension_id
      LEFT JOIN public.supervisory_assessment_question_plan_override o
        ON o.assessment_id = p.assessment_id AND o.question_id = p.question_id AND o.status = 'APPLIED'
      LEFT JOIN public.supervisory_assessment_question_response r
        ON r.assessment_id = p.assessment_id AND r.methodology_question_id = p.question_id
     WHERE p.assessment_id = _assessment_id
       AND (_dimension_id IS NULL OR p.dimension_id = _dimension_id)
       AND (_question_class IS NULL OR COALESCE(p.question_class,'CORE') = upper(_question_class))
       AND (_plan_state IS NULL OR COALESCE(o.to_state, p.plan_state) = upper(_plan_state))
       AND (_search IS NULL OR btrim(_search) = ''
            OR p.question_code ILIKE '%'||_search||'%' OR q.prompt ILIKE '%'||_search||'%'))
  SELECT count(*)::int,
         COALESCE(jsonb_agg(jsonb_build_object(
           'question_id', e.question_id, 'question_code', e.question_code, 'prompt', e.prompt,
           'dimension_id', e.dimension_id, 'dimension_code', e.dimension_code, 'dimension_label', e.dimension_label,
           'question_class', COALESCE(e.question_class,'CORE'),
           'plan_state', e.plan_state, 'effective_state', e.effective_state,
           'overridden', (e.override_reason IS NOT NULL), 'override_reason', e.override_reason,
           'reason_code', e.reason_code, 'reason_text', e.reason_text,
           'rule_summary', (SELECT rr.rule_summary FROM public.supervisory_methodology_question_rule rr WHERE rr.id = e.rule_id),
           'included', (e.effective_state LIKE 'INCLUDED%'),
           'allow_not_applicable', e.allow_not_applicable,
           'na_requires_rationale', e.na_requires_rationale,
           'requires_evidence', e.requires_evidence,
           'response', e.response,
           'response_status', CASE WHEN e.response_id IS NOT NULL THEN 'ANSWERED'
                                   WHEN e.effective_state LIKE 'INCLUDED%' THEN 'UNANSWERED' ELSE 'NOT_REQUIRED' END,
           'evaluated_inputs', e.evaluated_inputs
         ) ORDER BY e.dimension_code, e.question_code), '[]'::jsonb)
    INTO _total, _rows
    FROM (SELECT * FROM eff ORDER BY dimension_code, question_code
           LIMIT GREATEST(COALESCE(_limit,500),1) OFFSET GREATEST(COALESCE(_offset,0),0)) e;

  RETURN jsonb_build_object(
    'summary', public.supervisory_assessment_question_plan_summary(_assessment_id),
    'rows', _rows,
    'row_count', _total,
    'legacy_mode', COALESCE((SELECT bool_or(resolution_mode='LEGACY_METHODOLOGY_COMPATIBILITY')
                               FROM public.supervisory_assessment_question_plan
                              WHERE assessment_id = _assessment_id), false),
    'validation', jsonb_build_object('findings','[]'::jsonb),
    'note', 'Question scope is resolved by the server from the exact methodology version and assessment programme bound to this assessment.');
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_question_plan(uuid,text,uuid,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_question_plan(uuid,text,uuid,text,text,integer,integer) TO authenticated, service_role;

-- ================= Governed rebuild and override =================
CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_plan_materialize(
  _assessment_id uuid, _rationale text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _existing integer; _sum jsonb;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE='22023'; END IF;
  IF NOT public.is_super_admin(_uid)
     AND NOT public.has_any_permission(_uid, public.supervisory_domain_actions(_a.domain_code,'edit')) THEN
    RAISE EXCEPTION 'not_authorized: % required',
      array_to_string(public.supervisory_domain_actions(_a.domain_code,'edit'), ' or ') USING ERRCODE='42501'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);

  SELECT count(*) INTO _existing FROM public.supervisory_assessment_question_plan WHERE assessment_id = _assessment_id;

  IF _existing > 0 THEN
    -- rebuild: tightly governed, before any work exists
    IF _a.status <> 'draft' THEN
      RAISE EXCEPTION 'plan_rebuild_refused: the question plan can only be rebuilt while the assessment is a draft' USING ERRCODE='55000'; END IF;
    IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
      RAISE EXCEPTION 'rationale_required: state at least 10 characters of rationale to rebuild the question plan' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.supervisory_assessment_question_response WHERE assessment_id = _assessment_id) THEN
      RAISE EXCEPTION 'plan_rebuild_refused: responses have already been recorded; supersede the assessment instead' USING ERRCODE='55000'; END IF;
    IF _a.submitted_at IS NOT NULL OR _a.reviewed_at IS NOT NULL OR _a.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'plan_rebuild_refused: this assessment has already been submitted or reviewed' USING ERRCODE='55000'; END IF;
    PERFORM set_config('app.plan_rebuild','on',true);
    DELETE FROM public.supervisory_assessment_question_plan WHERE assessment_id = _assessment_id;
    PERFORM set_config('app.plan_rebuild','off',true);
  END IF;

  _sum := public.supervisory_assessment_question_plan_materialise_internal(_assessment_id, _uid);

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
  VALUES (_assessment_id, 'QUESTION_PLAN_MATERIALISED',
    COALESCE(_rationale,'Question plan resolved from the bound methodology version and assessment programme.'),
    jsonb_build_object('methodology_id',_a.methodology_id,'methodology_version',_a.methodology_version,
      'programme_id',_a.assessment_programme_id,'programme_code',_a.assessment_programme_code,
      'programme_version',_a.assessment_programme_version,'summary',_sum,
      'rebuild',(_existing > 0)), _uid);

  RETURN _sum;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_question_plan_materialize(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_question_plan_materialize(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_question_plan_override_apply(
  _assessment_id uuid, _question_id uuid, _to_state text, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _p public.supervisory_assessment_question_plan; _to text; _id uuid;
BEGIN
  _uid := auth.uid();
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE='22023'; END IF;
  IF NOT public.is_super_admin(_uid)
     AND NOT public.has_any_permission(_uid, public.supervisory_domain_actions(_a.domain_code,'approve')) THEN
    RAISE EXCEPTION 'not_authorized: scope overrides require %',
      array_to_string(public.supervisory_domain_actions(_a.domain_code,'approve'), ' or ') USING ERRCODE='42501'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);

  IF _a.status <> 'draft' THEN
    RAISE EXCEPTION 'override_refused: assessment scope may only be adjusted while the assessment is a draft' USING ERRCODE='55000'; END IF;
  IF length(btrim(COALESCE(_reason,''))) < 20 THEN
    RAISE EXCEPTION 'rationale_required: a scope override requires at least 20 characters of supervisory justification' USING ERRCODE='22023'; END IF;

  _to := upper(btrim(COALESCE(_to_state,'')));
  IF _to = 'NOT_APPLICABLE' THEN
    RAISE EXCEPTION 'override_refused: "not applicable" is an officer response, not a scope state' USING ERRCODE='22023'; END IF;
  IF _to NOT IN ('INCLUDED_CONDITIONAL','INCLUDED_ENHANCED','OUT_OF_SCOPE') THEN
    RAISE EXCEPTION 'override_refused: % is not a permitted override target', _to USING ERRCODE='22023'; END IF;

  SELECT * INTO _p FROM public.supervisory_assessment_question_plan
   WHERE assessment_id = _assessment_id AND question_id = _question_id;
  IF _p.id IS NULL THEN
    RAISE EXCEPTION 'not_found: the question is not part of this assessment question plan' USING ERRCODE='22023'; END IF;

  IF _to = 'OUT_OF_SCOPE' AND _p.plan_state = 'INCLUDED_CORE' THEN
    RAISE EXCEPTION 'override_refused: excluding a core question is a material methodology departure; maker/checker governance for it is not yet defined, so it is refused. Correct the methodology or programme configuration instead'
      USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.supervisory_assessment_question_response
              WHERE assessment_id = _assessment_id AND methodology_question_id = _question_id) THEN
    RAISE EXCEPTION 'override_refused: this question has already been answered' USING ERRCODE='55000'; END IF;

  INSERT INTO public.supervisory_assessment_question_plan_override(
    assessment_id, question_id, from_state, to_state, reason, actor_id)
  VALUES (_assessment_id, _question_id, _p.plan_state, _to, btrim(_reason), _uid)
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, rationale, detail, actor_id)
  VALUES (_assessment_id, 'QUESTION_PLAN_OVERRIDE_APPROVED', btrim(_reason),
    jsonb_build_object('question_id',_question_id,'question_code',_p.question_code,
      'from_state',_p.plan_state,'to_state',_to,'override_id',_id), _uid);

  RETURN jsonb_build_object('id',_id,'from_state',_p.plan_state,'to_state',_to);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_question_plan_override_apply(uuid,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_question_plan_override_apply(uuid,uuid,text,text) TO authenticated, service_role;
