-- =====================================================================
-- PCOMP-R2A (1/3) — canonical evidence rule shape, contract and content
-- validation semantics for EVIDENCE_POLICY.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.supervisory_evidence_policy_rules(_content jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'rule_code', COALESCE(NULLIF(btrim(COALESCE(r->>'rule_code', r->>'code','')),''),
                          'RULE-' || lpad(i::text, 2, '0')),
    'label', NULLIF(btrim(COALESCE(r->>'label','')),''),
    'scope_type', upper(btrim(COALESCE(r->>'scope_type', r->>'scope',''))),
    'scope_reference', NULLIF(upper(btrim(COALESCE(r->>'scope_reference', r->>'question_code',
                                                   r->>'dimension_code',''))),''),
    'evidence_requirement', CASE upper(btrim(COALESCE(r->>'evidence_requirement', r->>'sufficiency','')))
                              WHEN 'PROHIBITED' THEN 'NOT_REQUIRED'
                              ELSE upper(btrim(COALESCE(r->>'evidence_requirement', r->>'sufficiency','')))
                            END,
    'minimum_items', GREATEST(COALESCE(NULLIF(r->>'minimum_items','')::numeric, 1)::int, 1),
    'permitted_source_kinds', CASE
      WHEN jsonb_typeof(COALESCE(r->'permitted_source_kinds','null'::jsonb)) = 'array'
        THEN (SELECT COALESCE(jsonb_agg(upper(btrim(x))), '[]'::jsonb)
                FROM jsonb_array_elements_text(r->'permitted_source_kinds') x)
      WHEN jsonb_typeof(COALESCE(r->'evidence_kinds','null'::jsonb)) = 'array'
        THEN (SELECT COALESCE(jsonb_agg(upper(btrim(x))), '[]'::jsonb)
                FROM jsonb_array_elements_text(r->'evidence_kinds') x)
      WHEN COALESCE(btrim(r->>'evidence_kind'),'') <> ''
        THEN jsonb_build_array(upper(btrim(r->>'evidence_kind')))
      ELSE '[]'::jsonb END,
    'required_source_kinds', CASE
      WHEN jsonb_typeof(COALESCE(r->'required_source_kinds','null'::jsonb)) = 'array'
        THEN (SELECT COALESCE(jsonb_agg(upper(btrim(x))), '[]'::jsonb)
                FROM jsonb_array_elements_text(r->'required_source_kinds') x)
      ELSE '[]'::jsonb END,
    'applies_to_responses', CASE
      WHEN jsonb_typeof(COALESCE(r->'applies_to_responses','null'::jsonb)) = 'array'
        THEN (SELECT COALESCE(jsonb_agg(upper(btrim(x))), '[]'::jsonb)
                FROM jsonb_array_elements_text(r->'applies_to_responses') x)
      ELSE '[]'::jsonb END,
    'maximum_age_days', NULLIF(r->>'maximum_age_days','')::int,
    'independent_sources_required', NULLIF(r->>'independent_sources_required','')::int,
    'rationale_required', COALESCE((r->>'rationale_required')::boolean, false),
    'exception_allowed', COALESCE((r->>'exception_allowed')::boolean, false),
    'exception_approval_required', COALESCE((r->>'exception_approval_required')::boolean, true)
  )) ORDER BY i), '[]'::jsonb)
  FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(COALESCE(_content->'rules','null'::jsonb)) = 'array'
              THEN _content->'rules' ELSE '[]'::jsonb END) WITH ORDINALITY AS t(r, i);
$$;
REVOKE ALL ON FUNCTION public.supervisory_evidence_policy_rules(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_evidence_policy_rules(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_policy_component_content_contract(_component_type text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
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
      'required_fields', jsonb_build_array('direction','max_band_steps','rationale_min_length'),
      'enums', jsonb_build_object('direction', jsonb_build_array('UP','DOWN','BOTH')),
      'positive_numbers', jsonb_build_array('max_band_steps','rationale_min_length'))
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
$$;

CREATE OR REPLACE FUNCTION public.supervisory_evidence_policy_content_errors(_content jsonb)
RETURNS text[] LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE _rules jsonb; _r jsonb; _errors text[] := ARRAY[]::text[]; _codes text[] := ARRAY[]::text[];
        _kinds jsonb; _txt text; _i int := 0;
BEGIN
  _rules := public.supervisory_evidence_policy_rules(_content);
  _kinds := public.supervisory_policy_vocabulary('EVIDENCE_KIND');
  FOR _r IN SELECT * FROM jsonb_array_elements(_rules) LOOP
    _i := _i + 1;
    IF _r->>'rule_code' = ANY (_codes) THEN
      _errors := _errors || format('evidence rule %s: rule reference %s is used more than once', _i, _r->>'rule_code');
    END IF;
    _codes := _codes || (_r->>'rule_code');

    IF (_r->>'scope_type') IN ('DIMENSION','QUESTION')
       AND COALESCE(_r->>'scope_reference','') = '' AND COALESCE(_r->>'evidence_requirement','') = 'REQUIRED'
       AND COALESCE((_r->>'minimum_items')::int,1) > 1 THEN
      _errors := _errors || format('evidence rule %s: a minimum above one must name the %s it applies to',
                                   _i, lower(_r->>'scope_type'));
    END IF;

    FOR _txt IN SELECT jsonb_array_elements_text(_r->'required_source_kinds') LOOP
      IF jsonb_array_length(_r->'permitted_source_kinds') > 0
         AND NOT (_r->'permitted_source_kinds' @> to_jsonb(_txt)) THEN
        _errors := _errors || format('evidence rule %s: %s is required but is not one of the permitted kinds of evidence',
                                     _i, _txt);
      END IF;
      IF NOT (_kinds @> to_jsonb(_txt)) THEN
        _errors := _errors || format('evidence rule %s: %s is not a kind of evidence the platform holds', _i, _txt);
      END IF;
    END LOOP;

    IF COALESCE((_r->>'independent_sources_required')::int,0) > COALESCE((_r->>'minimum_items')::int,1) THEN
      _errors := _errors || format('evidence rule %s: independent sources required cannot exceed the minimum number of items',
                                   _i);
    END IF;

    IF COALESCE(_r->>'evidence_requirement','') <> 'REQUIRED'
       AND COALESCE((_r->>'exception_allowed')::boolean,false) THEN
      _errors := _errors || format('evidence rule %s: exceptions apply only where evidence is required', _i);
    END IF;
  END LOOP;
  RETURN _errors;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_evidence_policy_content_errors(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_evidence_policy_content_errors(jsonb) TO authenticated, service_role;