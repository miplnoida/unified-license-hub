-- PCOMP-R2C (1b): restore the complete content contract with the evolved RESPONSE_POLICY branch
-- (the previous statement delegated to a helper that does not exist) and normalise
-- RESPONSE_POLICY before generic validation so legacy short-form content stays valid.
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
      'runtime','RESPONSE_POLICY_RUNTIME',
      'canonical_owner','AML-08 supervisory consequence engine (supervisory_consequence_decision / supervisory_consequence_record)',
      'required_fields', jsonb_build_array('rule_code','risk_band','action','response_level'),
      'field_aliases', jsonb_build_object(
        'action','supervisory_action','response_level','policy_expectation',
        'risk_band','rating','policy_note','note'),
      'enums', jsonb_build_object(
        'response_level', jsonb_build_array('REQUIRED','RECOMMENDED','PERMITTED','PROHIBITED'),
        'risk_band', public.supervisory_policy_vocabulary('RISK_BAND_ORDERED'),
        'action', (SELECT COALESCE(jsonb_agg(m->>'policy_action'), '[]'::jsonb)
                     FROM jsonb_array_elements(public.supervisory_response_policy_action_map()) m)),
      'booleans', jsonb_build_array('rationale_required','deferral_allowed'),
      'positive_numbers', jsonb_build_array('advisory_timeframe_days'),
      'action_map', public.supervisory_response_policy_action_map(),
      'legacy_shape', jsonb_build_object(
        'field','actions','interpretation','PERMITTED',
        'note','Historical response content that lists several actions under one risk band remains readable and is interpreted as PERMITTED. It is never interpreted as a supervisory requirement.'),
      'timing_ownership', jsonb_build_object(
        'field','timeframe_days','authority','ADVISORY_UNTIL_SLA_POLICY',
        'note','Response policy states what supervisory response is expected. When an action becomes due, overdue or escalated is owned by SLA policy; response timing is advisory only.'))
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
  ELSIF _ct = 'RESPONSE_POLICY' THEN
    _norm := COALESCE(_content,'{}'::jsonb)
             || jsonb_build_object('responses', public.supervisory_response_policy_rules(_content));
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
  ELSIF _ct = 'RESPONSE_POLICY' THEN
    _errors := _errors || public.supervisory_response_policy_content_errors(_content);
  END IF;

  RETURN jsonb_build_object(
    'valid', array_length(_errors,1) IS NULL,
    'contract', _c,
    'normalised', CASE WHEN _ct IN ('EVIDENCE_POLICY','JUDGEMENT_POLICY','RESPONSE_POLICY')
                       THEN _norm ELSE NULL::jsonb END,
    'item_count', CASE WHEN jsonb_typeof(_items) = 'array' THEN jsonb_array_length(_items) ELSE 0 END,
    'errors', to_jsonb(_errors));
END $function$;