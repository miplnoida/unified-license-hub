-- 1. Ordered rating vocabulary owned by the methodology
CREATE OR REPLACE FUNCTION public.supervisory_methodology_rating_order(_methodology_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT jsonb_agg(jsonb_build_object(
              'code', upper(btrim(t.x->>'code')),
              'label', COALESCE(NULLIF(btrim(COALESCE(t.x->>'label','')),''), upper(btrim(t.x->>'code'))),
              'ordinal', COALESCE((t.x->>'ordinal')::int, t.i::int))
              ORDER BY COALESCE((t.x->>'ordinal')::int, t.i::int))
       FROM public.supervisory_methodology m
       CROSS JOIN LATERAL jsonb_array_elements(m.scoring_scale) WITH ORDINALITY AS t(x, i)
      WHERE m.id = _methodology_id
        AND jsonb_typeof(m.scoring_scale) = 'array'
        AND COALESCE(btrim(t.x->>'code'),'') <> ''),
    (SELECT jsonb_agg(jsonb_build_object('code', upper(s.code), 'label', s.label, 'ordinal', s.ordinal)
              ORDER BY s.ordinal)
       FROM public.supervisory_rating_scale s WHERE s.is_active AND s.ordinal < 10),
    '[]'::jsonb);
$function$;

REVOKE ALL ON FUNCTION public.supervisory_methodology_rating_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_methodology_rating_order(uuid) TO authenticated, service_role;

-- 2. Canonical judgement policy rule normalisation
CREATE OR REPLACE FUNCTION public.supervisory_judgement_policy_rules(_content jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'rule_code', COALESCE(NULLIF(btrim(COALESCE(r->>'rule_code', r->>'code','')),''),
                          'JUD-' || lpad(i::text, 2, '0')),
    'label', NULLIF(btrim(COALESCE(r->>'label', r->>'name','')),''),
    'override_permitted', CASE
        WHEN jsonb_typeof(COALESCE(r->'override_permitted', r->'override_allowed','null'::jsonb)) = 'boolean'
          THEN COALESCE((r->>'override_permitted')::boolean, (r->>'override_allowed')::boolean)
        WHEN upper(btrim(COALESCE(r->>'override_permitted', r->>'override_allowed',''))) IN ('NO','FALSE','N')
          THEN false
        ELSE true END,
    'applies_to_ratings', COALESCE((
        SELECT jsonb_agg(DISTINCT upper(btrim(v)))
          FROM jsonb_array_elements_text(
                 CASE WHEN jsonb_typeof(COALESCE(r->'applies_to_ratings', r->'applies_to_calculated_ratings',
                                                 r->'calculated_ratings','null'::jsonb)) = 'array'
                      THEN COALESCE(r->'applies_to_ratings', r->'applies_to_calculated_ratings', r->'calculated_ratings')
                      ELSE '[]'::jsonb END) v
         WHERE btrim(v) <> ''), '[]'::jsonb),
    'direction', CASE upper(btrim(COALESCE(r->>'direction', r->>'permitted_direction','BOTH')))
        WHEN 'UP' THEN 'UPWARD' WHEN 'UPWARD' THEN 'UPWARD' WHEN 'UPWARDS' THEN 'UPWARD'
        WHEN 'INCREASE' THEN 'UPWARD' WHEN 'HIGHER' THEN 'UPWARD'
        WHEN 'DOWN' THEN 'DOWNWARD' WHEN 'DOWNWARD' THEN 'DOWNWARD' WHEN 'DOWNWARDS' THEN 'DOWNWARD'
        WHEN 'DECREASE' THEN 'DOWNWARD' WHEN 'LOWER' THEN 'DOWNWARD'
        WHEN 'BOTH' THEN 'BOTH' WHEN 'EITHER' THEN 'BOTH' WHEN 'ANY' THEN 'BOTH'
        ELSE upper(btrim(COALESCE(r->>'direction', r->>'permitted_direction','BOTH'))) END,
    'max_band_steps', GREATEST(COALESCE(NULLIF(btrim(COALESCE(r->>'max_band_steps', r->>'maximum_band_steps',
                                                              r->>'max_movement','')),'')::numeric, 1), 1)::int,
    'prohibited_target_ratings', COALESCE((
        SELECT jsonb_agg(DISTINCT upper(btrim(v)))
          FROM jsonb_array_elements_text(
                 CASE WHEN jsonb_typeof(COALESCE(r->'prohibited_target_ratings', r->'prohibited_ratings',
                                                 'null'::jsonb)) = 'array'
                      THEN COALESCE(r->'prohibited_target_ratings', r->'prohibited_ratings')
                      ELSE '[]'::jsonb END) v
         WHERE btrim(v) <> ''), '[]'::jsonb),
    'rationale_required', CASE
        WHEN jsonb_typeof(COALESCE(r->'rationale_required','null'::jsonb)) = 'boolean'
             AND NOT (r->>'rationale_required')::boolean THEN false
        WHEN upper(btrim(COALESCE(r->>'rationale_required',''))) IN ('NO','FALSE','N') THEN false
        ELSE true END,
    'rationale_min_length', GREATEST(
        COALESCE(NULLIF(btrim(COALESCE(r->>'rationale_min_length', r->>'minimum_rationale_length','')),'')::numeric, 10),
        10)::int,
    'independent_approval_required', true,
    'authored_independent_approval',
        CASE WHEN r ? 'independent_approval_required'
             THEN COALESCE(r->'independent_approval_required', 'null'::jsonb)
             ELSE NULL::jsonb END
    ) ORDER BY i), '[]'::jsonb)
  FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(COALESCE(_content->'rules','null'::jsonb)) = 'array'
              THEN _content->'rules' ELSE '[]'::jsonb END) WITH ORDINALITY AS t(r, i);
$function$;

REVOKE ALL ON FUNCTION public.supervisory_judgement_policy_rules(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_judgement_policy_rules(jsonb) TO authenticated, service_role;

-- 3. Judgement-specific content semantics (contract-independent)
CREATE OR REPLACE FUNCTION public.supervisory_judgement_policy_content_errors(_content jsonb)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE _rules jsonb; _r jsonb; _errors text[] := ARRAY[]::text[]; _codes text[] := ARRAY[]::text[];
        _i int := 0; _catchall int := 0; _seen text[] := ARRAY[]::text[]; _v text;
BEGIN
  _rules := public.supervisory_judgement_policy_rules(_content);
  FOR _r IN SELECT * FROM jsonb_array_elements(_rules) LOOP
    _i := _i + 1;
    IF _r->>'rule_code' = ANY (_codes) THEN
      _errors := _errors || format('override rule %s: rule reference %s is used more than once', _i, _r->>'rule_code');
    END IF;
    _codes := _codes || (_r->>'rule_code');

    IF NOT (jsonb_build_array('UPWARD','DOWNWARD','BOTH') @> to_jsonb(_r->>'direction')) THEN
      _errors := _errors || format('override rule %s: permitted direction must be upward, downward or both', _i);
    END IF;

    IF _r->'authored_independent_approval' IS NOT NULL
       AND jsonb_typeof(_r->'authored_independent_approval') = 'boolean'
       AND NOT (_r->>'authored_independent_approval')::boolean THEN
      _errors := _errors || format('override rule %s: independent approval of a rating override is a platform control and cannot be switched off by policy', _i);
    END IF;

    IF jsonb_array_length(_r->'applies_to_ratings') = 0 THEN
      _catchall := _catchall + 1;
      IF _catchall > 1 THEN
        _errors := _errors || format('override rule %s: only one rule may apply to every calculated rating, otherwise the rule that applies is not determinate', _i);
      END IF;
    ELSE
      FOR _v IN SELECT jsonb_array_elements_text(_r->'applies_to_ratings') LOOP
        IF _v = ANY (_seen) THEN
          _errors := _errors || format('override rule %s: calculated rating %s is already governed by another rule, so the rule that applies is not determinate', _i, _v);
        END IF;
        _seen := _seen || _v;
      END LOOP;
    END IF;

    FOR _v IN SELECT jsonb_array_elements_text(_r->'prohibited_target_ratings') LOOP
      IF (_r->'applies_to_ratings') @> to_jsonb(_v) AND jsonb_array_length(_r->'applies_to_ratings') = 1 THEN
        _errors := _errors || format('override rule %s: %s cannot be both the calculated rating it governs and a prohibited target', _i, _v);
      END IF;
    END LOOP;
  END LOOP;
  RETURN _errors;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_judgement_policy_content_errors(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_judgement_policy_content_errors(jsonb) TO authenticated, service_role;

-- 4. Contract: governed judgement policy fields
CREATE OR REPLACE FUNCTION public.supervisory_policy_component_content_contract(_component_type text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE upper(btrim(COALESCE(_component_type,'')))
    WHEN 'SECTOR_OVERLAY' THEN jsonb_build_object(
      'collection','sectors','item_label','sector rule',
      'required_fields', jsonb_build_array('sector_code','applicability'),
      'enums', jsonb_build_object('applicability', jsonb_build_array('APPLICABLE','NOT_APPLICABLE','MODIFIED')))
    WHEN 'FACT_CONFIG' THEN jsonb_build_object(
      'collection','facts','item_label','fact',
      'required_fields', jsonb_build_array('fact_code','data_type'),
      'enums', jsonb_build_object('data_type', jsonb_build_array('NUMBER','TEXT','BOOLEAN','DATE','PERCENT')))
    WHEN 'SOURCE_BINDING' THEN jsonb_build_object(
      'collection','bindings','item_label','source binding',
      'required_fields', jsonb_build_array('fact_code','source_kind','source_reference'),
      'enums', jsonb_build_object('source_kind', jsonb_build_array('RETURN','FORM','MANUAL','EXTERNAL','DERIVED')))
    WHEN 'EVIDENCE_POLICY' THEN jsonb_build_object(
      'collection','rules','item_label','evidence rule',
      'runtime','EVIDENCE_POLICY_RUNTIME',
      'canonical_owner','AML-05 assessment evidence basis (supervisory_assessment_evidence_basis)',
      'required_fields', jsonb_build_array('rule_code','scope_type','evidence_requirement'),
      'field_aliases', jsonb_build_object(
        'scope_type','scope','evidence_requirement','sufficiency','permitted_source_kinds','evidence_kind'),
      'enums', jsonb_build_object(
        'scope_type', jsonb_build_array('ASSESSMENT','DIMENSION','QUESTION'),
        'evidence_requirement', jsonb_build_array('REQUIRED','OPTIONAL','NOT_REQUIRED')),
      'enum_arrays', jsonb_build_object(
        'permitted_source_kinds', public.supervisory_policy_vocabulary('EVIDENCE_KIND'),
        'required_source_kinds', public.supervisory_policy_vocabulary('EVIDENCE_KIND')),
      'booleans', jsonb_build_array('rationale_required','exception_allowed','exception_approval_required'),
      'positive_numbers', jsonb_build_array('minimum_items','maximum_age_days','independent_sources_required'))
    WHEN 'MATERIALITY_POLICY' THEN jsonb_build_object(
      'collection','thresholds','item_label','materiality threshold',
      'required_fields', jsonb_build_array('measure','operator','value'),
      'enums', jsonb_build_object('operator', jsonb_build_array('GT','GTE','LT','LTE','EQ')))
    WHEN 'JUDGEMENT_POLICY' THEN jsonb_build_object(
      'collection','rules','item_label','override rule',
      'runtime','JUDGEMENT_POLICY_RUNTIME',
      'canonical_owner','AML calculation override engine (supervisory_assessment_calculation_override)',
      'required_fields', jsonb_build_array('rule_code','direction','max_band_steps'),
      'field_aliases', jsonb_build_object(
        'direction','permitted_direction','max_band_steps','maximum_band_steps',
        'applies_to_ratings','applies_to_calculated_ratings',
        'rationale_min_length','minimum_rationale_length'),
      'enums', jsonb_build_object('direction', jsonb_build_array('UPWARD','DOWNWARD','BOTH')),
      'booleans', jsonb_build_array('override_permitted','rationale_required'),
      'enum_arrays', jsonb_build_object(
        'applies_to_ratings', public.supervisory_policy_vocabulary('RISK_BAND_ORDERED'),
        'prohibited_target_ratings', public.supervisory_policy_vocabulary('RISK_BAND_ORDERED')),
      'positive_numbers', jsonb_build_array('max_band_steps','rationale_min_length'),
      'platform_minimums', jsonb_build_object(
        'independent_approval_required', true,
        'rationale_min_length', 10))
    WHEN 'RESPONSE_POLICY' THEN jsonb_build_object(
      'collection','responses','item_label','supervisory response',
      'required_fields', jsonb_build_array('risk_band','actions'),
      'non_empty_arrays', jsonb_build_array('actions'),
      'positive_numbers', jsonb_build_array('timeframe_days'))
    WHEN 'SLA_POLICY' THEN jsonb_build_object(
      'collection','stages','item_label','SLA stage',
      'required_fields', jsonb_build_array('stage','days'),
      'positive_numbers', jsonb_build_array('days'))
    WHEN 'DASHBOARD_POLICY' THEN jsonb_build_object(
      'collection','tiles','item_label','dashboard tile',
      'required_fields', jsonb_build_array('tile_key','metric','audience'))
    WHEN 'NOTIFICATION_POLICY' THEN jsonb_build_object(
      'collection','triggers','item_label','notification trigger',
      'required_fields', jsonb_build_array('event','channels','recipients'),
      'non_empty_arrays', jsonb_build_array('channels','recipients'),
      'enum_arrays', jsonb_build_object('channels', jsonb_build_array('EMAIL','IN_APP','SMS')))
    ELSE NULL::jsonb END
$function$;

-- 5. Content validation normalises judgement policy the same way runtime reads it
CREATE OR REPLACE FUNCTION public.supervisory_policy_component_content_validate(_component_type text, _content jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
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
  ELSIF _ct = 'JUDGEMENT_POLICY' THEN
    _norm := COALESCE(_content,'{}'::jsonb)
             || jsonb_build_object('rules', public.supervisory_judgement_policy_rules(_content));
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
  ELSIF _ct = 'JUDGEMENT_POLICY' THEN
    _errors := _errors || public.supervisory_judgement_policy_content_errors(_content);
  END IF;

  RETURN jsonb_build_object(
    'valid', array_length(_errors,1) IS NULL,
    'contract', _c,
    'normalised', CASE WHEN _ct IN ('EVIDENCE_POLICY','JUDGEMENT_POLICY') THEN _norm ELSE NULL::jsonb END,
    'item_count', CASE WHEN jsonb_typeof(_items) = 'array' THEN jsonb_array_length(_items) ELSE 0 END,
    'errors', to_jsonb(_errors));
END $function$;

-- 6. Judgement policy compatibility against the bound methodology
CREATE OR REPLACE FUNCTION public.supervisory_judgement_policy_compatibility(_profile_id uuid, _component_id uuid, _methodology_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _content jsonb; _rules jsonb; _r jsonb; _f jsonb := '[]'::jsonb;
        _order jsonb; _codes jsonb; _n int; _v text; _ord int; _min_ord int; _max_ord int;
        _reachable int;
BEGIN
  SELECT content INTO _content FROM public.supervisory_policy_component WHERE id = _component_id;
  _rules := public.supervisory_judgement_policy_rules(_content);

  IF _methodology_id IS NULL THEN
    _f := _f || jsonb_build_object('code','JUDGEMENT_POLICY_WITHOUT_METHODOLOGY','severity','ERROR',
      'component_type','JUDGEMENT_POLICY',
      'message','Judgement policy governs departure from a calculated rating, so it may only be bound together with the methodology that owns the rating vocabulary.');
    _order := public.supervisory_policy_vocabulary('RISK_BAND_ORDERED');
    _codes := _order;
  ELSE
    _order := public.supervisory_methodology_rating_order(_methodology_id);
    SELECT COALESCE(jsonb_agg(x->>'code'), '[]'::jsonb) INTO _codes FROM jsonb_array_elements(_order) x;
  END IF;
  _n := jsonb_array_length(_codes);

  FOR _v IN SELECT unnest(public.supervisory_judgement_policy_content_errors(_content)) LOOP
    _f := _f || jsonb_build_object('code','JUDGEMENT_CONTENT_INVALID','severity','ERROR',
      'component_type','JUDGEMENT_POLICY','message', initcap(left(_v,1)) || substr(_v,2) || '.');
  END LOOP;

  FOR _r IN SELECT * FROM jsonb_array_elements(_rules) LOOP
    IF NOT (jsonb_build_array('UPWARD','DOWNWARD','BOTH') @> to_jsonb(_r->>'direction')) THEN
      _f := _f || jsonb_build_object('code','JUDGEMENT_DIRECTION_INVALID','severity','ERROR',
        'component_type','JUDGEMENT_POLICY',
        'message','Override direction '||COALESCE(NULLIF(_r->>'direction',''),'(blank)')||' is not valid; use upward, downward or both.');
    END IF;

    IF (_r->>'max_band_steps')::int < 1 OR (_r->>'max_band_steps')::int > GREATEST(_n - 1, 1) THEN
      _f := _f || jsonb_build_object('code','JUDGEMENT_BAND_STEPS_INVALID','severity','ERROR',
        'component_type','JUDGEMENT_POLICY',
        'message','Maximum band movement must be between 1 and '||GREATEST(_n - 1, 1)||
          ' for the '||_n||' ratings in the bound methodology vocabulary.');
    END IF;

    IF (_r->>'rationale_min_length')::int < 10 THEN
      _f := _f || jsonb_build_object('code','JUDGEMENT_RATIONALE_INVALID','severity','ERROR',
        'component_type','JUDGEMENT_POLICY',
        'message','A written supervisory reason of at least 10 characters is a platform minimum and cannot be reduced.');
    END IF;

    IF _r->'authored_independent_approval' IS NOT NULL
       AND jsonb_typeof(_r->'authored_independent_approval') = 'boolean'
       AND NOT (_r->>'authored_independent_approval')::boolean THEN
      _f := _f || jsonb_build_object('code','JUDGEMENT_INDEPENDENT_APPROVAL_REQUIRED','severity','ERROR',
        'component_type','JUDGEMENT_POLICY',
        'message','Independent approval of a rating override is a platform control; a policy may strengthen governance but may not replace the checker.');
    END IF;

    FOR _v IN SELECT jsonb_array_elements_text(_r->'applies_to_ratings') LOOP
      IF NOT (_codes @> to_jsonb(_v)) THEN
        _f := _f || jsonb_build_object('code','JUDGEMENT_RATING_UNKNOWN','severity','ERROR',
          'component_type','JUDGEMENT_POLICY',
          'message','Calculated rating '||_v||' is not in the rating vocabulary of the bound methodology.');
      END IF;
    END LOOP;

    FOR _v IN SELECT jsonb_array_elements_text(_r->'prohibited_target_ratings') LOOP
      IF NOT (_codes @> to_jsonb(_v)) THEN
        _f := _f || jsonb_build_object('code','JUDGEMENT_PROHIBITED_RATING_UNKNOWN','severity','ERROR',
          'component_type','JUDGEMENT_POLICY',
          'message','Prohibited target rating '||_v||' is not in the rating vocabulary of the bound methodology.');
      END IF;
    END LOOP;

    -- impossible movement: every governed calculated rating has no permitted target left
    IF COALESCE((_r->>'override_permitted')::boolean, true) AND _n > 0 THEN
      _reachable := 0;
      FOR _v IN SELECT jsonb_array_elements_text(
                  CASE WHEN jsonb_array_length(_r->'applies_to_ratings') > 0
                       THEN _r->'applies_to_ratings' ELSE _codes END) LOOP
        SELECT (x->>'ordinal')::int INTO _ord FROM jsonb_array_elements(_order) x WHERE x->>'code' = _v;
        IF _ord IS NULL THEN CONTINUE; END IF;
        SELECT count(*) INTO _min_ord FROM jsonb_array_elements(_order) x
         WHERE (x->>'code') <> _v
           AND NOT ((_r->'prohibited_target_ratings') @> to_jsonb(x->>'code'))
           AND abs((x->>'ordinal')::int - _ord) <= (_r->>'max_band_steps')::int
           AND CASE _r->>'direction'
                 WHEN 'UPWARD' THEN (x->>'ordinal')::int > _ord
                 WHEN 'DOWNWARD' THEN (x->>'ordinal')::int < _ord
                 ELSE true END;
        _reachable := _reachable + COALESCE(_min_ord,0);
      END LOOP;
      IF _reachable = 0 THEN
        _f := _f || jsonb_build_object('code','JUDGEMENT_MOVEMENT_IMPOSSIBLE','severity','ERROR',
          'component_type','JUDGEMENT_POLICY',
          'message','Rule '||(_r->>'rule_code')||' permits an override but no target rating is reachable under its direction, movement limit and prohibited ratings.');
      END IF;
    END IF;
  END LOOP;

  RETURN _f;
END $function$;

REVOKE ALL ON FUNCTION public.supervisory_judgement_policy_compatibility(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_judgement_policy_compatibility(uuid, uuid, uuid) TO authenticated, service_role;