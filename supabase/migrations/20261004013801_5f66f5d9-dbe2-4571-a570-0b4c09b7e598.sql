-- AML-CLOSE-03 — Materiality, applicability & risk-factor authority.
-- Extends the single calculation engine (AML-06 calculation settings); no second engine.

CREATE TABLE public.supervisory_calculation_applicability_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.supervisory_calculation_config(id) ON DELETE CASCADE,
  dimension_code text NOT NULL,
  methodology_dimension_id uuid NOT NULL REFERENCES public.supervisory_methodology_dimension(id),
  basis text NOT NULL,
  sector_codes text[],
  fact_code text,
  fact_requirement_id uuid REFERENCES public.supervisory_methodology_fact_requirement(id),
  operator text,
  threshold_value numeric,
  when_missing text NOT NULL DEFAULT 'PENDING_INFORMATION',
  rationale text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scar_unique UNIQUE (config_id, dimension_code),
  CONSTRAINT scar_basis CHECK (basis IN ('ALWAYS','SECTOR','FACT')),
  CONSTRAINT scar_operator CHECK (operator IS NULL OR operator IN ('GT','GTE','LT','LTE','EQ','IS_TRUE','IS_FALSE')),
  CONSTRAINT scar_when_missing CHECK (when_missing IN ('PENDING_INFORMATION','APPLICABLE','NOT_APPLICABLE')),
  CONSTRAINT scar_rationale CHECK (length(btrim(rationale)) >= 10),
  CONSTRAINT scar_shape CHECK (
    (basis = 'ALWAYS' AND fact_code IS NULL AND sector_codes IS NULL)
    OR (basis = 'SECTOR' AND fact_code IS NULL AND COALESCE(array_length(sector_codes,1),0) > 0)
    OR (basis = 'FACT' AND fact_code IS NOT NULL AND operator IS NOT NULL
        AND (operator IN ('IS_TRUE','IS_FALSE') OR threshold_value IS NOT NULL)))
);
GRANT SELECT ON public.supervisory_calculation_applicability_rule TO authenticated;
GRANT ALL ON public.supervisory_calculation_applicability_rule TO service_role;
ALTER TABLE public.supervisory_calculation_applicability_rule ENABLE ROW LEVEL SECURITY;
CREATE POLICY scar_read ON public.supervisory_calculation_applicability_rule FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()) OR has_any_permission(auth.uid(), ARRAY['supervisory_spine.view','aml_supervision.view',
    'prudential_supervision.view','supervisory_spine.manage_config','aml_supervision.manage_config','prudential_supervision.manage_config']));
CREATE TRIGGER scar_touch BEFORE UPDATE ON public.supervisory_calculation_applicability_rule
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_calc_touch_updated_at();

ALTER TABLE public.supervisory_calculation_materiality_rule
  ADD COLUMN dimension_code text,
  ADD COLUMN methodology_dimension_id uuid REFERENCES public.supervisory_methodology_dimension(id),
  ADD COLUMN fact_requirement_id uuid REFERENCES public.supervisory_methodology_fact_requirement(id),
  ADD COLUMN when_missing text NOT NULL DEFAULT 'PENDING_INFORMATION',
  ADD COLUMN when_not_material text;
ALTER TABLE public.supervisory_calculation_materiality_rule DROP CONSTRAINT scmr_adjustment;
ALTER TABLE public.supervisory_calculation_materiality_rule ADD CONSTRAINT scmr_adjustment
  CHECK (adjustment_kind IN ('FLOOR_AT_BAND','NO_ADJUSTMENT','FACTOR_MATERIALITY'));
ALTER TABLE public.supervisory_calculation_materiality_rule ADD CONSTRAINT scmr_when_missing
  CHECK (when_missing IN ('PENDING_INFORMATION','MATERIAL','NOT_APPLIED'));
ALTER TABLE public.supervisory_calculation_materiality_rule ADD CONSTRAINT scmr_factor_shape CHECK (
  (adjustment_kind = 'FACTOR_MATERIALITY' AND dimension_code IS NOT NULL AND fact_code IS NOT NULL
     AND threshold_value IS NOT NULL AND when_not_material IN ('RETAIN','EXCLUDE')
     AND when_missing IN ('PENDING_INFORMATION','MATERIAL'))
  OR (adjustment_kind <> 'FACTOR_MATERIALITY' AND dimension_code IS NULL AND when_not_material IS NULL));
CREATE UNIQUE INDEX scmr_factor_unique ON public.supervisory_calculation_materiality_rule(config_id, dimension_code)
  WHERE dimension_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.supervisory_calc_factor_rule_draft_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _s text;
BEGIN
  SELECT status INTO _s FROM public.supervisory_calculation_config
   WHERE id = COALESCE(NEW.config_id, OLD.config_id);
  IF _s IS DISTINCT FROM 'DRAFT' THEN
    RAISE EXCEPTION 'calculation_settings_locked: factor rules of % calculation settings cannot change', COALESCE(_s,'unknown')
      USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE EXECUTE ON FUNCTION public.supervisory_calc_factor_rule_draft_only() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER scar_draft_only BEFORE INSERT OR UPDATE OR DELETE ON public.supervisory_calculation_applicability_rule
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_calc_factor_rule_draft_only();
CREATE TRIGGER scmr_draft_only BEFORE INSERT OR UPDATE OR DELETE ON public.supervisory_calculation_materiality_rule
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_calc_factor_rule_draft_only();

CREATE OR REPLACE FUNCTION public.supervisory_calc_factor_rules_internal(_config_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'kind', x->>'dimension_code'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('kind','APPLICABILITY','dimension_code',a.dimension_code,'basis',a.basis,
             'sector_codes',to_jsonb(a.sector_codes),'fact_code',a.fact_code,'operator',a.operator,
             'threshold_value',a.threshold_value,'when_missing',a.when_missing,'rationale',a.rationale) x
      FROM public.supervisory_calculation_applicability_rule a WHERE a.config_id = _config_id
    UNION ALL
    SELECT jsonb_build_object('kind','MATERIALITY','dimension_code',m.dimension_code,'parameter_code',m.parameter_code,
             'fact_code',m.fact_code,'operator',m.comparator,'threshold_value',m.threshold_value,'unit',m.unit,
             'when_missing',m.when_missing,'when_not_material',m.when_not_material,'rationale',m.rationale)
      FROM public.supervisory_calculation_materiality_rule m
     WHERE m.config_id = _config_id AND m.dimension_code IS NOT NULL) s;
$$;
REVOKE EXECUTE ON FUNCTION public.supervisory_calc_factor_rules_internal(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.supervisory_calculation_applicability_set(_config_id uuid, _rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _c public.supervisory_calculation_config; _r jsonb; _dim uuid; _fr public.supervisory_methodology_fact_requirement;
        _basis text; _op text; _fact text; _sectors text[]; _bad text; _n integer;
BEGIN
  _uid := public.supervisory_calc_config_draft_guard(_config_id, 'applicability rules');
  SELECT * INTO _c FROM public.supervisory_calculation_config WHERE id = _config_id;
  IF jsonb_typeof(COALESCE(_rows,'[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'invalid_payload: applicability rules must be a list' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.supervisory_calculation_applicability_rule WHERE config_id = _config_id;
  FOR _r IN SELECT x FROM jsonb_array_elements(COALESCE(_rows,'[]'::jsonb)) x LOOP
    SELECT id INTO _dim FROM public.supervisory_methodology_dimension
     WHERE methodology_id = _c.methodology_id AND upper(dimension_code) = upper(btrim(COALESCE(_r->>'dimension_code','')));
    IF _dim IS NULL THEN
      RAISE EXCEPTION 'factor_not_in_methodology: % is not a dimension of the methodology these settings belong to', _r->>'dimension_code'
        USING ERRCODE = '22023';
    END IF;
    _basis := upper(btrim(COALESCE(_r->>'basis','')));
    _op := NULLIF(upper(btrim(COALESCE(_r->>'operator',''))),'');
    _fact := NULLIF(upper(btrim(COALESCE(_r->>'fact_code',''))),'');
    _fr := NULL; _sectors := NULL;
    IF _basis = 'FACT' THEN
      SELECT * INTO _fr FROM public.supervisory_methodology_fact_requirement
       WHERE methodology_id = _c.methodology_id AND upper(fact_code) = _fact AND definition_status <> 'RETIRED';
      IF _fr.id IS NULL THEN
        RAISE EXCEPTION 'fact_not_in_methodology: % is not a live fact of the methodology these settings belong to', _fact USING ERRCODE = '22023';
      END IF;
      IF lower(_fr.data_type) = 'boolean' AND _op NOT IN ('IS_TRUE','IS_FALSE') THEN
        RAISE EXCEPTION 'operator_not_supported: a yes/no fact uses IS_TRUE or IS_FALSE' USING ERRCODE = '22023';
      END IF;
      IF lower(_fr.data_type) <> 'boolean' AND (_op NOT IN ('GT','GTE','LT','LTE','EQ')
           OR lower(_fr.data_type) NOT IN ('integer','number','numeric','decimal','amount','ratio','percentage')) THEN
        RAISE EXCEPTION 'operator_not_supported: % (%) cannot be compared with %', _fact, _fr.data_type, COALESCE(_op,'no operator')
          USING ERRCODE = '22023';
      END IF;
    ELSIF _basis = 'SECTOR' THEN
      SELECT array_agg(DISTINCT upper(btrim(s))) INTO _sectors FROM jsonb_array_elements_text(COALESCE(_r->'sector_codes','[]'::jsonb)) s;
      SELECT string_agg(s, ', ') INTO _bad FROM unnest(_sectors) s WHERE NOT EXISTS (SELECT 1 FROM public.sectors x WHERE upper(x.code) = s);
      IF _bad IS NOT NULL THEN
        RAISE EXCEPTION 'unknown_sector: % is not a registered sector', _bad USING ERRCODE = '22023';
      END IF;
      _op := NULL; _fact := NULL;
    ELSIF _basis = 'ALWAYS' THEN
      _op := NULL; _fact := NULL;
    ELSE
      RAISE EXCEPTION 'invalid_basis: applicability basis must be ALWAYS, SECTOR or FACT' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.supervisory_calculation_applicability_rule(config_id, dimension_code, methodology_dimension_id, basis,
      sector_codes, fact_code, fact_requirement_id, operator, threshold_value, when_missing, rationale)
    VALUES (_config_id, upper(btrim(_r->>'dimension_code')), _dim, _basis, _sectors, _fact, _fr.id,
      CASE WHEN _basis = 'FACT' THEN _op END,
      CASE WHEN _basis = 'FACT' AND _op NOT IN ('IS_TRUE','IS_FALSE') THEN (_r->>'threshold_value')::numeric END,
      COALESCE(NULLIF(upper(btrim(COALESCE(_r->>'when_missing',''))),''),'PENDING_INFORMATION'),
      btrim(COALESCE(_r->>'rationale','')));
  END LOOP;
  SELECT count(*) INTO _n FROM public.supervisory_calculation_applicability_rule WHERE config_id = _config_id;
  INSERT INTO public.supervisory_calculation_event(config_id, event_type, to_status, actor_id, detail)
  VALUES (_config_id, 'APPLICABILITY_RULES_SAVED', 'DRAFT', _uid, jsonb_build_object('rows', _rows));
  RETURN _n;
END $$;
REVOKE EXECUTE ON FUNCTION public.supervisory_calculation_applicability_set(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_calculation_applicability_set(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.supervisory_calculation_materiality_set(_config_id uuid, _rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _n integer; _c public.supervisory_calculation_config; _r jsonb; _dim uuid; _fr uuid;
        _kind text; _fact text; _dcode text;
BEGIN
  _uid := public.supervisory_calc_config_draft_guard(_config_id, 'materiality rules');
  SELECT * INTO _c FROM public.supervisory_calculation_config WHERE id = _config_id;
  DELETE FROM public.supervisory_calculation_materiality_rule WHERE config_id = _config_id;
  FOR _r IN SELECT x FROM jsonb_array_elements(COALESCE(_rows,'[]'::jsonb)) x
             WHERE btrim(COALESCE(x->>'parameter_code','')) <> '' LOOP
    _kind := upper(btrim(COALESCE(_r->>'adjustment_kind','')));
    _fact := NULLIF(upper(btrim(COALESCE(_r->>'fact_code',''))),'');
    _dcode := NULLIF(upper(btrim(COALESCE(_r->>'dimension_code',''))),'');
    _dim := NULL; _fr := NULL;
    IF _fact IS NOT NULL THEN
      SELECT id INTO _fr FROM public.supervisory_methodology_fact_requirement
       WHERE methodology_id = _c.methodology_id AND upper(fact_code) = _fact AND definition_status <> 'RETIRED';
      IF _fr IS NULL THEN
        RAISE EXCEPTION 'fact_not_in_methodology: % is not a live fact of the methodology these settings belong to', _fact USING ERRCODE = '22023';
      END IF;
    END IF;
    IF _kind = 'FACTOR_MATERIALITY' THEN
      SELECT id INTO _dim FROM public.supervisory_methodology_dimension
       WHERE methodology_id = _c.methodology_id AND upper(dimension_code) = _dcode;
      IF _dim IS NULL THEN
        RAISE EXCEPTION 'factor_not_in_methodology: % is not a dimension of the methodology these settings belong to', COALESCE(_dcode,'(none)')
          USING ERRCODE = '22023';
      END IF;
    ELSIF _dcode IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_payload: only FACTOR_MATERIALITY rules name a factor' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.supervisory_calculation_materiality_rule(config_id, parameter_code, fact_code, comparator,
      threshold_value, unit, adjustment_kind, adjustment_band, rationale, dimension_code, methodology_dimension_id,
      fact_requirement_id, when_missing, when_not_material)
    VALUES (_config_id, upper(btrim(_r->>'parameter_code')), _fact, upper(btrim(COALESCE(_r->>'comparator',''))),
      (_r->>'threshold_value')::numeric, NULLIF(btrim(COALESCE(_r->>'unit','')),''), _kind,
      NULLIF(upper(btrim(COALESCE(_r->>'adjustment_band',''))),''), btrim(COALESCE(_r->>'rationale','')),
      CASE WHEN _kind = 'FACTOR_MATERIALITY' THEN _dcode END, _dim, _fr,
      COALESCE(NULLIF(upper(btrim(COALESCE(_r->>'when_missing',''))),''),'PENDING_INFORMATION'),
      CASE WHEN _kind = 'FACTOR_MATERIALITY' THEN NULLIF(upper(btrim(COALESCE(_r->>'when_not_material',''))),'') END);
  END LOOP;
  SELECT count(*) INTO _n FROM public.supervisory_calculation_materiality_rule WHERE config_id = _config_id;
  INSERT INTO public.supervisory_calculation_event(config_id, event_type, to_status, actor_id, detail)
  VALUES (_config_id, 'MATERIALITY_RULES_SAVED', 'DRAFT', _uid, jsonb_build_object('rows', _rows));
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_calc_config_resolved_internal(_assessment_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.supervisory_assessment; _pin uuid; _ok boolean;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RETURN NULL; END IF;
  SELECT calculation_config_id INTO _pin FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id = _assessment_id;
  IF _pin IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.supervisory_calculation_config c
                    WHERE c.id = _pin AND c.methodology_id = _a.methodology_id
                      AND c.approved_at IS NOT NULL AND c.status IN ('ACTIVE','SUPERSEDED','RETIRED')) INTO _ok;
    IF _ok THEN RETURN _pin; END IF;
    RETURN NULL;
  END IF;
  RETURN public.supervisory_calc_config_for(_assessment_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.supervisory_calc_config_resolved_internal(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.supervisory_calc_factor_evaluate_internal(_assessment_id uuid, _policy jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.supervisory_assessment; _app jsonb := COALESCE(_policy->'applicability','[]'::jsonb);
        _mat jsonb; _codes text[]; _code text; _ar jsonb; _mr jsonb; _sector text; _f record; _val numeric;
        _hit boolean; _astat text; _areason_code text; _areason text; _mstat text; _mreason_code text; _mreason text;
        _outcome text; _effect text; _missing text[]; _facts jsonb; _factors jsonb := '[]'::jsonb; _by jsonb := '{}'::jsonb;
        _pending int := 0; _all_missing text[] := '{}'; _d record; _fx jsonb;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO _mat FROM jsonb_array_elements(COALESCE(_policy->'materiality','[]'::jsonb)) x
   WHERE COALESCE(x->>'dimension_code','') <> '';
  SELECT array_agg(DISTINCT upper(x->>'dimension_code') ORDER BY upper(x->>'dimension_code')) INTO _codes
    FROM (SELECT x FROM jsonb_array_elements(_app) x UNION ALL SELECT x FROM jsonb_array_elements(_mat) x) s;
  IF _codes IS NULL THEN
    RETURN jsonb_build_object('status','NOT_GOVERNED','reason_code','NO_FACTOR_RULES',
      'reason','The calculation settings in force publish no factor applicability or materiality rule.',
      'factors','[]'::jsonb,'by_dimension','{}'::jsonb,'pending_count',0,'missing_facts','[]'::jsonb);
  END IF;
  _sector := public.supervisory_assessment_sector_overlay_internal(_assessment_id)->>'sector_code';

  FOREACH _code IN ARRAY _codes LOOP
    SELECT x INTO _ar FROM jsonb_array_elements(_app) x WHERE upper(x->>'dimension_code') = _code LIMIT 1;
    SELECT x INTO _mr FROM jsonb_array_elements(_mat) x WHERE upper(x->>'dimension_code') = _code LIMIT 1;
    SELECT sad.id, sad.is_applicable INTO _d FROM public.supervisory_assessment_dimension sad
     WHERE sad.assessment_id = _assessment_id AND upper(sad.dimension_code) = _code LIMIT 1;
    _missing := '{}'; _facts := '[]'::jsonb; _astat := NULL; _mstat := NULL;
    _areason_code := NULL; _areason := NULL; _mreason_code := NULL; _mreason := NULL;

    IF _ar IS NULL THEN
      _astat := 'APPLICABLE'; _areason_code := 'NO_APPLICABILITY_RULE';
      _areason := 'No applicability rule is published for this factor, so the methodology applies it to every assessment.';
    ELSIF _ar->>'basis' = 'ALWAYS' THEN
      _astat := 'APPLICABLE'; _areason_code := 'APPLIES_TO_ALL';
      _areason := 'The calculation settings apply this factor to every assessment.';
    ELSIF _ar->>'basis' = 'SECTOR' THEN
      IF _sector IS NULL THEN
        _astat := CASE _ar->>'when_missing' WHEN 'APPLICABLE' THEN 'APPLICABLE' WHEN 'NOT_APPLICABLE' THEN 'NOT_APPLICABLE'
                       ELSE 'PENDING_INFORMATION' END;
        _areason_code := 'SECTOR_UNRESOLVED';
        _areason := 'The entity''s supervised sector could not be determined.';
      ELSIF _ar->'sector_codes' ? _sector THEN
        _astat := 'APPLICABLE'; _areason_code := 'SECTOR_IN_SCOPE';
        _areason := format('Sector %s is one of the sectors this factor applies to.', _sector);
      ELSE
        _astat := 'NOT_APPLICABLE'; _areason_code := 'SECTOR_OUT_OF_SCOPE';
        _areason := format('Sector %s is not one of the sectors this factor applies to (%s).', _sector,
                           (SELECT string_agg(s, ', ') FROM jsonb_array_elements_text(_ar->'sector_codes') s));
      END IF;
    ELSE
      SELECT af.id, af.fact_code, af.value_numeric, af.value_boolean, af.numerator, af.denominator, af.source_type,
             af.source_reference, af.recorded_by, af.updated_at, af.provenance
        INTO _f FROM public.supervisory_assessment_fact af
       WHERE af.assessment_id = _assessment_id AND upper(af.fact_code) = upper(_ar->>'fact_code')
       ORDER BY af.updated_at DESC LIMIT 1;
      IF _f.id IS NULL THEN
        _astat := CASE _ar->>'when_missing' WHEN 'APPLICABLE' THEN 'APPLICABLE' WHEN 'NOT_APPLICABLE' THEN 'NOT_APPLICABLE'
                       ELSE 'PENDING_INFORMATION' END;
        _areason_code := CASE WHEN _astat = 'PENDING_INFORMATION' THEN 'FACT_MISSING' ELSE 'FACT_MISSING_CONFIGURED_DEFAULT' END;
        _areason := CASE WHEN _astat = 'PENDING_INFORMATION'
                         THEN format('Fact %s has not been recorded, so applicability cannot be decided.', _ar->>'fact_code')
                         ELSE format('Fact %s has not been recorded; the settings explicitly treat this as %s.', _ar->>'fact_code', lower(replace(_astat,'_',' '))) END;
        IF _astat = 'PENDING_INFORMATION' THEN _missing := array_append(_missing, _ar->>'fact_code'); END IF;
      ELSE
        _facts := _facts || jsonb_build_object('role','APPLICABILITY','fact_id',_f.id,'fact_code',_f.fact_code,
          'value_numeric',_f.value_numeric,'value_boolean',_f.value_boolean,'source_type',_f.source_type,
          'source_reference',_f.source_reference,'recorded_by',_f.recorded_by,'recorded_at',_f.updated_at,
          'governance',_f.provenance->'governance');
        _val := COALESCE(_f.value_numeric, CASE WHEN _f.numerator IS NOT NULL AND COALESCE(_f.denominator,0) <> 0
                                                THEN _f.numerator / _f.denominator END);
        _hit := CASE _ar->>'operator'
          WHEN 'IS_TRUE' THEN _f.value_boolean IS TRUE
          WHEN 'IS_FALSE' THEN _f.value_boolean IS FALSE
          WHEN 'GT' THEN _val > (_ar->>'threshold_value')::numeric
          WHEN 'GTE' THEN _val >= (_ar->>'threshold_value')::numeric
          WHEN 'LT' THEN _val < (_ar->>'threshold_value')::numeric
          WHEN 'LTE' THEN _val <= (_ar->>'threshold_value')::numeric
          WHEN 'EQ' THEN _val = (_ar->>'threshold_value')::numeric END;
        IF _hit IS NULL THEN
          _astat := 'PENDING_INFORMATION'; _areason_code := 'FACT_NOT_COMPARABLE';
          _areason := format('Fact %s carries no value the applicability rule can compare.', _ar->>'fact_code');
          _missing := array_append(_missing, _ar->>'fact_code');
        ELSIF _hit THEN
          _astat := 'APPLICABLE'; _areason_code := 'FACT_CONDITION_MET';
          _areason := format('Fact %s meets the applicability condition %s%s.', _ar->>'fact_code', _ar->>'operator',
                             COALESCE(' ' || (_ar->>'threshold_value'), ''));
        ELSE
          _astat := 'NOT_APPLICABLE'; _areason_code := 'FACT_CONDITION_NOT_MET';
          _areason := format('Fact %s does not meet the applicability condition %s%s.', _ar->>'fact_code', _ar->>'operator',
                             COALESCE(' ' || (_ar->>'threshold_value'), ''));
        END IF;
      END IF;
    END IF;

    IF _astat <> 'APPLICABLE' THEN
      _mstat := 'NOT_EVALUATED'; _mreason_code := 'FACTOR_NOT_APPLICABLE_OR_PENDING';
      _mreason := 'Materiality is only decided for a factor that applies.';
    ELSIF _mr IS NULL THEN
      _mstat := 'NOT_ASSESSED'; _mreason_code := 'NO_MATERIALITY_RULE';
      _mreason := 'No materiality rule is published for this factor, so it contributes as calculated.';
    ELSE
      SELECT af.id, af.fact_code, af.value_numeric, af.value_boolean, af.numerator, af.denominator, af.source_type,
             af.source_reference, af.recorded_by, af.updated_at, af.provenance
        INTO _f FROM public.supervisory_assessment_fact af
       WHERE af.assessment_id = _assessment_id AND upper(af.fact_code) = upper(_mr->>'fact_code')
       ORDER BY af.updated_at DESC LIMIT 1;
      _val := CASE WHEN _f.id IS NULL THEN NULL ELSE COALESCE(_f.value_numeric,
                CASE WHEN _f.numerator IS NOT NULL AND COALESCE(_f.denominator,0) <> 0 THEN _f.numerator / _f.denominator END) END;
      IF _f.id IS NOT NULL THEN
        _facts := _facts || jsonb_build_object('role','MATERIALITY','fact_id',_f.id,'fact_code',_f.fact_code,
          'value_numeric',_f.value_numeric,'value_boolean',_f.value_boolean,'source_type',_f.source_type,
          'source_reference',_f.source_reference,'recorded_by',_f.recorded_by,'recorded_at',_f.updated_at,
          'governance',_f.provenance->'governance');
      END IF;
      IF _val IS NULL THEN
        IF _mr->>'when_missing' = 'MATERIAL' THEN
          _mstat := 'MATERIAL'; _mreason_code := 'FACT_MISSING_TREATED_MATERIAL';
          _mreason := format('Fact %s has not been recorded; the settings explicitly treat the factor as material until it is.', _mr->>'fact_code');
        ELSE
          _mstat := 'PENDING_INFORMATION'; _mreason_code := 'FACT_MISSING';
          _mreason := format('Fact %s has not been recorded, so materiality cannot be decided.', _mr->>'fact_code');
          _missing := array_append(_missing, _mr->>'fact_code');
        END IF;
      ELSE
        _hit := CASE _mr->>'comparator'
          WHEN 'GT' THEN _val > (_mr->>'threshold_value')::numeric
          WHEN 'GTE' THEN _val >= (_mr->>'threshold_value')::numeric
          WHEN 'LT' THEN _val < (_mr->>'threshold_value')::numeric
          WHEN 'LTE' THEN _val <= (_mr->>'threshold_value')::numeric END;
        IF _hit THEN
          _mstat := 'MATERIAL'; _mreason_code := 'THRESHOLD_MET';
          _mreason := format('Material because %s = %s meets the governed threshold %s %s%s.', _mr->>'fact_code', _val,
                             _mr->>'comparator', _mr->>'threshold_value', COALESCE(' ' || (_mr->>'unit'), ''));
        ELSE
          _mstat := 'NOT_MATERIAL'; _mreason_code := 'THRESHOLD_NOT_MET';
          _mreason := format('Not material because %s = %s does not meet the governed threshold %s %s%s.', _mr->>'fact_code', _val,
                             _mr->>'comparator', _mr->>'threshold_value', COALESCE(' ' || (_mr->>'unit'), ''));
        END IF;
      END IF;
    END IF;

    _outcome := CASE
      WHEN _astat = 'PENDING_INFORMATION' OR _mstat = 'PENDING_INFORMATION' THEN 'PENDING_INFORMATION'
      WHEN _astat = 'NOT_APPLICABLE' THEN 'NOT_APPLICABLE'
      WHEN _mstat = 'NOT_MATERIAL' AND _mr->>'when_not_material' = 'EXCLUDE' THEN 'EXCLUDED_NOT_MATERIAL'
      ELSE 'INCLUDED' END;
    _effect := CASE _outcome
      WHEN 'PENDING_INFORMATION' THEN format('Not calculated until these facts are recorded: %s.', array_to_string(_missing, ', '))
      WHEN 'NOT_APPLICABLE' THEN 'Excluded from the calculation: the factor does not apply to this entity.'
      WHEN 'EXCLUDED_NOT_MATERIAL' THEN 'Excluded from the calculation: the factor applies but is not material under the governed threshold.'
      WHEN 'INCLUDED' THEN CASE WHEN _mstat = 'NOT_MATERIAL'
                                THEN 'Scored as calculated: not material, but the settings retain non-material factors.'
                                ELSE 'Scored as calculated.' END END;
    IF _outcome = 'PENDING_INFORMATION' THEN _pending := _pending + 1; _all_missing := _all_missing || _missing; END IF;

    _fx := jsonb_build_object('dimension_code', _code,
      'assessment_dimension_id', _d.id,
      'applicability_status', _astat, 'applicable', CASE _astat WHEN 'APPLICABLE' THEN true WHEN 'NOT_APPLICABLE' THEN false END,
      'applicability_reason_code', _areason_code, 'applicability_reason', _areason,
      'applicability_rule', _ar - 'rationale', 'applicability_rationale', _ar->>'rationale',
      'materiality_status', _mstat, 'material', CASE _mstat WHEN 'MATERIAL' THEN true WHEN 'NOT_MATERIAL' THEN false END,
      'materiality_reason_code', _mreason_code, 'materiality_reason', _mreason,
      'materiality_rule', _mr - 'rationale', 'materiality_rationale', _mr->>'rationale',
      'supporting_facts', _facts, 'missing_facts', to_jsonb(_missing),
      'outcome', _outcome, 'calculation_effect', _effect,
      'supervisor_marked_not_applicable', COALESCE(_d.is_applicable = false, false),
      'supervisor_flag_effect', CASE WHEN _d.is_applicable = false
        THEN 'Disregarded: governed applicability rules decide this factor; a working-file flag cannot change it.' END);
    _factors := _factors || _fx;
    _by := _by || jsonb_build_object(_code, _fx);
  END LOOP;

  RETURN jsonb_build_object('status','GOVERNED','reason_code','GOVERNED','sector_code',_sector,
    'factors',_factors,'by_dimension',_by,'pending_count',_pending,
    'missing_facts',(SELECT COALESCE(jsonb_agg(DISTINCT m), '[]'::jsonb) FROM unnest(_all_missing) m));
END $$;
REVOKE EXECUTE ON FUNCTION public.supervisory_calc_factor_evaluate_internal(uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.supervisory_calc_policy_from_config_factor_ext(_config_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'applicability', COALESCE((SELECT jsonb_agg(jsonb_build_object('dimension_code',a.dimension_code,'basis',a.basis,
        'sector_codes',to_jsonb(a.sector_codes),'fact_code',a.fact_code,'operator',a.operator,
        'threshold_value',a.threshold_value,'when_missing',a.when_missing,'rationale',a.rationale) ORDER BY a.dimension_code)
      FROM public.supervisory_calculation_applicability_rule a WHERE a.config_id = _config_id), '[]'::jsonb),
    'materiality', COALESCE((SELECT jsonb_agg(jsonb_build_object('parameter_code', m.parameter_code, 'fact_code', m.fact_code,
        'comparator', m.comparator, 'threshold_value', m.threshold_value, 'unit', m.unit,
        'adjustment_kind', m.adjustment_kind, 'adjustment_band', m.adjustment_band,
        'dimension_code', m.dimension_code, 'when_missing', m.when_missing, 'when_not_material', m.when_not_material,
        'rationale', m.rationale) ORDER BY m.parameter_code)
      FROM public.supervisory_calculation_materiality_rule m WHERE m.config_id = _config_id), '[]'::jsonb));
$$;
REVOKE EXECUTE ON FUNCTION public.supervisory_calc_policy_from_config_factor_ext(uuid) FROM PUBLIC, anon, authenticated;

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.supervisory_calc_policy_from_config(uuid)'::regprocedure);
  d := replace(d, 'FUNCTION public.supervisory_calc_policy_from_config(', 'FUNCTION public.supervisory_calc_policy_from_config_base(');
  EXECUTE d;
END $do$;
REVOKE EXECUTE ON FUNCTION public.supervisory_calc_policy_from_config_base(uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.supervisory_calc_policy_from_config(_config_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.supervisory_calc_policy_from_config_base(_config_id)
         || public.supervisory_calc_policy_from_config_factor_ext(_config_id);
$function$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_factor_evaluation_internal(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _cfg uuid; _c public.supervisory_calculation_config;
BEGIN
  _cfg := public.supervisory_calc_config_resolved_internal(_assessment_id);
  IF _cfg IS NULL THEN
    RETURN jsonb_build_object('status','NOT_GOVERNED','reason_code','NO_CONFIGURATION',
      'reason','No approved calculation settings govern this assessment.',
      'factors','[]'::jsonb,'by_dimension','{}'::jsonb,'pending_count',0,'missing_facts','[]'::jsonb);
  END IF;
  SELECT * INTO _c FROM public.supervisory_calculation_config WHERE id = _cfg;
  RETURN public.supervisory_calc_factor_evaluate_internal(_assessment_id, public.supervisory_calc_policy_from_config(_cfg))
         || jsonb_build_object('config_id', _cfg, 'config_version', _c.config_version, 'config_status', _c.status,
              'factor_rules_fingerprint', 'cfp1:' || md5(public.supervisory_calc_factor_rules_internal(_cfg)::text));
END $$;
REVOKE EXECUTE ON FUNCTION public.supervisory_assessment_factor_evaluation_internal(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.supervisory_calc_compute_core(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.supervisory_assessment; _cfg uuid; _c public.supervisory_calculation_config;
        _as_of date; _policy jsonb; _eval jsonb; _r jsonb;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;

  _as_of := public.supervisory_calc_as_of_for(_assessment_id);
  IF _as_of IS NULL THEN
    RETURN jsonb_build_object('status','NOT_CALCULABLE','reason_code','NO_EFFECTIVE_DATE_RULE',
      'assessment_id',_assessment_id,
      'methodology_id',_a.methodology_id,'methodology_version',_a.methodology_version,
      'dimensions','[]'::jsonb,
      'reason', format('domain %s has no recorded effective-date rule, so no authoritative as-of date exists', _a.domain_code));
  END IF;

  _cfg := public.supervisory_calc_config_resolved_internal(_assessment_id);
  IF _cfg IS NULL THEN
    RETURN jsonb_build_object('status','NOT_CALCULABLE','reason_code','NO_CONFIGURATION',
      'assessment_id',_assessment_id,
      'methodology_id',_a.methodology_id,'methodology_version',_a.methodology_version,
      'as_of',_as_of,'dimensions','[]'::jsonb,
      'reason','no approved calculation configuration was in force on the authoritative as-of date');
  END IF;

  SELECT * INTO _c FROM public.supervisory_calculation_config WHERE id = _cfg;
  _policy := public.supervisory_calc_policy_from_config(_cfg);
  _eval := public.supervisory_calc_factor_evaluate_internal(_assessment_id, _policy);
  _policy := _policy || jsonb_build_object('factor_outcomes', _eval->'by_dimension');
  _r := public.supervisory_calc_compute_policy(_assessment_id, _policy, _as_of, _cfg, _c.config_version);
  _r := _r || jsonb_build_object('factors', _eval - 'by_dimension');
  IF _eval->>'status' = 'GOVERNED' AND (_eval->>'pending_count')::int > 0 AND _r->>'status' = 'CALCULATED' THEN
    _r := _r || jsonb_build_object('status','NOT_CALCULABLE','reason_code','FACTOR_INFORMATION_PENDING',
      'reason', format('%s risk factor(s) cannot be decided until these facts are recorded: %s',
                       _eval->>'pending_count',
                       (SELECT string_agg(m, ', ') FROM jsonb_array_elements_text(_eval->'missing_facts') m)),
      'residual_rating', NULL, 'recommended_rating', NULL);
  END IF;
  RETURN _r;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_factor_authority(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.supervisory_assessment; _snap public.supervisory_assessment_policy_snapshot;
        _eval jsonb; _run public.supervisory_assessment_calculation_run; _same boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.supervisory_assessment_question_readable(auth.uid(), _assessment_id) THEN
    RAISE EXCEPTION 'not_authorized: assessment outside your supervisory authority' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  SELECT * INTO _snap FROM public.supervisory_assessment_policy_snapshot WHERE assessment_id = _assessment_id;
  _eval := public.supervisory_assessment_factor_evaluation_internal(_assessment_id);
  SELECT * INTO _run FROM public.supervisory_assessment_calculation_run
   WHERE assessment_id = _assessment_id ORDER BY run_seq DESC LIMIT 1;
  IF _run.id IS NOT NULL AND _run.trace ? 'factors' THEN
    SELECT COALESCE(bool_and(f->>'outcome' = (SELECT g->>'outcome' FROM jsonb_array_elements(_run.trace->'factors'->'factors') g
                                                WHERE g->>'dimension_code' = f->>'dimension_code')), true)
           AND jsonb_array_length(COALESCE(_eval->'factors','[]'::jsonb)) = jsonb_array_length(COALESCE(_run.trace->'factors'->'factors','[]'::jsonb))
      INTO _same FROM jsonb_array_elements(COALESCE(_eval->'factors','[]'::jsonb)) f;
  END IF;
  RETURN jsonb_build_object(
    'assessment_id', _a.id, 'reference', _a.reference, 'entity_id', _a.entity_id,
    'policy_profile_code', _snap.policy_profile_code, 'policy_profile_version', _snap.policy_profile_version,
    'methodology_id', _a.methodology_id, 'methodology_code', _snap.methodology_code,
    'methodology_version', _a.methodology_version,
    'pinned_calculation_config_id', _snap.calculation_config_id,
    'pinned_calculation_config_version', _snap.calculation_config_version,
    'evaluation', _eval - 'by_dimension',
    'latest_run', CASE WHEN _run.id IS NULL THEN NULL ELSE jsonb_build_object(
        'run_id', _run.id, 'run_seq', _run.run_seq, 'calculated_at', _run.calculated_at, 'status', _run.status,
        'reason_code', _run.reason_code, 'config_id', _run.config_id, 'config_version', _run.config_version,
        'engine_version', _run.engine_version, 'result_hash', _run.result_hash,
        'factor_outcomes', (SELECT COALESCE(jsonb_object_agg(g->>'dimension_code', g->>'outcome'), '{}'::jsonb)
                              FROM jsonb_array_elements(COALESCE(_run.trace->'factors'->'factors','[]'::jsonb)) g),
        'matches_current_evaluation', _same) END,
    'generated_at', now());
END $$;
REVOKE EXECUTE ON FUNCTION public.supervisory_assessment_factor_authority(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_factor_authority(uuid) TO authenticated;

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.supervisory_calc_compute_policy(uuid,jsonb,date,uuid,integer)'::regprocedure);
  IF position($o$  _mat jsonb := COALESCE(_policy->'materiality','[]'::jsonb);$o$ IN d) = 0 THEN RAISE EXCEPTION 'aml_close_03_patch_anchor_missing: compute_policy'; END IF;
  d := replace(d, $o$  _mat jsonb := COALESCE(_policy->'materiality','[]'::jsonb);$o$, $n$  _mat jsonb := COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements(COALESCE(_policy->'materiality','[]'::jsonb)) x
                           WHERE COALESCE(x->>'dimension_code','') = ''), '[]'::jsonb);
  -- AML-CLOSE-03: factor outcomes are decided by the server-side factor evaluator only.
  _fo jsonb := COALESCE(_policy->'factor_outcomes','{}'::jsonb); _fx jsonb; _mpending text[] := '{}';$n$);
  IF position($o$  _engine text := 'AML06.1';$o$ IN d) = 0 THEN RAISE EXCEPTION 'aml_close_03_patch_anchor_missing: compute_policy'; END IF;
  d := replace(d, $o$  _engine text := 'AML06.1';$o$, $n$  _engine text := 'AML06.2';$n$);
  IF position($o$    IF _d.is_applicable IS FALSE THEN$o$ IN d) = 0 THEN RAISE EXCEPTION 'aml_close_03_patch_anchor_missing: compute_policy'; END IF;
  d := replace(d, $o$    IF _d.is_applicable IS FALSE THEN$o$, $n$    _fx := _fo->upper(_d.dimension_code);
    IF _fx IS NOT NULL AND _fx->>'outcome' IN ('NOT_APPLICABLE','EXCLUDED_NOT_MATERIAL') THEN
      _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,
        'dimension_code',_d.dimension_code,'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),
        'status','NOT_APPLICABLE',
        'reason_code', CASE WHEN _fx->>'outcome' = 'NOT_APPLICABLE' THEN 'FACTOR_NOT_APPLICABLE' ELSE 'FACTOR_NOT_MATERIAL' END,
        'reason', _fx->>'calculation_effect', 'factor', _fx);
      CONTINUE;
    ELSIF _fx IS NOT NULL AND _fx->>'outcome' = 'PENDING_INFORMATION' THEN
      _dims := _dims || jsonb_build_object('assessment_dimension_id',_d.id,
        'dimension_code',_d.dimension_code,'dimension_kind',COALESCE(_d.dimension_kind,'CONTROL'),
        'status','NOT_CALCULABLE','reason_code','FACTOR_INFORMATION_PENDING',
        'missing_facts', _fx->'missing_facts',
        'reason', _fx->>'calculation_effect', 'factor', _fx);
      CONTINUE;
    END IF;
    IF _d.is_applicable IS FALSE AND _fx IS NULL THEN$n$);
  IF position($o$        _mtrace := _mtrace || jsonb_build_object('parameter_code',_mrule->>'parameter_code',
          'outcome','NOT_APPLIED','reason_code','FACT_UNAVAILABLE');$o$ IN d) = 0 THEN RAISE EXCEPTION 'aml_close_03_patch_anchor_missing: compute_policy'; END IF;
  d := replace(d, $o$        _mtrace := _mtrace || jsonb_build_object('parameter_code',_mrule->>'parameter_code',
          'outcome','NOT_APPLIED','reason_code','FACT_UNAVAILABLE');$o$, $n$        -- AML-CLOSE-03: a missing materiality fact is never silently non-material.
        IF COALESCE(_mrule->>'when_missing','PENDING_INFORMATION') = 'PENDING_INFORMATION' THEN
          _mpending := array_append(_mpending, COALESCE(_mrule->>'fact_code', _mrule->>'parameter_code'));
          _mtrace := _mtrace || jsonb_build_object('parameter_code',_mrule->>'parameter_code',
            'fact_code',_mrule->>'fact_code','outcome','PENDING_INFORMATION','reason_code','FACT_UNAVAILABLE');
        ELSE
          _mtrace := _mtrace || jsonb_build_object('parameter_code',_mrule->>'parameter_code',
            'outcome','NOT_APPLIED','reason_code','FACT_UNAVAILABLE');
        END IF;$n$);
  IF position($o$    _reason := 'the recommendation policy produced no rating on the methodology scoring scale';$o$ IN d) = 0 THEN RAISE EXCEPTION 'aml_close_03_patch_anchor_missing: compute_policy'; END IF;
  d := replace(d, $o$    _reason := 'the recommendation policy produced no rating on the methodology scoring scale';$o$, $n$    _reason := 'the recommendation policy produced no rating on the methodology scoring scale';
  ELSIF array_length(_mpending,1) IS NOT NULL THEN
    _status := 'NOT_CALCULABLE'; _reason_code := 'MATERIALITY_INFORMATION_PENDING';
    _reason := format('materiality cannot be decided until these facts are recorded: %s', array_to_string(_mpending, ', '));$n$);
  IF position($o$       'materiality_rows', jsonb_array_length(_mat),$o$ IN d) = 0 THEN RAISE EXCEPTION 'aml_close_03_patch_anchor_missing: compute_policy'; END IF;
  d := replace(d, $o$       'materiality_rows', jsonb_array_length(_mat),$o$, $n$       'materiality_rows', jsonb_array_length(_mat),
       'applicability_rows', jsonb_array_length(COALESCE(_policy->'applicability','[]'::jsonb)),
       'factor_materiality_rows', (SELECT count(*) FROM jsonb_array_elements(COALESCE(_policy->'materiality','[]'::jsonb)) x
                                    WHERE COALESCE(x->>'dimension_code','') <> ''),$n$);
  EXECUTE d;
END $do$;

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.supervisory_calc_simulate(text,jsonb,uuid)'::regprocedure);
  IF position($o$    _r := public.supervisory_calc_compute_policy(_a.id, _policy, _as_of, NULL, NULL);$o$ IN d) = 0 THEN RAISE EXCEPTION 'aml_close_03_patch_anchor_missing: simulate'; END IF;
  d := replace(d, $o$    _r := public.supervisory_calc_compute_policy(_a.id, _policy, _as_of, NULL, NULL);$o$, $n$    _r := public.supervisory_calc_compute_policy(_a.id,
            (_policy - 'factor_outcomes') || jsonb_build_object('factor_outcomes',
              public.supervisory_calc_factor_evaluate_internal(_a.id, _policy - 'factor_outcomes')->'by_dimension'),
            _as_of, NULL, NULL);$n$);
  EXECUTE d;
END $do$;

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.supervisory_policy_component_content_fingerprint(text,uuid)'::regprocedure);
  IF position($o$      INTO _c FROM public.supervisory_calculation_config c WHERE c.id = _component_id;$o$ IN d) = 0 THEN RAISE EXCEPTION 'aml_close_03_patch_anchor_missing: fingerprint'; END IF;
  d := replace(d, $o$      INTO _c FROM public.supervisory_calculation_config c WHERE c.id = _component_id;$o$, $n$      INTO _c FROM public.supervisory_calculation_config c WHERE c.id = _component_id;
    -- AML-CLOSE-03: factor applicability/materiality rules join the fingerprint only when
    -- present, so every fingerprint computed before this change is unchanged.
    IF _c IS NOT NULL AND public.supervisory_calc_factor_rules_internal(_component_id) <> '[]'::jsonb THEN
      _c := _c || jsonb_build_object('factor_rules', public.supervisory_calc_factor_rules_internal(_component_id));
    END IF;$n$);
  EXECUTE d;
END $do$;

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.supervisory_assessment_readiness_internal(uuid)'::regprocedure);
  IF position($o$        _dq int; _ovr int; _pol jsonb; _pol_items jsonb; _pol_blocking int;$o$ IN d) = 0 THEN RAISE EXCEPTION 'aml_close_03_patch_anchor_missing: readiness'; END IF;
  d := replace(d, $o$        _dq int; _ovr int; _pol jsonb; _pol_items jsonb; _pol_blocking int;$o$, $n$        _dq int; _ovr int; _pol jsonb; _pol_items jsonb; _pol_blocking int; _fac jsonb;$n$);
  IF position($o$  _pol_blocking := public.jsonb_array_len_safe(_pol_items);$o$ IN d) = 0 THEN RAISE EXCEPTION 'aml_close_03_patch_anchor_missing: readiness'; END IF;
  d := replace(d, $o$  _pol_blocking := public.jsonb_array_len_safe(_pol_items);$o$, $n$  _pol_blocking := public.jsonb_array_len_safe(_pol_items);

  _fac := public.supervisory_assessment_factor_evaluation_internal(_assessment_id);$n$);
  IF position($o$      'detail', format('%s recorded fact(s) without a source reference; %s officer change(s) on prefilled values.', _dq, _ovr),
      'items','[]'::jsonb)$o$ IN d) = 0 THEN RAISE EXCEPTION 'aml_close_03_patch_anchor_missing: readiness'; END IF;
  d := replace(d, $o$      'detail', format('%s recorded fact(s) without a source reference; %s officer change(s) on prefilled values.', _dq, _ovr),
      'items','[]'::jsonb)$o$, $n$      'detail', format('%s recorded fact(s) without a source reference; %s officer change(s) on prefilled values.', _dq, _ovr),
      'items','[]'::jsonb),
    jsonb_build_object('key','FACTOR_INFORMATION','label','Risk factor applicability and materiality',
      'status', CASE WHEN _fac->>'status' <> 'GOVERNED' THEN 'OK'
                     WHEN COALESCE((_fac->>'pending_count')::int,0) > 0 THEN 'BLOCKING' ELSE 'OK' END,
      'blocking', _fac->>'status' = 'GOVERNED' AND COALESCE((_fac->>'pending_count')::int,0) > 0,
      'count', COALESCE((_fac->>'pending_count')::int,0),
      'detail', CASE WHEN _fac->>'status' <> 'GOVERNED'
                     THEN 'The calculation settings in force publish no factor applicability or materiality rule.'
                     ELSE format('%s risk factor(s) cannot be decided until the listed facts are recorded.',
                                 COALESCE(_fac->>'pending_count','0')) END,
      'items', COALESCE((SELECT jsonb_agg(jsonb_build_object('dimension_code', f->>'dimension_code',
                           'missing_facts', f->'missing_facts', 'reason', f->>'calculation_effect'))
                           FROM jsonb_array_elements(COALESCE(_fac->'factors','[]'::jsonb)) f
                          WHERE f->>'outcome' = 'PENDING_INFORMATION'), '[]'::jsonb))$n$);
  EXECUTE d;
END $do$;