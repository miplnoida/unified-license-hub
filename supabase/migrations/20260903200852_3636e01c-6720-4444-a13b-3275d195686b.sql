-- =============================================================================
-- Supervisory methodology calculation configuration (governed, versioned,
-- maker/checker approved). No scoring value is chosen here: the tables carry
-- only structure. Values are supplied by the supervisory owner in the
-- Administration screens and become usable only once ACTIVE.
-- =============================================================================

CREATE TABLE public.supervisory_calculation_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  methodology_id uuid NOT NULL REFERENCES public.supervisory_methodology(id) ON DELETE CASCADE,
  config_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'DRAFT',
  effective_from date,
  effective_to date,
  -- dimension aggregation
  aggregation_method text NOT NULL DEFAULT 'UNWEIGHTED_MEAN',
  min_answered_questions integer NOT NULL DEFAULT 1,
  na_denominator_handling text NOT NULL DEFAULT 'EXCLUDE',
  evidence_insufficiency_handling text NOT NULL DEFAULT 'FLAG_ONLY',
  critical_question_handling text NOT NULL DEFAULT 'NONE',
  rounding_mode text NOT NULL DEFAULT 'HALF_UP',
  rounding_decimals integer NOT NULL DEFAULT 1,
  inherent_direction text NOT NULL DEFAULT 'INVERTED',
  -- overall recommendation
  recommendation_policy text NOT NULL DEFAULT 'WEIGHTED_WITH_CRITICAL_FLOOR',
  recommendation_threshold text,
  override_threshold text,
  notes text,
  created_by uuid,
  submitted_by uuid,
  submitted_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  activated_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_calculation_config_status_chk
    CHECK (status = ANY (ARRAY['DRAFT','REVIEW','APPROVED','ACTIVE','SUPERSEDED','RETIRED'])),
  CONSTRAINT supervisory_calculation_config_agg_chk
    CHECK (aggregation_method = ANY (ARRAY['UNWEIGHTED_MEAN','WEIGHTED_MEAN','WORST_RESPONSE'])),
  CONSTRAINT supervisory_calculation_config_na_chk
    CHECK (na_denominator_handling = ANY (ARRAY['EXCLUDE','INCLUDE_AS_ZERO','INCLUDE_AS_FULL'])),
  CONSTRAINT supervisory_calculation_config_evid_chk
    CHECK (evidence_insufficiency_handling = ANY (ARRAY['FLAG_ONLY','NOT_CALCULABLE','CAP_AT_MIDPOINT'])),
  CONSTRAINT supervisory_calculation_config_crit_chk
    CHECK (critical_question_handling = ANY (ARRAY['NONE','FLOOR_DIMENSION','FLOOR_ASSESSMENT'])),
  CONSTRAINT supervisory_calculation_config_round_chk
    CHECK (rounding_mode = ANY (ARRAY['HALF_UP','HALF_DOWN','FLOOR','CEILING','NONE'])),
  CONSTRAINT supervisory_calculation_config_decimals_chk
    CHECK (rounding_decimals BETWEEN 0 AND 4),
  CONSTRAINT supervisory_calculation_config_dir_chk
    CHECK (inherent_direction = ANY (ARRAY['DIRECT','INVERTED'])),
  CONSTRAINT supervisory_calculation_config_policy_chk
    CHECK (recommendation_policy = ANY (ARRAY['WEIGHTED_SCORE','HIGHEST_MATERIAL_DIMENSION','WEIGHTED_WITH_CRITICAL_FLOOR','WORST_OF_N','WEIGHTED_WITH_THRESHOLD'])),
  CONSTRAINT supervisory_calculation_config_min_chk CHECK (min_answered_questions >= 0),
  CONSTRAINT supervisory_calculation_config_window_chk
    CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  CONSTRAINT supervisory_calculation_config_version_uniq UNIQUE (methodology_id, config_version)
);

CREATE UNIQUE INDEX supervisory_calculation_config_one_active
  ON public.supervisory_calculation_config(methodology_id)
  WHERE status = 'ACTIVE';

GRANT SELECT ON public.supervisory_calculation_config TO authenticated;
GRANT ALL ON public.supervisory_calculation_config TO service_role;
ALTER TABLE public.supervisory_calculation_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY supervisory_calculation_config_read ON public.supervisory_calculation_config
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), ARRAY[
    'supervisory_spine.view','aml_supervision.view','prudential_supervision.view',
    'supervisory_spine.manage_config','aml_supervision.manage_config','prudential_supervision.manage_config']));

CREATE TRIGGER supervisory_calculation_config_touch
  BEFORE UPDATE ON public.supervisory_calculation_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------- responses --
CREATE TABLE public.supervisory_calculation_response_score (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.supervisory_calculation_config(id) ON DELETE CASCADE,
  response_code text NOT NULL,
  score numeric(6,2),
  meaning text,
  excluded_from_denominator boolean NOT NULL DEFAULT false,
  requires_observation boolean NOT NULL DEFAULT false,
  requires_evidence boolean NOT NULL DEFAULT false,
  requires_rationale boolean NOT NULL DEFAULT false,
  is_critical_floor boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_calc_response_uniq UNIQUE (config_id, response_code),
  CONSTRAINT supervisory_calc_response_score_chk
    CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  CONSTRAINT supervisory_calc_response_scored_chk
    CHECK (excluded_from_denominator OR score IS NOT NULL)
);
GRANT SELECT ON public.supervisory_calculation_response_score TO authenticated;
GRANT ALL ON public.supervisory_calculation_response_score TO service_role;
ALTER TABLE public.supervisory_calculation_response_score ENABLE ROW LEVEL SECURITY;
CREATE POLICY supervisory_calc_response_read ON public.supervisory_calculation_response_score
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), ARRAY[
    'supervisory_spine.view','aml_supervision.view','prudential_supervision.view',
    'supervisory_spine.manage_config','aml_supervision.manage_config','prudential_supervision.manage_config']));
CREATE TRIGGER supervisory_calc_response_touch
  BEFORE UPDATE ON public.supervisory_calculation_response_score
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------------- bands ---
CREATE TABLE public.supervisory_calculation_band (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.supervisory_calculation_config(id) ON DELETE CASCADE,
  band_kind text NOT NULL,
  band_code text NOT NULL,
  min_score numeric(6,2) NOT NULL,
  max_score numeric(6,2) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_calc_band_kind_chk CHECK (band_kind = ANY (ARRAY['INHERENT','CONTROL'])),
  CONSTRAINT supervisory_calc_band_range_chk CHECK (max_score >= min_score AND min_score >= 0 AND max_score <= 100),
  CONSTRAINT supervisory_calc_band_uniq UNIQUE (config_id, band_kind, band_code)
);
GRANT SELECT ON public.supervisory_calculation_band TO authenticated;
GRANT ALL ON public.supervisory_calculation_band TO service_role;
ALTER TABLE public.supervisory_calculation_band ENABLE ROW LEVEL SECURITY;
CREATE POLICY supervisory_calc_band_read ON public.supervisory_calculation_band
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), ARRAY[
    'supervisory_spine.view','aml_supervision.view','prudential_supervision.view',
    'supervisory_spine.manage_config','aml_supervision.manage_config','prudential_supervision.manage_config']));
CREATE TRIGGER supervisory_calc_band_touch
  BEFORE UPDATE ON public.supervisory_calculation_band
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------------ matrix ---
CREATE TABLE public.supervisory_calculation_matrix_cell (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.supervisory_calculation_config(id) ON DELETE CASCADE,
  inherent_band text NOT NULL,
  control_band text NOT NULL,
  residual_rating text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_calc_matrix_uniq UNIQUE (config_id, inherent_band, control_band)
);
GRANT SELECT ON public.supervisory_calculation_matrix_cell TO authenticated;
GRANT ALL ON public.supervisory_calculation_matrix_cell TO service_role;
ALTER TABLE public.supervisory_calculation_matrix_cell ENABLE ROW LEVEL SECURITY;
CREATE POLICY supervisory_calc_matrix_read ON public.supervisory_calculation_matrix_cell
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), ARRAY[
    'supervisory_spine.view','aml_supervision.view','prudential_supervision.view',
    'supervisory_spine.manage_config','aml_supervision.manage_config','prudential_supervision.manage_config']));
CREATE TRIGGER supervisory_calc_matrix_touch
  BEFORE UPDATE ON public.supervisory_calculation_matrix_cell
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------------------ events ---
CREATE TABLE public.supervisory_calculation_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.supervisory_calculation_config(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  rationale text,
  actor_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.supervisory_calculation_event TO authenticated;
GRANT ALL ON public.supervisory_calculation_event TO service_role;
ALTER TABLE public.supervisory_calculation_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY supervisory_calc_event_read ON public.supervisory_calculation_event
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), ARRAY[
    'supervisory_spine.view','aml_supervision.view','prudential_supervision.view',
    'supervisory_spine.manage_config','aml_supervision.manage_config','prudential_supervision.manage_config']));

-- ------------------------------------------------- domain effective-date rule
CREATE TABLE public.supervisory_domain_calculation_rule (
  domain_code text PRIMARY KEY,
  effective_date_rule text NOT NULL,
  rationale text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supervisory_domain_calc_rule_chk
    CHECK (effective_date_rule = ANY (ARRAY['EXECUTION_DATE','ASSESSMENT_DATE','PERIOD_END','TRIGGER_DATE','EXPLICIT_AS_OF']))
);
GRANT SELECT ON public.supervisory_domain_calculation_rule TO authenticated;
GRANT ALL ON public.supervisory_domain_calculation_rule TO service_role;
ALTER TABLE public.supervisory_domain_calculation_rule ENABLE ROW LEVEL SECURITY;
CREATE POLICY supervisory_domain_calc_rule_read ON public.supervisory_domain_calculation_rule
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(), ARRAY[
    'supervisory_spine.view','aml_supervision.view','prudential_supervision.view',
    'supervisory_spine.manage_config','aml_supervision.manage_config','prudential_supervision.manage_config']));
CREATE TRIGGER supervisory_domain_calc_rule_touch
  BEFORE UPDATE ON public.supervisory_domain_calculation_rule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- Governed operations
-- =============================================================================

CREATE OR REPLACE FUNCTION public.supervisory_calculation_config_upsert(
  _methodology_id uuid, _payload jsonb, _config_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _id uuid; _status text; _next integer;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_methodology WHERE id = _methodology_id) THEN
    RAISE EXCEPTION 'not_found: methodology' USING ERRCODE = '22023';
  END IF;

  IF _config_id IS NOT NULL THEN
    SELECT status INTO _status FROM public.supervisory_calculation_config WHERE id = _config_id;
    IF _status IS NULL THEN RAISE EXCEPTION 'not_found: calculation configuration' USING ERRCODE = '22023'; END IF;
    IF _status <> 'DRAFT' THEN
      RAISE EXCEPTION 'a calculation configuration may only be edited while it is a draft' USING ERRCODE = '22023';
    END IF;
    _id := _config_id;
  ELSE
    SELECT COALESCE(max(config_version),0)+1 INTO _next
      FROM public.supervisory_calculation_config WHERE methodology_id = _methodology_id;
    INSERT INTO public.supervisory_calculation_config(methodology_id, config_version, created_by)
    VALUES (_methodology_id, _next, _uid) RETURNING id INTO _id;
    INSERT INTO public.supervisory_calculation_event(config_id, event_type, to_status, actor_id, rationale)
    VALUES (_id, 'DRAFT_CREATED', 'DRAFT', _uid, 'draft calculation configuration created');
  END IF;

  UPDATE public.supervisory_calculation_config c SET
    effective_from = COALESCE((_payload->>'effective_from')::date, c.effective_from),
    effective_to   = CASE WHEN _payload ? 'effective_to' THEN NULLIF(_payload->>'effective_to','')::date ELSE c.effective_to END,
    aggregation_method = COALESCE(_payload->>'aggregation_method', c.aggregation_method),
    min_answered_questions = COALESCE((_payload->>'min_answered_questions')::int, c.min_answered_questions),
    na_denominator_handling = COALESCE(_payload->>'na_denominator_handling', c.na_denominator_handling),
    evidence_insufficiency_handling = COALESCE(_payload->>'evidence_insufficiency_handling', c.evidence_insufficiency_handling),
    critical_question_handling = COALESCE(_payload->>'critical_question_handling', c.critical_question_handling),
    rounding_mode = COALESCE(_payload->>'rounding_mode', c.rounding_mode),
    rounding_decimals = COALESCE((_payload->>'rounding_decimals')::int, c.rounding_decimals),
    inherent_direction = COALESCE(_payload->>'inherent_direction', c.inherent_direction),
    recommendation_policy = COALESCE(_payload->>'recommendation_policy', c.recommendation_policy),
    recommendation_threshold = CASE WHEN _payload ? 'recommendation_threshold' THEN NULLIF(_payload->>'recommendation_threshold','') ELSE c.recommendation_threshold END,
    override_threshold = CASE WHEN _payload ? 'override_threshold' THEN NULLIF(_payload->>'override_threshold','') ELSE c.override_threshold END,
    notes = CASE WHEN _payload ? 'notes' THEN NULLIF(_payload->>'notes','') ELSE c.notes END
  WHERE c.id = _id;

  INSERT INTO public.supervisory_calculation_event(config_id, event_type, to_status, actor_id, detail)
  VALUES (_id, 'PARAMETERS_SAVED', 'DRAFT', _uid, _payload);
  RETURN _id;
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_calculation_response_scores_set(_config_id uuid, _rows jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _status text; _n integer := 0;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  SELECT status INTO _status FROM public.supervisory_calculation_config WHERE id = _config_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'not_found: calculation configuration' USING ERRCODE = '22023'; END IF;
  IF _status <> 'DRAFT' THEN RAISE EXCEPTION 'response scoring may only be edited while the configuration is a draft' USING ERRCODE = '22023'; END IF;

  DELETE FROM public.supervisory_calculation_response_score WHERE config_id = _config_id;
  INSERT INTO public.supervisory_calculation_response_score(
    config_id, response_code, score, meaning, excluded_from_denominator,
    requires_observation, requires_evidence, requires_rationale, is_critical_floor, sort_order)
  SELECT _config_id, upper(btrim(r->>'response_code')),
         NULLIF(r->>'score','')::numeric, NULLIF(r->>'meaning',''),
         COALESCE((r->>'excluded_from_denominator')::boolean,false),
         COALESCE((r->>'requires_observation')::boolean,false),
         COALESCE((r->>'requires_evidence')::boolean,false),
         COALESCE((r->>'requires_rationale')::boolean,false),
         COALESCE((r->>'is_critical_floor')::boolean,false),
         COALESCE((r->>'sort_order')::int, 0)
    FROM jsonb_array_elements(COALESCE(_rows,'[]'::jsonb)) r
   WHERE btrim(COALESCE(r->>'response_code','')) <> '';
  SELECT count(*) INTO _n FROM public.supervisory_calculation_response_score WHERE config_id = _config_id;

  INSERT INTO public.supervisory_calculation_event(config_id, event_type, to_status, actor_id, detail)
  VALUES (_config_id, 'RESPONSE_SCORING_SAVED', 'DRAFT', _uid, jsonb_build_object('rows', _rows));
  RETURN _n;
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_calculation_bands_set(_config_id uuid, _band_kind text, _rows jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _status text; _n integer := 0; _kind text := upper(btrim(_band_kind));
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  IF _kind NOT IN ('INHERENT','CONTROL') THEN RAISE EXCEPTION 'band kind must be INHERENT or CONTROL' USING ERRCODE = '22023'; END IF;
  SELECT status INTO _status FROM public.supervisory_calculation_config WHERE id = _config_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'not_found: calculation configuration' USING ERRCODE = '22023'; END IF;
  IF _status <> 'DRAFT' THEN RAISE EXCEPTION 'bands may only be edited while the configuration is a draft' USING ERRCODE = '22023'; END IF;

  DELETE FROM public.supervisory_calculation_band WHERE config_id = _config_id AND band_kind = _kind;
  INSERT INTO public.supervisory_calculation_band(config_id, band_kind, band_code, min_score, max_score, sort_order)
  SELECT _config_id, _kind, upper(btrim(r->>'band_code')),
         (r->>'min_score')::numeric, (r->>'max_score')::numeric, COALESCE((r->>'sort_order')::int,0)
    FROM jsonb_array_elements(COALESCE(_rows,'[]'::jsonb)) r
   WHERE btrim(COALESCE(r->>'band_code','')) <> '';
  SELECT count(*) INTO _n FROM public.supervisory_calculation_band WHERE config_id = _config_id AND band_kind = _kind;

  INSERT INTO public.supervisory_calculation_event(config_id, event_type, to_status, actor_id, detail)
  VALUES (_config_id, 'BANDS_SAVED', 'DRAFT', _uid, jsonb_build_object('band_kind', _kind, 'rows', _rows));
  RETURN _n;
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_calculation_matrix_set(_config_id uuid, _cells jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _status text; _n integer := 0;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  SELECT status INTO _status FROM public.supervisory_calculation_config WHERE id = _config_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'not_found: calculation configuration' USING ERRCODE = '22023'; END IF;
  IF _status <> 'DRAFT' THEN RAISE EXCEPTION 'the residual matrix may only be edited while the configuration is a draft' USING ERRCODE = '22023'; END IF;

  DELETE FROM public.supervisory_calculation_matrix_cell WHERE config_id = _config_id;
  INSERT INTO public.supervisory_calculation_matrix_cell(config_id, inherent_band, control_band, residual_rating)
  SELECT _config_id, upper(btrim(c->>'inherent_band')), upper(btrim(c->>'control_band')), upper(btrim(c->>'residual_rating'))
    FROM jsonb_array_elements(COALESCE(_cells,'[]'::jsonb)) c
   WHERE btrim(COALESCE(c->>'inherent_band','')) <> ''
     AND btrim(COALESCE(c->>'control_band','')) <> ''
     AND btrim(COALESCE(c->>'residual_rating','')) <> '';
  SELECT count(*) INTO _n FROM public.supervisory_calculation_matrix_cell WHERE config_id = _config_id;

  INSERT INTO public.supervisory_calculation_event(config_id, event_type, to_status, actor_id, detail)
  VALUES (_config_id, 'MATRIX_SAVED', 'DRAFT', _uid, jsonb_build_object('cells', _cells));
  RETURN _n;
END $function$;

-- Completeness validation: the configuration cannot leave DRAFT until every
-- parameter the calculation needs is published.
CREATE OR REPLACE FUNCTION public.supervisory_calculation_config_validate(_config_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _c public.supervisory_calculation_config; _m public.supervisory_methodology;
        _problems text[] := '{}'; _risk text[]; _ctrl text[]; _resp text[]; _need integer; _have integer;
        _prev numeric; _b record;
BEGIN
  SELECT * INTO _c FROM public.supervisory_calculation_config WHERE id = _config_id;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'not_found: calculation configuration' USING ERRCODE = '22023'; END IF;
  SELECT * INTO _m FROM public.supervisory_methodology WHERE id = _c.methodology_id;

  SELECT array_agg(x->>'code' ORDER BY (x->>'ordinal')::int)
    INTO _risk FROM jsonb_array_elements(_m.scoring_scale) x;
  SELECT array_agg(v) INTO _ctrl
    FROM jsonb_array_elements_text(COALESCE(_m.definition->'control_scale','[]'::jsonb)) v;
  IF _risk IS NULL OR array_length(_risk,1) = 0 THEN
    _problems := _problems || 'the methodology publishes no risk rating scale';
  END IF;
  IF _ctrl IS NULL OR array_length(_ctrl,1) = 0 THEN
    _problems := _problems || 'the methodology publishes no control effectiveness scale';
  END IF;

  -- response scoring must cover every response option the questions permit
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

  -- bands: present, in-vocabulary, contiguous, non-overlapping, covering 0..100
  FOR _b IN SELECT 'INHERENT'::text AS k, _risk AS vocab UNION ALL SELECT 'CONTROL', _ctrl LOOP
    IF _b.vocab IS NOT NULL THEN
      SELECT count(*) INTO _have FROM public.supervisory_calculation_band
        WHERE config_id = _config_id AND band_kind = _b.k;
      IF _have = 0 THEN
        _problems := _problems || (lower(_b.k) || ' bands are not defined');
      ELSE
        IF EXISTS (SELECT 1 FROM public.supervisory_calculation_band b
                    WHERE b.config_id = _config_id AND b.band_kind = _b.k
                      AND NOT (b.band_code = ANY (_b.vocab))) THEN
          _problems := _problems || (lower(_b.k) || ' bands use a code outside the published vocabulary');
        END IF;
        IF EXISTS (SELECT 1 FROM unnest(_b.vocab) v
                    WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_calculation_band b
                                       WHERE b.config_id = _config_id AND b.band_kind = _b.k AND b.band_code = v)) THEN
          _problems := _problems || (lower(_b.k) || ' bands do not cover every published rating');
        END IF;
        _prev := NULL;
        FOR _b IN SELECT * FROM (SELECT b.min_score, b.max_score, _b.k AS k, _b.vocab AS vocab
                                   FROM public.supervisory_calculation_band b
                                  WHERE b.config_id = _config_id AND b.band_kind = _b.k
                                  ORDER BY b.min_score) s LOOP
          IF _prev IS NULL THEN
            IF _b.min_score <> 0 THEN _problems := _problems || (lower(_b.k) || ' bands do not start at 0'); END IF;
          ELSIF _b.min_score > _prev + 1.01 OR _b.min_score <= _prev THEN
            _problems := _problems || (lower(_b.k) || ' bands are not contiguous and non-overlapping');
          END IF;
          _prev := _b.max_score;
        END LOOP;
        IF _prev IS DISTINCT FROM 100 THEN
          _problems := _problems || (lower(_b.k) || ' bands do not reach 100');
        END IF;
      END IF;
    END IF;
  END LOOP;

  -- residual matrix: one cell per inherent x control, each an in-vocabulary rating
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
  IF _c.effective_from IS NULL THEN
    _problems := _problems || 'an effective-from date is required';
  END IF;

  RETURN jsonb_build_object('ok', array_length(_problems,1) IS NULL,
                            'problems', to_jsonb(COALESCE(_problems,'{}'::text[])));
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_calculation_config_lifecycle(
  _config_id uuid, _to_status text, _rationale text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _c public.supervisory_calculation_config; _to text := upper(btrim(_to_status)); _v jsonb;
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
    UPDATE public.supervisory_calculation_config
       SET status = 'SUPERSEDED', superseded_at = now(), effective_to = COALESCE(effective_to, current_date)
     WHERE methodology_id = _c.methodology_id AND status = 'ACTIVE' AND id <> _config_id;
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
END $function$;

CREATE OR REPLACE FUNCTION public.supervisory_domain_calculation_rule_set(
  _domain_code text, _effective_date_rule text, _rationale text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _d text := upper(btrim(_domain_code));
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  IF NOT public.supervisory_domain_valid(_d) THEN
    RAISE EXCEPTION 'not_found: supervisory domain' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.supervisory_domain_calculation_rule(domain_code, effective_date_rule, rationale, decided_by, decided_at)
  VALUES (_d, upper(btrim(_effective_date_rule)), btrim(_rationale), _uid, now())
  ON CONFLICT (domain_code) DO UPDATE
    SET effective_date_rule = EXCLUDED.effective_date_rule,
        rationale = EXCLUDED.rationale, decided_by = EXCLUDED.decided_by, decided_at = now();
  RETURN _d;
END $function$;

-- Resolution as-of date, derived from the configured rule for the domain.
CREATE OR REPLACE FUNCTION public.supervisory_methodology_as_of(
  _domain_code text, _execution_date date DEFAULT NULL, _assessment_date date DEFAULT NULL,
  _period_end date DEFAULT NULL, _trigger_date date DEFAULT NULL, _explicit_as_of date DEFAULT NULL)
RETURNS date
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT CASE COALESCE((SELECT r.effective_date_rule FROM public.supervisory_domain_calculation_rule r
                         WHERE r.domain_code = upper(_domain_code)), 'EXECUTION_DATE')
           WHEN 'EXECUTION_DATE' THEN COALESCE(_execution_date, current_date)
           WHEN 'ASSESSMENT_DATE' THEN COALESCE(_assessment_date, _execution_date, current_date)
           WHEN 'PERIOD_END'      THEN COALESCE(_period_end, _execution_date, current_date)
           WHEN 'TRIGGER_DATE'    THEN COALESCE(_trigger_date, _execution_date, current_date)
           WHEN 'EXPLICIT_AS_OF'  THEN COALESCE(_explicit_as_of, _execution_date, current_date)
           ELSE COALESCE(_execution_date, current_date)
         END;
$function$;

REVOKE ALL ON FUNCTION public.supervisory_calculation_config_upsert(uuid, jsonb, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_calculation_response_scores_set(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_calculation_bands_set(uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_calculation_matrix_set(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_calculation_config_validate(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_calculation_config_lifecycle(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_domain_calculation_rule_set(text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.supervisory_methodology_as_of(text, date, date, date, date, date) FROM anon;