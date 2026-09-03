-- =====================================================================
-- AML calculation PRE-POLICY CLOSURE (server contract)
-- No supervisory policy value is authored here.
-- =====================================================================

-- ---------- domain-derived authorization ----------
CREATE OR REPLACE FUNCTION public.supervisory_domain_module(_domain_code text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE upper(btrim(_domain_code))
           WHEN 'AML_CFT'        THEN 'aml_supervision'
           WHEN 'PRUDENTIAL'     THEN 'prudential_supervision'
           WHEN 'MARKET_CONDUCT' THEN 'market_conduct'
         END;
$$;
COMMENT ON FUNCTION public.supervisory_domain_module(text) IS
  'Platform wiring: maps a supervisory domain code to its permission module. An unknown domain returns NULL and authority is refused.';

CREATE OR REPLACE FUNCTION public.supervisory_calc_domain_authority_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _mid uuid; _domain text; _module text; _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_TABLE_NAME = 'supervisory_calculation_config' THEN
    _mid := COALESCE(NEW.methodology_id, OLD.methodology_id);
  ELSE
    SELECT c.methodology_id INTO _mid FROM public.supervisory_calculation_config c
     WHERE c.id = COALESCE(NEW.config_id, OLD.config_id);
  END IF;
  IF public.is_super_admin(_uid) THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT m.domain_code INTO _domain FROM public.supervisory_methodology m WHERE m.id = _mid;
  _module := public.supervisory_domain_module(_domain);
  IF _module IS NULL OR NOT public.has_any_permission(_uid,
       ARRAY[_module || '.manage_config', 'supervisory_spine.manage_config']) THEN
    RAISE EXCEPTION 'not_authorized_for_domain: managing the calculation configuration of domain % requires that domain''s configuration authority', COALESCE(_domain, '(unknown)')
      USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_calc_domain_authority_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS scdag_config_trg ON public.supervisory_calculation_config;
CREATE TRIGGER scdag_config_trg BEFORE INSERT OR UPDATE OR DELETE ON public.supervisory_calculation_config
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_calc_domain_authority_guard();
DROP TRIGGER IF EXISTS scdag_score_trg ON public.supervisory_calculation_response_score;
CREATE TRIGGER scdag_score_trg BEFORE INSERT OR UPDATE OR DELETE ON public.supervisory_calculation_response_score
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_calc_domain_authority_guard();
DROP TRIGGER IF EXISTS scdag_band_trg ON public.supervisory_calculation_band;
CREATE TRIGGER scdag_band_trg BEFORE INSERT OR UPDATE OR DELETE ON public.supervisory_calculation_band
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_calc_domain_authority_guard();
DROP TRIGGER IF EXISTS scdag_matrix_trg ON public.supervisory_calculation_matrix_cell;
CREATE TRIGGER scdag_matrix_trg BEFORE INSERT OR UPDATE OR DELETE ON public.supervisory_calculation_matrix_cell
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_calc_domain_authority_guard();

-- ---------- persisted calculation-status contract ----------
ALTER TABLE public.supervisory_assessment_dimension
  DROP CONSTRAINT IF EXISTS supervisory_assessment_dimension_calc_status_chk;
ALTER TABLE public.supervisory_assessment_dimension
  ADD CONSTRAINT supervisory_assessment_dimension_calc_status_chk
  CHECK (calculation_status IS NULL OR calculation_status = ANY (ARRAY[
    'CALCULATED','NOT_CALCULABLE','NO_CONFIGURATION','NO_EFFECTIVE_DATE_RULE','CONFIGURATION_INCOMPLETE']));
COMMENT ON COLUMN public.supervisory_assessment_dimension.calculation_status IS
  'Closed vocabulary written only by supervisory_calc_materialise: CALCULATED, NOT_CALCULABLE, NO_CONFIGURATION, NO_EFFECTIVE_DATE_RULE, CONFIGURATION_INCOMPLETE. NULL = never calculated.';

ALTER TABLE public.supervisory_assessment_calculation
  DROP CONSTRAINT IF EXISTS supervisory_assessment_calculation_status_chk;
ALTER TABLE public.supervisory_assessment_calculation
  ADD CONSTRAINT supervisory_assessment_calculation_status_chk
  CHECK (status = ANY (ARRAY[
    'CALCULATED','NOT_CALCULABLE','NO_CONFIGURATION','NO_EFFECTIVE_DATE_RULE','CONFIGURATION_INCOMPLETE']));

-- ---------- rounding semantics ----------
CREATE OR REPLACE FUNCTION public.supervisory_calc_round(_v numeric, _mode text, _decimals integer)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE _p numeric; _s numeric;
BEGIN
  IF _v IS NULL THEN RETURN NULL; END IF;
  IF _mode IS NULL OR (_mode <> 'NONE' AND _decimals IS NULL) THEN
    RAISE EXCEPTION 'rounding_undecided: the calculation configuration must decide the rounding mode and precision'
      USING ERRCODE = '22023';
  END IF;
  IF _mode = 'NONE' THEN RETURN _v; END IF;
  _p := power(10, _decimals)::numeric;
  _s := _v * _p;
  RETURN CASE _mode
           WHEN 'FLOOR'     THEN floor(_s) / _p
           WHEN 'CEILING'   THEN ceil(_s) / _p
           WHEN 'HALF_DOWN' THEN CASE WHEN abs(_s - trunc(_s)) = 0.5 THEN trunc(_s) / _p ELSE round(_s) / _p END
           ELSE round(_s) / _p
         END;
END $$;
COMMENT ON FUNCTION public.supervisory_calc_round(numeric,text,integer) IS
  'HALF_UP rounds a tie away from zero; HALF_DOWN rounds a tie toward zero; FLOOR/CEILING are directional; NONE keeps full precision. Nothing is defaulted.';

-- ---------- dead response-level policy controls removed ----------
ALTER TABLE public.supervisory_calculation_response_score
  DROP COLUMN IF EXISTS requires_observation,
  DROP COLUMN IF EXISTS requires_rationale,
  DROP COLUMN IF EXISTS is_critical_floor,
  DROP COLUMN IF EXISTS requires_evidence;

CREATE OR REPLACE FUNCTION public.supervisory_calculation_response_scores_set(_config_id uuid, _rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _status text; _n integer := 0;
BEGIN
  _uid := public.supervisory_spine_require(ARRAY['aml_supervision.manage_config',
            'supervisory_spine.manage_config','prudential_supervision.manage_config']);
  SELECT status INTO _status FROM public.supervisory_calculation_config WHERE id = _config_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'not_found: calculation configuration' USING ERRCODE = '22023'; END IF;
  IF _status <> 'DRAFT' THEN RAISE EXCEPTION 'response scoring may only be edited while the configuration is a draft' USING ERRCODE = '22023'; END IF;

  DELETE FROM public.supervisory_calculation_response_score WHERE config_id = _config_id;
  INSERT INTO public.supervisory_calculation_response_score(
    config_id, response_code, score, meaning, excluded_from_denominator, sort_order)
  SELECT _config_id, upper(btrim(r->>'response_code')),
         NULLIF(r->>'score','')::numeric, NULLIF(r->>'meaning',''),
         COALESCE((r->>'excluded_from_denominator')::boolean,false),
         COALESCE((r->>'sort_order')::int, 0)
    FROM jsonb_array_elements(COALESCE(_rows,'[]'::jsonb)) r
   WHERE btrim(COALESCE(r->>'response_code','')) <> '';
  SELECT count(*) INTO _n FROM public.supervisory_calculation_response_score WHERE config_id = _config_id;

  INSERT INTO public.supervisory_calculation_event(config_id, event_type, to_status, actor_id, detail)
  VALUES (_config_id, 'RESPONSE_SCORING_SAVED', 'DRAFT', _uid, jsonb_build_object('rows', _rows));
  RETURN _n;
END $$;

-- ---------- correct overall NOT_CALCULABLE semantics (wrapper over the existing engine) ----------
ALTER FUNCTION public.supervisory_calc_compute(uuid) RENAME TO supervisory_calc_compute_core;
COMMENT ON FUNCTION public.supervisory_calc_compute_core(uuid) IS
  'Deterministic engine body. Callers must use supervisory_calc_compute, which states the authoritative overall status.';
REVOKE ALL ON FUNCTION public.supervisory_calc_compute_core(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.supervisory_calc_compute(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _r jsonb; _any boolean;
BEGIN
  _r := public.supervisory_calc_compute_core(_assessment_id);
  IF _r->>'status' <> 'CALCULATED' THEN RETURN _r; END IF;
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(_r->'dimensions','[]'::jsonb)) d
                  WHERE d->>'status' = 'CALCULATED') INTO _any;
  IF _any THEN RETURN _r; END IF;
  RETURN _r || jsonb_build_object('status','NOT_CALCULABLE',
    'reason','no assessment dimension satisfies the configured calculation rules, so no rating is produced');
END $$;
REVOKE ALL ON FUNCTION public.supervisory_calc_compute(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_calc_compute(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.supervisory_calc_compute(uuid) IS
  'Authoritative calculation result. Overall status is CALCULATED only when at least one dimension was actually calculated.';

-- ---------- completeness: a scored response must carry a score in range ----------
CREATE OR REPLACE FUNCTION public.supervisory_calculation_config_score_problems(_config_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(array_agg(p), '{}'::text[]) FROM (
    SELECT 'a response that counts toward the score must carry a numeric score: ' || string_agg(s.response_code, ', ') AS p
      FROM public.supervisory_calculation_response_score s
     WHERE s.config_id = _config_id AND NOT s.excluded_from_denominator AND s.score IS NULL
    HAVING count(*) > 0
    UNION ALL
    SELECT 'a response score must be between 0 and 100: ' || string_agg(s.response_code, ', ')
      FROM public.supervisory_calculation_response_score s
     WHERE s.config_id = _config_id AND s.score IS NOT NULL AND (s.score < 0 OR s.score > 100)
    HAVING count(*) > 0
  ) q;
$$;
REVOKE ALL ON FUNCTION public.supervisory_calculation_config_score_problems(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_calculation_config_score_problems(uuid) TO authenticated, service_role;

ALTER FUNCTION public.supervisory_calculation_config_validate(uuid) RENAME TO supervisory_calculation_config_validate_core;
REVOKE ALL ON FUNCTION public.supervisory_calculation_config_validate_core(uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.supervisory_calculation_config_validate(_config_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _v jsonb; _extra text[]; _problems jsonb;
BEGIN
  _v := public.supervisory_calculation_config_validate_core(_config_id);
  _extra := public.supervisory_calculation_config_score_problems(_config_id);
  IF array_length(_extra,1) IS NULL THEN RETURN _v; END IF;
  _problems := COALESCE(_v->'problems','[]'::jsonb) || to_jsonb(_extra);
  RETURN jsonb_build_object('ok', jsonb_array_length(_problems) = 0, 'problems', _problems);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_calculation_config_validate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_calculation_config_validate(uuid) TO authenticated, service_role;