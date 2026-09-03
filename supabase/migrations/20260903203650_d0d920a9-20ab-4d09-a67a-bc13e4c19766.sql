-- =====================================================================
-- AML/CFT calculation governance hardening (A-J)
-- No supervisory policy value is authored here.
-- =====================================================================

-- ---------- A. remove silent supervisory defaults ----------
ALTER TABLE public.supervisory_calculation_config
  ALTER COLUMN aggregation_method DROP DEFAULT,
  ALTER COLUMN aggregation_method DROP NOT NULL,
  ALTER COLUMN min_answered_questions DROP DEFAULT,
  ALTER COLUMN min_answered_questions DROP NOT NULL,
  ALTER COLUMN na_denominator_handling DROP DEFAULT,
  ALTER COLUMN na_denominator_handling DROP NOT NULL,
  ALTER COLUMN evidence_insufficiency_handling DROP DEFAULT,
  ALTER COLUMN evidence_insufficiency_handling DROP NOT NULL,
  ALTER COLUMN critical_question_handling DROP DEFAULT,
  ALTER COLUMN critical_question_handling DROP NOT NULL,
  ALTER COLUMN rounding_mode DROP DEFAULT,
  ALTER COLUMN rounding_mode DROP NOT NULL,
  ALTER COLUMN rounding_decimals DROP DEFAULT,
  ALTER COLUMN rounding_decimals DROP NOT NULL,
  ALTER COLUMN inherent_direction DROP DEFAULT,
  ALTER COLUMN inherent_direction DROP NOT NULL,
  ALTER COLUMN recommendation_policy DROP DEFAULT,
  ALTER COLUMN recommendation_policy DROP NOT NULL;

COMMENT ON COLUMN public.supervisory_calculation_config.aggregation_method IS
  'Supervisory decision. NULL = undecided; the completeness validator refuses submission.';
COMMENT ON COLUMN public.supervisory_calculation_config.rounding_decimals IS
  'Supervisory decision (methodology-sensitive: it defines the band quantum).';

-- ---------- F. only options with distinct implemented semantics ----------
ALTER TABLE public.supervisory_calculation_config DROP CONSTRAINT IF EXISTS supervisory_calculation_config_agg_chk;
ALTER TABLE public.supervisory_calculation_config ADD CONSTRAINT supervisory_calculation_config_agg_chk
  CHECK (aggregation_method IS NULL OR aggregation_method = ANY (ARRAY['UNWEIGHTED_MEAN','WORST_RESPONSE']));
-- WEIGHTED_MEAN withdrawn: supervisory_methodology_question publishes no per-question weight,
-- so it would be indistinguishable from UNWEIGHTED_MEAN.

ALTER TABLE public.supervisory_calculation_config DROP CONSTRAINT IF EXISTS supervisory_calculation_config_crit_chk;
ALTER TABLE public.supervisory_calculation_config ADD CONSTRAINT supervisory_calculation_config_crit_chk
  CHECK (critical_question_handling IS NULL OR critical_question_handling = 'NONE');
-- FLOOR_DIMENSION / FLOOR_ASSESSMENT withdrawn: no canonical question-level criticality exists in
-- the methodology model. Response-value criticality is not an approved substitute.

ALTER TABLE public.supervisory_calculation_config DROP CONSTRAINT IF EXISTS supervisory_calculation_config_policy_chk;
ALTER TABLE public.supervisory_calculation_config ADD CONSTRAINT supervisory_calculation_config_policy_chk
  CHECK (recommendation_policy IS NULL OR recommendation_policy = ANY (
    ARRAY['WEIGHTED_SCORE','HIGHEST_MATERIAL_DIMENSION','WEIGHTED_WITH_THRESHOLD']));
-- WEIGHTED_WITH_CRITICAL_FLOOR withdrawn (no question-level criticality);
-- WORST_OF_N withdrawn (no governed N parameter).

ALTER TABLE public.supervisory_calculation_config DROP CONSTRAINT IF EXISTS supervisory_calculation_config_na_chk;
ALTER TABLE public.supervisory_calculation_config ADD CONSTRAINT supervisory_calculation_config_na_chk
  CHECK (na_denominator_handling IS NULL OR na_denominator_handling = ANY (ARRAY['EXCLUDE','INCLUDE_AS_ZERO','INCLUDE_AS_FULL']));
ALTER TABLE public.supervisory_calculation_config DROP CONSTRAINT IF EXISTS supervisory_calculation_config_evid_chk;
ALTER TABLE public.supervisory_calculation_config ADD CONSTRAINT supervisory_calculation_config_evid_chk
  CHECK (evidence_insufficiency_handling IS NULL OR evidence_insufficiency_handling = ANY (ARRAY['FLAG_ONLY','NOT_CALCULABLE','CAP_AT_MIDPOINT']));
ALTER TABLE public.supervisory_calculation_config DROP CONSTRAINT IF EXISTS supervisory_calculation_config_dir_chk;
ALTER TABLE public.supervisory_calculation_config ADD CONSTRAINT supervisory_calculation_config_dir_chk
  CHECK (inherent_direction IS NULL OR inherent_direction = ANY (ARRAY['DIRECT','INVERTED']));
ALTER TABLE public.supervisory_calculation_config DROP CONSTRAINT IF EXISTS supervisory_calculation_config_round_chk;
ALTER TABLE public.supervisory_calculation_config ADD CONSTRAINT supervisory_calculation_config_round_chk
  CHECK (rounding_mode IS NULL OR rounding_mode = ANY (ARRAY['HALF_UP','HALF_DOWN','FLOOR','CEILING','NONE']));

-- ---------- C. non-overlapping effective windows, half-open [from, to) ----------
CREATE OR REPLACE FUNCTION public.supervisory_calc_config_window_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status IN ('ACTIVE','SUPERSEDED') AND NEW.effective_from IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.supervisory_calculation_config o
       WHERE o.methodology_id = NEW.methodology_id AND o.id <> NEW.id
         AND o.status IN ('ACTIVE','SUPERSEDED') AND o.effective_from IS NOT NULL
         AND daterange(o.effective_from, o.effective_to, '[)')
             && daterange(NEW.effective_from, NEW.effective_to, '[)')
    ) THEN
      RAISE EXCEPTION 'overlapping_effective_window: another in-force or historical calculation configuration already covers this period for this methodology'
        USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_calc_config_window_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS supervisory_calc_config_window_guard_trg ON public.supervisory_calculation_config;
CREATE TRIGGER supervisory_calc_config_window_guard_trg
  BEFORE INSERT OR UPDATE ON public.supervisory_calculation_config
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_calc_config_window_guard();

COMMENT ON COLUMN public.supervisory_calculation_config.effective_from IS
  'Inclusive start of the effective window.';
COMMENT ON COLUMN public.supervisory_calculation_config.effective_to IS
  'Exclusive end of the effective window; NULL = open-ended. Semantics: [effective_from, effective_to).';

-- ---------- B. the effective-date rule is authoritative (no silent fallback) ----------
CREATE OR REPLACE FUNCTION public.supervisory_methodology_as_of(
  _domain_code text, _execution_date date DEFAULT NULL, _assessment_date date DEFAULT NULL,
  _period_end date DEFAULT NULL, _trigger_date date DEFAULT NULL, _explicit_as_of date DEFAULT NULL)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE r.effective_date_rule
           WHEN 'EXECUTION_DATE' THEN _execution_date
           WHEN 'ASSESSMENT_DATE' THEN COALESCE(_assessment_date, _execution_date)
           WHEN 'PERIOD_END'      THEN COALESCE(_period_end, _execution_date)
           WHEN 'TRIGGER_DATE'    THEN COALESCE(_trigger_date, _execution_date)
           WHEN 'EXPLICIT_AS_OF'  THEN COALESCE(_explicit_as_of, _execution_date)
         END
    FROM public.supervisory_domain_calculation_rule r
   WHERE r.domain_code = upper(_domain_code)
   LIMIT 1;
$$;
COMMENT ON FUNCTION public.supervisory_methodology_as_of(text,date,date,date,date,date) IS
  'Returns NULL when the domain has no recorded effective-date rule. Callers must refuse to calculate.';

-- ---------- I. band mathematics: half-open intervals ----------
CREATE OR REPLACE FUNCTION public.supervisory_calc_band_of(_config_id uuid, _kind text, _score numeric)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT b.band_code FROM public.supervisory_calculation_band b
   WHERE b.config_id = _config_id AND b.band_kind = upper(_kind) AND _score IS NOT NULL
     AND _score >= b.min_score
     AND (_score < b.max_score OR (b.max_score = 100 AND _score <= 100))
   ORDER BY b.min_score LIMIT 1;
$$;

-- ---------- J. calculation provenance history ----------
CREATE TABLE IF NOT EXISTS public.supervisory_assessment_calculation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL,
  methodology_id uuid,
  methodology_version text,
  config_id uuid,
  config_version integer,
  as_of date,
  status text NOT NULL,
  inherent_score numeric,
  inherent_band text,
  control_score numeric,
  control_band text,
  residual_rating text,
  recommended_rating text,
  trace jsonb NOT NULL DEFAULT '{}'::jsonb,
  trace_hash text,
  event_reason text NOT NULL,
  actor_id uuid,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.supervisory_assessment_calculation_history TO authenticated;
GRANT ALL ON public.supervisory_assessment_calculation_history TO service_role;
ALTER TABLE public.supervisory_assessment_calculation_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sach_read ON public.supervisory_assessment_calculation_history;
CREATE POLICY sach_read ON public.supervisory_assessment_calculation_history
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), ARRAY[
    'supervisory_spine.view','aml_supervision.view','prudential_supervision.view',
    'aml_supervision.manage_config','prudential_supervision.manage_config']));
CREATE INDEX IF NOT EXISTS sach_assessment_idx
  ON public.supervisory_assessment_calculation_history(assessment_id, calculated_at DESC);
COMMENT ON TABLE public.supervisory_assessment_calculation_history IS
  'Append-only provenance of every calculation event. Never rewritten when a later configuration is published.';

CREATE OR REPLACE FUNCTION public.supervisory_calc_history_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'calculation history is append-only' USING ERRCODE = '55000';
END $$;
REVOKE ALL ON FUNCTION public.supervisory_calc_history_immutable() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sach_immutable_trg ON public.supervisory_assessment_calculation_history;
CREATE TRIGGER sach_immutable_trg BEFORE UPDATE OR DELETE
  ON public.supervisory_assessment_calculation_history
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_calc_history_immutable();

-- ---------- C. temporal configuration resolution ----------
CREATE OR REPLACE FUNCTION public.supervisory_calc_as_of_for(_assessment_id uuid)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.supervisory_methodology_as_of(a.domain_code, a.created_at::date,
           a.assessment_date, a.period_end, NULL, NULL)
    FROM public.supervisory_assessment a WHERE a.id = _assessment_id;
$$;

CREATE OR REPLACE FUNCTION public.supervisory_calc_config_for(_assessment_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _a public.supervisory_assessment; _as_of date; _id uuid;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL OR _a.methodology_id IS NULL THEN RETURN NULL; END IF;
  _as_of := public.supervisory_calc_as_of_for(_assessment_id);
  IF _as_of IS NULL THEN RETURN NULL; END IF;
  SELECT c.id INTO _id FROM public.supervisory_calculation_config c
   WHERE c.methodology_id = _a.methodology_id
     AND c.status IN ('ACTIVE','SUPERSEDED')
     AND c.effective_from IS NOT NULL AND c.effective_from <= _as_of
     AND (c.effective_to IS NULL OR c.effective_to > _as_of)
   ORDER BY c.effective_from DESC, c.config_version DESC
   LIMIT 1;
  RETURN _id;
END $$;

-- ---------- compute: pure, deterministic, no persistence (D/F/G/H) ----------
CREATE OR REPLACE FUNCTION public.supervisory_calc_compute(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _a public.supervisory_assessment; _c public.supervisory_calculation_config;
  _m public.supervisory_methodology; _cfg uuid; _dims jsonb := '[]'::jsonb;
  _d record; _q record; _num numeric; _den numeric; _answered integer;
  _ev_req integer; _ev_sup integer; _ev_ok boolean; _treat text;
  _raw numeric; _score numeric; _band text; _qtrace jsonb; _capped boolean;
  _inh_num numeric := 0; _inh_den numeric := 0; _ctl_num numeric := 0; _ctl_den numeric := 0;
  _inh_score numeric; _ctl_score numeric; _inh_band text; _ctl_band text;
  _residual text; _rec text; _ord_num numeric := 0; _ord_den numeric := 0;
  _worst integer := 0; _thr integer; _weighted integer; _as_of date; _missing text[] := '{}';
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  _as_of := public.supervisory_calc_as_of_for(_assessment_id);

  IF _as_of IS NULL THEN
    RETURN jsonb_build_object('status','NO_EFFECTIVE_DATE_RULE','assessment_id',_assessment_id,
      'methodology_id',_a.methodology_id,'methodology_version',_a.methodology_version,
      'dimensions','[]'::jsonb,
      'reason', format('domain %s has no recorded effective-date rule, so no authoritative as-of date exists', _a.domain_code));
  END IF;

  _cfg := public.supervisory_calc_config_for(_assessment_id);
  IF _cfg IS NULL THEN
    RETURN jsonb_build_object('status','NO_CONFIGURATION','assessment_id',_assessment_id,
      'methodology_id',_a.methodology_id,'methodology_version',_a.methodology_version,
      'as_of',_as_of,'dimensions','[]'::jsonb,
      'reason','no approved calculation configuration was in force on the authoritative as-of date');
  END IF;
  SELECT * INTO _c FROM public.supervisory_calculation_config WHERE id = _cfg;
  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _a.methodology_id;

  IF _c.aggregation_method IS NULL THEN _missing := _missing || 'aggregation_method'; END IF;
  IF _c.min_answered_questions IS NULL THEN _missing := _missing || 'min_answered_questions'; END IF;
  IF _c.na_denominator_handling IS NULL THEN _missing := _missing || 'na_denominator_handling'; END IF;
  IF _c.evidence_insufficiency_handling IS NULL THEN _missing := _missing || 'evidence_insufficiency_handling'; END IF;
  IF _c.critical_question_handling IS NULL THEN _missing := _missing || 'critical_question_handling'; END IF;
  IF _c.rounding_mode IS NULL THEN _missing := _missing || 'rounding_mode'; END IF;
  IF _c.rounding_decimals IS NULL THEN _missing := _missing || 'rounding_decimals'; END IF;
  IF _c.inherent_direction IS NULL THEN _missing := _missing || 'inherent_direction'; END IF;
  IF _c.recommendation_policy IS NULL THEN _missing := _missing || 'recommendation_policy'; END IF;
  IF array_length(_missing,1) IS NOT NULL THEN
    RETURN jsonb_build_object('status','CONFIGURATION_INCOMPLETE','assessment_id',_assessment_id,
      'config_id',_cfg,'config_version',_c.config_version,'as_of',_as_of,'dimensions','[]'::jsonb,
      'undecided_parameters', to_jsonb(_missing),
      'reason','the in-force calculation configuration leaves a required supervisory parameter undecided');
  END IF;

  FOR _d IN
    SELECT sad.id, sad.dimension_code, sad.dimension_group, sad.weight, sad.is_applicable,
           sad.methodology_dimension_id, md.dimension_kind, md.weight AS meth_weight
      FROM public.supervisory_assessment_dimension sad
      LEFT JOIN public.supervisory_methodology_dimension md ON md.id = sad.methodology_dimension_id
     WHERE sad.assessment_id = _assessment_id
     ORDER BY sad.dimension_code
  LOOP
    _num := 0; _den := 0; _answered := 0; _qtrace := '[]'::jsonb;
    _ev_req := 0; _ev_sup := 0; _ev_ok := true; _capped := false;
    FOR _q IN
      SELECT r.question_code, r.response, s.score, s.excluded_from_denominator,
             jsonb_array_length(COALESCE(r.evidence_refs,'[]'::jsonb)) AS evidence_count,
             COALESCE(mq.min_evidence_count,0) AS evidence_required
        FROM public.supervisory_assessment_question_response r
        LEFT JOIN public.supervisory_calculation_response_score s
               ON s.config_id = _cfg AND s.response_code = r.response
        LEFT JOIN public.supervisory_methodology_question mq
               ON mq.methodology_id = _a.methodology_id AND mq.question_code = r.question_code
       WHERE r.assessment_id = _assessment_id
         AND _d.methodology_dimension_id IS NOT NULL
         AND r.methodology_dimension_id = _d.methodology_dimension_id
       ORDER BY r.question_code
    LOOP
      IF COALESCE(_q.excluded_from_denominator,false) THEN
        IF _c.na_denominator_handling = 'INCLUDE_AS_ZERO' THEN _num := _num + 0; _den := _den + 1;
        ELSIF _c.na_denominator_handling = 'INCLUDE_AS_FULL' THEN _num := _num + 100; _den := _den + 1;
        END IF;
      ELSIF _q.score IS NOT NULL THEN
        IF _c.aggregation_method = 'WORST_RESPONSE' THEN
          _num := CASE WHEN _den = 0 THEN _q.score ELSE least(_num, _q.score) END; _den := 1;
        ELSE
          _num := _num + _q.score; _den := _den + 1;
        END IF;
        _answered := _answered + 1;
        _ev_req := _ev_req + _q.evidence_required;
        _ev_sup := _ev_sup + COALESCE(_q.evidence_count,0);
        IF COALESCE(_q.evidence_count,0) < _q.evidence_required THEN _ev_ok := false; END IF;
      END IF;
      _qtrace := _qtrace || jsonb_build_object('question_code',_q.question_code,'response',_q.response,
                   'score',_q.score,'excluded',COALESCE(_q.excluded_from_denominator,false),
                   'evidence_required',_q.evidence_required,'evidence_supplied',COALESCE(_q.evidence_count,0));
    END LOOP;

    _treat := CASE WHEN _ev_ok THEN 'NONE' ELSE _c.evidence_insufficiency_handling END;

    IF _answered < _c.min_answered_questions OR _den = 0
       OR (NOT _ev_ok AND _c.evidence_insufficiency_handling = 'NOT_CALCULABLE') THEN
      _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,'dimension_code',_d.dimension_code,
        'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),'status','NOT_CALCULABLE',
        'reason', CASE WHEN NOT _ev_ok AND _c.evidence_insufficiency_handling = 'NOT_CALCULABLE'
                       THEN 'the configured evidence-insufficiency treatment makes this dimension not calculable'
                       ELSE 'no applicable answered question meets the minimum-answer rule' END,
        'evidence_required',_ev_req,'evidence_supplied',_ev_sup,'evidence_sufficient',_ev_ok,
        'evidence_treatment',_treat,'evidence_effect','dimension not calculated',
        'answered',_answered,'questions',_qtrace);
      CONTINUE;
    END IF;

    _raw := public.supervisory_calc_round(_num / _den, _c.rounding_mode, _c.rounding_decimals);
    IF _d.dimension_kind = 'INHERENT' THEN
      _score := CASE WHEN _c.inherent_direction = 'INVERTED' THEN 100 - _raw ELSE _raw END;
    ELSE
      _score := _raw;
    END IF;

    IF NOT _ev_ok AND _c.evidence_insufficiency_handling = 'CAP_AT_MIDPOINT' THEN
      IF _d.dimension_kind = 'INHERENT' THEN
        IF _score < 50 THEN _score := 50; _capped := true; END IF;
      ELSE
        IF _score > 50 THEN _score := 50; _capped := true; END IF;
      END IF;
    END IF;

    _band := public.supervisory_calc_band_of(_cfg,
               CASE WHEN _d.dimension_kind = 'INHERENT' THEN 'INHERENT' ELSE 'CONTROL' END, _score);
    IF _d.dimension_kind = 'INHERENT' THEN
      _inh_num := _inh_num + _score * COALESCE(_d.weight,_d.meth_weight,1);
      _inh_den := _inh_den + COALESCE(_d.weight,_d.meth_weight,1);
    ELSE
      _ctl_num := _ctl_num + _score * COALESCE(_d.weight,_d.meth_weight,1);
      _ctl_den := _ctl_den + COALESCE(_d.weight,_d.meth_weight,1);
    END IF;

    _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,'dimension_code',_d.dimension_code,
      'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),'status','CALCULATED',
      'weight',COALESCE(_d.weight,_d.meth_weight),'raw_score',_raw,'score',_score,'band',_band,
      'answered',_answered,
      'evidence_required',_ev_req,'evidence_supplied',_ev_sup,'evidence_sufficient',_ev_ok,
      'evidence_treatment',_treat,
      'evidence_effect', CASE WHEN _capped THEN 'score capped at the midpoint (50)'
                              WHEN NOT _ev_ok THEN 'flagged only; no effect on the calculated rating'
                              ELSE 'none' END,
      'critical_handling',_c.critical_question_handling,
      'questions',_qtrace);
  END LOOP;

  IF _inh_den > 0 THEN
    _inh_score := public.supervisory_calc_round(_inh_num/_inh_den, _c.rounding_mode, _c.rounding_decimals);
    _inh_band := public.supervisory_calc_band_of(_cfg,'INHERENT',_inh_score);
  END IF;
  IF _ctl_den > 0 THEN
    _ctl_score := public.supervisory_calc_round(_ctl_num/_ctl_den, _c.rounding_mode, _c.rounding_decimals);
    _ctl_band := public.supervisory_calc_band_of(_cfg,'CONTROL',_ctl_score);
  END IF;

  IF _inh_band IS NOT NULL AND _ctl_band IS NOT NULL THEN
    SELECT residual_rating INTO _residual FROM public.supervisory_calculation_matrix_cell
     WHERE config_id = _cfg AND inherent_band = _inh_band AND control_band = _ctl_band;
  END IF;

  SELECT jsonb_agg(
           CASE WHEN d->>'status' <> 'CALCULATED' THEN d
                ELSE d || jsonb_build_object('residual_rating',
                  (SELECT mc.residual_rating FROM public.supervisory_calculation_matrix_cell mc
                    WHERE mc.config_id = _cfg
                      AND mc.inherent_band = CASE WHEN d->>'dimension_kind' = 'INHERENT' THEN d->>'band' ELSE _inh_band END
                      AND mc.control_band  = CASE WHEN d->>'dimension_kind' = 'INHERENT' THEN _ctl_band ELSE d->>'band' END))
           END ORDER BY d->>'dimension_code')
    INTO _dims FROM jsonb_array_elements(_dims) d;
  _dims := COALESCE(_dims,'[]'::jsonb);

  FOR _q IN
    SELECT (SELECT (x->>'ordinal')::int FROM jsonb_array_elements(_m.scoring_scale) x
             WHERE x->>'code' = d->>'residual_rating') AS ord,
           COALESCE((d->>'weight')::numeric,1) AS w
      FROM jsonb_array_elements(_dims) d
     WHERE d->>'residual_rating' IS NOT NULL
  LOOP
    IF _q.ord IS NOT NULL THEN
      _ord_num := _ord_num + _q.ord * _q.w; _ord_den := _ord_den + _q.w;
      _worst := greatest(_worst, _q.ord);
    END IF;
  END LOOP;

  IF _ord_den > 0 THEN
    IF _c.recommendation_policy = 'HIGHEST_MATERIAL_DIMENSION' THEN
      _weighted := _worst;
    ELSE
      _weighted := round(_ord_num/_ord_den)::int;
      IF _c.recommendation_policy = 'WEIGHTED_WITH_THRESHOLD' THEN
        SELECT (x->>'ordinal')::int INTO _thr FROM jsonb_array_elements(_m.scoring_scale) x
         WHERE x->>'code' = _c.recommendation_threshold;
        IF _thr IS NOT NULL AND _worst >= _thr THEN _weighted := greatest(_weighted, _thr); END IF;
      END IF;
    END IF;
    SELECT x->>'code' INTO _rec FROM jsonb_array_elements(_m.scoring_scale) x
     WHERE (x->>'ordinal')::int = _weighted;
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN jsonb_array_length(_dims) = 0 THEN 'NOT_CALCULABLE' ELSE 'CALCULATED' END,
    'assessment_id',_assessment_id,'methodology_id',_a.methodology_id,
    'methodology_version',_a.methodology_version,'config_id',_cfg,'config_version',_c.config_version,
    'as_of',_as_of,
    'parameters', jsonb_build_object('aggregation_method',_c.aggregation_method,
       'na_denominator_handling',_c.na_denominator_handling,'min_answered_questions',_c.min_answered_questions,
       'evidence_insufficiency_handling',_c.evidence_insufficiency_handling,
       'critical_question_handling',_c.critical_question_handling,
       'inherent_direction',_c.inherent_direction,'rounding',_c.rounding_mode||'/'||_c.rounding_decimals,
       'recommendation_policy',_c.recommendation_policy,'recommendation_threshold',_c.recommendation_threshold,
       'override_threshold',_c.override_threshold),
    'inherent_score',_inh_score,'inherent_band',_inh_band,
    'control_score',_ctl_score,'control_band',_ctl_band,
    'residual_rating',_residual,'recommended_rating',_rec,
    'dimensions',_dims);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_calc_compute(uuid) FROM PUBLIC, anon;

-- ---------- D. internal materialisation (not callable by arbitrary users) ----------
CREATE OR REPLACE FUNCTION public.supervisory_calc_materialise(
  _assessment_id uuid, _event_reason text, _actor_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _r jsonb; _d jsonb; _row public.supervisory_assessment_dimension; _ov boolean;
        _uid uuid := COALESCE(_actor_id, auth.uid()); _a public.supervisory_assessment;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  _r := public.supervisory_calc_compute(_assessment_id);

  INSERT INTO public.supervisory_assessment_calculation(
    assessment_id, methodology_id, methodology_version, config_id, config_version, as_of, status,
    inherent_score, inherent_band, control_score, control_band, residual_rating,
    recommended_rating, recommendation_policy, trace, calculated_at)
  VALUES (_assessment_id, _a.methodology_id, _a.methodology_version,
    NULLIF(_r->>'config_id','')::uuid, NULLIF(_r->>'config_version','')::int,
    NULLIF(_r->>'as_of','')::date, _r->>'status',
    NULLIF(_r->>'inherent_score','')::numeric, _r->>'inherent_band',
    NULLIF(_r->>'control_score','')::numeric, _r->>'control_band',
    _r->>'residual_rating', _r->>'recommended_rating', _r->'parameters'->>'recommendation_policy',
    _r, now())
  ON CONFLICT (assessment_id) DO UPDATE SET
    methodology_id = EXCLUDED.methodology_id, methodology_version = EXCLUDED.methodology_version,
    config_id = EXCLUDED.config_id, config_version = EXCLUDED.config_version, as_of = EXCLUDED.as_of,
    status = EXCLUDED.status, inherent_score = EXCLUDED.inherent_score, inherent_band = EXCLUDED.inherent_band,
    control_score = EXCLUDED.control_score, control_band = EXCLUDED.control_band,
    residual_rating = EXCLUDED.residual_rating, recommended_rating = EXCLUDED.recommended_rating,
    recommendation_policy = EXCLUDED.recommendation_policy, trace = EXCLUDED.trace,
    calculated_at = now();

  INSERT INTO public.supervisory_assessment_calculation_history(
    assessment_id, methodology_id, methodology_version, config_id, config_version, as_of, status,
    inherent_score, inherent_band, control_score, control_band, residual_rating, recommended_rating,
    trace, trace_hash, event_reason, actor_id, calculated_at)
  VALUES (_assessment_id, _a.methodology_id, _a.methodology_version,
    NULLIF(_r->>'config_id','')::uuid, NULLIF(_r->>'config_version','')::int,
    NULLIF(_r->>'as_of','')::date, _r->>'status',
    NULLIF(_r->>'inherent_score','')::numeric, _r->>'inherent_band',
    NULLIF(_r->>'control_score','')::numeric, _r->>'control_band',
    _r->>'residual_rating', _r->>'recommended_rating',
    _r, md5(_r::text), COALESCE(NULLIF(btrim(_event_reason),''),'CALCULATION'), _uid, now());

  IF _r->>'status' <> 'CALCULATED' THEN
    UPDATE public.supervisory_assessment_dimension
       SET calculated_inherent_rating = NULL, calculated_control_rating = NULL,
           calculated_residual_rating = NULL, calculated_score = NULL,
           calculation_config_id = NULL, calculation_status = _r->>'status',
           calculation_trace = jsonb_build_object('reason', _r->>'reason',
                                'undecided_parameters', _r->'undecided_parameters'),
           calculated_at = now(), is_overridden = false, override_reason = NULL,
           overridden_by = NULL, overridden_at = NULL
     WHERE assessment_id = _assessment_id;
    RETURN _r;
  END IF;

  FOR _d IN SELECT * FROM jsonb_array_elements(_r->'dimensions') LOOP
    SELECT * INTO _row FROM public.supervisory_assessment_dimension
     WHERE id = (_d->>'assessment_dimension_id')::uuid;
    IF _row.id IS NULL THEN CONTINUE; END IF;

    _ov := (_d->>'status' = 'CALCULATED') AND (
             (_d->>'residual_rating' IS NOT NULL AND _row.residual_rating IS NOT NULL
                AND upper(_d->>'residual_rating') <> upper(_row.residual_rating))
          OR (_d->>'dimension_kind' = 'INHERENT' AND _d->>'band' IS NOT NULL AND _row.inherent_rating IS NOT NULL
                AND upper(_d->>'band') <> upper(_row.inherent_rating))
          OR (_d->>'dimension_kind' <> 'INHERENT' AND _d->>'band' IS NOT NULL AND _row.control_rating IS NOT NULL
                AND upper(_d->>'band') <> upper(_row.control_rating)));

    IF _ov AND length(btrim(COALESCE(_row.override_reason,''))) < 10 THEN
      RAISE EXCEPTION 'override_reason_required: dimension % departs from the calculated recommendation and needs a recorded reason of at least 10 characters',
        _row.dimension_code USING ERRCODE = '22023';
    END IF;

    UPDATE public.supervisory_assessment_dimension SET
      calculated_inherent_rating = CASE WHEN _d->>'dimension_kind' = 'INHERENT' THEN _d->>'band' ELSE _r->>'inherent_band' END,
      calculated_control_rating  = CASE WHEN _d->>'dimension_kind' = 'INHERENT' THEN _r->>'control_band' ELSE _d->>'band' END,
      calculated_residual_rating = _d->>'residual_rating',
      calculated_score = NULLIF(_d->>'score','')::numeric,
      calculation_config_id = NULLIF(_r->>'config_id','')::uuid,
      calculation_status = _d->>'status',
      calculation_trace = _d || jsonb_build_object('parameters', _r->'parameters',
                             'assessment_inherent_band', _r->>'inherent_band',
                             'assessment_control_band', _r->>'control_band',
                             'config_version', _r->>'config_version',
                             'methodology_version', _r->>'methodology_version',
                             'as_of', _r->>'as_of',
                             'event_reason', COALESCE(NULLIF(btrim(_event_reason),''),'CALCULATION')),
      calculated_at = now(),
      is_overridden = _ov,
      override_reason = CASE WHEN _ov THEN _row.override_reason ELSE NULL END,
      overridden_by = CASE WHEN _ov THEN COALESCE(_row.overridden_by, _uid) ELSE NULL END,
      overridden_at = CASE WHEN _ov THEN COALESCE(_row.overridden_at, now()) ELSE NULL END
    WHERE id = _row.id;
  END LOOP;

  RETURN _r;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_calc_materialise(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.supervisory_calc_materialise(uuid,text,uuid) IS
  'Internal authoritative writer of calculated_*; not executable by application roles. Reached only through governed operations.';

-- ---------- D. governed wrapper ----------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_calculate(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a public.supervisory_assessment;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.edit','supervisory_spine.create',
    'prudential_supervision.record_camels_assessment',
    'aml_supervision.create','aml_supervision.edit','aml_supervision.approve',
    'aml_supervision.manage_config','market_conduct.run_conduct_analytics']);
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);
  IF _a.status NOT IN ('draft','returned_for_revision') THEN
    RAISE EXCEPTION 'assessment_not_editable: an approved or closed assessment is recalculated only through the governed recalculation operation'
      USING ERRCODE = '55000';
  END IF;
  RETURN public.supervisory_calc_materialise(_assessment_id, 'ASSESSMENT_EDIT', _uid);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_assessment_calculate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_calculate(uuid) TO authenticated;

-- ---------- E. governed recalculation / backfill ----------
CREATE OR REPLACE FUNCTION public.supervisory_calculation_recalculate(
  _domain_code text, _rationale text, _config_id uuid DEFAULT NULL,
  _entity_id uuid DEFAULT NULL, _dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a record; _r jsonb; _d jsonb; _row public.supervisory_assessment_dimension;
        _considered int := 0; _recalculated int := 0; _blocked int := 0; _skipped int := 0;
        _dims int := 0; _items jsonb := '[]'::jsonb; _blockers jsonb := '[]'::jsonb; _needs boolean;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'prudential_supervision.manage_config']);
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  FOR _a IN
    SELECT s.id, s.entity_id, s.status, s.methodology_id
      FROM public.supervisory_assessment s
     WHERE upper(s.domain_code) = upper(_domain_code)
       AND (_entity_id IS NULL OR s.entity_id = _entity_id)
     ORDER BY s.created_at
  LOOP
    _considered := _considered + 1;
    _r := public.supervisory_calc_compute(_a.id);
    IF _config_id IS NOT NULL AND NULLIF(_r->>'config_id','')::uuid IS DISTINCT FROM _config_id THEN
      _skipped := _skipped + 1; CONTINUE;
    END IF;
    IF _r->>'status' <> 'CALCULATED' THEN
      _skipped := _skipped + 1;
      _items := _items || jsonb_build_object('assessment_id',_a.id,'result',_r->>'status','reason',_r->>'reason');
      CONTINUE;
    END IF;

    _needs := false;
    FOR _d IN SELECT * FROM jsonb_array_elements(_r->'dimensions') LOOP
      SELECT * INTO _row FROM public.supervisory_assessment_dimension
       WHERE id = (_d->>'assessment_dimension_id')::uuid;
      IF _row.id IS NULL THEN CONTINUE; END IF;
      IF _d->>'residual_rating' IS NOT NULL AND _row.residual_rating IS NOT NULL
         AND upper(_d->>'residual_rating') <> upper(_row.residual_rating)
         AND length(btrim(COALESCE(_row.override_reason,''))) < 10 THEN
        _needs := true;
        _blockers := _blockers || jsonb_build_object('assessment_id',_a.id,
          'dimension_code',_row.dimension_code,'judged',_row.residual_rating,
          'calculated',_d->>'residual_rating');
      END IF;
    END LOOP;

    IF _needs THEN
      _blocked := _blocked + 1;
      _items := _items || jsonb_build_object('assessment_id',_a.id,'result','BLOCKED_REVIEW_REQUIRED');
      CONTINUE;
    END IF;

    _dims := _dims + jsonb_array_length(_r->'dimensions');
    IF NOT _dry_run THEN
      PERFORM public.supervisory_calc_materialise(_a.id, 'GOVERNED_RECALCULATION', _uid);
    END IF;
    _recalculated := _recalculated + 1;
    _items := _items || jsonb_build_object('assessment_id',_a.id,
      'result', CASE WHEN _dry_run THEN 'WOULD_RECALCULATE' ELSE 'RECALCULATED' END,
      'config_id',_r->>'config_id','config_version',_r->>'config_version','as_of',_r->>'as_of');
  END LOOP;

  IF NOT _dry_run THEN
    INSERT INTO public.supervisory_calculation_event(config_id, event_type, from_status, to_status,
      rationale, actor_id, detail)
    VALUES (_config_id, 'RECALCULATION', NULL, NULL, btrim(_rationale), _uid,
      jsonb_build_object('domain_code',upper(_domain_code),'entity_id',_entity_id,
        'considered',_considered,'recalculated',_recalculated,'blocked',_blocked,'skipped',_skipped,
        'dimensions',_dims));
    PERFORM public.log_compliance_audit('UPDATE','supervisory_assessment_calculation', NULL,
      '{}'::jsonb,
      jsonb_build_object('domain_code',upper(_domain_code),'config_id',_config_id,'entity_id',_entity_id,
        'recalculated',_recalculated,'blocked',_blocked),
      'Governed recalculation of supervisory calculated ratings: ' || btrim(_rationale));
  END IF;

  RETURN jsonb_build_object('dry_run',_dry_run,'domain_code',upper(_domain_code),
    'config_id',_config_id,'entity_id',_entity_id,'considered',_considered,
    'recalculated',_recalculated,'blocked_review_required',_blocked,'skipped',_skipped,
    'dimensions_affected',_dims,'items',_items,'blockers',_blockers,
    'actor_id',_uid,'rationale',btrim(_rationale),'at',now());
END $$;
REVOKE ALL ON FUNCTION public.supervisory_calculation_recalculate(text,text,uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_calculation_recalculate(text,text,uuid,uuid,boolean) TO authenticated;
COMMENT ON FUNCTION public.supervisory_calculation_recalculate(text,text,uuid,uuid,boolean) IS
  'Explicit, audited, idempotent recalculation. Never triggered automatically by activation; never invents an override rationale.';

-- ---------- dimension editing keeps recalculating through the internal path ----------
CREATE OR REPLACE FUNCTION public.supervisory_assessment_dimension_upsert(_assessment_id uuid, _dimension_code text, _dimension_group text DEFAULT 'OTHER'::text, _inherent_rating text DEFAULT NULL::text, _control_rating text DEFAULT NULL::text, _residual_rating text DEFAULT NULL::text, _weight numeric DEFAULT NULL::numeric, _score numeric DEFAULT NULL::numeric, _rationale text DEFAULT NULL::text, _methodology_dimension_id uuid DEFAULT NULL::uuid, _evidence_refs jsonb DEFAULT NULL::jsonb, _source_facts text DEFAULT NULL::text, _supervisory_commentary text DEFAULT NULL::text, _exceptions text DEFAULT NULL::text, _trend text DEFAULT NULL::text, _confidence text DEFAULT NULL::text, _data_quality text DEFAULT NULL::text, _is_applicable boolean DEFAULT NULL::boolean, _calculated_inherent_rating text DEFAULT NULL::text, _calculated_control_rating text DEFAULT NULL::text, _calculated_residual_rating text DEFAULT NULL::text, _calculated_score numeric DEFAULT NULL::numeric, _override_reason text DEFAULT NULL::text, _proposed_examination_scope boolean DEFAULT NULL::boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _a public.supervisory_assessment; _id uuid; _forged boolean; _calc jsonb; _row public.supervisory_assessment_dimension;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['supervisory_spine.edit','supervisory_spine.create',
    'prudential_supervision.record_camels_assessment',
    'aml_supervision.create','aml_supervision.edit','aml_supervision.approve',
    'market_conduct.run_conduct_analytics']);
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  IF _a.status NOT IN ('draft','returned_for_revision') THEN
    RAISE EXCEPTION 'assessment is not editable in status %', _a.status USING ERRCODE = '55000'; END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);

  IF NOT (public.supervisory_rating_valid(_inherent_rating, _a.domain_code)
          AND public.supervisory_rating_valid(_control_rating, _a.domain_code)
          AND public.supervisory_rating_valid(_residual_rating, _a.domain_code)) THEN
    RAISE EXCEPTION 'invalid_rating: ratings must use the canonical supervisory rating scale'
      USING ERRCODE = '22023'; END IF;

  _forged := _calculated_inherent_rating IS NOT NULL OR _calculated_control_rating IS NOT NULL
          OR _calculated_residual_rating IS NOT NULL OR _calculated_score IS NOT NULL;

  INSERT INTO public.supervisory_assessment_dimension(
    assessment_id, methodology_dimension_id, dimension_code, dimension_group, weight,
    inherent_rating, control_rating, residual_rating, score, rationale, evidence_refs, created_by,
    is_applicable, source_facts, supervisory_commentary, exceptions, trend, confidence, data_quality,
    override_reason, proposed_examination_scope)
  VALUES (_assessment_id, _methodology_dimension_id, _dimension_code, COALESCE(_dimension_group,'OTHER'),
    _weight, _inherent_rating, _control_rating, _residual_rating, _score, _rationale,
    COALESCE(_evidence_refs,'[]'::jsonb), _uid,
    COALESCE(_is_applicable,true), _source_facts, _supervisory_commentary, _exceptions,
    upper(_trend), upper(_confidence), upper(_data_quality),
    NULLIF(btrim(COALESCE(_override_reason,'')),''), COALESCE(_proposed_examination_scope,false))
  ON CONFLICT (assessment_id, dimension_code) DO UPDATE
    SET dimension_group = EXCLUDED.dimension_group, weight = EXCLUDED.weight,
        inherent_rating = EXCLUDED.inherent_rating, control_rating = EXCLUDED.control_rating,
        residual_rating = EXCLUDED.residual_rating, score = EXCLUDED.score,
        rationale = EXCLUDED.rationale, evidence_refs = EXCLUDED.evidence_refs,
        is_applicable = EXCLUDED.is_applicable, source_facts = EXCLUDED.source_facts,
        supervisory_commentary = EXCLUDED.supervisory_commentary, exceptions = EXCLUDED.exceptions,
        trend = EXCLUDED.trend, confidence = EXCLUDED.confidence, data_quality = EXCLUDED.data_quality,
        override_reason = EXCLUDED.override_reason,
        proposed_examination_scope = EXCLUDED.proposed_examination_scope,
        methodology_dimension_id = COALESCE(EXCLUDED.methodology_dimension_id, supervisory_assessment_dimension.methodology_dimension_id),
        updated_at = now()
  RETURNING id INTO _id;

  IF _forged THEN
    PERFORM public.log_compliance_audit('UPDATE','supervisory_assessment_dimension', _id,
      jsonb_build_object('rejected_calculated_inherent',_calculated_inherent_rating,
        'rejected_calculated_control',_calculated_control_rating,
        'rejected_calculated_residual',_calculated_residual_rating,
        'rejected_calculated_score',_calculated_score),
      '{}'::jsonb,
      'Caller-supplied calculated ratings were ignored; the server recalculated from the approved methodology configuration.');
  END IF;

  _calc := public.supervisory_calc_materialise(_assessment_id, 'ASSESSMENT_EDIT', _uid);
  SELECT * INTO _row FROM public.supervisory_assessment_dimension WHERE id = _id;

  IF _row.is_overridden THEN
    PERFORM public.log_compliance_audit('OVERRIDE','supervisory_assessment_dimension', _id,
      jsonb_build_object('calculated_residual',_row.calculated_residual_rating,
                         'calculated_inherent',_row.calculated_inherent_rating,
                         'calculated_control',_row.calculated_control_rating),
      jsonb_build_object('judged_residual',_row.residual_rating,
                         'judged_inherent',_row.inherent_rating,
                         'judged_control',_row.control_rating),
      'Supervisory override of the calculated rating: ' || COALESCE(_row.override_reason,''));
  END IF;

  RETURN jsonb_build_object('id',_id,'assessment_id',_assessment_id,
    'dimension_code',_dimension_code,'is_overridden',_row.is_overridden,
    'calculation_status',_row.calculation_status,
    'calculated_residual_rating',_row.calculated_residual_rating,
    'calculated_score',_row.calculated_score,
    'caller_calculated_ignored',_forged);
END $$;

-- ---------- A/I. completeness validation ----------
CREATE OR REPLACE FUNCTION public.supervisory_calculation_config_validate(_config_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _c public.supervisory_calculation_config; _m public.supervisory_methodology;
        _problems text[] := '{}'; _risk text[]; _ctrl text[]; _resp text[]; _need integer; _have integer;
        _kind text; _vocab text[]; _prev numeric; _b record; _quantum numeric; _first boolean;
BEGIN
  SELECT * INTO _c FROM public.supervisory_calculation_config WHERE id = _config_id;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'not_found: calculation configuration' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _c.methodology_id;

  IF _c.aggregation_method IS NULL THEN _problems := _problems || 'the question aggregation method has not been decided'; END IF;
  IF _c.min_answered_questions IS NULL THEN _problems := _problems || 'the minimum number of answered questions has not been decided'; END IF;
  IF _c.na_denominator_handling IS NULL THEN _problems := _problems || 'the treatment of not-applicable answers has not been decided'; END IF;
  IF _c.evidence_insufficiency_handling IS NULL THEN _problems := _problems || 'the treatment of insufficient evidence has not been decided'; END IF;
  IF _c.critical_question_handling IS NULL THEN _problems := _problems || 'the treatment of critical questions has not been decided'; END IF;
  IF _c.rounding_mode IS NULL THEN _problems := _problems || 'the rounding mode has not been decided'; END IF;
  IF _c.rounding_decimals IS NULL THEN _problems := _problems || 'the score precision has not been decided'; END IF;
  IF _c.inherent_direction IS NULL THEN _problems := _problems || 'the inherent-score direction has not been decided'; END IF;
  IF _c.recommendation_policy IS NULL THEN _problems := _problems || 'the overall recommendation policy has not been decided'; END IF;
  IF _c.effective_from IS NULL THEN _problems := _problems || 'an effective-from date is required'; END IF;

  SELECT array_agg(x->>'code' ORDER BY (x->>'ordinal')::int)
    INTO _risk FROM jsonb_array_elements(_m.scoring_scale) x;
  SELECT array_agg(v) INTO _ctrl
    FROM jsonb_array_elements_text(COALESCE(_m.definition->'control_scale','[]'::jsonb)) v;
  IF _risk IS NULL OR array_length(_risk,1) = 0 THEN
    _problems := _problems || 'the methodology publishes no risk rating scale'; END IF;
  IF _ctrl IS NULL OR array_length(_ctrl,1) = 0 THEN
    _problems := _problems || 'the methodology publishes no control effectiveness scale'; END IF;

  SELECT array_agg(DISTINCT o) INTO _resp
    FROM public.supervisory_methodology_question q, unnest(q.response_options) o
   WHERE q.methodology_id = _c.methodology_id AND q.active;
  IF _resp IS NULL THEN
    _problems := _problems || 'the methodology publishes no question response options';
  ELSIF EXISTS (
    SELECT 1 FROM unnest(_resp) o
     WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_calculation_response_score s
                        WHERE s.config_id = _config_id AND s.response_code = o)) THEN
    _problems := _problems || 'every permitted question response must be scored or explicitly excluded';
  END IF;

  _quantum := CASE WHEN _c.rounding_decimals IS NULL THEN NULL
                   ELSE 1 / power(10, _c.rounding_decimals)::numeric END;
  FOREACH _kind IN ARRAY ARRAY['INHERENT','CONTROL'] LOOP
    _vocab := CASE WHEN _kind = 'INHERENT' THEN _risk ELSE _ctrl END;
    IF _vocab IS NULL THEN CONTINUE; END IF;
    SELECT count(*) INTO _have FROM public.supervisory_calculation_band
      WHERE config_id = _config_id AND band_kind = _kind;
    IF _have = 0 THEN
      _problems := _problems || (lower(_kind) || ' bands are not defined');
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.supervisory_calculation_band b
                WHERE b.config_id = _config_id AND b.band_kind = _kind
                  AND NOT (b.band_code = ANY (_vocab))) THEN
      _problems := _problems || (lower(_kind) || ' bands use a code outside the published vocabulary');
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(_vocab) v
                WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_calculation_band b
                                   WHERE b.config_id = _config_id AND b.band_kind = _kind AND b.band_code = v)) THEN
      _problems := _problems || (lower(_kind) || ' bands do not cover every published rating');
    END IF;
    _prev := NULL; _first := true;
    FOR _b IN SELECT b.min_score, b.max_score FROM public.supervisory_calculation_band b
               WHERE b.config_id = _config_id AND b.band_kind = _kind ORDER BY b.min_score LOOP
      IF _first THEN
        IF _b.min_score <> 0 THEN _problems := _problems || (lower(_kind) || ' bands do not start at 0'); END IF;
        _first := false;
      ELSIF _b.min_score <> _prev THEN
        _problems := _problems || format('%s bands leave a gap or overlap at %s: the next band must start exactly where the previous one ends',
                                          lower(_kind), _prev);
      END IF;
      IF _b.max_score <= _b.min_score THEN
        _problems := _problems || (lower(_kind) || ' bands contain an empty interval');
      END IF;
      _prev := _b.max_score;
    END LOOP;
    IF _prev IS DISTINCT FROM 100 THEN
      _problems := _problems || (lower(_kind) || ' bands do not reach 100');
    END IF;
    IF _quantum IS NOT NULL AND _quantum > 0 AND EXISTS (
      SELECT 1 FROM public.supervisory_calculation_band b
       WHERE b.config_id = _config_id AND b.band_kind = _kind
         AND (mod(b.min_score, _quantum) <> 0 OR mod(b.max_score, _quantum) <> 0)) THEN
      _problems := _problems || format('%s band boundaries must be multiples of the configured precision (%s)',
                                        lower(_kind), _quantum);
    END IF;
  END LOOP;

  IF _risk IS NOT NULL AND _ctrl IS NOT NULL THEN
    _need := array_length(_risk,1) * array_length(_ctrl,1);
    SELECT count(*) INTO _have FROM public.supervisory_calculation_matrix_cell WHERE config_id = _config_id;
    IF _have <> _need THEN
      _problems := _problems || format('the residual matrix must publish all %s cells (%s present)', _need, _have);
    END IF;
    IF EXISTS (SELECT 1 FROM public.supervisory_calculation_matrix_cell m
                WHERE m.config_id = _config_id
                  AND (NOT (m.inherent_band = ANY (_risk)) OR NOT (m.control_band = ANY (_ctrl))
                       OR NOT (m.residual_rating = ANY (_risk)))) THEN
      _problems := _problems || 'the residual matrix uses a band or rating outside the published vocabulary';
    END IF;
  END IF;

  IF _c.recommendation_policy = 'WEIGHTED_WITH_THRESHOLD'
     AND COALESCE(btrim(_c.recommendation_threshold),'') = '' THEN
    _problems := _problems || 'the chosen recommendation policy requires a threshold rating';
  END IF;

  IF _m.domain_code IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.supervisory_domain_calculation_rule r
       WHERE r.domain_code = upper(_m.domain_code)) THEN
    _problems := _problems || format('domain %s has no recorded effective-date rule', upper(_m.domain_code));
  END IF;

  RETURN jsonb_build_object('ok', array_length(_problems,1) IS NULL,
                            'problems', to_jsonb(COALESCE(_problems,'{}'::text[])));
END $$;

-- ---------- C. activation closes the predecessor window against the successor ----------
CREATE OR REPLACE FUNCTION public.supervisory_calculation_config_lifecycle(_config_id uuid, _to_status text, _rationale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _c public.supervisory_calculation_config; _to text := upper(btrim(_to_status)); _v jsonb;
        _pred public.supervisory_calculation_config;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  SELECT * INTO _c FROM public.supervisory_calculation_config WHERE id = _config_id;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'not_found: calculation configuration' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;

  IF _to = 'REVIEW' THEN
    IF _c.status <> 'DRAFT' THEN RAISE EXCEPTION 'only a draft may be submitted for approval' USING ERRCODE = '22023'; END IF;
    _v := public.supervisory_calculation_config_validate(_config_id);
    IF NOT (_v->>'ok')::boolean THEN
      RAISE EXCEPTION 'the configuration is incomplete: %', (_v->'problems')::text USING ERRCODE = '22023';
    END IF;
    UPDATE public.supervisory_calculation_config
       SET status = 'REVIEW', submitted_by = _uid, submitted_at = now() WHERE id = _config_id;

  ELSIF _to = 'APPROVED' THEN
    IF _c.status <> 'REVIEW' THEN RAISE EXCEPTION 'only a configuration under review may be approved' USING ERRCODE = '22023'; END IF;
    IF _uid = COALESCE(_c.submitted_by, _c.created_by) THEN
      RAISE EXCEPTION 'the approver must be a different person from the author' USING ERRCODE = '22023';
    END IF;
    UPDATE public.supervisory_calculation_config
       SET status = 'APPROVED', approved_by = _uid, approved_at = now() WHERE id = _config_id;

  ELSIF _to = 'RETURNED' OR _to = 'DRAFT' THEN
    IF _c.status NOT IN ('REVIEW','APPROVED') THEN RAISE EXCEPTION 'only a submitted configuration may be returned' USING ERRCODE = '22023'; END IF;
    UPDATE public.supervisory_calculation_config
       SET status = 'DRAFT', submitted_by = NULL, submitted_at = NULL,
           approved_by = NULL, approved_at = NULL WHERE id = _config_id;
    _to := 'DRAFT';

  ELSIF _to = 'ACTIVE' THEN
    IF _c.status <> 'APPROVED' THEN RAISE EXCEPTION 'only an approved configuration may be activated' USING ERRCODE = '22023'; END IF;
    IF _c.effective_from IS NULL THEN
      RAISE EXCEPTION 'a configuration cannot be activated without an effective-from date' USING ERRCODE = '22023'; END IF;
    SELECT * INTO _pred FROM public.supervisory_calculation_config
     WHERE methodology_id = _c.methodology_id AND status = 'ACTIVE' AND id <> _config_id
     ORDER BY effective_from DESC NULLS LAST LIMIT 1;
    IF _pred.id IS NOT NULL THEN
      IF _pred.effective_from IS NULL OR _pred.effective_from >= _c.effective_from THEN
        RAISE EXCEPTION 'the successor must take effect after the configuration it replaces (predecessor effective from %)', _pred.effective_from
          USING ERRCODE = '22023';
      END IF;
      UPDATE public.supervisory_calculation_config
         SET status = 'SUPERSEDED', superseded_at = now(), effective_to = _c.effective_from
       WHERE id = _pred.id;
    END IF;
    UPDATE public.supervisory_calculation_config
       SET status = 'ACTIVE', activated_at = now() WHERE id = _config_id;

  ELSIF _to = 'RETIRED' THEN
    UPDATE public.supervisory_calculation_config SET status = 'RETIRED' WHERE id = _config_id;
  ELSE
    RAISE EXCEPTION 'unsupported target status %', _to USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.supervisory_calculation_event(config_id, event_type, from_status, to_status, rationale, actor_id)
  VALUES (_config_id, 'LIFECYCLE', _c.status, _to, btrim(_rationale), _uid);
  RETURN _config_id;
END $$;